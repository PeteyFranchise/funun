import type { SupabaseClient } from '@supabase/supabase-js'
import { getStaffRoles } from '@/lib/admin/staff-role'
import type { WorkspaceRole } from '@/lib/workspaces/types'

// ─── Server-side workspace access gate (D-30, D-31, D-33) ──────────────────
// Page redirects and workspace chrome are presentation only — a stale tab or
// a direct request still reaches an API route. This gate re-derives the
// caller's live membership from the DATABASE on every call, mirroring
// lib/accounts/member-api-gate.ts's requireMemberApiAccount doctrine exactly.
//
// The workspace id MUST arrive from the route's own path segment, never from
// a request body or header (D-31) — every call site in this codebase passes
// a path param, and this module never reads a request body itself.
//
// This module is additive and PARALLEL to the existing account-context and
// identity-resolution modules (see lib/accounts/, lib/auth/, components/auth/).
// It must not extend those modules' workspace-shaped union type or their
// sign-out-based context switcher — D-33 requires the opposite mechanism
// (instant, in-session switching) for workspaces, so this gate is a new,
// standalone module rather than a generalization of the staff-only
// sign-out boundary.

export const WORKSPACE_ACCESS_REQUIRED =
  'Workspaces do not apply to Funūn Team Member identities. Sign in with your personal Member account.'

type AuthAccount = {
  id: string
  app_metadata?: unknown
}

export type WorkspaceAccessResult =
  | { ok: true; workspaceId: string; userId: string; role: WorkspaceRole }
  | { ok: false; status: 401 | 403 | 500; error: string }

/**
 * Enforces the workspace access boundary for `/api/workspaces/**` routes.
 *
 * Order mirrors requireMemberApiAccount: null user -> 401; any staff role ->
 * 403 (staff identities are never workspace members, D-33, evaluated before
 * any database lookup); missing/non-active/lapsed membership row -> 403;
 * lookup error -> 500, never a permissive fallthrough. On success, `role`
 * came from the database on THIS call — no code path accepts a caller-
 * supplied role or membership object.
 */
export async function requireWorkspaceAccess(
  supabase: SupabaseClient,
  user: AuthAccount | null,
  workspaceId: string,
  options?: { now?: number }
): Promise<WorkspaceAccessResult> {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  if (getStaffRoles(user).length > 0) {
    return { ok: false, status: 403, error: WORKSPACE_ACCESS_REQUIRED }
  }

  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('role, status, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: 'Could not verify workspace membership' }
  }

  if (!membership || membership.status !== 'active') {
    return { ok: false, status: 403, error: 'You are not an active member of this workspace' }
  }

  const now = options?.now ?? Date.now()
  if (membership.expires_at && new Date(membership.expires_at as string).getTime() <= now) {
    return { ok: false, status: 403, error: 'Your seat on this workspace has expired' }
  }

  return {
    ok: true,
    workspaceId,
    userId: user.id,
    role: membership.role as WorkspaceRole,
  }
}

/**
 * Composes a passed WorkspaceAccessResult with a role predicate (e.g.
 * canManageWorkspaceMembers from '@/lib/workspaces/membership'), so a route
 * expresses "gate + role check" without inlining a role literal itself.
 */
export function requireWorkspaceRole(
  access: WorkspaceAccessResult,
  predicate: (role: WorkspaceRole) => boolean,
  error: string
): WorkspaceAccessResult {
  if (!access.ok) return access
  if (!predicate(access.role)) {
    return { ok: false, status: 403, error }
  }
  return access
}
