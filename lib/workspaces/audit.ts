import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspacePermission } from '@/lib/workspaces/permissions'

// ─── Member-side write-through audit trail (D-50) ──────────────────────────
// Pass a SERVICE-ROLE client — the audit table is REVOKEd for INSERT/
// UPDATE/DELETE from `authenticated`/`anon` (migration 182 section (e));
// clients can never write it directly, and it can never be UPDATEd or
// DELETEd by any role (append-only, D-50), even service-role reached
// through PostgREST.
//
// ── WHAT THIS FUNCTION IS, AFTER PHASE 38.0.2 (WSR-13) ───────────────────
//
// IT USED TO CLAIM to be the one write-through call every workspace-context
// write invoked. THAT BECAME FALSE THE MOMENT THE RPCs TOOK OVER. Migration
// 198 gives every CONSEQUENTIAL state change — custody acceptance,
// invitation redemption, ownership and owner-floor changes, roster
// transitions — its own SECURITY DEFINER RPC that locks the row,
// revalidates, mutates and writes its OWN audit row IN THE SAME
// TRANSACTION. Migration 197's deferred constraint triggers then make that
// non-bypassable rather than merely conventional: a consequential mutation
// with no audit row FAILS AT COMMIT. The corrected sentence matters because
// a stale doctrine comment in this codebase is exactly how migration 139's
// wrong parenthetical reached production and cost a day of broken custody
// transfer, and lib/workspaces/audit.test.ts now asserts the superseded
// sentence stays gone.
//
// WHAT REMAINS HERE IS THE NON-CONSEQUENTIAL CLASS — actions that form no
// authority and move no row through a state machine, and for which there is
// no RPC and should not be one. In full, and this list is the contract:
//
//   1. INVITATION ISSUANCE  (redemption is the RPC's; issuing is not)
//   2. AGREEMENT EVIDENCE UPLOAD
//   3. D-56 KILL-SWITCH FLIPS
//   4. WORKSPACE CONFIGURATION CHANGES
//
// Roster PROPOSAL issuance belongs to class 1's shape for the same reason:
// a proposal is inert until the named Member affirms it (D-05).
//
// ── THE THREE CONSTRAINTS THIS FUNCTION NOW WRITES UNDER (migration 197) ──
//
//   (e) APPEND-ONLY TRIGGERS. A row written here can never be corrected or
//       removed by anybody, service_role included. Write it right the first
//       time; there is no second attempt and no cleanup path.
//
//   (f) THE RESTRICTED-PII WRITE GUARD. A `changes` object carrying a
//       restricted key AT ANY DEPTH — email, phone, contact_email,
//       contact_phone, address, tax_id, token, token_hash, ipi, isni — is
//       REFUSED AT INSERT. So a caller must not put contact details in
//       `changes` at all. THIS FUNCTION DELIBERATELY DOES NOT STRIP THEM
//       AND MUST NOT BE MADE TO: a silent strip here would turn a loud,
//       correct refusal into quiet data loss, and would hide the fact that
//       a route tried to log PII — which is the only signal anyone gets. The
//       primary control is the CALLER not writing it (R-13/WSR-19); the
//       trigger is the backstop; a third silent layer between them would
//       defeat the backstop's diagnostic value. The invited address
//       legitimately lives on `workspace_invitations.email`, whose SELECT
//       policy is owner/admin-only and which the audit row already reaches
//       through `target_id`.
//
//   (g) THE DEFERRED AUDIT-ASSERTION TRIGGERS. A consequential mutation
//       without its audit row fails at COMMIT, and the assertion matches on
//       `target_id = NEW.id`. THIS FUNCTION IS THEREFORE NEVER A SUBSTITUTE
//       FOR AN RPC ON THOSE PATHS: calling it beside a raw UPDATE would be a
//       second writer racing the constraint, and the stale copy is where
//       drift lives.
//
// Never throws: a log failure never blocks the primary write, matching the
// house convention (lib/staff/audit.ts, lib/notifications/index.ts). The
// caller decides whether a { ok: false } result should be surfaced.
//
// THAT CONTRACT IS RETAINED DESPITE BEING FINDING F14'S OBSERVABLE HALF,
// and the reason is that F14 no longer applies to anything this function
// still serves: it is retained ONLY for the non-consequential paths above,
// where a log failure genuinely should not block the primary write, and the
// consequential paths do not rely on it at all any more — their audit row
// is written inside the same transaction as their mutation and cannot be
// lost without losing the mutation with it.
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
