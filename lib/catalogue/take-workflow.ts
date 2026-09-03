export type WorkingTake = {
  id: string
  archivedAt?: string | null
}

/** Presentation-only labels are bounded and blank input clears the label. */
export function normalizeTakeLabel(value: string): string | null {
  const label = value.trim()
  return label ? label.slice(0, 200) : null
}

/** Keeps chronological order inside each group while putting the room's working take first. */
export function workingTakeFirst<T extends WorkingTake>(takes: T[], workingVersionId: string | null): T[] {
  if (!workingVersionId) return takes
  const working = takes.find(take => take.id === workingVersionId && !take.archivedAt)
  if (!working) return takes
  return [working, ...takes.filter(take => take.id !== workingVersionId)]
}
