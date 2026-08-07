import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Staff write-through audit trail (D-04) ────────────────────────────────
// Pass a SERVICE-ROLE client — staff_audit_log is a zero-RLS/REVOKE-ALL
// table (migration 089), reachable only via the service role; clients can
// never write or read it (T-25-03).
//
// This is the ONE write-through call every staff write (25-04, 25-05)
// invokes — centralizing the audit requirement into a single code-review
// surface instead of scattering ad-hoc .insert() calls across routes.
//
// Called UNCONDITIONALLY after every staff write, including no-op/
// idempotent edits — mirrors grantOrRevokeVerification's "log even
// idempotent actions" discipline (verification_audit_log precedent).
// Never throws: mirrors createNotification's { ok, error } non-throwing
// return shape (lib/notifications/index.ts) — the caller decides whether
// a log failure should block the primary write (D-04 prefers: never fail
// the primary write on a log error).

export async function logStaffAction(
  service: SupabaseClient,
  args: {
    actorId: string
    action: string
    targetType: string
    targetId?: string | null
    changes?: Record<string, unknown>
  }
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await service.from('staff_audit_log').insert({
    actor_id: args.actorId,
    action: args.action,
    target_type: args.targetType,
    target_id: args.targetId ?? null,
    changes: args.changes ?? {},
  })

  return { ok: !error, error: error?.message }
}
