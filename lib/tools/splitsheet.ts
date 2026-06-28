// ─── SplitSheet ──────────────────────────────────────────────────────
// Form-driven (not AI): the artist enters each collaborator's role and
// ownership %. The form must sum to exactly 100% or it won't submit.
// Produces a structured co-writing split sheet stored on the document.

export type SplitRole = 'lyrics' | 'melody' | 'production' | 'hook' | 'other'

export type SplitContributor = {
  name: string
  role: SplitRole
  percentage: number
  email?: string
}

export type SplitSheetData = {
  song_name: string
  contributors: SplitContributor[]
  total: number
}

export const SPLITSHEET_META = {
  slug: 'splitsheet' as const,
  name: 'SplitSheet',
  documentType: 'split_sheet' as const,
  protects: 'Documents who owns what share of the song before it earns money.',
}

export const SPLIT_ROLE_LABELS: Record<SplitRole, string> = {
  lyrics: 'Lyrics',
  melody: 'Melody',
  production: 'Production',
  hook: 'Hook',
  other: 'Other',
}

export type SplitSheetResult =
  | { ok: true; data: SplitSheetData }
  | { ok: false; error: string }

/** Validate + normalize split-sheet form input. Percentages must total 100. */
export function buildSplitSheet(input: {
  song_name?: string
  contributors?: { name?: string; role?: string; percentage?: number | string }[]
}): SplitSheetResult {
  const song_name = String(input.song_name ?? '').trim()
  if (!song_name) return { ok: false, error: 'Song name is required' }

  const raw = input.contributors ?? []
  if (raw.length < 1) return { ok: false, error: 'Add at least one collaborator' }

  const contributors: SplitContributor[] = []
  for (const c of raw) {
    const name = String(c.name ?? '').trim()
    if (!name) return { ok: false, error: 'Every collaborator needs a name' }
    const role = (
      ['lyrics', 'melody', 'production', 'hook', 'other'].includes(String(c.role))
        ? c.role
        : 'other'
    ) as SplitRole
    const pct = Number(c.percentage)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { ok: false, error: `Invalid percentage for ${name}` }
    }
    const email = (c as { email?: unknown }).email ? String((c as { email?: unknown }).email).trim() : undefined
    contributors.push({ name, role, percentage: Math.round(pct * 100) / 100, ...(email ? { email } : {}) })
  }

  const total = Math.round(contributors.reduce((s, c) => s + c.percentage, 0) * 100) / 100
  if (total !== 100) {
    return { ok: false, error: `Percentages must add up to 100% (currently ${total}%)` }
  }

  return { ok: true, data: { song_name, contributors, total } }
}
