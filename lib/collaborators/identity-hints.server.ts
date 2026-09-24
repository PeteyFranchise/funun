import type { SupabaseClient } from '@supabase/supabase-js'
import type { CollaboratorProfile } from '@/lib/collaborators'
import type {
  CollaboratorIdentityHint,
  CollaboratorIdentityHints,
} from '@/lib/collaborators/display-identity'
import { isMemberVisible, visibleHandle } from '@/lib/collaborators/display-identity'
import { isDiscoverRowVisible, loadBlockedIds } from '@/lib/green-room/discover'

// ─── Collaborator identity hints — the ONE handle authorization boundary ──
//
// A roster card may render a claimed member's `@handle` as a disambiguator
// ("which Eric?"). A handle is public ACCOUNT identity, so deciding who may
// see it is an authorization decision, and it is made here — once, on the
// server — never in a component and never by a raw id→handle map.
//
// The page this replaced read `user_profiles(id, handle)` straight off the
// session client and called the result "RLS-scoped". It is not a boundary:
// user_profiles' SELECT policy is `USING (true)` and only column-limited
// (migration 040), which is precisely why People Search states that the
// application layer is solely responsible for is_public, profile visibility
// and BOTH block directions (lib/green-room/discover.ts §23-34). That map was
// safe only because it was used as a link target; turning it into visible
// text without these filters would disclose hidden and blocked members.
//
// A handle is returned ONLY when ALL of these hold:
//   1. the roster row is claimed (`claimed_by` set);
//   2. the member's profile row was found and carries a well-formed handle;
//   3. `is_public === true`;
//   4. no block exists in EITHER direction (service-client lookup);
//   5. `profile_visibility === 'public'`, or `connections_only` WITH an
//      accepted connection between the viewer and that member.
//
// Anything else — missing row, hidden profile, malformed handle, block, failed
// lookup — degrades to NO handle. One outcome for every refusal, so the
// absence of a handle never says which rule refused it.
//
// ─── The SECOND signal: memberVisible ────────────────────────────────────
//
// `claim_collaborators()` stamps `claimed_by` at signup, when no block can
// exist yet — blocks reference account ids and the account is being created.
// A block placed AFTERWARDS was never applied to the already-stamped row, and
// there is no write left to gate: only reads. So the roster's member-derived
// affordances (the "✓ Funūn member" state, the Message link, the profile
// link) need their own predicate, and it is NOT the handle chain above.
//
// `memberVisible` is false if and ONLY if a block exists in either direction,
// or the block lookup could not be completed (fail closed, matching this
// resolver's posture after PR #97). A hidden, connections-only or
// `is_public: false` member stays `memberVisible: true`: they ARE a member,
// and whether that may be disclosed is Phase 41's D-01a — an OPEN owner
// decision this resolver must not settle in either direction by accident.
//
// Consequence: this map now carries an entry for EVERY claimed row, not only
// the ones with a visible handle. A `{ handle: null, memberVisible: false }`
// entry is a suppression instruction, and callers strip `claimed_by` from the
// payload for exactly those rows (see redactHiddenMemberLinks below).
//
// WHAT THIS MAY NEVER CARRY: email, legal name, phone, mailing address, PRO,
// IPI, publisher, MLC id, SoundExchange id, or any internal UUID. The
// projection below is the enforcement; CollaboratorIdentityHint has exactly
// two fields, both of them decisions, so there is nowhere else to put them
// (Phase 41 D-10/D-11/D-22).
// ─────────────────────────────────────────────────────────────────────────

/** Exactly the columns the decision needs. No PII column is readable from
 *  this projection even if a future caller logs the raw rows. */
const IDENTITY_HINT_COLUMNS = 'id, handle, is_public, profile_visibility'

type IdentityProfileRow = {
  id: string
  handle: string | null
  is_public: boolean | null
  profile_visibility: string | null
}

type RosterRow = Pick<CollaboratorProfile, 'id'> & { claimed_by?: string | null }

/**
 * Resolves the viewer-visible `@handle`, and the member-visibility decision,
 * for each claimed roster row.
 *
 * Returns a map keyed by `collaborators.id` with an entry for every CLAIMED
 * row. `handle` is non-null only for the rows whose handle this viewer may
 * see; an absent handle means "no handle", with no distinguishable reason.
 * `memberVisible` is false only for a block (or an incomplete block lookup).
 * Never throws: every failure path degrades to no handles, and a failed block
 * lookup additionally degrades to `memberVisible: false` for every row.
 *
 * @param supabase session-bound client — reads the public-safe profile columns
 *                 and the viewer's own accepted connections under RLS
 * @param service  service client — REQUIRED for the bidirectional block set;
 *                 `blocks` RLS only exposes rows the viewer placed themselves,
 *                 so a session client cannot see "who blocked me"
 */
