// ─── Direct-overlay (sync / commercial-library) eligibility ──────────
// Computes whether a project qualifies for the ReRight "direct overlay" in
// the Model-B partnership (see docs/publishing-admin-partners.md):
//   • Tier 1 — sync + direct commercial-library deals. Open to ALL territories
//     (no rights withdrawal). Gated on clean rights + sync-ready assets.
//   • Tier 2 — digital streaming withdrawal. Tier 1 PLUS a territory/PRO gate
//     (US ASCAP/BMI writers are blocked by consent decrees).
//
// Design goal: this is the "guidance layer," not a pass/fail wall. Every gate
// reports a status AND a remedy that maps to an Funūn tool, so the UI can
// walk an artist *into* eligibility instead of just rejecting them.
//
// Pure + client-safe (no Node-only deps). Callers normalize DB rows via
// buildEligibilityInput() then run evaluate().

import type { Track, VaultDocument, VaultProject } from '@/types'
import { readComposers, type PRO } from '@/lib/metadata/schema'

// ─── Result shapes ───────────────────────────────────────────────────
export type GateStatus =
  | 'pass' // requirement met
  | 'fail' // requirement unmet — something to fix
  | 'needs_input' // we can't tell from data; artist must attest/confirm

export type GateKey =
  | 'original_work'
  | 'splits_resolved'
  | 'samples_cleared'
  | 'no_conflicting_admin'
  | 'sync_assets'
  | 'withdrawal_territory'

export type EligibilityGate = {
  key: GateKey
  label: string
  status: GateStatus
  /** Which tier this gate belongs to. */
  tier: 1 | 2
  /** Human-readable state. */
  detail: string
  /** When not `pass`: the Funūn tool / action that resolves it. */
  remedy?: string
}

export type DirectOverlayTier = 'none' | 'tier1' | 'tier2'

export type EligibilityResult = {
  tier1Eligible: boolean
  tier2Eligible: boolean
  tier: DirectOverlayTier
  gates: EligibilityGate[]
  /** Tier-1 gates still blocking (status !== 'pass'), with remedies — the to-do list. */
  blockers: EligibilityGate[]
  /** Passed Tier-1 gates / total Tier-1 gates, e.g. "3 of 5". */
  progress: { passed: number; total: number }
}

// ─── Normalized input (one project) ──────────────────────────────────
export type EligibilityTrack = {
  title: string
  /** Sum of composer publishing splits on this track. */
  splitTotal: number
  hasSample: boolean
  /** A signed/verified sample_clearance covers this track. */
  sampleCleared: boolean
  /** Master audio present (audio_file_url). */
  hasMaster: boolean
  /** language === 'zxx' — an instrumental version is on hand. */
  isInstrumental: boolean
  /** PROs of the writers on this track. */
  writerPros: PRO[]
}

export type EligibilityInput = {
  /** A signed split_sheet document exists for the project. */
  signedSplitSheet: boolean
  /** Attestations not yet modeled in the schema (null = not answered). */
  isCover: boolean | null
  existingAdminAssignment: boolean | null
  tracks: EligibilityTrack[]
}

// US PROs under DOJ consent decrees — cannot partially withdraw digital rights.
const CONSENT_DECREE_PROS: PRO[] = ['ASCAP', 'BMI']
// Societies that allow flexible digital mandates → Tier-2 (withdrawal) friendly.
const WITHDRAWAL_FRIENDLY_PROS: PRO[] = [
  'PRS', 'SOCAN', 'GEMA', 'SACEM', 'APRA', 'JASRAC', 'STIM', 'BUMA',
]

// ─── DB rows → normalized input ──────────────────────────────────────
export function buildEligibilityInput(
  project: VaultProject,
  tracks: Track[],
  documents: VaultDocument[],
  attestations: { isCover?: boolean | null; existingAdminAssignment?: boolean | null } = {}
): EligibilityInput {
  const signedSplitSheet = documents.some(
    d => d.type === 'split_sheet' && d.status === 'signed' &&
      (d.project_id === project.id || d.project_id === null)
  )

  const clearanceDocs = documents.filter(
    d => d.type === 'sample_clearance' && (d.status === 'signed' || d.status === 'verified')
  )

  const eTracks: EligibilityTrack[] = tracks.map(t => {
    const composers = readComposers(t.metadata)
    const splitTotal = Math.round(composers.reduce((s, c) => s + (c.split || 0), 0) * 100) / 100
    const sampleCleared =
      !t.has_sample ||
      clearanceDocs.some(d => d.track_id === t.id || d.track_id === null)
    return {
      title: t.title,
      splitTotal,
      hasSample: t.has_sample,
      sampleCleared,
      hasMaster: Boolean(t.audio_file_url),
      isInstrumental: t.language === 'zxx',
      writerPros: composers.map(c => c.pro),
    }
  })

  return {
    signedSplitSheet,
    isCover: attestations.isCover ?? null,
    existingAdminAssignment: attestations.existingAdminAssignment ?? null,
    tracks: eTracks,
  }
}

