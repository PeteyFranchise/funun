import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import {
  isWorkspaceAccessPermitted,
  isWorkspaceCohortRequired,
  resolveWorkspaceAccessDecision,
} from '@/lib/workspaces/cohort'
import {
  hashInvitationToken,
  isInvitationRedeemable,
  normalizeInvitedEmail,
} from '@/lib/workspaces/invitations'
import type { WorkspaceInvitationState, WorkspaceRole } from '@/lib/workspaces/types'

// ─── POST /api/workspaces/invitations/accept — bind a pending seat to the ──
//     accepting session's own identity (D-12, D-33)
//
// The binding identity is the accepting session's — resolved from
// `auth.getUser()`, never from anything in the request body. This is an
// ordinary authenticated request under one identity: no sign-out, no new
// session, no admin API. A Funūn Team Member identity is refused by the
// Member-only account gate before any invitation lookup, because staff is
// a separate identity and never a workspace member (D-33).
//
// The raw token travels in the body ONLY to be hashed and looked up — it
// is never written to any table, NEVER SENT TO SQL, and the invitation row
// is never disclosed to exist or not exist to an unauthenticated/mismatched
// caller (a lookup miss and a redeemability failure both return generic,
// non-enumerating messages).
//
// ─── F11 / WSR-10: THE SINGLE WRITER IS public.workspace_redeem_invitation ──
//
// This route used to perform FOUR separate transactions: the lookup; a
// compare-and-set update of the invitation to `accepted` filtered on
// `status = 'pending'`; a seat lookup; and then a seat UPDATE **or** a seat
// INSERT. Three things were wrong with that, and all three are gone:
//
//   1. THE CAS RESULT WAS NEVER CHECKED. Only `{ error }` was destructured,
//      which reports a database failure and not "zero rows matched" — so a
//      redemption that LOST the race was indistinguishable from one that won
//      it, and both returned 200. The CAS is now structural: migration 198
//      section (f) locks the invitation row and revalidates its status under
//      that lock, so there is no unchecked result left to check.
//   2. THE SEAT LOOKUP AND THE SEAT WRITE WERE TWO TRANSACTIONS, so two
//      concurrent redemptions could both miss the seat and both take the
//      INSERT branch. Correctness survived only because
//      `idx_workspace_members_unique_user` refused the second one with a
//      `23505` this route reported as a generic 500. The RPC writes the seat
//      as ONE `INSERT ... ON CONFLICT` statement, which cannot race itself,
//      and the loser now receives the `'not_pending'` outcome mapped to 410.
//   3. THE AUDIT ROW CARRIED `targetId: pendingSeat?.id ?? null` — a NULL
//      target whenever no pending seat existed, which is exactly the shape
//      migration 197's deferred constraint trigger refuses at COMMIT. This
//      route no longer computes a target id at all: the RPC writes BOTH
//      audit rows (one per mutated table), each with `target_id` set to the
//      mutated row's own id, in the same transaction as the mutation.
//
// THE SELF-HEAL MOVED INTO THE RPC TOO. A still-pending invitation whose
// expiry has passed is swept to `'expired'` under the same lock, with its
// own audit row. This route performs no write on that path — or on any
// other.
//
// ─── WHAT DELIBERATELY STAYS HERE (research §11's keep list) ───────────────
//
// The read-only lookup below plus `isInvitationRedeemable` are the
// friendly-refusal predicate layer: they produce the non-enumerating
// sentences a `RAISE` cannot phrase, and they refuse the cheap cases before
// a transaction is opened. They are NOT a stale copy of the rule — the
// RPC's post-lock revalidation is the authoritative layer, and it decides
// every outcome independently. Two layers agreeing is this repo's doctrine
// (migrations 078, 136, 187, 190, 192, 196); WSR-17 exists because two
// layers once disagreed about `expires_at`. This layer writes NOTHING.
//
// ─── R-24 / R-25: THE COHORT GATE APPLIES TO THE ACCEPTOR ─────────────────
//
// This is the THIRD AND LAST of the three D-56 kill-switch call sites. The
// other two are workspace creation (`app/api/workspaces/route.ts`) and the
// shared API gate `requireWorkspaceAccess` (`lib/workspaces/access.ts`).
// Until now this one consulted `isWorkspaceAccessEnabled` DIRECTLY instead
// of going through the gate — which is the exact shape of hotfix F7, where
// a route carrying workspace state read the platform control but skipped
// the surrounding gate. Accepting an invitation forms new workspace
// membership, so if the D-55 cohort bound applied only to workspace
// creation, ONE cohort owner could pull in unlimited non-cohort Members and
// the pilot bound would stop meaning anything (R-24).
//
// A non-cohort acceptor receives 404, NOT 403 (R-25): during a bounded pilot
// someone outside the cohort should not learn the feature exists, and 404 is
// how the rest of this repo hides an unreachable resource. Its body is
// deliberately IDENTICAL to the unknown-token 404, so the pair cannot be
// used to probe whether an invitation exists.

