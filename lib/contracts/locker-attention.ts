// ─── buildAttentionSections() — the Contract Locker's attention-first landing ──
// 17-DUAL-ENTRY-DESIGN.md section 10a: the Locker's highest-value version is
// pure structured queries, not an AI reading of the same data — Funūn
// generated every row this module looks at, so inferring what is already
// known would be slower and less correct than just asking the database.
// This module is that "just ask" layer: a pure, no-I/O derivation (matching
// lib/vault/readiness-tiers.ts's convention) that turns plain row arrays
// (already fetched by app/(artist)/contracts/page.tsx) into the four
// attention sections plus a settled archive, in the fixed P18-10 order:
// awaiting signature, drafts in progress, unattached executed, songs with
// no sheet. The caller does no bucketing of its own.
//
// P18-11 (17-DUAL-ENTRY-DESIGN section 10b) is threaded through every
// section: a draft is invisible to anyone but its initiator, and every row
// resolves the VIEWER's own share/state from the party rows — never
// another party's figure presented as the viewer's own.

import { CONSENSUS_RESET_STATUSES, type SplitSheetStatus } from '@/lib/split-sheets/lifecycle'

// ─── The 3-state per-party label (P18-10 extension, research §4) ─────────
// A pure derivation over TWO already-shipped columns —
// split_sheet_parties.approval_status (migration 018) and
// split_sheet_parties.first_viewed_at (migration 062, already read by
// isNudgeEligible() in lib/split-sheets/phase.ts) — needing ZERO new
// schema. This is per-SHEET signing progress ("has this specific person
// signed THIS agreement yet"), and is deliberately distinct from 18-05's
// roster-level collaborators.status ("has this person engaged with Funūn
// at all"). This module never reads collaborators.status and must never be
// used as a substitute for it, or vice versa — the two answer different
// questions about the same person.
export type PartyProgressState = 'invited' | 'opened' | 'signed'

/**
 * approved -> signed. Everything else (pending OR countered) is "opened"
 * once first_viewed_at is stamped, else "invited, hasn't opened yet". A
 * countered party has necessarily viewed the sheet to counter it, so
 * folding 'countered' into the same viewed/unviewed split as 'pending'
 * (rather than inventing a fourth label) keeps this a pure function of
 * exactly the two inputs the spec names.
 */
export function derivePartyProgressState(
  approvalStatus: string,
  firstViewedAt: string | null
): PartyProgressState {
  if (approvalStatus === 'approved') return 'signed'
  return firstViewedAt != null ? 'opened' : 'invited'
}

export type AttentionPartyInput = {
  userId: string | null
  name: string
  approvalStatus: string
  firstViewedAt: string | null
  splitPercentage: number
}

export type PartyProgressRow = {
  userId: string | null
  name: string
  state: PartyProgressState
}

// ─── Viewer context resolution (P18-11 heart of this module) ─────────────
// One document, N lockers, each in the viewer's OWN context (design section
// 10b): "your share 30%" for me, "your share 45%" for you, from the SAME
// input rows. Resolved strictly by matching userId — never by position,
// never by "the other party's row" — so two different viewers of one sheet
// can never see each other's figure presented as their own. When the
// viewer is the initiator but not a named party (no row with a matching
// userId), the share is null rather than defaulting to anyone else's.
export type ViewerContext = {
  sharePercentage: number | null
  state: PartyProgressState | null
}

export function resolveViewerContext(
  parties: AttentionPartyInput[],
  viewerUserId: string
): ViewerContext {
  const viewerParty = parties.find(p => p.userId === viewerUserId)
  if (!viewerParty) return { sharePercentage: null, state: null }
  return {
    sharePercentage: viewerParty.splitPercentage,
    state: derivePartyProgressState(viewerParty.approvalStatus, viewerParty.firstViewedAt),
  }
}

export type AttentionSheetAttachmentInput = {
  vaultProjectId: string
  trackId: string | null
}

export type AttentionSheetInput = {
  id: string
  songName: string
  status: string
  initiatorUserId: string
  vaultProjectId: string | null
  trackId: string | null
  /** Additional coverage via split_sheet_attachments (migration 067) — the
   * SAME sheet attached to a second release (e.g. a single AND an album).
   * Origin fields above cover the sheet's own track_id/vault_project_id
   * only; a track reached ONLY through this array must still count as
   * covered (WR-01). Optional so existing callers/fixtures that predate
   * this field keep compiling and behaving as "no additional coverage". */
  attachments?: AttentionSheetAttachmentInput[]
  parties: AttentionPartyInput[]
}

export type AttentionDocumentInput = {
  id: string
  status: string
}

export type AttentionTrackInput = {
  id: string
  title: string
}

export type AttentionProjectInput = {
  id: string
  title: string
  tracks: AttentionTrackInput[]
}

export type AwaitingSignatureRow = {
  sheetId: string
  songName: string
  status: string
  /** How many named parties have signed, out of how many. */
  signedCount: number
  totalCount: number
  parties: PartyProgressRow[]
  viewerSharePercentage: number | null
  viewerState: PartyProgressState | null
}

export type DraftInProgressRow = {
  sheetId: string
  songName: string
}

export type UnattachedExecutedRow = {
  sheetId: string
  songName: string
}

export type SongWithNoSheetRow = {
  projectId: string
  projectTitle: string
  trackId: string
  trackTitle: string
}

