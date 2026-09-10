import type { ReadinessItem, VaultProjectType } from '@/types'
import { READINESS_ITEMS } from '@/types'
import { readComposers } from '@/lib/metadata/schema'
import { projectSplitTier, isRenegotiating } from '@/lib/vault/readiness-tiers'
import { coverageTier } from '@/lib/vault/readiness-coverage'
import { hireCreditsOf } from '@/lib/vault/hire-credits'

type ReadinessInput = {
  type: VaultProjectType
  distributor?: string | null
  tracks?: {
    id?: string
    isrc?: string | null
    iswc?: string | null
    metadata?: Record<string, unknown> | null
    // ─── Hire credits (2026-09-10, defect 1) ────────────────────────────
    // The columns computeStage3()'s section 3 derives hired collaborators
    // from, consumed here through the SAME hireCreditsOf() helper. All three
    // are OPTIONAL, and the difference between "the property is absent" and
    // "the property is present and empty" is LOAD-BEARING — see
    // hireCreditsKnown() below. A caller that does not select these columns
    // gets exactly the pre-2026-09-10 behaviour for `hire_right`.
    producers?: string[] | null
    mixing_engineer?: string | null
    mastering_engineer?: string | null
  }[]
  assets?: { type: string }[]
  documents?: { type: string; status: string }[]
  tool_outputs?: { tool_slug: string }[]
  // Pipeline-stage statuses for the project's split sheets (P17-03-impl,
  // ESIGN-08). OPTIONAL — an omitted field degrades to the legacy
  // signedOf('split_sheet')-only behavior so every existing caller
  // (dashboard, vault list, project detail, demo-store) keeps compiling
  // and behaving exactly as before. Wired in only by the readiness
  // breakdown page (app/(artist)/vault/[projectId]/readiness/page.tsx) —
  // deliberate v1 scoping (see 17-02-PLAN.md).
  split_sheets?: { status: string }[]
  // Coverage-based derivation (P18-14/P18-15/P18-16, 18-04). Per-track
  // split-sheet attachment statuses via split_sheet_attachments (18-03) —
  // OPTIONAL, alongside the split_sheets field above. When supplied,
  // coverage across EVERY one of the project's tracks (P18-15: no
  // solo-written exemption) replaces the project-level projectSplitTier
  // call for this branch. Omitted entirely, behavior degrades to exactly
  // what it did before this field existed, so every existing caller
  // (dashboard, vault list, project detail, demo-store) keeps compiling
  // and behaving unchanged — the same optional-input discipline 17-02
  // used for split_sheets itself.
  track_split_sheet_attachments?: { track_id: string; statuses: string[] }[]
}

/** A track's composer splits are captured and total exactly 100%. */
function composersComplete(metadata: Record<string, unknown> | null | undefined): boolean {
  const comps = readComposers(metadata)
  if (comps.length === 0) return false
  const total = Math.round(comps.reduce((s, c) => s + (c.split || 0), 0) * 100) / 100
  return total === 100
}

/**
 * Returns true when any roster-picked composer on the track is missing an IPI.
 *
 * Primary signal: the `composer_ipi_missing` boolean written by MetadataStudio
 * into the track metadata JSONB at save time (option-b approach from RESEARCH.md).
 *
 * Fallback heuristic: when the primary flag is absent, any composer row that
 * has an email set but no IPI is treated as a roster-picked row with a missing
 * IPI — the email field is only populated via the picker auto-fill (D-03).
 */
function composersHaveMissingIpi(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false
  // Primary signal written by MetadataStudio on save
  if (typeof metadata.composer_ipi_missing === 'boolean') {
    return metadata.composer_ipi_missing
  }
  // Fallback heuristic: email present but IPI absent implies a roster-picked row
  const comps = readComposers(metadata)
  return comps.some(c => (c.email || c.phone) && !c.ipi)
}

