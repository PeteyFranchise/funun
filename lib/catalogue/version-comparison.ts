export type ComparisonVersionFacts = {
  id: string
  display: string
  createdAt: string
  durationSeconds: number | null
}

export function defaultComparisonIds(
  versionsNewestFirst: ComparisonVersionFacts[],
  workingVersionId: string | null = null
): { sideAId: string; sideBId: string } | null {
  if (versionsNewestFirst.length < 2) return null
  const working = workingVersionId
    ? versionsNewestFirst.find(version => version.id === workingVersionId)
    : null
  if (working) {
    const comparison = versionsNewestFirst.find(version => version.id !== working.id)!
    return { sideAId: comparison.id, sideBId: working.id }
  }
  return {
    sideAId: versionsNewestFirst[1]!.id,
    sideBId: versionsNewestFirst[0]!.id,
  }
}

export function clampComparisonPosition(positionMs: number, durationSeconds: number | null): number {
  const safePosition = Number.isFinite(positionMs) ? Math.max(0, Math.round(positionMs)) : 0
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return safePosition
  }
  return Math.min(safePosition, Math.round(durationSeconds * 1000))
}

export function isNewerVersion(candidate: ComparisonVersionFacts, source: ComparisonVersionFacts): boolean {
  const candidateTime = Date.parse(candidate.createdAt)
  const sourceTime = Date.parse(source.createdAt)
  if (!Number.isFinite(candidateTime) || !Number.isFinite(sourceTime)) return false
  return candidateTime > sourceTime || (candidateTime === sourceTime && candidate.id > source.id)
}

export function comparisonResolutionLabel({
  resolved,
  commentVersion,
  listeningVersion,
}: {
  resolved: boolean
  commentVersion: ComparisonVersionFacts
  listeningVersion: ComparisonVersionFacts
}): string {
  if (resolved) return 'Reopen note'
  if (commentVersion.id !== listeningVersion.id && isNewerVersion(listeningVersion, commentVersion)) {
    return `Mark addressed in ${listeningVersion.display}`
  }
  return 'Resolve note'
}
