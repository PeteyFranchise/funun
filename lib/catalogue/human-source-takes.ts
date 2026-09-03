export type ExistingTakeOption = {
  id: string
  display: string
  description: string
  playbackUrl: string | null
  durationSeconds: number | null
  createdAt: string
  isAiTagged: boolean
}

/**
 * Returns only plausible earlier evidence. This proves sequence—not
 * authorship—so the artist still attests to what the selected take means.
 */
export function eligibleEarlierTakes(
  versions: ExistingTakeOption[],
  targetVersionId: string | null
): ExistingTakeOption[] {
  const target = targetVersionId
    ? versions.find(version => version.id === targetVersionId) ?? null
    : null
  if (targetVersionId && !target) return []

  const targetTime = target ? Date.parse(target.createdAt) : null
  if (target && !Number.isFinite(targetTime)) return []

  return versions
    .filter(version => {
      if (version.id === targetVersionId || version.isAiTagged) return false
      const createdAt = Date.parse(version.createdAt)
      if (!Number.isFinite(createdAt)) return false
      return targetTime === null || createdAt < targetTime
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
