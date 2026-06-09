import type { OpportunityType } from '@/types'

/** Accent color per opportunity type (used for chips, borders, dots). */
export const TYPE_COLORS: Record<OpportunityType, string> = {
  sync: '#818CF8',
  playlist: '#34D399',
  label: '#F59E0B',
  venue: '#60A5FA',
  festival: '#A78BFA',
  press: '#F472B6',
  brand: '#F87171',
}

/** Color band for a 0–100 match score bar. */
export function scoreColor(score: number): string {
  if (score >= 85) return '#34D399'
  if (score >= 70) return '#818CF8'
  if (score >= 50) return '#F59E0B'
  return '#F87171'
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Excellent match'
  if (score >= 70) return 'Strong match'
  if (score >= 50) return 'Possible match'
  return 'Long shot'
}

/** Whole days from now until an ISO deadline (negative if past). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function deadlineLabel(iso: string | null): string | null {
  const d = daysUntil(iso)
  if (d == null) return null
  if (d < 0) return 'Closed'
  if (d === 0) return 'Closes today'
  if (d === 1) return '1 day left'
  return `${d} days left`
}