// ─── Evaluate ────────────────────────────────────────────────────────
export function evaluateDirectOverlayEligibility(input: EligibilityInput): EligibilityResult {
  const tracks = input.tracks
  const gates: EligibilityGate[] = []

  // 1) Original work — not a cover. (Attestation; no schema flag yet.)
  gates.push(
    input.isCover === null
      ? { key: 'original_work', label: 'Original work', tier: 1, status: 'needs_input',
          detail: 'Confirm this is an original composition (not a cover).',
          remedy: 'Mark the release as original, or use the licensed-cover path.' }
      : input.isCover
        ? { key: 'original_work', label: 'Original work', tier: 1, status: 'fail',
            detail: 'Marked as a cover — the composition is not yours to license directly.',
            remedy: 'Switch to an original, or license the cover (Songfile) instead of direct deals.' }
        : { key: 'original_work', label: 'Original work', tier: 1, status: 'pass',
            detail: 'Original composition.' }
  )

  // 2) Splits resolved — every track sums to 100% AND a signed split sheet exists.
  const tracksWithComposers = tracks.filter(t => t.splitTotal > 0)
  const allHundred = tracksWithComposers.length > 0 &&
    tracksWithComposers.every(t => t.splitTotal === 100)
  const splitsOk = allHundred && input.signedSplitSheet
  gates.push({
    key: 'splits_resolved', label: 'Splits resolved', tier: 1,
    status: splitsOk ? 'pass' : 'fail',
    detail: splitsOk
      ? 'All tracks at 100% with a signed split sheet.'
      : !input.signedSplitSheet
        ? 'No signed split sheet on file.'
        : 'One or more tracks do not total 100%.',
    remedy: splitsOk ? undefined : 'SplitSheet — resolve every track to a signed 100% split.',
  })

  // 3) Samples cleared — any sampling track has a signed/verified clearance.
  const uncleared = tracks.filter(t => t.hasSample && !t.sampleCleared)
  gates.push({
    key: 'samples_cleared', label: 'Samples cleared', tier: 1,
    status: uncleared.length === 0 ? 'pass' : 'fail',
    detail: uncleared.length === 0
      ? 'No uncleared samples.'
      : `${uncleared.length} track(s) sample uncleared material.`,
    remedy: uncleared.length === 0 ? undefined : 'SampleClear — assess and clear the flagged samples.',
  })

  // 4) No conflicting prior admin. (Attestation; no schema flag yet.)
  gates.push(
    input.existingAdminAssignment === null
      ? { key: 'no_conflicting_admin', label: 'No conflicting admin', tier: 1, status: 'needs_input',
          detail: 'Confirm these digital rights are not already assigned to another publisher/admin.',
          remedy: 'Confirm no prior assignment, or resolve it before opting in.' }
      : input.existingAdminAssignment
        ? { key: 'no_conflicting_admin', label: 'No conflicting admin', tier: 1, status: 'fail',
            detail: 'Rights already assigned elsewhere — would double-claim.',
            remedy: 'Exit/clear the prior assignment before assigning sync to ReRight.' }
        : { key: 'no_conflicting_admin', label: 'No conflicting admin', tier: 1, status: 'pass',
            detail: 'No conflicting assignment.' }
  )

  // 5) Sync-ready assets — every track has a master. (Stems advisory below.)
  const noMaster = tracks.filter(t => !t.hasMaster)
  const anyInstrumental = tracks.some(t => t.isInstrumental)
  gates.push({
    key: 'sync_assets', label: 'Sync-ready assets', tier: 1,
    status: tracks.length > 0 && noMaster.length === 0 ? 'pass' : 'fail',
    detail: tracks.length === 0
      ? 'No tracks yet.'
      : noMaster.length === 0
        ? `Masters present.${anyInstrumental ? ' Instrumental available.' : ' Add stems/instrumental to maximize placements.'}`
        : `${noMaster.length} track(s) missing a master.`,
    remedy: noMaster.length === 0 ? undefined : 'Upload the master(s); add stems/instrumental for best sync odds.',
  })

  // 6) Tier-2 only — withdrawal territory/PRO.
  const allPros = Array.from(new Set(tracks.flatMap(t => t.writerPros)))
  const hasConsentDecree = allPros.some(p => CONSENT_DECREE_PROS.includes(p))
  const allWithdrawalFriendly = allPros.length > 0 &&
    allPros.every(p => WITHDRAWAL_FRIENDLY_PROS.includes(p))
  gates.push({
    key: 'withdrawal_territory', label: 'Withdrawal-eligible territory', tier: 2,
    status: hasConsentDecree ? 'fail' : allWithdrawalFriendly ? 'pass' : 'needs_input',
    detail: hasConsentDecree
      ? 'US ASCAP/BMI writer — consent decrees block partial digital withdrawal (Tier 1 still available).'
      : allWithdrawalFriendly
        ? 'Writers are with withdrawal-friendly societies.'
        : 'Writer PRO(s) need verification for withdrawal eligibility.',
    remedy: hasConsentDecree
      ? 'Stay on Tier 1 (sync/library) — no withdrawal needed.'
      : allWithdrawalFriendly ? undefined : 'Confirm each writer’s society allows digital withdrawal.',
  })

  // ─── Roll up ───────────────────────────────────────────────────────
  const tier1Gates = gates.filter(g => g.tier === 1)
  const tier1Eligible = tier1Gates.every(g => g.status === 'pass')
  const territoryGate = gates.find(g => g.key === 'withdrawal_territory')!
  const tier2Eligible = tier1Eligible && territoryGate.status === 'pass'

  const blockers = tier1Gates.filter(g => g.status !== 'pass')
  const passed = tier1Gates.filter(g => g.status === 'pass').length

  return {
    tier1Eligible,
    tier2Eligible,
    tier: tier2Eligible ? 'tier2' : tier1Eligible ? 'tier1' : 'none',
    gates,
    blockers,
    progress: { passed, total: tier1Gates.length },
  }
}
