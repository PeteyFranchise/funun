// ─── DDEX RDR-N readiness (neighbouring rights / recording side) ─────
// Assesses whether a recording carries enough data to be registered with a
// music licensing company (SoundExchange / PPL / GVL …) for neighbouring-
// rights collection, against DDEX RDR's two conformance profiles:
//   • Core        — enough for many MLCs to REGISTER the recording.
//   • Recommended — enough to ALLOCATE revenue and PAY OUT next distribution.
// Pure + client-safe. See docs/ddex-rdr-compliance.md. This models the data
// completeness; it does NOT emit RDR-N XML (that's a partner-routed step).
import type { Performer, RecordingInfo } from '@/lib/metadata/schema'

export type RdrProfile = 'none' | 'core' | 'recommended'

export type RdrTrackInput = {
  title: string
  isrc: string | null
  /** Main/display artist for the recording. */
  mainArtist: string | null
  /** P-line / master rights owner (label or self). */
  rightsOwner: string | null
  performers: Performer[]
  recording: RecordingInfo | null
}

export type RdrTrackStatus = {
  title: string
  profile: RdrProfile
  /** Missing fields blocking the Core profile. */
  coreMissing: string[]
  /** Additional fields needed for the Recommended profile. */
  recommendedMissing: string[]
}

export type RdrReadiness = {
  tracks: RdrTrackStatus[]
  coreCount: number
  recommendedCount: number
  /** True when at least one recording is Core-ready to submit. */
  hasCore: boolean
}

export function assessRdrTrack(t: RdrTrackInput): RdrTrackStatus {
  const coreMissing: string[] = []
  const recommendedMissing: string[] = []

  // ── Core: identify + register the recording ──
  if (!t.isrc) coreMissing.push('ISRC')
  if (!t.title.trim()) coreMissing.push('Recording title')
  if (!t.mainArtist?.trim()) coreMissing.push('Main artist')
  if (!t.rightsOwner?.trim()) coreMissing.push('Rights owner (P-line)')
  if (t.performers.length === 0) coreMissing.push('At least one performer')

  // ── Recommended: allocate revenue + pay out ──
  // Every performer needs a role (always set) AND an identifier (ISNI/IPN).
  const performersUnidentified = t.performers.filter(p => !p.ipn && !p.isni).length
  if (t.performers.length === 0) {
    recommendedMissing.push('Performers with identifiers (ISNI/IPN)')
  } else if (performersUnidentified > 0) {
    recommendedMissing.push(`${performersUnidentified} performer(s) missing ISNI/IPN`)
  }
  const hasFeatured = t.performers.some(p => p.role === 'featured')
  if (t.performers.length > 0 && !hasFeatured) {
    recommendedMissing.push('No featured performer marked')
  }
  if (!t.recording?.recordingDate) recommendedMissing.push('Recording date')
  if (!t.recording?.recordingCountry) recommendedMissing.push('Country of recording')
  if (!t.recording?.originalPurpose) recommendedMissing.push('Original purpose')
  if (t.recording?.commerciallyAvailable === undefined)
    recommendedMissing.push('Commercial availability')

  const coreReady = coreMissing.length === 0
  const recommendedReady = coreReady && recommendedMissing.length === 0
  const profile: RdrProfile = recommendedReady ? 'recommended' : coreReady ? 'core' : 'none'

  return { title: t.title, profile, coreMissing, recommendedMissing }
}

export function assessRdrReadiness(tracks: RdrTrackInput[]): RdrReadiness {
  const assessed = tracks.map(assessRdrTrack)
  const coreCount = assessed.filter(t => t.profile !== 'none').length
  const recommendedCount = assessed.filter(t => t.profile === 'recommended').length
  return { tracks: assessed, coreCount, recommendedCount, hasCore: coreCount > 0 }
}
