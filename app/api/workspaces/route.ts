import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { resolveWorkspaceAccessDecision } from '@/lib/workspaces/cohort'
import { WORKSPACE_TYPE_VALUES } from '@/lib/workspaces/types'

// ─── /api/workspaces — create + list (D-03, D-04, D-06, D-50) ─────────────
// POST creates a workspace, born unverified with the creator seated as its
// sole active owner — the only legitimate write path onto the tables
// migration 182 REVOKEd from `authenticated`/`anon`. GET lists the
// workspaces the caller holds an active membership in, filtered by RLS via
// the caller's own session client rather than an application WHERE clause
// on a service client.
//
// Do NOT auto-create a workspace anywhere, for anyone, under any condition
// (D-03, D-53). This route touches no legacy account field — no old-style
// membership-type column, no professional-role array, no capability-grant
// table (D-54).
//
// ─── THE SINGLE WRITER IS `public.workspace_create` (WSR-23 / R-15) ────────
// This handler used to perform TWO inserts in TWO transactions — the
// workspace, then the owner seat — with a hand-rolled compensating
// `.delete()` that only ran if the process survived long enough to run it.
// A crash between them left an OWNERLESS workspace, which is why migration
// 182 carried a `created_by = auth.uid()` visibility fallback in
// `workspaces_select_member`, and why a creator removed from their own
// workspace could still see it forever.
//
// Migration 198 section (b) makes both inserts and the `workspace.created`
// audit row ONE transaction. That is what makes migration 197 section (j)'s
// removal of the `created_by` fallback safe: a workspace can no longer exist
// without its owner seat, so live membership alone is always sufficient to
// see a workspace you just made. The compensating DELETE is therefore not
// merely unused here — it is unreachable, and it is gone.
//
// Creation MUST go through the RPC and can never go back to a direct insert:
// migration 197 section (c) refuses every non-definer `owner` INSERT on
// `workspace_members`, and `workspace_create` is postgres-owned
// SECURITY DEFINER, so it is the only remaining path that can seat the
// first owner. The route also writes no audit row of its own — the RPC owns
// that write, and a second route-side copy is where drift lives.
//
// ─── THE D-55 COHORT GATE — CALL SITE 2 OF 3 (R-07 / R-24 / R-25) ──────────
// Creating a workspace forms new workspace state, so it stops when the D-56
// platform control is off (503) AND when the caller is outside the D-55
// pilot cohort (404 — R-25, never 403, because during a bounded pilot a
// non-cohort Member should not learn the feature exists). The control is
// GLOBAL, so "there is no workspace yet" was never a reason to skip it.
//
// THERE ARE THREE KILL-SWITCH CALL SITES (RESEARCH pitfall 12), and missing
// one reproduces hotfix F7's exact shape:
//   1. `lib/workspaces/access.ts` — `requireWorkspaceAccess`, which covers
//      every route under `app/api/workspaces/[workspaceId]/**`;
//   2. THIS ROUTE — POST, which has no workspaceId and so cannot funnel
//      through that gate;
//   3. `app/api/workspaces/invitations/accept/route.ts` — the R-24 acceptor,
//      without which one cohort owner can pull in unlimited non-cohort
//      Members and the pilot bound stops meaning anything.
// Check all three together or not at all.
//
// GET is deliberately NOT gated: listing memberships you already hold is
// read-only and helps a Member understand state during an incident.

// Mass-assignment allowlist. Deliberately EXCLUDES `verification_state`,
// `verified_at`, and `verified_by` — verification is a separate, later,
// auditable act, never a creation-time input (D-04). Also excludes
// `created_by`, `slug`, `id`, and timestamps, which are server-owned.
const WORKSPACE_CREATE_FIELDS = [
  'name',
  'workspaceType',
  'rosterEnabled',
  'catalogueEnabled',
  'subjectMemberId',
] as const

const CreateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1, 'Workspace name is required.').max(120),
    workspaceType: z.enum(WORKSPACE_TYPE_VALUES),
    rosterEnabled: z.boolean().optional(),
    catalogueEnabled: z.boolean().optional(),
    subjectMemberId: z.string().uuid().optional(),
  })
  .strict()

// Pure allowlist filter — mass-assignment backstop independent of Zod's own
// `.strict()` rejection (mirrors lib/client-partners/contacts.ts's
// pickContactFields), applied BEFORE validation so a key outside this array
// can never reach CreateWorkspaceSchema, let alone `workspace_create` below.
// A key outside the array is DROPPED here, not rejected — it never reaches
// Zod, so it produces no 400; the guarantee is that a server-owned value can
// never travel from a request body into the write.
function pickCreateFields(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of WORKSPACE_CREATE_FIELDS) {
    if (key in body) picked[key] = body[key]
  }
  return picked
}

// The finished slug is passed INTO the RPC deliberately. Reimplementing this
// transform in SQL would create two implementations of one rule in two
// languages, and they drift; migration 198 section (b) says so from the
// other side ("the slug arrives FINISHED from TypeScript... it is
// deliberately not normalised, lower-cased or punctuation-stripped here").
// The one slug concern TypeScript cannot own — losing the race for the
// `workspaces.slug` UNIQUE constraint against a concurrent creation — is the
// RPC's bounded five-attempt retry, and nothing else.
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base || 'workspace'
}

// Short random suffix to satisfy the workspaces.slug unique constraint —
// derived from crypto.randomUUID() (house convention: lib/accounts/
// provisionIntent.ts, lib/logging/correlation.ts), never Math.random().
function slugSuffix(): string {
  return randomUUID().slice(0, 8)
}

const WORKSPACE_COLUMNS =
  'id, name, slug, workspace_type, roster_enabled, catalogue_enabled, verification_state, subject_member_id, created_by, created_at'

