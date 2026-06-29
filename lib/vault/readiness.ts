import type { ReadinessItem, VaultProjectType } from '@/types'
import { READINESS_ITEMS } from '@/types'
import { readComposers } from '@/lib/metadata/schema'

type ReadinessInput = {
  type: VaultProjectType
  distributor?: string | null
  tracks?: {
    isrc?: string | null
    iswc?: string | null
    metadata?: Record<string, unknown> | null
  }[]
  assets?: { type: string }[]
  documents?: { type: string; status: string }[]
  tool_outputs?: { tool_slug: string }[]
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

  return READINESS_ITEMS.filter(item => item.applies_to.includes(input.type)).map(item => {
    let status: ReadinessItem['status'] = 'missing'

    switch (item.key) {
      case 'audio_files':
        status = tracks.length > 0 ? 'complete' : 'missing'
        break
      case 'visual_asset':
        status = assets.some(a => ['cover_art', 'snippet_visual', 'lyric_card'].includes(a.type))
          ? 'complete'
          : 'missing'
        break
      case 'split_sheets':
        status = signedOf('split_sheet')
        break
      case 'copyright':
        status = documents.some(d => d.type === 'copyright_registration') ? 'complete' : 'missing'
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
      case 'hire_right':
        status = signedOf('hire_right')
        break
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

    return { ...item, status }
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
