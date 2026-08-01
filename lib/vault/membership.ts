// ─── Project membership role helpers ─────────────────────────────────
// Single TypeScript source of truth for the four-role vocabulary that
// migration 078's project_members CHECK constraint and RLS policies
// mirror. Pure, no-I/O helper module over vault domain types (style
// precedent: lib/vault/readiness.ts) — no Supabase client, no side
// effects. Keep the four literal role strings byte-identical to the SQL
// side (migration 078's CHECK (role IN ('owner','co-owner','editor',
// 'viewer'))).
//
// Capability matrix, 21-SPEC.md ②:
// | Role     | View | Edit project | Manage guest list | Delete project |
// |----------|:---:|:---:|:---:|:---:|
// | owner    | ✓ | ✓ | ✓ | ✓ |
// | co-owner | ✓ | ✓ | ✓ | ✗ |
// | editor   | ✓ | ✓ | ✗ | ✗ |
// | viewer   | ✓ | ✗ | ✗ | ✗ |

export type ProjectRole = 'owner' | 'co-owner' | 'editor' | 'viewer'

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'Owner',
  'co-owner': 'Co-owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

export const PROJECT_ROLE_VALUES = Object.keys(PROJECT_ROLE_LABELS) as ProjectRole[]

/** True for all four roles — every member can at least view the project. */
export function canViewProject(role: ProjectRole): boolean {
  return PROJECT_ROLE_VALUES.includes(role)
}

/** True for owner, co-owner, editor. False for viewer or an unrecognized role. */
export function canEditProject(role: ProjectRole): boolean {
  return role === 'owner' || role === 'co-owner' || role === 'editor'
}

/** True for owner, co-owner. False for editor, viewer, or an unrecognized role. */
export function canManageGuests(role: ProjectRole): boolean {
  return role === 'owner' || role === 'co-owner'
}

/** True for owner only. */
export function canDeleteProject(role: ProjectRole): boolean {
  return role === 'owner'
}