type WorkspaceCreateOutcome = {
  outcome: string
  workspace_id: string | null
  slug: string | null
  audit_id: string | null
}

// ─── Outcome → HTTP, in the shape of ────────────────────────────────────────
// `app/api/workspaces/[workspaceId]/members/route.ts`: a
// `Record<string, { error, status }>` with a fallback, so an outcome code
// this route does not recognise degrades to a 400 with a sentence rather
// than a 500 with a stack trace.
//
// Migration 198 section (b)'s vocabulary is SHORT — `ok` and `disabled`, and
// nothing else. Its slug-exhaustion and parameter refusals are `RAISE`s
// rather than outcome codes, deliberately and on the record: R-26 says
// audited AUTHORITY refusals become codes while validation errors may keep
// raising, and this function has written nothing when it raises, so a RAISE
// rolls back no audit row. Those two arrive as Postgres error codes and are
// mapped below, not here.
const WORKSPACE_CREATE_OUTCOMES: Record<string, { error: string; status: number }> = {
  disabled: { error: 'Workspace access is temporarily disabled.', status: 503 },
}

const UNRECOGNISED_OUTCOME = {
  error: 'This workspace could not be created.',
  status: 400,
}

// ─── Postgres error code → response ─────────────────────────────────────────
// Migration 198 sets `SET LOCAL lock_timeout = '3s'` in every RPC precisely
// so a blocked row lock becomes a bounded, retryable failure rather than a
// hung request. `55P03` (lock not available) is that timeout arriving and
// `40P01` (deadlock detected) is the other bounded outcome; both mean
// "nothing was written, ask again", which is a 409 the caller can act on —
// never a 500.
//
// `23505` is `workspace_create`'s slug-exhaustion RAISE: five consecutive
// losses of the `workspaces.slug` UNIQUE race. Nothing was written, and a
// fresh suffix is generated per attempt, so this is retry-safe too.
// `22023` is its parameter refusal, which Zod already makes unreachable from
// this route — mapped anyway so a future caller sees a 400 rather than a 500.
type PostgresLikeError = { message: string; code?: string }

const RETRYABLE_LOCK_CODES: ReadonlySet<string> = new Set(['40P01', '55P03'])

const LOCK_CONTENTION_MESSAGE =
  'This workspace was being changed by someone else. Nothing was saved — please try again.'

const SLUG_EXHAUSTED_MESSAGE =
  'Could not allocate a unique address for this workspace. Nothing was saved — please try again.'

function respondToPostgresError(error: PostgresLikeError): NextResponse {
  if (error.code && RETRYABLE_LOCK_CODES.has(error.code)) {
    return NextResponse.json({ error: LOCK_CONTENTION_MESSAGE }, { status: 409 })
  }
  if (error.code === '23505') {
    return NextResponse.json({ error: SLUG_EXHAUSTED_MESSAGE }, { status: 409 })
  }
  if (error.code === '22023') {
    return NextResponse.json({ error: 'Invalid workspace payload.' }, { status: 400 })
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

  const service = createServiceClient()

  // Call site 2 of 3 (see the header). ONE service-role round trip resolves
  // the D-56 platform control and the D-55 cohort window together;
  // `resolveWorkspaceAccessDecision` never throws and fails closed on every
  // path, so a transport failure can never be mistaken for permission.
  const decision = await resolveWorkspaceAccessDecision(service, gate.user.id, process.env)
  if (!decision.accessEnabled) {
    return NextResponse.json(
      { error: 'Workspace access is temporarily disabled.' },
      { status: 503 }
    )
  }
  // R-25: 404, not 403 — a Member outside the bounded pilot should not learn
  // the feature exists. Never conflated with the 503 above.
  if (!decision.cohortEligible) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = CreateWorkspaceSchema.safeParse(pickCreateFields(body))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid workspace payload.' },
      { status: 400 }
    )
  }

  const { name, workspaceType, rosterEnabled, catalogueEnabled, subjectMemberId } = parsed.data

  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_create', {
      p_actor_id: gate.user.id,
      p_name: name,
      p_slug: `${slugify(name)}-${slugSuffix()}`,
      p_workspace_type: workspaceType,
      p_roster_enabled: rosterEnabled ?? false,
      p_catalogue_enabled: catalogueEnabled ?? false,
      // subject_member_id only means anything for workspace_type='artist_team'
      // (D-07); naming a subject grants nothing until they accept (D-05). The
      // RPC repeats this rule, and both must hold — two independent layers
      // agreeing is this repo's doctrine, not duplication to remove.
      p_subject_member_id: workspaceType === 'artist_team' ? (subjectMemberId ?? null) : null,
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as WorkspaceCreateOutcome | null) ?? null
  if (!result || result.outcome !== 'ok' || !result.workspace_id) {
    const mapped = WORKSPACE_CREATE_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  // Re-read through the service client with the SAME column list this route
  // returned before the rewrite, so no client change is needed. The RPC
  // returns identifiers rather than the row precisely so this stays the one
  // place the response shape is defined.
  const { data: workspace, error: readError } = await service
    .from('workspaces')
    .select(WORKSPACE_COLUMNS)
    .eq('id', result.workspace_id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!workspace) {
    return NextResponse.json({ error: 'Failed to create workspace.' }, { status: 500 })
  }

  return NextResponse.json({ data: workspace }, { status: 201 })
}

export async function GET() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS-scoped read: workspaces_select_member (migration 182) is the filter
  // — an application WHERE clause on a service client would duplicate that
  // rule and risk drifting from it.
  const { data, error } = await supabase
    .from('workspaces')
    .select(
      'id, name, slug, workspace_type, roster_enabled, catalogue_enabled, verification_state, created_at'
    )
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
