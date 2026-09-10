// ─── Sync Readiness — the sync-catalogue subset of the Wave 1 readiness engine
// (Phase 30, 30-CONTEXT.md "Sync Readiness (the completion pipeline)")
//
// CONTEXT.md locks this: "A sync-specific readiness checklist — a SUBSET of
// the existing Sound Vault readiness engine (Wave 1). Reuse that engine; do
// not rebuild it." This module never redefines an item's points or status
// logic — it (a) narrows READINESS_ITEMS to the sync-relevant keys via
// SYNC_READINESS_KEYS, and (b) achieves PER-TRACK granularity by handing
// readinessItemsForProject() a single-track input (tracks: [track]) rather
// than re-deriving any check itself. Every status value below is exactly
// what readinessItemsForProject() already computes — this module only
// assembles the one-track input and filters the output (30-RESEARCH.md
// Pattern 2 / Pitfall 2 — the Phase 18 coverageTier() precedent for
// reconciling project-level checks with track-level reality).
//
// Pure: no I/O — mirrors lib/sync-library/submission.ts's "accept an
// already-fetched shape, never throw" convention so this stays
// unit-testable without a DB (plan prohibition: MUST NOT perform I/O here).
import type { ReadinessItem, VaultProjectType } from '@/types'
import { readinessItemsForProject } from '@/lib/vault/readiness'

// ─── SYNC_READINESS_KEYS — the sync-catalogue ENTRY requirements ─────────
// Owner decision 2026-09-09 (.planning/deliberations/sync-catalogue-entry-
// and-samples.md, "DECIDED — what it takes to enter the sync catalogue").
// Exactly SIX items, and deliberately NOT the aggregate
// vault_readiness_score: that score was designed for releasing on Spotify,
// and 30 of its 100 points (isrc_codes, distributor, pro_registration,
// mlc_registration) are release admin a music supervisor has no stake in.
// Under a score threshold a song with every signature signed and a finished
// master reads as unlicensable because nobody picked a distributor.
//
// Removed from the pre-2026-09-10 eight-key list: isrc_codes,
// pro_registration, mlc_registration (release admin — explicitly NOT
// required). Added: visual_asset (cover art — "shop-window quality, not a
// licensing blocker", but required to be listed).
//
// This ONE list drives BOTH:
//   1. isRightsReady() (lib/deals/catalog.ts) — the buyer-visible catalogue
//      gate, via isSyncEntryComplete() below.
//   2. the STAFF pending_admit / needs_completion label
//      (lib/deals/catalog-query.ts ~line 320, lib/sync-library/worklist.ts)
//      via missingSyncItems().
// That coupling is DELIBERATE and was called out when this list changed:
// staff should see exactly the bar the catalogue enforces, so a track that
// reads pending_admit to staff is a track that will pass the buyer gate the
// moment it is admitted. Changing this array moves both surfaces at once.
export const SYNC_READINESS_KEYS = [
  'split_sheets',
  'copyright',
  'hire_right',
  'audio_files',
  'metadata',
  'visual_asset',
] as const

export type SyncReadinessKey = (typeof SYNC_READINESS_KEYS)[number]

// ─── SYNC_ELIGIBLE_PROJECT_TYPES — WHICH projects may enter, at all ──────
// The sync catalogue licenses RECORDINGS in released formats. Of the five
// VaultProjectType values, exactly three qualify:
//
//   'single' | 'ep' | 'album'  — released-format works. Eligible.
//   'snippet'                  — a promo clip, not a licensable recording.
//   'unreleased'               — owner confirmed 2026-09-09 that unreleased
//                                work has nothing to do with the sync
//                                catalogue. Out of scope, full stop.
//
// ─── WHY THIS EXISTS: it REPLACES AN ACCIDENTAL EXCLUSION ────────────────
// Before this constant, 'snippet' and 'unreleased' were kept out of the
// catalogue only as a SIDE EFFECT of the readiness registry's `applies_to`
// tables (types/index.ts READINESS_ITEMS). Four of the six entry keys
// (copyright, hire_right, metadata, visual_asset) do not apply to
// 'unreleased', and five of the six do not apply to 'snippet', so
// readinessItemsForProject() never emitted them, and isSyncEntryComplete()'s
// every() failed on the absent keys.
//
// That is a coincidence of a table maintained for a DIFFERENT purpose — the
// Wave 1 release-readiness checklist — not a stated rule. Adding
// `applies_to: [... 'unreleased']` to any one of those four items for an
// unrelated release-readiness reason (a perfectly reasonable future edit)
// would have silently made unreleased projects catalogue-eligible, and
// nobody would have noticed until a buyer saw one.
//
// The rule is now EXPLICIT and independently enforced: isRightsReady()
// (lib/deals/catalog.ts) checks this allowlist BEFORE it looks at any
// readiness item, so the gate holds no matter what the registry emits.
// Changing this array changes who may be licensed — it is an owner
// decision, not a refactor, and lib/sync-library/readiness.test.ts pins it.
export const SYNC_ELIGIBLE_PROJECT_TYPES = ['single', 'ep', 'album'] as const

