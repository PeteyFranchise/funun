// ─── The delegation-chain validity decision (R-01, D-21, WSR-02) ──────────
// Pure, zero-I/O module — no Supabase client, no side effects (style
// precedent: lib/workspaces/grants.ts's `ReadonlySet` inputs, ordered
// fail-closed checks, tagged-union return, "never throws" doc-comment
// convention; lib/workspaces/roster.ts's record-of-constants-plus-predicate
// shape for `MEMBER_CONSENT_SOURCE`/`MAX_GRANT_CHAIN_DEPTH`).
//
// D-21 describes exactly two tiers of authority: the Member's own root
// consent (lib/workspaces/consent.ts), and a workspace's re-delegation of a
// SUBSET of what the Member consented to. A delegated grant therefore
// carries a `parent_grant_id` pointing at the grant it was relayed from,
// and the chain of `parent_grant_id` links must terminate at a live
// `source = 'member_consent'` row — a chain with no consent root, or with
// any revoked link along the way, confers nothing.
//
// SELF-FK, NOT A CLOSURE TABLE. The lineage is a self-referential
// `parent_grant_id` chain rather than a closure table because the depth is
// bounded and shallow by design (D-21's two tiers do not describe
// arbitrarily deep admin-to-admin-to-admin re-delegation chains). A closure
// table would only earn its complexity if multi-level workspace hierarchies
// become a real product requirement, which is out of this phase's scope.
//
// REVOCATION CASCADES FOR FREE AT READ TIME. Nothing about a chain is ever
// cached — `isGrantChainLive` re-walks the supplied rows on every call, so
// a parent grant's revocation is visible to every descendant on the very
// next read with no cascade job and no cron. This mirrors
// `lib/workspaces/grant-service.ts`'s header doctrine ("nothing is cached,
// by design") applied to the lineage dimension specifically (D-49).
//
// SQL TWIN. `public.workspace_grant_lineage_live` (migration 192) is this
// module's authoritative SQL-side counterpart, walking the same
// `parent_grant_id` chain via `WITH RECURSIVE` inside a `STABLE SECURITY
// DEFINER` function. The two must be changed together — a change to which
// links count as "live" here without a matching SQL change would let the
// TypeScript-side and SQL-side authorities silently drift apart.

// ─── Already-fetched chain row shape ──────────────────────────────────────
// Describes one already-fetched `workspace_grants` row. This module
// performs no lookups of its own — the caller resolves the candidate rows
// (the grant itself plus every row reachable by following `parentGrantId`)
// from the DB before calling `isGrantChainLive`.
export type GrantChainRow = {
  id: string
  parentGrantId: string | null
  source: string
  permission: string
  projectId: string | null
  revokedAt: string | null
  relationshipId: string
}

// The one literal naming the root source value, shared by this module, the
// schema (plan 05) and the SQL twin — so all three name one string rather
// than three independently-typed copies drifting apart.
export const MEMBER_CONSENT_SOURCE = 'member_consent'

// Chain depth is bounded because D-21 describes exactly two tiers of
// authority by design, not because Postgres or this walker cannot go
// deeper — a chain longer than this is refused outright rather than walked
// indefinitely, closing off a denial-of-service vector from a
// pathologically long or adversarially-constructed row set
// (T-38.0.1-03-06).
export const MAX_GRANT_CHAIN_DEPTH = 8

export type GrantChainResult = { ok: true } | { ok: false; reason: string }

/**
 * Whether the grant chain ending at `grantId` is currently live: every link
 * from the named grant up through its `parentGrantId` ancestors is
 * unrevoked, permission and project scope only ever narrow (never widen)
 * moving from parent to child, the chain terminates at an unrevoked row
 * with `parentGrantId === null` and `source === MEMBER_CONSENT_SOURCE`, and
 * the walk neither loops on a cycle nor exceeds `MAX_GRANT_CHAIN_DEPTH`.
 * Fails closed — returning `{ ok: false }` with a specific reason — on a
 * missing grant, a revoked link anywhere in the chain, a permission
 * mismatch, a project-scope widening, a cycle, a dangling parent id, or an
 * over-deep chain. Never throws.
 */
export function isGrantChainLive(args: {
  grantId: string
  rows: readonly GrantChainRow[]
}): GrantChainResult {
  const { grantId, rows } = args

  const byId = new Map<string, GrantChainRow>()
  for (const row of rows) byId.set(row.id, row)

  const leaf = byId.get(grantId)
  if (!leaf) {
    return { ok: false, reason: `grant "${grantId}" is not present among the supplied rows` }
  }

  const visited = new Set<string>([grantId])
  let current = leaf
  let depth = 0

  for (;;) {
    if (current.revokedAt !== null) {
      return { ok: false, reason: `grant "${current.id}" is revoked — the chain is not live` }
    }

    if (depth > MAX_GRANT_CHAIN_DEPTH) {
      return {
        ok: false,
        reason: `chain exceeds the maximum depth of ${MAX_GRANT_CHAIN_DEPTH} — refused rather than walked indefinitely`,
      }
    }

    // ─── Terminal case: reached a chain root ─────────────────────────────
    if (current.parentGrantId === null) {
      if (current.source === MEMBER_CONSENT_SOURCE) {
        return { ok: true }
      }
      return {
        ok: false,
        reason: `chain terminates at grant "${current.id}" with source "${current.source}" — a chain with no member-consent root confers nothing`,
      }
    }

    // ─── Continue walking upward ──────────────────────────────────────────
    const parent = byId.get(current.parentGrantId)
    if (!parent) {
      return {
        ok: false,
        reason: `grant "${current.id}" names parent "${current.parentGrantId}", which is absent from the supplied rows — failing closed on missing evidence`,
      }
    }

    if (visited.has(parent.id)) {
      return {
        ok: false,
        reason: `chain contains a cycle at grant "${parent.id}" — terminated rather than looped`,
      }
    }

    // ─── Containment: permission never widens moving parent -> child ─────
    if (parent.permission !== current.permission) {
      return {
        ok: false,
        reason: `grant "${current.id}"'s permission "${current.permission}" is not contained by parent "${parent.id}"'s permission "${parent.permission}"`,
      }
    }

    // ─── Containment: project scope narrows only, never widens ───────────
    // parent.projectId === null means the parent is relationship-wide, so
    // any child scope (narrower or equally relationship-wide) is contained.
    // A non-null parent.projectId means the child must name that exact
    // project — a null child scope there would be WIDER than its parent
    // (relationship-wide instead of one project), which is refused.
    if (parent.projectId !== null && current.projectId !== parent.projectId) {
      return {
        ok: false,
        reason: `grant "${current.id}"'s project scope is not contained by parent "${parent.id}"'s project scope`,
      }
    }

    visited.add(parent.id)
    current = parent
    depth += 1
  }
}