// ─── hireCreditsKnown (2026-09-10, defect 1) ─────────────────────────────
// The guard that stops "not applicable" being inferred from data nobody
// fetched. `hire_right` may only be declared not-applicable when this
// engine can SEE that the project credits nobody — which requires the
// caller to have actually supplied the three hire-credit columns.
//
// The distinction is property PRESENCE, not truthiness: a track row selected
// with these columns has `producers: null` (or `[]`) — the key exists. A
// caller that never selected them passes an object with no such key at all.
// Only the first case is evidence of "nobody was hired"; the second is
// evidence of nothing, and falls back to the legacy document-only status
// (i.e. 'missing'), which is the CONSERVATIVE answer — it keeps the song out
// of the catalogue rather than letting it in on an assumption.
//
// A project with zero tracks is also "not known": there is no credit list to
// read. (Such a project fails `audio_files` anyway.)
function hireCreditsKnown(
  tracks: NonNullable<ReadinessInput['tracks']>
): boolean {
  if (tracks.length === 0) return false
  return tracks.every(
    t => 'producers' in t && 'mixing_engineer' in t && 'mastering_engineer' in t
  )
}

/**
 * Per-item readiness for a single project, filtered to the items that
 * actually gate this project type. The headline 0–100 score still comes
 * from the DB column (vault_readiness_score) — this drives the breakdown.
 */
