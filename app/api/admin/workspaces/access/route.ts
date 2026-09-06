import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { readWorkspaceAccessState, setWorkspaceAccessEnabled } from '@/lib/workspaces/access-kill-switch'

// ─── /api/admin/workspaces/access — the D-56 / WS-31 platform-wide kill ────
// switch, leadership-only. This route plus the migration 186 push checkpoint
// are what "owner-operable without a deploy" requires — flipping
// `workspace_access_config.enabled` makes every workspace RLS branch on
// `vault_projects` and its four child tables return FALSE on the very next
// query, with no deploy and no further migration (see
// public.workspace_access_enabled() in migration 186). Personal Member
// access (ownership, project_members) never consults this control and is
// entirely unaffected by it.
//
// `requireStaff(['leadership'])` is the FIRST statement in BOTH handlers,
// before any DB read — this disables a platform-wide access layer, so it is
// leadership-only, never general OPERATIONAL_STAFF_ROLES (the requireStaff()
// default). Uses `createServiceClient()` throughout: migration 186 REVOKEs
// SELECT/INSERT/UPDATE/DELETE on `workspace_access_config` from
// `authenticated`/`anon`, so a session-scoped client cannot reach this table
// at all — only the service role can.
//
// DELIBERATE EXEMPTION FROM THE KILL SWITCH ITSELF (F7 hotfix, 2026-09-06):
// this route is gated by `requireStaff`, a Funūn-staff check entirely
// separate from `requireWorkspaceAccess` and the workspace-membership model
// — it never calls `requireWorkspaceAccess` and therefore never consults
// `isWorkspaceAccessEnabled()`. This is intentional and load-bearing: this
// route MUST keep working while `enabled` is FALSE, or an owner who flips
// the switch off would have no way to flip it back on. Do not add a
// `requireWorkspaceAccess` call to this route under any circumstance — that
// would make the kill switch capable of disabling itself.
//
// No UI ships for this in this plan — the route plus the 186 push checkpoint
// are the full "owner-operable" surface for now; a Playbook IT-room control
// panel belongs to Phase 38.2's rollout slice.

const PostBodySchema = z
  .object({
    enabled: z.boolean(),
    reason: z.string().trim().min(1).optional(),
  })
  .strict()

export async function GET() {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()

  try {
    const state = await readWorkspaceAccessState(service)
    return NextResponse.json({ data: state })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read workspace access state' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const { enabled, reason } = parsed.data
  const service = createServiceClient()

  let state
  try {
    state = await setWorkspaceAccessEnabled(service, {
      enabled,
      reason,
      actorUserId: auth.user.id,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update workspace access state' },
      { status: 400 }
    )
  }

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'workspace_access_toggled',
    targetType: 'workspace_access_config',
    changes: { enabled, reason: reason ?? null },
  })

  return NextResponse.json({ data: state })
}