export type SyncEligibleProjectType = (typeof SYNC_ELIGIBLE_PROJECT_TYPES)[number]

/**
 * True only for a released-format project type ('single' | 'ep' | 'album').
 * Fails closed: 'snippet', 'unreleased', and any value that is not a
 * VaultProjectType at all (a row read straight from the DB's unconstrained
 * `type` column) all return false.
 */
export function isSyncEligibleProjectType(type: VaultProjectType): boolean {
  return (SYNC_ELIGIBLE_PROJECT_TYPES as readonly string[]).includes(type)
}

// ─── syncIneligibleTypeReason — the ONE staff-facing explanation ─────────
// isSyncEligibleProjectType() answers "may this be licensed?" with a
// boolean. The STAFF surfaces additionally have to answer "why not, and
// what would change it?" — the admit route
// (app/api/sync-library/admin/[listingId]/route.ts) when it refuses, and
// the Sync Readiness worklist (lib/sync-library/worklist.ts) when it shows
// a submission that can never reach the catalogue.
//
// Both consume THIS function rather than writing their own sentence, for
// the same reason they both consume isSyncEligibleProjectType() rather
// than their own allowlist: two copies of the explanation drift, and a
// refusal that only says "not eligible" sends a person hunting.
//
// It deliberately does NOT re-derive eligibility — it delegates to
// isSyncEligibleProjectType(), so SYNC_ELIGIBLE_PROJECT_TYPES stays the
// single definition of the rule and this stays the single definition of
// how we explain it.
const SYNC_INELIGIBLE_TYPE_REASON: Record<'snippet' | 'unreleased', string> = {
  snippet:
    "This song can't be admitted — it's a snippet, a promo clip rather than a licensable recording, and the sync catalogue lists singles, EPs and albums only. Submit the full recording from a single, EP or album project instead.",
  unreleased:
    "This song can't be admitted — it's an unreleased work, and the sync catalogue lists singles, EPs and albums only. It can be submitted again once its project is set up as a single, EP or album.",
}

// Fails closed on a value that is not a VaultProjectType at all (a row read
// straight from the DB's unconstrained `type` column): ineligible, with a
// generic sentence. The raw value is deliberately NOT interpolated — an
// unvalidated DB string does not belong in copy we hand to a browser.
const SYNC_INELIGIBLE_TYPE_REASON_FALLBACK =
  "This song can't be admitted — its project type isn't one the sync catalogue lists. The sync catalogue lists singles, EPs and albums only."

/**
 * Why an ineligible project type cannot enter the sync catalogue, phrased
 * for a staff member: what it is, why that is out of scope, and what would
 * change it. Returns null for an ELIGIBLE type — so `if (reason)` reads as
 * "is this refused?" at both call sites without a second predicate.
 */
export function syncIneligibleTypeReason(type: VaultProjectType): string | null {
  if (isSyncEligibleProjectType(type)) return null
  return SYNC_INELIGIBLE_TYPE_REASON[type as 'snippet' | 'unreleased'] ?? SYNC_INELIGIBLE_TYPE_REASON_FALLBACK
}

/** The one track this Sync Readiness check is for. */
export type SyncReadinessTrack = {
  id?: string
  isrc?: string | null
  iswc?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Everything syncReadinessForTrack() needs — the track itself, plus its
 * project's SHARED, project-level readiness signals (cover art via
 * `assets`, copyright, hire_right, and the split-sheet legacy/coverage/
 * pipeline data). These are passed straight through to
 * readinessItemsForProject() unchanged; only `tracks` is narrowed to the
 * single track (that narrowing is what makes the metadata item resolve
 * per-track instead of per-project).
 */
export type SyncReadinessInput = {
  /** The project's type — same VaultProjectType the Wave 1 engine gates on. */
  type: VaultProjectType
  track: SyncReadinessTrack
  /**
   * The PROJECT's vault_assets rows (cover art / snippet visual / lyric
   * card). REQUIRED, not optional, on purpose: `visual_asset` joined
   * SYNC_READINESS_KEYS on 2026-09-10, and an omitted `assets` would make
   * that item read 'missing' for every track forever — silently pinning
   * the staff label to needs_completion and the buyer gate to false. A
   * required field makes tsc, not production, find the caller that forgot.
   * Pass [] only when the project genuinely has no assets.
   */
  assets: { type: string }[]
  documents?: { type: string; status: string }[]
  split_sheets?: { status: string }[]
  track_split_sheet_attachments?: { track_id: string; statuses: string[] }[]
}

/**
 * Per-track Sync Readiness. Delegates ALL status computation to
 * readinessItemsForProject() — this function only assembles a single-track
 * ReadinessInput and filters the result to SYNC_READINESS_KEYS. Never
 * returns a release-admin key (isrc_codes/pro_registration/
 * mlc_registration/distributor/epk).
 */
