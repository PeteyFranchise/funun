import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspacePermission } from '@/lib/workspaces/permissions'

// ─── Member-side write-through audit trail (D-50) ──────────────────────────
// Pass a SERVICE-ROLE client — the audit table is REVOKEd for INSERT/
// UPDATE/DELETE from `authenticated`/`anon` (migration 182 section (e));
// clients can never write it directly, and it can never be UPDATEd or
// DELETEd by any role (append-only, D-50), even service-role reached
// through PostgREST.
//
// This is the ONE write-through call every workspace-context write invokes
// — centralizing the D-50 requirement into a single code-review surface,
// exactly as lib/staff/audit.ts's logStaffAction does for the staff side.
//
// Never throws: a log failure never blocks the primary write, matching the
// house convention (lib/staff/audit.ts, lib/notifications/index.ts). The
// caller decides whether a { ok: false } result should be surfaced.
//
// Deliberate deviation from logStaffAction: a workspace row carries BOTH
// `actor_user_id` and `subject_member_id` — never one collapsed identity.
// D-22 requires every delegated action to be attributed to both the person
// who acted and the Member acted on behalf of; staff_audit_log has no
// "on behalf of" concept to represent, so it only ever names one actor.

export async function logWorkspaceAction(
  service: SupabaseClient,
  args: {
    workspaceId: string
    actorId: string
    subjectMemberId: string | null
    action: string
    permissionReliedOn?: WorkspacePermission | null
    targetType: string
    targetId?: string | null
    changes?: Record<string, unknown>
  }
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await service.from('workspace_audit_log').insert({
    workspace_id: args.workspaceId,
    actor_user_id: args.actorId,
    subject_member_id: args.subjectMemberId,
    action: args.action,
    permission_relied_on: args.permissionReliedOn ?? null,
    target_type: args.targetType,
    target_id: args.targetId ?? null,
    changes: args.changes ?? {},
  })

  return { ok: !error, error: error?.message }
}