export type AttentionSections = {
  awaitingSignature: AwaitingSignatureRow[]
  draftsInProgress: DraftInProgressRow[]
  unattachedExecuted: UnattachedExecutedRow[]
  songsWithNoSheet: SongWithNoSheetRow[]
  /** Executed, attached sheets not surfaced in any attention section above. */
  settledArchiveSheetIds: string[]
  /** Signed/verified documents not hidden and not covered by an attention section above. */
  settledArchiveDocumentIds: string[]
}

export type BuildAttentionSectionsInput = {
  viewerUserId: string
  sheets: AttentionSheetInput[]
  documents: AttentionDocumentInput[]
  projects: AttentionProjectInput[]
  hiddenDocumentIds: string[]
}

// Awaiting-signature bucket (P18-10): the CONSENSUS_RESET_STATUSES pair
// ('pending_approval'/'approved') sourced from lib/split-sheets/lifecycle.ts
// — the freeze-boundary's own vocabulary — plus 'countered' (a live
// renegotiation, still awaiting resolution) and 'esign_pending' (envelope
// minted, awaiting actual signatures). Sourcing two of the four from
// lifecycle.ts rather than re-declaring all four as fresh literals means a
// future freeze-boundary change to those two statuses cannot silently leave
// this bucket stale.
const AWAITING_SIGNATURE_STATUSES: SplitSheetStatus[] = [
  ...CONSENSUS_RESET_STATUSES,
  'countered',
  'esign_pending',
]

/**
 * Turns plain, already-fetched row arrays into the Locker's four ordered
 * attention sections plus a settled archive. No I/O, no model call — every
 * fact here was already computed by Funūn's own approval/e-sign pipeline
 * (design section 10a). An unrecognized sheet status degrades to the
 * archive rather than throwing, matching deriveSheetTier()'s posture in
 * lib/vault/readiness-tiers.ts.
 */
export function buildAttentionSections({
  viewerUserId,
  sheets,
  documents,
  projects,
  hiddenDocumentIds,
}: BuildAttentionSectionsInput): AttentionSections {
  const hidden = new Set(hiddenDocumentIds)

  // P18-11: a draft whose initiator is someone else does not exist for
  // this viewer, in any section or in the archive.
  const visibleSheets = sheets.filter(s => s.status !== 'draft' || s.initiatorUserId === viewerUserId)

  const awaitingSignature: AwaitingSignatureRow[] = []
  const draftsInProgress: DraftInProgressRow[] = []
  const unattachedExecuted: UnattachedExecutedRow[] = []
  const settledArchiveSheetIds: string[] = []

  for (const sheet of visibleSheets) {
    if (sheet.status === 'draft') {
      draftsInProgress.push({ sheetId: sheet.id, songName: sheet.songName })
      continue
    }

    if (AWAITING_SIGNATURE_STATUSES.includes(sheet.status as SplitSheetStatus)) {
      const parties: PartyProgressRow[] = sheet.parties.map(p => ({
        userId: p.userId,
        name: p.name,
        state: derivePartyProgressState(p.approvalStatus, p.firstViewedAt),
      }))
      const signedCount = parties.filter(p => p.state === 'signed').length
      const viewer = resolveViewerContext(sheet.parties, viewerUserId)

      awaitingSignature.push({
        sheetId: sheet.id,
        songName: sheet.songName,
        status: sheet.status,
        signedCount,
        totalCount: parties.length,
        parties,
        viewerSharePercentage: viewer.sharePercentage,
        viewerState: viewer.state,
      })
      continue
    }

    if (sheet.status === 'executed') {
      // Phrased as a nudge, never a warning (design section 7): an
      // unreleased song's sheet is a valid, permanent state, not a defect.
      if (sheet.vaultProjectId === null) {
        unattachedExecuted.push({ sheetId: sheet.id, songName: sheet.songName })
      } else {
        settledArchiveSheetIds.push(sheet.id)
      }
      continue
    }

    // Unrecognized status: degrade to the archive rather than throw.
    settledArchiveSheetIds.push(sheet.id)
  }

  // Songs with no sheet (P18-15: every track needs one, no exceptions). A
  // track is "covered" by either a sheet whose own track_id matches it, or
  // a project-level "covers the whole release" sheet (track_id null,
  // migration 067's explicitly-marked exception) attached to the same
  // project, OR any split_sheet_attachments row that reaches it (WR-01) —
  // the join table migration 067 built specifically so one sheet can cover
  // the same composition on a second release. A non-initiator's invisible
  // draft covers nothing, per P18-11.
  const songsWithNoSheet: SongWithNoSheetRow[] = []
  for (const project of projects) {
    for (const track of project.tracks) {
      const covered = visibleSheets.some(s => {
        if (s.trackId === track.id || (s.vaultProjectId === project.id && s.trackId === null)) {
          return true
        }
        return (s.attachments ?? []).some(
          a => a.trackId === track.id || (a.vaultProjectId === project.id && a.trackId === null)
        )
      })
      if (!covered) {
        songsWithNoSheet.push({
          projectId: project.id,
          projectTitle: project.title,
          trackId: track.id,
          trackTitle: track.title,
        })
      }
    }
  }

  const settledArchiveDocumentIds = documents
    .filter(d => !hidden.has(d.id))
    .filter(d => d.status === 'signed' || d.status === 'verified')
    .map(d => d.id)

  return {
    awaitingSignature,
    draftsInProgress,
    unattachedExecuted,
    songsWithNoSheet,
    settledArchiveSheetIds,
    settledArchiveDocumentIds,
  }
}
