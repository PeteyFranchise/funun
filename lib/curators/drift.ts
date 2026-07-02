// ─── Genre-drift baseline diff (D-16) ────────────────────────────────────
// Pure function, no side effects, no external deps. Compares a curator's
// stored baseline genre-focus tag set against a current/proposed set using
// Jaccard similarity; a significant shift (overlap/union < 0.5) flags the
// curator for admin + artist-facing review (D-17). Empty-vs-empty is never
// treated as drift.

export function hasSignificantDrift(baseline: string[], current: string[]): boolean {
  const baseSet = new Set(baseline.map(t => t.trim().toLowerCase()).filter(Boolean))
  const currSet = new Set(current.map(t => t.trim().toLowerCase()).filter(Boolean))

  if (baseSet.size === 0 && currSet.size === 0) return false

  let intersectionSize = 0
  for (const tag of baseSet) {
    if (currSet.has(tag)) intersectionSize += 1
  }
  const unionSize = new Set([...baseSet, ...currSet]).size
  if (unionSize === 0) return false

  const jaccardSimilarity = intersectionSize / unionSize
  return jaccardSimilarity < 0.5
}