const AcceptSchema = z.object({ token: z.string().trim().min(1) }).strict()

// The lookup reads the two columns the predicate layer needs and NOTHING
// else. In particular it does not read the invited address: the binding
// check is decided inside the RPC against the row it has locked, so this
// route never needs to hold a second copy of somebody's email.
type InvitationLookupRow = {
  status: WorkspaceInvitationState
  expires_at: string
}

type RedeemInvitationOutcome = {
  outcome: string
  workspace_id: string | null
  member_id: string | null
  member_role: string | null
  invitation_audit_id: string | null
  member_audit_id: string | null
}

const WORKSPACE_ACCESS_DISABLED_MESSAGE = 'Workspace access is temporarily disabled.'
const INVITATION_INVALID_MESSAGE = 'This invitation link is invalid.'
const INVITATION_NOT_VALID_MESSAGE = 'This invitation is no longer valid.'
const EMAIL_MISMATCH_MESSAGE =
  'This invitation was sent to a different email address than your account.'

// ─── Outcome → HTTP, in the shape of ────────────────────────────────────────
// `app/api/workspaces/[workspaceId]/members/route.ts`: a
// `Record<string, { error, status }>` with a fallback for a code this route
// does not recognise, so an unmapped outcome degrades to a 400 with a
// sentence rather than a 500 with a stack trace.
//
// The vocabulary below is migration 198 section (f)'s, IN FULL, read from
// the migration rather than from the plan text — plan 10 extended it beyond
// what plan 14 was written against, adding `owner_invitation_forbidden` and
// `owner_seat_conflict`:
//   ok, not_found, not_in_cohort, expired, not_pending, email_mismatch,
//   owner_invitation_forbidden, owner_seat_conflict, illegal_transition.
const REDEEM_OUTCOMES: Record<string, { error: string; status: number }> = {
  // Same sentence and same status as the route-side miss above it, so the
  // two are indistinguishable to a caller probing for an invitation's
  // existence.
  not_found: { error: INVITATION_INVALID_MESSAGE, status: 404 },
  // R-24/R-25 — 404 and not 403, with the unknown-token body.
  not_in_cohort: { error: INVITATION_INVALID_MESSAGE, status: 404 },
  expired: { error: INVITATION_NOT_VALID_MESSAGE, status: 410 },
  // The concurrent loser. Previously this surfaced as a generic 500 derived
  // from a raw 23505; it is a 410 the caller can read.
  not_pending: { error: INVITATION_NOT_VALID_MESSAGE, status: 410 },
  email_mismatch: { error: EMAIL_MISMATCH_MESSAGE, status: 403 },
  owner_invitation_forbidden: {
    error:
      'Ownership is transferred by nominating a successor who accepts, never by invitation. This invitation cannot be redeemed.',
    status: 409,
  },
  owner_seat_conflict: {
    error:
      'You already hold the owner seat on this workspace, so this invitation cannot be redeemed — it would give up ownership outside the two-sided transfer.',
    status: 409,
  },
  illegal_transition: { error: 'This seat can no longer be activated.', status: 409 },
}

const UNRECOGNISED_OUTCOME = { error: 'This invitation could not be redeemed.', status: 400 }

// ─── Postgres error code → response ─────────────────────────────────────────
// Migration 198 sets `SET LOCAL lock_timeout = '3s'` in every RPC precisely so
// that a blocked row lock becomes a bounded, retryable failure rather than a
// hung request. `55P03` (lock not available) is that timeout arriving, and
// `40P01` (deadlock detected) is the other bounded outcome; both mean "nothing
// was written, ask again", which is a 409 the caller can act on — never a 500.
//
// `42501` is the RPC's own refusal when the D-56 control is off. The gate
// below already answers that case with a 503, so this entry exists for the
// window where the switch flips BETWEEN the gate and the RPC: the second
// layer must give the same answer as the first, not a 500.
type PostgresLikeError = { message: string; code?: string }

const RETRYABLE_LOCK_CODES: ReadonlySet<string> = new Set(['40P01', '55P03'])
const ACCESS_DISABLED_CODE = '42501'

const LOCK_CONTENTION_MESSAGE =
  'This workspace was being changed by someone else. Nothing was saved — please try again.'

function respondToPostgresError(error: PostgresLikeError): NextResponse {
  if (error.code === ACCESS_DISABLED_CODE) {
    return NextResponse.json({ error: WORKSPACE_ACCESS_DISABLED_MESSAGE }, { status: 503 })
  }
  if (error.code && RETRYABLE_LOCK_CODES.has(error.code)) {
    return NextResponse.json({ error: LOCK_CONTENTION_MESSAGE }, { status: 409 })
  }
  return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
}

