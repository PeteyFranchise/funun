// ─── Split sheet ↔ project sync — pure mapping/merge module ───────────
// Phase 21's `sheet-project-sync` decision: while a linked sheet is still
// syncing (lib/split-sheets/lifecycle.ts's isSyncActive), writers/roles/
// splits stay linked between the sheet's parties and the linked project's
// track composer metadata, in both directions. This module is the pure
// "plain arrays in, structured result out" core (mirrors
// lib/contracts/locker-attention.ts's buildAttentionSections() discipline
// and this repo's Function Design convention) — no Supabase client, no
// fetch, no I/O of any kind. The two PATCH routes that hook it
// (app/api/split-sheets/[id]/route.ts, app/api/vault/[projectId]/tracks/
// [trackId]/route.ts) own every read/write; this module only decides what
// the resulting shapes should look like.
//
// Identity signal: there is no collaborator_id/party_id link on Composer
// (lib/split-sheets/reconciliation.ts's own documented gap) — matching a
// sheet party to a project composer is by normalized (trim + case-fold)
// name only, the SAME identity signal reconciliation.ts already uses for
// this exact cross-system problem. normalizeName is imported from there
// rather than re-derived, so the two modules can never disagree about
// what "the same name" means.
//
// "Writers ⊆ credits" (CONTEXT.md): the project can carry credits the
// sheet never mentions — a manually-added producer/performer row in
// Metadata Studio that isn't one of the sheet's negotiating parties.
// mergeComposers() preserves any existing composer row whose name doesn't
// match a current writer party; mapComposersToParties() only turns
// WRITER-role composer rows into parties, so a 'producer' credit row can
// exist project-side without ever becoming (or corrupting) a party on the
// legal document. This also protects ① ("splits stay the sheet's job"):
// reverse sync's caller (Task 3) uses mapComposersToParties() output only
// to REFRESH an already-matched party, never to insert a brand-new one —
// this module doesn't invent split percentages, it only maps them.

import { COMPOSER_ROLE_VALUES, PRO_VALUES, type Composer, type ComposerRole, type PRO } from '@/lib/metadata/schema'
import { normalizeName } from './reconciliation'

/** The minimal split_sheet_parties shape this module needs — a subset of
 * SplitSheetParty (lib/split-sheets/approval.ts) shared with the sanitized
 * party rows the PATCH route already builds. */
export type SyncPartyInput = {
  name: string
  role?: string | null
  split_percentage: number
  pro?: string | null
  ipi?: string | null
}

/** Writing/composition credit roles — the ones a split sheet negotiates.
 * 'producer' is deliberately excluded: it's a valid ComposerRole (a
 * producer CAN be a sheet party, and mapPartiesToComposers/mergeComposers
 * handle that case via name-matching), but a producer credit added
 * directly to a project's composers[] with no matching sheet party is
 * exactly the "project-only credit the writer sheet never mentions" case
 * (writers ⊆ credits) — mapComposersToParties must never turn that into a
 * party on its own. */
const WRITER_ROLES: ComposerRole[] = ['composer_lyricist', 'composer', 'lyricist', 'arranger']

/** Sheet parties → composer entries suitable for merging into a track's
 * metadata.composers[] (lib/metadata/schema.ts's Composer shape). Reuses
 * the SAME role/pro validation readComposers()/sanitizeComposers() apply,
 * so a sync write can never introduce a value those functions would
 * otherwise reject. */
export function mapPartiesToComposers(parties: SyncPartyInput[]): Composer[] {
  return parties
    .map(p => {
      const name = String(p.name ?? '').trim()
      const role: ComposerRole = COMPOSER_ROLE_VALUES.includes(p.role as ComposerRole)
        ? (p.role as ComposerRole)
        : 'composer_lyricist'
      const pro: PRO = PRO_VALUES.includes(p.pro as PRO) ? (p.pro as PRO) : 'none'
      const ipi = p.ipi ? String(p.ipi).trim() || undefined : undefined
      const splitNum = Number(p.split_percentage)
      const split = Number.isFinite(splitNum) ? splitNum : 0
      return { name, role, pro, ipi, split }
    })
    .filter(c => c.name)
}

/** Writer-role composer rows → party entries. Non-writer-role rows
 * (currently: 'producer') produce no party — see WRITER_ROLES above. */
export function mapComposersToParties(composers: Composer[]): SyncPartyInput[] {
  return composers
    .filter(c => WRITER_ROLES.includes(c.role))
    .map(c => ({
      name: c.name,
      role: c.role,
      pro: c.pro,
      ipi: c.ipi,
      split_percentage: c.split,
    }))
}

/**
 * Merges a fresh writer roster (from the sheet) into an existing composer
 * array (from the project), REPLACING any existing row whose normalized
 * name matches a writer and PRESERVING every other existing row untouched
 * — the "writers ⊆ credits" invariant. Order: writers first (the sheet's
 * order), then preserved project-only rows. A no-op merge (same names,
 * same values) returns an array deep-equal to writerComposers followed by
 * the untouched preserved rows — idempotent by construction.
 */
export function mergeComposers(existingComposers: Composer[], writerComposers: Composer[]): Composer[] {
  const writerKeys = new Set(writerComposers.map(c => normalizeName(c.name)))
  const preserved = existingComposers.filter(c => !writerKeys.has(normalizeName(c.name)))
  return [...writerComposers, ...preserved]
}
