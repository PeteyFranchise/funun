import type { CollaboratorProfile } from '@/lib/collaborators'
import { assembleDisplayName } from '@/lib/collaborators'

// ─── Collaborator display identity — one contract, every surface ────────
//
// Same-name collaborators ("which Eric?") are only distinguishable if every
// surface renders the SAME identity stack. This module is the single pure
// definition of that stack so roster cards, the roster list view, the
// Metadata Studio / Work Roster picker and the split-sheet PartyPicker
// cannot drift apart:
//
//   primary   — the owner's structured roster name (assembleDisplayName)
//   secondary — @handle, but ONLY when the server resolver decided this
//               viewer may see it (lib/collaborators/identity-hints.server.ts)
//
// Nothing here reads a database or decides visibility. The handle arrives
// as a CollaboratorIdentityHint that a privacy-aware server resolver
// produced; a component may never source a handle any other way.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The viewer-scoped, server-decided identity supplement for ONE roster row.
 * Deliberately NOT a field on CollaboratorProfile: CollaboratorProfile models
 * the `collaborators` table row, which has no handle column and must not gain
 * a stale copy of one — a member can change their handle at any time.
 *
 * `handle` is null (or the hint is absent) whenever the viewer may not see it.
 * The type carries exactly two fields, both of them DECISIONS rather than
 * data: it is an identity disambiguator plus one disclosure flag, not a
 * profile projection, so there is nowhere to put an email, a legal name, a
 * phone number, a rights identifier or an internal UUID.
 */
export type CollaboratorIdentityHint = {
  handle: string | null
  /**
   * Whether this row's MEMBER-derived affordances may render at all: the
   * "✓ Funūn member" state, the Message link, and the profile link on the
   * name and avatar.
   *
   * TWO SIGNALS, NOT ONE. `handle` carries the full visibility chain
   * (is_public + profile_visibility + connection + block). `memberVisible`
   * carries ONE predicate: `false` if and only if a block exists in either
   * direction (or the block lookup could not be completed, which fails
   * closed).
   *
   * A hidden, connections-only or `is_public: false` member is still
   * `memberVisible: true`. They ARE a member; whether their membership may
   * be disclosed to the roster owner is Phase 41's D-01a, an OPEN owner
   * decision. Collapsing the two signals would settle D-01a by accident, in
   * the suppressing direction, which this work must not do.
   */
  memberVisible: boolean
}

/** Row-id keyed hints. Keyed by `collaborators.id`, never by member id: two
 *  legacy roster rows can point at the same member before dedupe lands. */
export type CollaboratorIdentityHints = Record<string, CollaboratorIdentityHint>

// Canonical handle grammar, mirrored from migration 134's CHECK constraint
// (`handle ~ '^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$'`, length 3–30). Re-typing a
// looser rule here would let a malformed stored value reach `/u/{handle}` as a
// path segment, so the predicate is copied from the database's own.
const HANDLE_RE = /^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$/
const HANDLE_MIN = 3
const HANDLE_MAX = 30

/**
 * Normalizes a name/handle for COMPARISON only (collision detection and
 * search) — never for display. NFKC folds compatibility forms so visually
 * identical names compare equal, whitespace collapses, and lowercasing is
 * locale-aware.
 */
export function normalizeIdentityText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

/** The primary label: the owner's own roster name, never the member's
 *  account or legal name. */
export function collaboratorDisplayName(c: Partial<CollaboratorProfile>): string {
  return assembleDisplayName(c).replace(/\s+/g, ' ').trim()
}

/** Avatar initials derived from the SAME assembled name the label renders,
 *  so `Eric Smith` yields `ES` while a legacy single-name `Eric` yields `ER`. */
