import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { isWorkspaceAccessEnabled } from '@/lib/workspaces/access-kill-switch'
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
// can never reach CreateWorkspaceSchema, let alone the insert below.
function pickCreateFields(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of WORKSPACE_CREATE_FIELDS) {
    if (key in body) picked[key] = body[key]
  }
  return picked
}

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

export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  // D-56/WS-31 (hotfix F7, completion): creating a workspace forms new
  // workspace state, so it must stop when the platform-wide control is off.
  // The control is GLOBAL — `isWorkspaceAccessEnabled` needs no workspaceId,
  // so "there is no workspace yet" is not a reason to skip it. GET below is
  // deliberately NOT gated: listing memberships you already hold is read-only
  // and helps a Member understand state during an incident.
  if (!(await isWorkspaceAccessEnabled(createServiceClient()))) {
    return NextResponse.json(
      { error: 'Workspace access is temporarily disabled.' },
      { status: 503 }
    )
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
  const service = createServiceClient()

  const { data: workspace, error: workspaceError } = await service
    .from('workspaces')
    .insert({
      name,
      slug: `${slugify(name)}-${slugSuffix()}`,
      workspace_type: workspaceType,
      roster_enabled: rosterEnabled ?? false,
      catalogue_enabled: catalogueEnabled ?? false,
      // subject_member_id only means anything for workspace_type='artist_team'
      // (D-07); naming a subject grants nothing until they accept (D-05).
      subject_member_id: workspaceType === 'artist_team' ? (subjectMemberId ?? null) : null,
      created_by: gate.user.id,
    })
    .select('id, name, slug, workspace_type, roster_enabled, catalogue_enabled, verification_state, subject_member_id, created_by, created_at')
    .single()

  if (workspaceError || !workspace) {
    return NextResponse.json(
      { error: workspaceError?.message ?? 'Failed to create workspace.' },
      { status: 500 }
    )
  }

  const { error: membershipError } = await service.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: gate.user.id,
    role: 'owner',
    status: 'active',
    invited_by: gate.user.id,
  })

  if (membershipError) {
    // Never leave an ownerless workspace behind (D-13 floor starts from the
    // first row) — delete the just-created workspace before returning.
    await service.from('workspaces').delete().eq('id', workspace.id)
    return NextResponse.json(
      { error: `Failed to seat workspace owner: ${membershipError.message}` },
      { status: 500 }
    )
  }

  await logWorkspaceAction(service, {
    workspaceId: workspace.id,
    actorId: gate.user.id,
    subjectMemberId: null,
    action: 'workspace.created',
    targetType: 'workspace',
    targetId: workspace.id,
  })

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