export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // D-56/WS-31 (hotfix F7, completion) + D-55/R-24. ONE service-role round
  // trip resolves both halves — `workspace_access_permitted` folds the kill
  // switch and the cohort window into a single function for exactly this
  // reason. `isWorkspaceAccessPermitted` is the SHARED reading all three call
  // sites use, so this one cannot drift from the other two;
  // `canAcceptWorkspaceInvitation` composes the same two calls but collapses
  // them into one boolean, and R-25 needs the two answers kept apart — 503
  // and 404 are different answers to different questions.
  const decision = await resolveWorkspaceAccessDecision(service, user.id)
  if (!isWorkspaceAccessPermitted(decision)) {
    if (!decision.accessEnabled) {
      return NextResponse.json({ error: WORKSPACE_ACCESS_DISABLED_MESSAGE }, { status: 503 })
    }
    // R-25: 404, never 403, and with the unknown-token body.
    return NextResponse.json({ error: INVITATION_INVALID_MESSAGE }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = AcceptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'A valid invitation token is required.' },
      { status: 400 }
    )
  }

  // THE RAW TOKEN STOPS HERE. `parsed.data.token` is passed to
  // `hashInvitationToken` and to nothing else — it never becomes an RPC
  // argument, so it cannot reach `pg_stat_statements`, a
  // `log_min_duration_statement` line, or the error context of anything the
  // function raises.
  const tokenHash = hashInvitationToken(parsed.data.token)

  // The binding identity is the SESSION's own verified email, never a body
  // value (T-38-06-01, T-38-06-02) — normalized the same way the issuance
  // route normalized the invitation's stored address. A session with no
  // usable address is refused here rather than sent on: the RPC treats a
  // null `p_actor_email` as a validation error and raises, which would
  // surface as a 500 instead of this sentence.
  const sessionEmail = normalizeInvitedEmail(user.email ?? '')
  if (!sessionEmail) {
    return NextResponse.json({ error: EMAIL_MISMATCH_MESSAGE }, { status: 403 })
  }

  // ─── The read-only predicate layer. It writes nothing. ──────────────────
  const { data: invitationData, error: lookupError } = await service
    .from('workspace_invitations')
    .select('status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: 'Could not process this invitation.' }, { status: 500 })
  }
  if (!invitationData) {
    // Generic — does not disclose whether the token ever existed.
    return NextResponse.json({ error: INVITATION_INVALID_MESSAGE }, { status: 404 })
  }
  const invitation = invitationData as InvitationLookupRow

  const now = Date.now()
  if (
    !isInvitationRedeemable({
      status: invitation.status,
      expiresAt: invitation.expires_at,
      now,
    })
  ) {
    // TERMINAL statuses (accepted, refused, revoked, already-swept expired)
    // are refused here: there is nothing left to heal, so opening a
    // transaction would buy nothing.
    //
    // A STILL-PENDING invitation whose expiry has merely PASSED is NOT
    // refused here — it is handed to the RPC, which sweeps it to 'expired'
    // and audits that sweep under the lock that proved it was still pending.
    // Refusing it here would leave the self-heal permanently unreachable and
    // silently drop a behaviour this route has always had.
    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: INVITATION_NOT_VALID_MESSAGE }, { status: 410 })
    }
  }

  // ─── THE ONE WRITE ───────────────────────────────────────────────────────
  // `p_actor_id` is the identity the session gate above already proved, and
  // `p_actor_email` is that same session's normalised address — R-21 Option A
  // applied to one more field than usual, and stated rather than glossed: the
  // AUTHORITY half ("does this invitation name this address") is decided in
  // the database, while the IDENTITY half ("is this session that address")
  // is decided here, because SQL should not read `auth.users.email`. The RPC
  // re-checks the binding it was told, against the row it has locked.
  //
  // `p_require_cohort` comes from the environment through
  // `isWorkspaceCohortRequired`, which SQL cannot read — and which defaults
  // CLOSED, so an absent variable means "cohort required" and never
  // "everyone admitted".
  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_redeem_invitation', {
      p_actor_id: user.id,
      p_token_hash: tokenHash,
      p_actor_email: sessionEmail,
      p_require_cohort: isWorkspaceCohortRequired(),
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as RedeemInvitationOutcome | null) ?? null
  if (!result || result.outcome !== 'ok') {
    const mapped = REDEEM_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  // The existing response shape, built from the RPC's own returned columns,
  // so no client change is needed.
  return NextResponse.json({
    data: {
      workspaceId: result.workspace_id,
      role: result.member_role as WorkspaceRole,
    },
  })
}
