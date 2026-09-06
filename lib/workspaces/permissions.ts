import type { WorkspaceAuthorityTier } from '@/lib/workspaces/types'

// ─── Workspace permission catalogue (D-19, D-21, D-40, D-42) ────────────
// Pure, zero-I/O const-map + resolver module — no Supabase client, no side
// effects (style precedent: lib/client-partners/health.ts's PERMISSION_TIER
// / bundle-exclusion convention).
//
// D-42 requires payout and tax capabilities to be STRUCTURALLY excluded —
// not a permission that defaults to false. They therefore live in a
// SEPARATE union (STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES, below) that is
// deliberately not a member of WorkspacePermission. This makes granting one
// unrepresentable under strict TypeScript: isSubsetGrant() cannot accept
// one as a WorkspacePermission, and migration 184's CHECK constraint list
// (generated from WORKSPACE_PERMISSION_VALUES) cannot store one. This
// supersedes 38-RESEARCH.md Pattern 3's single-union-with-excluded-set
// sketch for the payout case specifically — a value living inside the
// grantable union IS "a permission defaulting to false," which is exactly
// what D-42 forbids.

// ─── Permission catalogue (19 grantable permissions, matrix order) ──────
export const WORKSPACE_PERMISSION_VALUES = [
  'view_summaries',
  'view_metadata',
  'edit_metadata',
  'access_writers_room',
  'upload_audio',
  'download_protected_audio',
  'access_clean_masters',
  'invite_collaborators',
  'view_split_sheets',
  'view_contracts',
  'upload_contracts',
  'request_signatures',
  'view_private_rights_identifiers',
  'edit_rights_information',
  'manage_registrations',
  'approve_releases',
  'deliver_assets',
  'view_earnings',
  'act_on_behalf',
] as const

export type WorkspacePermission = (typeof WORKSPACE_PERMISSION_VALUES)[number]

// ─── Tier assignment (D-21) ───────────────────────────────────────────────
// Typed to the two-value subset so `none` is not assignable here — a
// permission is either operational or authority, never tier-less.
//
// Note: access_clean_masters, view_private_rights_identifiers, and
// view_earnings are OPERATIONAL tier yet bundle-excluded (see
// isBundleExcluded below). D-40 deliberately declines a third "sensitive"
// tier in favor of bundle exclusion — tier and bundle membership are
// independent axes.
export const PERMISSION_TIER: Record<WorkspacePermission, 'operational' | 'authority'> = {
  view_summaries: 'operational',
  view_metadata: 'operational',
  edit_metadata: 'operational',
  access_writers_room: 'operational',
  upload_audio: 'operational',
  download_protected_audio: 'operational',
  access_clean_masters: 'operational',
  invite_collaborators: 'operational',
  view_split_sheets: 'operational',
  view_contracts: 'operational',
  upload_contracts: 'operational',
  request_signatures: 'authority',
  view_private_rights_identifiers: 'operational',
  edit_rights_information: 'authority',
  manage_registrations: 'operational',
  approve_releases: 'authority',
  deliver_assets: 'authority',
  view_earnings: 'operational',
  act_on_behalf: 'authority',
}

// ─── Product-facing labels ────────────────────────────────────────────────
export const PERMISSION_LABELS: Record<WorkspacePermission, string> = {
  view_summaries: 'View roster / project summaries',
  view_metadata: 'View metadata',
  edit_metadata: 'Edit metadata',
  access_writers_room: "Access Writer's Room",
  upload_audio: 'Upload audio',
  download_protected_audio: 'Download protected/preview audio',
  access_clean_masters: 'Access clean masters',
  invite_collaborators: 'Invite collaborators',
  view_split_sheets: 'View split sheets',
  view_contracts: 'View contracts',
  upload_contracts: 'Upload / generate contracts',
  request_signatures: 'Request signatures',
  view_private_rights_identifiers: 'View private rights identifiers',
  edit_rights_information: 'Edit rights information',
  manage_registrations: 'Manage registrations',
  approve_releases: 'Approve releases',
  deliver_assets: 'Deliver assets',
  view_earnings: 'View earnings',
  act_on_behalf: 'Act on behalf of a Member',
}

// ─── Bundle exclusion (D-40) ───────────────────────────────────────────────
// High-sensitivity permissions that must never appear in a preset bundle —
// they must be ticked individually, and every use is logged. Clean-master
// download in particular preserves custody D-01's preview/clean-master
// separation (sound-vault-master-custody.md D-01, lines 54-107).
const BUNDLE_EXCLUDED_PERMISSIONS: ReadonlySet<WorkspacePermission> = new Set([
  'access_clean_masters',
  'view_private_rights_identifiers',
  'view_earnings',
])

export function isBundleExcluded(permission: WorkspacePermission): boolean {
  return BUNDLE_EXCLUDED_PERMISSIONS.has(permission)
}

// ─── Preset bundles (D-19) ─────────────────────────────────────────────────
// Bundles are DATA, not code branches — nothing anywhere keys behavior off
// a bundle name or a workspace role name (D-19: "Nothing is hardcoded to a
// role name"). Keys are neutral, capability-shaped, editable at the data
// layer — never workspace role names.
//
// No bundle may name a bundle-excluded permission (D-40) — enforced by a
// test that iterates every bundle rather than spot-checking one.
const READ_ONLY: readonly WorkspacePermission[] = [
  'view_summaries',
  'view_metadata',
  'view_split_sheets',
  'view_contracts',
]

const DAY_TO_DAY: readonly WorkspacePermission[] = [
  ...READ_ONLY,
  'edit_metadata',
  'access_writers_room',
  'upload_audio',
  'download_protected_audio',
  'invite_collaborators',
  'manage_registrations',
]

const FULL_OPERATIONAL: readonly WorkspacePermission[] = [...DAY_TO_DAY, 'upload_contracts']

const OPERATIONAL_PLUS_AUTHORITY: readonly WorkspacePermission[] = [
  ...FULL_OPERATIONAL,
  'request_signatures',
  'edit_rights_information',
  'approve_releases',
  'deliver_assets',
  'act_on_behalf',
]

export const WORKSPACE_PERMISSION_BUNDLES: Readonly<
  Record<string, readonly WorkspacePermission[]>
> = {
  read_only: READ_ONLY,
  day_to_day: DAY_TO_DAY,
  full_operational: FULL_OPERATIONAL,
  operational_plus_authority: OPERATIONAL_PLUS_AUTHORITY,
}

// ─── Structural exclusion (D-42) ──────────────────────────────────────────
// manage_payouts and view_tax_information are NOT members of
// WorkspacePermission. This is the structural half of D-42: because these
// names live in a separate union, no grant record can hold one under
// strict TypeScript, no bundle can name one, and migration 184's CHECK
// constraint list (generated from WORKSPACE_PERMISSION_VALUES) cannot
// store one. Do not add a `false` entry for either name in PERMISSION_TIER
// or any bundle above — that would put them back inside the grantable
// surface, which is exactly what D-42 forbids.
export const STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES = [
  'manage_payouts',
  'view_tax_information',
] as const

export type StructurallyExcludedCapability =
  (typeof STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES)[number]

const STRUCTURALLY_EXCLUDED_SET: ReadonlySet<string> = new Set(
  STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES
)

export function isStructurallyExcludedCapability(value: string): boolean {
  return STRUCTURALLY_EXCLUDED_SET.has(value)
}

// Re-exported so downstream modules (e.g. grants.ts) can reference the
// authority-tier vocabulary without a second import of lib/workspaces/types.
export type { WorkspaceAuthorityTier }
