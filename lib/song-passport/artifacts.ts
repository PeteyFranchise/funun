import { canonicalSha256 } from '@/lib/song-passport/canonical'
import { canEmbedPassportField, passportFieldDefinition } from '@/lib/song-passport/schema'

export type PassportArtifactFact = {
  fieldKey: string
  targetKey: string
  value: unknown
  state: string
  visibility: string
}

export type PassportArtifactMetadata = {
  schemaVersion: 'funun.song-passport.delivery.v1'
  facts: Record<string, unknown>
  factStates: Record<string, string>
}

export function deliverySafePassportMetadata(values: readonly PassportArtifactFact[]): PassportArtifactMetadata {
  const facts: Record<string, unknown> = {}
  const factStates: Record<string, string> = {}
  const ordered = [...values].sort((left, right) => `${left.fieldKey}:${left.targetKey}`.localeCompare(`${right.fieldKey}:${right.targetKey}`))
  for (const value of ordered) {
    if (value.visibility !== 'delivery_safe' || !canEmbedPassportField(value.fieldKey)) continue
    const key = facts[value.fieldKey] === undefined ? value.fieldKey : `${value.fieldKey}@${value.targetKey}`
    facts[key] = value.value
    factStates[key] = value.state
  }
  return { schemaVersion: 'funun.song-passport.delivery.v1', facts, factStates }
}

export function buildPassportSidecar(metadata: PassportArtifactMetadata): string {
  const lines = [
    'FUNŪN SONG PASSPORT — DELIVERY-SAFE METADATA',
    'This sidecar accompanies the identified recording. It is not proof of recipient acceptance.',
    '',
  ]
  for (const [key, value] of Object.entries(metadata.facts)) {
    const fieldKey = key.split('@')[0]!
    const label = passportFieldDefinition(fieldKey)?.label ?? humanize(fieldKey)
    lines.push(`${label}: ${display(value)}`)
    lines.push(`  Trust state: ${metadata.factStates[key]}`)
  }
  lines.push('', `Metadata SHA-256: ${canonicalSha256(metadata)}`)
  return lines.join('\n')
}

export function passportId3Fields(metadata: PassportArtifactMetadata) {
  const facts = metadata.facts
  return {
    title: text(facts.release_title ?? facts.composition_title),
    artist: people(facts.primary_artist) || text(facts.professional_name),
    album: text(facts.release_title),
    composer: people(facts.writers),
    publisher: text(facts.publisher_name),
    copyright: [text(facts.p_line), text(facts.c_line)].filter(Boolean).join(' · '),
    language: text(facts.lyrics_language),
    bpm: text(facts.bpm),
    lyrics: text(facts.lyrics),
    isrc: text(facts.isrc),
    iswc: text(facts.iswc),
    upc: text(facts.upc),
  }
}

function people(value: unknown): string {
  if (!Array.isArray(value)) return text(value)
  return value.map(person => typeof person === 'string' ? person : text((person as Record<string, unknown>)?.name)).filter(Boolean).join(', ')
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

function display(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}
