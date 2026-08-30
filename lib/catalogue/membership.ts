// ─── Work membership tier helpers ─────────────────────────────────────
// Single TypeScript source of truth for the two-tier capability vocabulary
// that migration 136's `work_members` CHECK constraint and RLS policies
// mirror. Pure, no-I/O helper module over catalogue domain types (style
// precedent: lib/vault/membership.ts) — no Supabase client, no side
// effects. Keep the two literal tier strings byte-identical to the SQL
// side (migration 136's CHECK (tier IN ('contribute','administer'))).
//
// Capability matrix (doctrine scope item 9):
// | Tier        | Play versions | Add own iterations (upload/hum) | Edit lyrics pad | Annotate | Manage membership | Money/release doors |
// |-------------|:---:|:---:|:---:|:---:|:---:|:---:|
// | contribute  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
// | administer  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
//
// SHIPS IN 37.1: canContribute, canAdminister, canManageMembership — the
// last gates plan 05's roster route. NOT WIRED TO ANY ROUTE IN 37.1:
// canOpenMoneyOrReleaseDoors. Graduate-to-release, Crate submission and
// sheet-execution requests are 37.2 surfaces that do not exist yet — this
// predicate is typed and tested TODAY so the door plans inherit a correct
// answer instead of writing one under deadline. It is not dead code.
//
// Being ON THE WORK and being ON THE SPLITS are different facts —
// membership grants access, the sheet grants ownership, the diary records
// both (doctrine, verbatim). Nothing in this module returns a percentage
// or references a split sheet.

export type WorkTier = 'contribute' | 'administer'

export const WORK_TIER_LABELS: Record<WorkTier, string> = {
  contribute: 'Contributor',
  administer: 'Administrator',
}

export const WORK_TIER_VALUES = Object.keys(WORK_TIER_LABELS) as WorkTier[]

/** True for both tiers; false for an unrecognized value. Every member may contribute. */
export function canContribute(tier: WorkTier): boolean {
  return (WORK_TIER_VALUES as string[]).includes(tier)
}

/** True for the administer tier only. False for contribute or an unrecognized value. */
export function canAdminister(tier: WorkTier): boolean {
  return tier === 'administer'
}

/**
 * True for the administer tier OR the work owner. `isOwner` is a second,
 * explicit fact — not a tier — because an owner acts on their own work
 * without ever needing a membership row; see lib/catalogue/access.ts for
 * why a route must keep working if that row is ever missing.
 */
export function canManageMembership(tier: WorkTier, isOwner: boolean): boolean {
  return isOwner || tier === 'administer'
}

/**
 * The 37.2 seam: graduate to a release, Crate submission, sheet-execution
 * requests — the money and release doors. Deliberately expressed as its
 * own predicate rather than reusing canManageMembership's body, even
 * though both currently resolve the same way for the two-tier matrix:
 * these are two different facts (who can change the roster vs. who can
 * move money or trigger a release) that a future tier could split apart.
 */
export function canOpenMoneyOrReleaseDoors(tier: WorkTier, isOwner: boolean): boolean {
  return isOwner || tier === 'administer'
}
