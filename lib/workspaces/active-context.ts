import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isWorkspaceAccessPermitted,
  resolveWorkspaceAccessDecision,
  type WorkspaceCohortClient,
  type WorkspaceCohortEnvironment,
} from '@/lib/workspaces/cohort'
import {
  requireWorkspaceAccess,
  WORKSPACE_NOT_FOUND,
  type WorkspaceAccessResult,
} from '@/lib/workspaces/access'
import {
  WORKSPACE_ROLE_VALUES,
  WORKSPACE_TYPE_LABELS,
  WORKSPACE_TYPE_VALUES,
  type WorkspaceRole,
  type WorkspaceType,
} from '@/lib/workspaces/types'
import type { WorkspaceSwitcherOption } from '@/lib/workspaces/navigation'

// ─── Active Member workspace context (D-30, D-31, D-33) ───────────────
// The URL is the only active-workspace state. This module deliberately has
// no browser API and no dependency on lib/auth/session-identity.ts: that
// older module protects switches between two different authenticated
// identities, while this module moves one Member among contexts in the same
// session. Authorization remains requireWorkspaceAccess on every request.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const WORKSPACE_TYPES = new Set<string>(WORKSPACE_TYPE_VALUES)
const WORKSPACE_ROLES = new Set<string>(WORKSPACE_ROLE_VALUES)

export type ActiveWorkspaceContext = WorkspaceSwitcherOption & {
  slug: string
}

export type WorkspaceMembershipOptionRow = {
  workspace_id: string
  role: string
  status: string
  expires_at: string | null
}

export type WorkspaceOptionRow = {
  id: string
  name: string
  workspace_type: string
  roster_enabled: boolean
  catalogue_enabled: boolean
}

type WorkspaceContextRow = WorkspaceOptionRow & { slug: string }

export type ActiveWorkspaceContextResult =
  | { ok: true; context: ActiveWorkspaceContext }
  | Extract<WorkspaceAccessResult, { ok: false }>

export function isWorkspaceId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function isWorkspaceType(value: string): value is WorkspaceType {
  return WORKSPACE_TYPES.has(value)
}

function isWorkspaceRole(value: string): value is WorkspaceRole {
  return WORKSPACE_ROLES.has(value)
}

function hasLiveSeat(row: WorkspaceMembershipOptionRow, now: number): boolean {
  if (row.status !== 'active' || !isWorkspaceRole(row.role)) return false
  if (!row.expires_at) return true

  const expiry = new Date(row.expires_at).getTime()
  return Number.isFinite(expiry) && expiry > now
}

/**
 * Converts RLS-scoped membership and workspace rows into the only shape the
 * switcher may receive. Unknown enums, malformed ids, blank names, duplicate
 * seats, expired seats, and missing joins all fail closed.
 */
export function buildWorkspaceSwitcherOptions(
  memberships: readonly WorkspaceMembershipOptionRow[],
  workspaces: readonly WorkspaceOptionRow[],
  now = Date.now()
): WorkspaceSwitcherOption[] {
  const workspaceById = new Map(workspaces.map(workspace => [workspace.id, workspace]))
  const seen = new Set<string>()
  const options: WorkspaceSwitcherOption[] = []

  for (const membership of memberships) {
    if (!isWorkspaceId(membership.workspace_id) || seen.has(membership.workspace_id)) continue
    if (!hasLiveSeat(membership, now)) continue

    const workspace = workspaceById.get(membership.workspace_id)
    if (
      !workspace ||
      workspace.id !== membership.workspace_id ||
      !isWorkspaceId(workspace.id) ||
      !workspace.name.trim() ||
      !isWorkspaceType(workspace.workspace_type)
    ) {
      continue
    }

    seen.add(workspace.id)
    options.push({
      id: workspace.id,
      name: workspace.name.trim(),
      type: workspace.workspace_type,
      typeLabel: WORKSPACE_TYPE_LABELS[workspace.workspace_type],
      role: membership.role as WorkspaceRole,
      rosterEnabled: workspace.roster_enabled === true,
      catalogueEnabled: workspace.catalogue_enabled === true,
    })
  }

  return options.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Lists switchable contexts for the current Member. The session client is
 * intentional: workspace RLS remains an independent visibility boundary.
 * The service client is used only for the server-side D-55/D-56 decision.
 */
export async function loadWorkspaceSwitcherOptions(
  supabase: SupabaseClient,
  cohortClient: WorkspaceCohortClient,
  userId: string,
  environment: WorkspaceCohortEnvironment = process.env,
  now = Date.now()
): Promise<WorkspaceSwitcherOption[]> {
  const decision = await resolveWorkspaceAccessDecision(cohortClient, userId, environment)
  if (!isWorkspaceAccessPermitted(decision)) return []

  const { data: membershipRows, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, status, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (membershipError || !membershipRows?.length) return []

  const liveMemberships = (membershipRows as WorkspaceMembershipOptionRow[]).filter(row =>
    hasLiveSeat(row, now)
  )
  const workspaceIds = [...new Set(liveMemberships.map(row => row.workspace_id))]
  if (workspaceIds.length === 0) return []

  const { data: workspaceRows, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id, name, workspace_type, roster_enabled, catalogue_enabled')
    .in('id', workspaceIds)

  if (workspaceError) return []

  return buildWorkspaceSwitcherOptions(
    liveMemberships,
    (workspaceRows ?? []) as WorkspaceOptionRow[],
    now
  )
}

/**
 * Resolves `/w/[workspaceId]` from the route id and authenticated user.
 * requireWorkspaceAccess re-reads the live seat first; only then does this
 * function load the workspace's display data through the RLS session.
 */
export async function resolveActiveWorkspaceContext(
  supabase: SupabaseClient,
  user: { id: string; app_metadata?: unknown } | null,
  workspaceId: string
): Promise<ActiveWorkspaceContextResult> {
  if (!isWorkspaceId(workspaceId)) {
    return { ok: false, status: 404, error: WORKSPACE_NOT_FOUND }
  }

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  if (!access.ok) return access

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, slug, workspace_type, roster_enabled, catalogue_enabled')
    .eq('id', workspaceId)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: 'Could not load workspace' }
  }

  const row = data as WorkspaceContextRow | null
  if (
    !row ||
    row.id !== workspaceId ||
    !row.name.trim() ||
    !row.slug.trim() ||
    !isWorkspaceType(row.workspace_type)
  ) {
    return { ok: false, status: 404, error: WORKSPACE_NOT_FOUND }
  }

  return {
    ok: true,
    context: {
      id: row.id,
      name: row.name.trim(),
      slug: row.slug,
      type: row.workspace_type,
      typeLabel: WORKSPACE_TYPE_LABELS[row.workspace_type],
      role: access.role,
      rosterEnabled: row.roster_enabled === true,
      catalogueEnabled: row.catalogue_enabled === true,
    },
  }
}
