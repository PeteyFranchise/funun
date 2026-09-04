import type { IdeaView } from '@/lib/ideas/schema'

export type IdeaNextMove = {
  key: 'record' | 'name' | 'note' | 'lyrics' | 'collaborate' | 'promote' | 'revisit'
  label: string
}

export function nextMoveForIdea(idea: IdeaView): IdeaNextMove {
  if (idea.recordings.length === 0) return { key: 'record', label: 'Capture the first sound' }
  if (/^Voice idea ·/.test(idea.title)) return { key: 'name', label: 'Give this spark a name' }
  if (!idea.note && !idea.transcript) return { key: 'note', label: 'Write down what you hear in it' }
  if (idea.transcript && idea.transcript.trim().length > 0 && idea.comments.length === 0) {
    return { key: 'lyrics', label: 'Pull out the line you want to keep' }
  }
  if (idea.members.length === 0 && idea.recordings.length >= 2) return { key: 'collaborate', label: 'Invite someone into the idea' }
  if (!idea.promotedWorkId && idea.recordings.length >= 2) return { key: 'promote', label: 'Start a Writer’s Room' }
  return { key: 'revisit', label: 'Listen from the beginning' }
}

export function ideaSimilarity(left: IdeaView, right: IdeaView): number {
  if (left.id === right.id) return 1
  const leftTerms = new Set([
    ...left.moods.map(value => value.toLocaleLowerCase()),
    ...`${left.title} ${left.note ?? ''}`.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(term => term.length >= 3),
  ])
  const rightTerms = new Set([
    ...right.moods.map(value => value.toLocaleLowerCase()),
    ...`${right.title} ${right.note ?? ''}`.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(term => term.length >= 3),
  ])
  if (leftTerms.size === 0 || rightTerms.size === 0) return 0
  let overlap = 0
  leftTerms.forEach(term => { if (rightTerms.has(term)) overlap += 1 })
  return overlap / new Set([...leftTerms, ...rightTerms]).size
}

export function relatedIdeas(idea: IdeaView, allIdeas: IdeaView[], limit = 3): IdeaView[] {
  return allIdeas
    .flatMap(candidate => candidate.id === idea.id ? [] : [{ candidate, score: ideaSimilarity(idea, candidate) }])
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.candidate.capturedAt.localeCompare(a.candidate.capturedAt))
    .slice(0, limit)
    .map(item => item.candidate)
}

export function contributionReceipt(idea: IdeaView): { name: string; recordings: number; comments: number }[] {
  const byName = new Map<string, { name: string; recordings: number; comments: number }>()
  for (const recording of idea.recordings) {
    const current = byName.get(recording.creatorName) ?? { name: recording.creatorName, recordings: 0, comments: 0 }
    current.recordings += 1
    byName.set(current.name, current)
  }
  for (const comment of idea.comments) {
    const current = byName.get(comment.authorName) ?? { name: comment.authorName, recordings: 0, comments: 0 }
    current.comments += 1
    byName.set(current.name, current)
  }
  return Array.from(byName.values()).sort((a, b) => b.recordings - a.recordings || b.comments - a.comments)
}