export async function resolveCollaboratorIdentityHints(
  supabase: SupabaseClient,
  service: SupabaseClient,
  viewerId: string | null | undefined,
  rows: RosterRow[]
): Promise<CollaboratorIdentityHints> {
  if (!viewerId) return {}

  const claimedIds = Array.from(
    new Set(rows.map(r => r.claimed_by).filter((v): v is string => typeof v === 'string' && v.length > 0))
  )
  if (claimedIds.length === 0) return {}

  // Base map: one entry per CLAIMED row, carrying the member-visibility
  // decision alone. Handles are filled in below only where the full
  // visibility chain clears.
  const seed = (memberVisible: (memberId: string) => boolean): CollaboratorIdentityHints => {
    const base: CollaboratorIdentityHints = {}
    for (const row of rows) {
      const memberId = row.claimed_by
      if (!memberId) continue
      base[row.id] = { handle: null, memberVisible: memberVisible(memberId) }
    }
    return base
  }

  // loadBlockedIds THROWS when the `blocks` query fails (PR #97) — it can no
  // longer report "nobody is blocked" from a failed lookup, because no Set
  // value can mean "everyone might be blocked". Catching it HERE, at the
  // resolver boundary, is the refusal shape this surface owes: the roster
  // still renders, with no handles and no member affordances at all. The
  // throw must not escape as a 500, and the old swallow (an empty block set)
  // must never come back — that is the fail-OPEN direction, and it would show
  // a blocked member's handle and offer to message them.
  let blockedIds: Set<string>
  try {
    blockedIds = await loadBlockedIds(service, viewerId)
  } catch {
    return seed(() => false)
  }

  const hints = seed(memberId => !blockedIds.has(memberId))

  const [profileResult, connectionResult] = await Promise.all([
    supabase.from('user_profiles').select(IDENTITY_HINT_COLUMNS).in('id', claimedIds),
    supabase
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`),
  ])

  // An unreadable profile table is an unknown visibility state, not a public
  // one: refuse every handle rather than guess. It says nothing about blocks,
  // though, so the already-decided memberVisible flags stand — conflating the
  // two would suppress the member state of every unblocked row on a transient
  // profiles outage, which is D-01a's question, not this one.
  if (profileResult.error) return hints

  // An unreadable connections table only ever REMOVES handles (a
  // connections_only profile stays hidden), so it degrades in the safe
  // direction and does not need to fail the whole batch.
  const connectedIds = new Set<string>()
  for (const row of (connectionResult.data ?? []) as { requester_id: string; addressee_id: string }[]) {
    connectedIds.add(row.requester_id === viewerId ? row.addressee_id : row.requester_id)
  }

  const profilesById = new Map<string, IdentityProfileRow>()
  for (const row of (profileResult.data ?? []) as unknown as IdentityProfileRow[]) {
    if (row && typeof row.id === 'string') profilesById.set(row.id, row)
  }

  for (const row of rows) {
    const memberId = row.claimed_by
    if (!memberId) continue
    if (blockedIds.has(memberId)) continue

    const profile = profilesById.get(memberId)
    if (!profile) continue
    if (profile.is_public !== true) continue
    if (!isDiscoverRowVisible(profile, connectedIds.has(memberId))) continue

    // Same grammar the display layer enforces (migration 134's CHECK), so a
    // malformed stored value never becomes a `/u/{handle}` path segment.
    const handle = visibleHandle({ handle: profile.handle })
    if (!handle) continue

    const hint: CollaboratorIdentityHint = { handle, memberVisible: true }
    hints[row.id] = hint
  }

  return hints
}

// ─── Payload redaction ───────────────────────────────────────────────────
//
// `claimed_by` IS the disclosure: it is the blocked member's account id, and
// it reaches the browser through the roster page's props and through
// GET /api/collaborators. Suppressing the card's affordances without
// stripping the id would leave the fact one devtools panel away.
//
// The row itself STAYS. Blocking on this platform severs nothing — a block
// inserts a `blocks` row and existing connections and follows are left in
// place and filtered at read time by `no_block()`. A block is a filter, not a
// severance, so the roster matches: filter at read, never unclaim the row.
// Unclaiming would destroy a real link and lose it permanently on unblock.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Strips `claimed_by` from every row whose member state this viewer may not
 * see, leaving the owner's own entry — their name for that person, their
 * notes, their PRO — completely intact.
 */
export function redactHiddenMemberLinks<T extends { id: string; claimed_by?: string | null }>(
  rows: T[],
  hints: CollaboratorIdentityHints
): T[] {
  return rows.map(row => {
    if (isMemberVisible(hints[row.id])) return row
    const copy: Record<string, unknown> = { ...row }
    delete copy.claimed_by
    return copy as T
  })
}
