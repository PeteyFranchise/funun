import type { ReadinessItem, Release } from '@/types'
import { READINESS_ITEMS } from '@/types'

export function calculateReadinessItems(release: Release & {
  tracks?: unknown[]
  assets?: { type: string }[]
  documents?: { type: string; status: string }[]
  tool_outputs?: { tool_slug: string }[]
}): ReadinessItem[] {
  const tracks = release.tracks || []
  const assets = release.assets || []
  const documents = release.documents || []
  const outputs = release.tool_outputs || []

  return READINESS_ITEMS.map(item => {
    let status: 'complete' | 'warning' | 'missing' = 'missing'

    switch (item.key) {
      case 'audio_files':
        status = tracks.length > 0 ? 'complete' : 'missing'
        break

      case 'cover_art':
        status = assets.some(a => a.type === 'cover_art') ? 'complete' : 'missing'
        break

      case 'split_sheets': {
        const signed = documents.filter(d => d.type === 'split_sheet' && d.status === 'signed').length
        const total = documents.filter(d => d.type === 'split_sheet').length
        if (signed === total && total > 0) status = 'complete'
        else if (total > 0) status = 'warning'
        else status = 'missing'
        break
      }

      case 'copyright':
        status = documents.some(d => d.type === 'copyright_registration') ? 'complete' : 'missing'
        break

      case 'isrc_codes':
        const tracksWithIsrc = (tracks as { isrc?: string }[]).filter(t => t.isrc).length
        if (tracksWithIsrc === tracks.length && tracks.length > 0) status = 'complete'
        else if (tracksWithIsrc > 0) status = 'warning'
        else status = 'missing'
        break

      case 'pro_registration':
        status = outputs.some(o => o.tool_slug === 'royaltyaudit') ? 'complete' : 'missing'
        break

      case 'hire_right': {
        const signed = documents.filter(d => d.type === 'hire_right' && d.status === 'signed').length
        const total = documents.filter(d => d.type === 'hire_right').length
        if (signed > 0 && signed === total) status = 'complete'
        else if (total > 0) status = 'warning'
        else status = 'missing'
        break
      }

      case 'epk':
        status = outputs.some(o => o.tool_slug === 'epkfyi') ? 'complete' : 'missing'
        break

      case 'metadata':
        status = outputs.some(o => ['presbit', 'distroadvisor'].includes(o.tool_slug)) ? 'complete' : 'missing'
        break
    }

    return { ...item, status }
  })
}

export function computeReadinessScore(items: ReadinessItem[]): number {
  return items
    .filter(i => i.status === 'complete')
    .reduce((sum, i) => sum + i.points, 0)
}

export function getReadinessLabel(score: number): {
  label: string
  color: 'red' | 'amber' | 'green'
  canSubmit: boolean
} {
  if (score < 40) return { label: 'Not ready', color: 'red', canSubmit: false }
  if (score < 60) return { label: 'Getting there', color: 'red', canSubmit: false }
  if (score < 80) return { label: 'Almost ready', color: 'amber', canSubmit: false }
  if (score < 100) return { label: 'Ready to submit', color: 'green', canSubmit: true }
  return { label: 'Fully complete', color: 'green', canSubmit: true }
}