export function readinessItemsForProject(input: ReadinessInput): ReadinessItem[] {
  const tracks = input.tracks ?? []
  const assets = input.assets ?? []
  const documents = input.documents ?? []
  const outputs = input.tool_outputs ?? []

  const signedOf = (docType: string) => {
    const total = documents.filter(d => d.type === docType).length
    const signed = documents.filter(d => d.type === docType && d.status === 'signed').length
    if (total > 0 && signed === total) return 'complete' as const
    if (total > 0) return 'warning' as const
    return 'missing' as const
  }

  // ─── evidencedOf (2026-09-10, defect 3) ────────────────────────────────
  // signedOf() for documents that are FILED rather than SIGNED. A copyright
  // registration is submitted to the US Copyright Office; nobody signs it,
  // so "signed" is not the word — but there is still a hard line between a
  // record with a document attached and a record with nothing behind it.
  //
  // The real lifecycle of a `copyright_registration` vault_document:
  //   'pending'  — created by "Mark as filed" (components/vault/
  //                CopyrightFiling.tsx) or by generating the CopyrightKit
  //                document. A SELF-DECLARATION with no file attached.
  //                POST /api/vault/[projectId]/documents hard-refuses any
  //                other status, so every one of these starts here.
  //   'signed'   — the artist uploaded the eCO receipt/certificate PDF via
  //                POST .../documents/[docId]/upload ("uploading a PDF IS
  //                the signing action"). Evidence attached.
  //   'verified' — uploaded through POST /api/contracts/verify and the AI
  //                verification returned a clean verdict. Evidence attached,
  //                and checked.
  // Both evidence states are genuinely reachable from the product today —
  // this predicate does not gate on something unreachable.
  //
  // 'verified' counts here for the same reason lib/vault/stage3.ts's
  // docStatusToReq(), lib/contracts/locker-attention.ts and
  // lib/eligibility/direct-overlay.ts all treat `signed || verified` as one
  // state. NOTE (deliberately not fixed here): plain signedOf() above counts
  // ONLY 'signed', so a VERIFIED split_sheet/hire_right document still reads
  // 'warning'. That is a separate, pre-existing inconsistency across the
  // other document items; widening it would move gates this change was not
  // asked to move.
  const EVIDENCE_STATUSES = ['signed', 'verified']
  const evidencedOf = (docType: string) => {
    const matching = documents.filter(d => d.type === docType)
    if (matching.length === 0) return 'missing' as const
    return matching.every(d => EVIDENCE_STATUSES.includes(d.status))
      ? ('complete' as const)
      : ('warning' as const)
  }

  const tracksHaveKnownHireCredits = hireCreditsKnown(tracks)
  const hasHiredCollaborator = tracks.some(t => hireCreditsOf(t).length > 0)

  return READINESS_ITEMS.filter(item => item.applies_to.includes(input.type)).map(item => {
    let status: ReadinessItem['status'] = 'missing'
    let earnedPoints: number | undefined
    let note: string | undefined
    let splitSheetSource: ReadinessItem['splitSheetSource']
    let notApplicable: true | undefined

    switch (item.key) {
      case 'audio_files':
        status = tracks.length > 0 ? 'complete' : 'missing'
        break
      case 'visual_asset':
        status = assets.some(a => ['cover_art', 'snippet_visual', 'lyric_card'].includes(a.type))
          ? 'complete'
          : 'missing'
        break
      case 'split_sheets': {
        // Legacy wet-sign-upload path (AM-1 universal fallback) always wins
        // outright — a fully signed split_sheet vault_document is worth the
        // full 15 regardless of pipeline state.
        const legacyStatus = signedOf('split_sheet')
        if (legacyStatus === 'complete') {
          status = 'complete'
          earnedPoints = 15
          splitSheetSource = 'legacy'
          break
        }
        // Coverage-based derivation (P18-14/P18-15/P18-16, 18-04) — only
        // when the caller supplied per-track attachment data. Replaces
        // the project-level projectSplitTier call below with a per-track
        // rule: every track needs its own sheet (P18-15), and the
        // identical derivation lives in migration 068's SQL, both
        // asserted against lib/vault/coverage-fixtures.ts.
        if (input.track_split_sheet_attachments !== undefined) {
          const attachmentsByTrack = new Map(
            input.track_split_sheet_attachments.map(a => [a.track_id, a.statuses])
          )
          const coverageTracks = tracks
            .filter((t): t is typeof t & { id: string } => typeof t.id === 'string')
            .map(t => ({
              id: t.id,
              attachedStatuses: attachmentsByTrack.get(t.id) ?? [],
            }))
          const coverage = coverageTier(coverageTracks)
          if (coverage) {
            earnedPoints = coverage.earnedPoints
            status = coverage.status
            splitSheetSource = 'coverage'
            break
          }
        }
        // Pipeline-derived tier (P17-03-impl) — only when the caller
        // supplied split_sheets data; identical derivation to the DB
        // trigger's SELECT MIN(CASE ss.status ...) in migration 062, both
        // consuming SPLIT_SHEET_TIER_MAP (lib/vault/readiness-tiers.ts).
        if (input.split_sheets !== undefined) {
          const statuses = input.split_sheets.map(s => s.status)
          const tier = projectSplitTier(statuses)
          if (tier !== null) {
            earnedPoints = tier
            status = tier === 15 ? 'complete' : tier === 0 ? 'missing' : 'warning'
            splitSheetSource = 'pipeline'
            if (statuses.some(isRenegotiating)) {
              note = 'A collaborator countered the split — renegotiating.'
            }
            break
          }
        }
        // No pipeline signal at all (field omitted, or supplied empty):
        // degrade to the legacy signedOf-only status.
        status = legacyStatus
        splitSheetSource = 'none'
        break
      }
      case 'copyright':
        // 2026-09-10 (defect 3): was `documents.some(d => d.type === ...)`,
        // which never looked at status — so a 'pending' row, i.e. an artist
        // clicking "Mark as filed" with nothing attached, satisfied a gate
        // that lets a buyer license the song. Every other document item
        // reads a status; this one now does too, via evidencedOf (see its
        // note above for why it is not signedOf).
        //
        // 'pending' now reads 'warning' — filed, awaiting the certificate —
        // which is a true statement about a song mid-registration, and it
        // does NOT clear the sync entry gate (isSyncEntryComplete requires
        // 'complete'). KNOWN DIVERGENCE, flagged rather than hidden: the DB
        // scoring function (migration 070) still awards this item's 15
        // points on mere EXISTENCE. Migrations are out of scope here, so an
        // aggregate vault_readiness_score can now sit 15 above what this
        // checklist shows. The aggregate score is not the catalogue gate
        // (see lib/deals/catalog.ts), so nothing gates on the difference.
        status = evidencedOf('copyright_registration')
        break
      case 'isrc_codes': {
        const withIsrc = tracks.filter(t => t.isrc).length
        if (tracks.length > 0 && withIsrc === tracks.length) status = 'complete'
        else if (withIsrc > 0) status = 'warning'
        else status = 'missing'
        break
      }
      case 'pro_registration': {
        // Proxy: ISWC captured — the code PROs use to register performance royalties.
        const withIswc = tracks.filter(t => t.iswc).length
        if (tracks.length > 0 && withIswc === tracks.length) status = 'complete'
        else if (withIswc > 0) status = 'warning'
        else status = 'missing'
        break
      }
      case 'mlc_registration': {
        // Proxy: ISWC captured — The MLC uses the same code to register mechanical
        // royalties from streaming/downloads. Phase 4 will upgrade this to per-party
        // tracking once collaborator identity reconciliation is in place.
        const withIswcMlc = tracks.filter(t => t.iswc).length
        if (tracks.length > 0 && withIswcMlc === tracks.length) status = 'complete'
        else if (withIswcMlc > 0) status = 'warning'
        else status = 'missing'
        break
      }
      case 'hire_right': {
        // 2026-09-10 (defect 1): was `signedOf('hire_right')` alone, which
        // returns 'missing' when ZERO producer agreements exist. That reads
        // "an agreement is missing" over a project where the true fact is
        // "no agreement is required" — a self-produced recording hired
        // nobody, so there is nothing to paper. Because the six-item sync
        // entry gate demands 'complete', that single line kept every
        // self-produced song out of The Crate, which for a platform built
        // for independent artists is most of the catalogue.
        //
        // Three conditions must ALL hold before the requirement is declared
        // not-applicable, and each one exists to stop a silent pass:
        //   1. NO hire_right document of any status exists. An existing
        //      document — even 'pending' — is the artist's own evidence
        //      that this requirement DOES apply to their project, and it
        //      outranks any derivation. Only signedOf() decides from there.
        //   2. The caller actually supplied the hire-credit columns
        //      (hireCreditsKnown) — never inferred from unfetched data.
        //   3. No track credits a producer, mixing engineer or mastering
        //      engineer, per hireCreditsOf() — the SAME derivation
        //      computeStage3()'s section 3 uses to decide which HireRight
        //      documents to require. One definition, two readers.
        // Anything else falls through to the legacy status, so a project
        // that genuinely hired someone and has no signed agreement still
        // reads 'missing' and is still blocked.
        const legacy = signedOf('hire_right')
        if (legacy === 'missing' && tracksHaveKnownHireCredits && !hasHiredCollaborator) {
          status = 'complete'
          notApplicable = true
          note = 'Not required — this recording credits no hired producer or engineer.'
        } else {
          status = legacy
        }
        break
      }
      case 'epk':
        status = outputs.some(o => o.tool_slug === 'epkfyi') ? 'complete' : 'missing'
        break
      case 'metadata': {
        // Captured in the Metadata Studio: composers + splits per track.
        const withComposers = tracks.filter(t => composersComplete(t.metadata)).length
        if (tracks.length > 0 && withComposers === tracks.length) {
          // All tracks have complete splits — check for missing-IPI warning (D-05).
          // A roster-picked composer without an IPI downgrades from 'complete' to
          // 'warning' so the readiness checklist surfaces the D-05 flag.
          const hasMissingIpi = tracks.some(t => composersHaveMissingIpi(t.metadata))
          status = hasMissingIpi ? 'warning' : 'complete'
        } else if (withComposers > 0) {
          status = 'warning'
        } else {
          status = 'missing'
        }
        break
      }
      case 'distributor':
        status = input.distributor ? 'complete' : 'missing'
        break
      case 'caption_copy':
        status = outputs.some(o => o.tool_slug === 'dropready') ? 'complete' : 'missing'
        break
      case 'tiktok_strategy':
        status = outputs.some(o => o.tool_slug === 'soundbait') ? 'complete' : 'missing'
        break
    }

    return {
      ...item,
      status,
      ...(earnedPoints !== undefined ? { earnedPoints } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(splitSheetSource !== undefined ? { splitSheetSource } : {}),
      ...(notApplicable ? { notApplicable } : {}),
    }
  })
}

export type ReadinessTone = 'red' | 'amber' | 'green'

export function readinessLabel(score: number): {
  label: string
  tone: ReadinessTone
  canSubmit: boolean
} {
  if (score < 40) return { label: 'Not ready', tone: 'red', canSubmit: false }
  if (score < 60) return { label: 'Getting there', tone: 'red', canSubmit: false }
  if (score < 80) return { label: 'Almost ready', tone: 'amber', canSubmit: false }
  if (score < 100) return { label: 'Ready to submit', tone: 'green', canSubmit: true }
  return { label: 'Fully complete', tone: 'green', canSubmit: true }
}
