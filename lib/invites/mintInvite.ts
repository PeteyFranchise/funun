import type { SupabaseClient } from '@supabase/supabase-js'
import { generateApprovalToken, APPROVAL_TOKEN_EXPIRY_DAYS } from '@/lib/split-sheets/approval'
import type { ArtistInviteSource } from '@/lib/invites/schema'

// ─── Shared artist-invite mint/rotate/reuse claim ─────────────────────────
// (27-CODEX-REVIEW.md B3/H1/M5, follow-up review) Single source of truth
// for "get me a valid, authorized invite token for this email" — used by
// the admin "issue invite" route, the waitlist "convert" route, and the
// Leadership-only reopen broadcast so all three claim/rotate an
// artist_invites row identically.
//
// This now delegates the ENTIRE decision to migration 101's
// mint_or_rotate_artist_invite() RPC — a single atomic
// `INSERT ... ON CONFLICT (LOWER(email)) WHERE status='pending' DO UPDATE`
// statement. The follow-up review found the prior JS implementation (a
// plain SELECT followed by an unconditional UPDATE) was NOT atomic: two
// concurrent callers could both read the same expired pending row and both
// issue their own UPDATE, silently invalidating whichever email went out
// first (a torn read/write), and used `.ilike('email', email)` with no
// escaping, reintroducing the ILIKE-wildcard bug (M1) that
// lib/invites/allowlist.ts had already fixed elsewhere. Routing through a
// single row-locked SQL statement — with an exact `LOWER(email)` equality
// match, never ILIKE — eliminates both issues at once: there is no
// client-side SELECT left to express with a pattern-matching operator, and
// two concurrent callers now serialize on Postgres's own row lock instead
// of racing in application code.
//
// Outcomes (identical external contract to the pre-fix version):
//   - 'reused'  — an active (non-expired) pending row already exists for
//                 this email; the RPC's DO UPDATE branch is a no-op write
//                 that returns the row unchanged. Preserves the
//                 duplicate-idempotency behavior (no re-send).
//   - 'rotated' — a pending row exists but was tokenless or its
//                 token_expires_at had passed; the RPC atomically swaps in
//                 the candidate token/expiry generated below (H1 fix —
//                 expired invites can now be re-issued, and two
//                 concurrent rotations can no longer both "win").
//   - 'created' — no pending row existed; the RPC's INSERT branch lands.
//                 Migration 099's partial UNIQUE index on LOWER(email)
//                 WHERE status='pending' is the ON CONFLICT target, so a
//                 concurrent insert attempt for the same email
//                 automatically falls through to the reuse/rotate branch
//                 within the SAME statement (B3 concurrency safety for the
//                 per-recipient broadcast mint) — no separate 23505
//                 handling needed in JS anymore.

export type MintInviteResult =
  | { ok: true; id: string; token: string; state: 'created' | 'rotated' | 'reused' }
  | { ok: false; error: string }

type MintRpcRow = { out_id: string; out_invite_token: string; out_state: 'created' | 'rotated' | 'reused' }

function newExpiry(): string {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)
  return expiresAt.toISOString()
}

export async function mintOrRotateInvite(
  service: SupabaseClient,
  args: { email: string; source: ArtistInviteSource; invitedByUserId: string | null }
): Promise<MintInviteResult> {
  const { email, source, invitedByUserId } = args

  // Candidate token/expiry — generated here (single source of truth for
  // token generation, unchanged crypto), but only ACTUALLY used by the RPC
  // if it decides this call needs to create or rotate. A "reused" outcome
  // discards this candidate entirely; it is never a wasted write, only a
  // wasted (cheap, local) crypto.randomBytes() call.
  const candidateToken = generateApprovalToken()
  const candidateExpiresAt = newExpiry()

  const { data, error } = await service.rpc('mint_or_rotate_artist_invite', {
    p_email: email,
    p_source: source,
    p_invited_by_user_id: invitedByUserId,
    p_new_token: candidateToken,
    p_new_expires_at: candidateExpiresAt,
  })

  if (error) return { ok: false, error: error.message }

  const row = (Array.isArray(data) ? data[0] : data) as MintRpcRow | undefined | null
  if (!row) return { ok: false, error: 'Failed to create invite.' }

  return { ok: true, id: row.out_id, token: row.out_invite_token, state: row.out_state }
}
