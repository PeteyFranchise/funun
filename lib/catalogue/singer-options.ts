import type { PerformerRef } from '@/types/catalogue'

export type SingerCandidateSource = 'self' | 'room' | 'roster' | 'named'

export type SingerCandidate = {
  key: string
  name: string
  source: SingerCandidateSource
  performer: PerformerRef
}

export type SingerPerson = {
  name: string
  userId?: string | null
  collaboratorId?: string | null
}

function identityKey(person: SingerPerson): string {
  if (person.userId) return `user:${person.userId}`
  if (person.collaboratorId) return `collaborator:${person.collaboratorId}`
  return `name:${person.name.trim().toLocaleLowerCase()}`
}

/**
 * Builds one picker list without turning performance into membership.
 * Priority is self, then people already in the room, then the wider roster.
 */
export function buildSingerCandidates(input: {
  viewer: SingerPerson & { userId: string }
  room: SingerPerson[]
  roster: SingerPerson[]
}): SingerCandidate[] {
  const candidates: SingerCandidate[] = []
  const seen = new Set<string>()

  function add(person: SingerPerson, source: SingerCandidateSource) {
    const name = person.name.trim()
    if (!name) return
    const key = identityKey({ ...person, name })
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({
      key,
      name,
      source,
      performer:
        source === 'self'
          ? { kind: 'self', userId: person.userId, name }
          : {
              kind: 'collaborator',
              collaboratorId: person.collaboratorId ?? null,
              userId: person.userId ?? null,
              name,
            },
    })
  }

  add(input.viewer, 'self')
  input.room.forEach(person => add(person, 'room'))
  input.roster.forEach(person => add(person, 'roster'))

  return candidates
}

export function performerIdentityKey(performer: PerformerRef): string {
  if (performer.userId) return `user:${performer.userId}`
  if (performer.collaboratorId) return `collaborator:${performer.collaboratorId}`
  return `guest:${(performer.name ?? '').trim().toLocaleLowerCase()}`
}