export function syncReadinessForTrack(input: SyncReadinessInput): ReadinessItem[] {
  const projectInput: Parameters<typeof readinessItemsForProject>[0] = {
    type: input.type,
    tracks: [input.track],
    assets: input.assets,
    documents: input.documents,
    split_sheets: input.split_sheets,
    track_split_sheet_attachments: input.track_split_sheet_attachments,
  }
  const items = readinessItemsForProject(projectInput)
  return items.filter((item): item is ReadinessItem & { key: SyncReadinessKey } =>
    (SYNC_READINESS_KEYS as readonly string[]).includes(item.key)
  )
}

/** Exactly what's missing — every item whose status isn't 'complete'. */
export function missingSyncItems(items: ReadinessItem[]): ReadinessItem[] {
  return items.filter(i => i.status !== 'complete')
}

// ─── isSyncEntryComplete — the catalogue ENTRY gate predicate ─────────────
// The six-item rule from the 2026-09-09 owner decision, expressed once.
// lib/deals/catalog.ts's isRightsReady() is its only production consumer;
// it deliberately lives HERE, next to SYNC_READINESS_KEYS, so the list and
// the "all of them, complete" rule can never drift apart.
//
// SCOPE: this predicate answers "are the six items done?" and NOTHING
// else. It deliberately does not know the project's TYPE — whether a
// project is even the kind of work the catalogue licenses is
// SYNC_ELIGIBLE_PROJECT_TYPES' question, checked separately and FIRST by
// isRightsReady(). Keeping the two apart is what makes the type rule
// enforced rather than emergent: this function's behaviour no longer
// carries any of the load for excluding 'snippet'/'unreleased'.
//
// FAILS CLOSED in three ways, all intentional:
//   1. A key ABSENT from `items` is not complete. readinessItemsForProject()
//      filters by applies_to, so a project type that does not gate on all
//      six will be missing some of them and fail here too. Do NOT rely on
//      that as the exclusion rule for 'snippet'/'unreleased' — it is a
//      property of a table maintained for release readiness, and it was
//      exactly the accidental coupling SYNC_ELIGIBLE_PROJECT_TYPES was
//      added to replace. This clause is a backstop for a genuinely
//      incomplete item list, not a type gate.
//   2. 'warning' is not 'complete'. A roster-picked composer with no IPI
//      downgrades `metadata` to 'warning'; a partially-covered split sheet
//      downgrades `split_sheets` to 'warning'. Both fail the gate. This is
//      the SAME rule missingSyncItems() already applies to the staff
//      worklist — one definition of "done", not two.
//   3. An empty list is not complete.
export function isSyncEntryComplete(items: ReadinessItem[]): boolean {
  const statusByKey = new Map(items.map(i => [i.key, i.status]))
  return SYNC_READINESS_KEYS.every(key => statusByKey.get(key) === 'complete')
}

// ─── METADATA_FAMILY_KEYS — collapsed 2026-09-10, deliberately kept ───────
// This constant used to group four keys: metadata + isrc_codes +
// pro_registration + mlc_registration ("tags, splits, ISRCs, etc." per
// 30-CONTEXT.md's gate description). The 2026-09-09 entry decision removed
// three of those four from SYNC_READINESS_KEYS as release admin a sync
// buyer has no stake in, so they can no longer appear in the `items` this
// function is ever handed (syncReadinessForTrack filters to
// SYNC_READINESS_KEYS). Leaving the four-key list in place would have been
// dead weight that silently narrowed to one member anyway.
//
// It is COLLAPSED rather than deleted because isSyncMetadataComplete() is a
// published input to lib/sync-library/gate.ts's GateSignal.metadataComplete
// — the staff admit gate in app/api/sync-library/admin/[listingId]/route.ts.
// Deleting the helper would have forced that gate to re-derive "metadata
// complete" itself, i.e. a second definition. Keeping the helper with a
// one-member family preserves the seam (and the fails-closed-on-empty
// discipline) while telling the truth about what it now checks.
//
// CONSEQUENCE, stated rather than left to be discovered: the staff admit
// gate no longer refuses to admit a song for a missing ISRC/ISWC. That is
// the decision working as intended — those are release admin, not
// licensing blockers.
const METADATA_FAMILY_KEYS = ['metadata'] as const

/**
 * True only when every metadata-family item PRESENT in `items` reads
 * 'complete'. An empty/absent metadata-family selection is NOT complete
 * (fails closed) — mirrors lib/deals/catalog.ts's isRightsReady discipline
 * of never treating "nothing to check" as "ready."
 */
export function isSyncMetadataComplete(items: ReadinessItem[]): boolean {
  const familyItems = items.filter((i): i is ReadinessItem =>
    (METADATA_FAMILY_KEYS as readonly string[]).includes(i.key)
  )
  if (familyItems.length === 0) return false
  return familyItems.every(i => i.status === 'complete')
}
