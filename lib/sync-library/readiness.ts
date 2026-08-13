// ─── Sync Readiness — per-track subset of the Wave 1 readiness engine ────
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

// The sync-relevant subset of READINESS_ITEMS. Release-only items
// (visual_asset, distributor, epk, caption_copy, tiktok_strategy) are
// deliberately excluded — a licensed track needs no distributor and no
// TikTok seeding plan to be sync-ready.
export const SYNC_READINESS_KEYS = [
  'audio_files',
  'split_sheets',
  'copyright',
  'isrc_codes',
  'pro_registration',
  'mlc_registration',
  'hire_right',
  'metadata',
] as const

export type SyncReadinessKey = (typeof SYNC_READINESS_KEYS)[number]

/** The one track this Sync Readiness check is for. */
export type SyncReadinessTrack = {
  id?: string
  isrc?: string | null
  iswc?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Everything syncReadinessForTrack() needs — the track itself, plus its
 * project's SHARED, document/project-level readiness signals (copyright,
 * hire_right, and the split-sheet legacy/coverage/pipeline data). These are
 * passed straight through to readinessItemsForProject() unchanged; only
 * `tracks` is narrowed to the single track (that narrowing is what makes
 * the isrc_codes/pro_registration/mlc_registration/metadata items resolve
 * per-track instead of per-project).
 */
export type SyncReadinessInput = {
  /** The project's type — same VaultProjectType the Wave 1 engine gates on. */
  type: VaultProjectType
  track: SyncReadinessTrack
  documents?: { type: string; status: string }[]
  split_sheets?: { status: string }[]
  track_split_sheet_attachments?: { track_id: string; statuses: string[] }[]
}

/**
 * Per-track Sync Readiness. Delegates ALL status computation to
 * readinessItemsForProject() — this function only assembles a single-track
 * ReadinessInput and filters the result to SYNC_READINESS_KEYS. Never
 * returns a release-only key.
 */
export function syncReadinessForTrack(input: SyncReadinessInput): ReadinessItem[] {
  const projectInput: Parameters<typeof readinessItemsForProject>[0] = {
    type: input.type,
    tracks: [input.track],
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

// The metadata-family keys — the "tags, splits, ISRCs, etc." CONTEXT.md
// names under the gate's "metadata complete" check.
const METADATA_FAMILY_KEYS = ['metadata', 'isrc_codes', 'pro_registration', 'mlc_registration'] as const

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