export function collaboratorInitials(c: Partial<CollaboratorProfile>): string {
  const parts = collaboratorDisplayName(c).split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * The handle a component may actually render, or null.
 *
 * Returns null for an absent hint, an empty handle, a handle that does not
 * match the stored grammar — a component must not be the place where a
 * malformed value becomes a link target — or a hint whose `memberVisible` is
 * explicitly false.
 *
 * The block gate lives HERE rather than at each call site because the handle
 * reaches a page through four of them (the identity label's text, the profile
 * href, the picker's search index and the ambiguity predicate), and a gate
 * repeated four times is a gate that will be forgotten once. The resolver
 * never emits a handle alongside `memberVisible: false`, so this is belt to
 * that braces; it is also what makes a hostile or hand-built hint unable to
 * reintroduce the handle of someone on the other side of a block.
 */
export function visibleHandle(
  hint: { handle?: string | null; memberVisible?: boolean } | null | undefined
): string | null {
  if (hint?.memberVisible === false) return null
  const value: unknown = hint?.handle
  if (typeof value !== 'string') return null
  const raw = value.trim().replace(/^@+/, '')
  if (raw.length < HANDLE_MIN || raw.length > HANDLE_MAX) return null
  return HANDLE_RE.test(raw) ? raw : null
}

/** Display form of a handle: exactly one leading `@`, never `@@name`. */
export function formatMemberHandle(handle: string | null | undefined): string | null {
  const raw = typeof handle === 'string' ? handle.trim().replace(/^@+/, '') : ''
  return raw ? `@${raw}` : null
}

/**
 * True when member-derived affordances may render for this row.
 *
 * An ABSENT hint reads as visible, and that is deliberate: the server
 * resolver emits an explicit `memberVisible: false` for every claimed row it
 * refuses (including on a failed block lookup), so "no hint" means "no member
 * to suppress" — an unclaimed row, or a surface that resolves no hints at
 * all — not "decision unknown".
 */
export function isMemberVisible(hint: CollaboratorIdentityHint | null | undefined): boolean {
  return hint?.memberVisible !== false
}

/** The member profile href for a safely visible handle, else null. The block
 *  gate is already inside visibleHandle, so there is nothing to repeat here. */
export function memberProfileHref(hint: CollaboratorIdentityHint | null | undefined): string | null {
  const handle = visibleHandle(hint)
  return handle ? `/u/${handle}` : null
}

/**
 * Every member-derived affordance a roster surface may offer for ONE row,
 * decided in ONE place so the card, the list row and the ⋯ menu cannot drift.
 *
 * The Message link is the reason this exists as a shared derivation rather
 * than three inline conditions: `claimed_by` is an ACTION target, and a
 * `/messages?with=` control aimed at someone who blocked you is not merely a
 * disclosure — it is an invitation to an interaction the DM route will
 * refuse, which is a poor experience for both people.
 */
export type CollaboratorMemberAffordances = {
  memberVisible: boolean
  profileHref: string | null
  messageHref: string | null
}

export function memberAffordances(
  collaborator: Partial<CollaboratorProfile>,
  hint?: CollaboratorIdentityHint | null
): CollaboratorMemberAffordances {
  if (!isMemberVisible(hint)) {
    return { memberVisible: false, profileHref: null, messageHref: null }
  }
  const claimedBy = typeof collaborator.claimed_by === 'string' ? collaborator.claimed_by.trim() : ''
  return {
    memberVisible: true,
    profileHref: memberProfileHref(hint),
    messageHref: claimedBy ? `/messages?with=${encodeURIComponent(claimedBy)}` : null,
  }
}

/**
 * Everything a picker search may match on: the assembled name, its individual
 * parts, and the visible handle both bare and `@`-prefixed. Private fields
 * (email, phone, rights identifiers) are deliberately absent — a roster search
 * that matched them would turn the picker into a lookup oracle for data the
 * identity stack does not display.
 */
export function collaboratorSearchText(
  c: Partial<CollaboratorProfile>,
  hint?: CollaboratorIdentityHint | null
): string {
  const handle = visibleHandle(hint)
  const parts = [
    collaboratorDisplayName(c),
    c.first_name ?? '',
    c.middle_name ?? '',
    c.last_name ?? '',
    handle ?? '',
    handle ? `@${handle}` : '',
  ]
  return normalizeIdentityText(parts.filter(Boolean).join(' '))
}

/** Picker/roster search predicate. An empty query matches everything. */
export function matchesCollaboratorSearch(
  c: Partial<CollaboratorProfile>,
  hint: CollaboratorIdentityHint | null | undefined,
  query: string
): boolean {
  const q = normalizeIdentityText(query)
  if (!q) return true
  return collaboratorSearchText(c, hint).includes(q)
}

/**
 * Ids of active rows that a viewer cannot tell apart from another row.
 *
 * A row is ambiguous when another ACTIVE row normalizes to the same primary
 * label AND neither of them carries a visible handle. One Eric with a handle
 * beside one without is already distinguishable, so neither is flagged.
 */
export function ambiguousCollaboratorIds(
  rows: Pick<CollaboratorProfile, 'id' | 'name' | 'first_name' | 'middle_name' | 'last_name' | 'name_suffix' | 'archived_at'>[],
  hints: CollaboratorIdentityHints = {}
): Set<string> {
  const groups = new Map<string, string[]>()
  for (const row of rows) {
    if (row.archived_at) continue
    if (visibleHandle(hints[row.id])) continue
    const key = normalizeIdentityText(collaboratorDisplayName(row))
    if (!key) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(row.id)
    else groups.set(key, [row.id])
  }

  const ambiguous = new Set<string>()
  for (const ids of groups.values()) {
    if (ids.length < 2) continue
    for (const id of ids) ambiguous.add(id)
  }
  return ambiguous
}

/**
 * The remediation label for an ambiguous row. A row with no last name is asked
 * for the missing piece; a row that already has one is sent to the full form
 * rather than being offered an invented identifier.
 */
export function collaboratorEditActionLabel(c: Partial<CollaboratorProfile>): string {
  return (c.last_name ?? '').trim() ? 'Edit details' : 'Add last name'
}

/**
 * Defensively reads the `identityHints` field of a GET /api/collaborators
 * response. Follows the repo's "read loosely, normalize, return a typed
 * value" convention: anything that is not a row-id → handle string is
 * dropped, so a malformed or hostile payload can only ever REMOVE handles.
 */
export function readIdentityHints(value: unknown): CollaboratorIdentityHints {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const hints: CollaboratorIdentityHints = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    // `memberVisible: false` is a SUPPRESSION instruction, so an entry that
    // carries nothing else must survive this parse — dropping it would fall
    // back to "no hint", which reads as visible. Only an explicit `false`
    // suppresses: an absent key is indistinguishable from an absent row, so
    // treating it as suppression would buy no safety and would silently
    // strip the member state from every legacy payload.
    const memberVisible = (raw as { memberVisible?: unknown }).memberVisible !== false
    const handle = visibleHandle({
      handle: (raw as { handle?: unknown }).handle as string | null,
      memberVisible,
    })
    if (handle || !memberVisible) hints[id] = { handle, memberVisible }
  }
  return hints
}
