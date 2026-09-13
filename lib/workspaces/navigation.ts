import type { WorkspaceRole, WorkspaceType } from '@/lib/workspaces/types'

// Client-safe workspace navigation vocabulary. Keep this module free of
// Supabase and server-only authorization imports: the context switcher is
// rendered inside ArtistNav's client boundary, while authorization remains
// exclusively in active-context.ts and access.ts on the server.

export type WorkspaceSwitcherOption = {
  id: string
  name: string
  type: WorkspaceType
  typeLabel: string
  role: WorkspaceRole
  rosterEnabled: boolean
  catalogueEnabled: boolean
}

export function workspaceHomeHref(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}`
}

export function workspaceRoleLabel(role: WorkspaceRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}
