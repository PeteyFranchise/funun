import type { LegacyPassportFact } from '@/lib/song-passport/discovery'

export type LegacyWorkSource = {
  work: {
    id: string
    title: string
    vocal_state: 'primary' | 'varies' | 'instrumental'
    graduated_project_id: string | null
  }
  members: Array<{
    user_id: string | null
    collaborator_id: string | null
  }>
  collaborators: Array<{
    id: string
    name: string
    legal_name?: string | null
    pro?: string | null
    ipi?: string | null
    publisher?: string | null
  }>
  ownerProfile?: {
    id: string
    artist_name?: string | null
    legal_first_name?: string | null
    legal_middle_name?: string | null
    legal_last_name?: string | null
    legal_name_suffix?: string | null
    pro?: string | null
    ipi?: string | null
    publisher?: string | null
    industry_roles?: string[] | null
  } | null
  lyricBlocks: Array<{
    id: string
    position: number
    block_type: string
    custom_label?: string | null
    text: string
    updated_at?: string | null
  }>
  versions: Array<{
    id: string
    label?: string | null
    performers?: unknown
    duration_seconds?: number | null
    created_at?: string | null
  }>
  splitSheet?: {
    id: string
    status: string
    updated_at?: string | null
    parties: Array<{
      collaborator_id?: string | null
      user_id?: string | null
      name: string
      role?: string | null
      split_percentage: number | string
    }>
  } | null
  releaseProject?: {
    id: string
    title: string
    release_date?: string | null
    label?: string | null
    upc?: string | null
    catalog_number?: string | null
    tracks?: Array<{
      id: string
      title: string
      track_number?: number | null
      isrc?: string | null
      p_line?: string | null
      c_line?: string | null
    }>
  } | null
}

/** Collects only facts supported by an exact legacy row. */
export function legacyFactsForWork(source: LegacyWorkSource): LegacyPassportFact[] {
  const facts: LegacyPassportFact[] = [
    fact('composition_title', { layer: 'composition' }, source.work.title, 'work', source.work.id),
  ]

  const owner = source.ownerProfile
  if (owner) {
    const legalName = [
      owner.legal_first_name,
      owner.legal_middle_name,
      owner.legal_last_name,
      owner.legal_name_suffix,
    ]
      .map(value => value?.trim())
      .filter(Boolean)
      .join(' ')
    facts.push(
      fact('professional_name', { layer: 'contributor', userId: owner.id }, owner.artist_name, 'profile', owner.id),
      fact('legal_name', { layer: 'contributor', userId: owner.id }, legalName, 'profile', owner.id),
      fact('pro_affiliation', { layer: 'contributor', userId: owner.id }, owner.pro, 'profile', owner.id),
      fact('ipi_cae', { layer: 'contributor', userId: owner.id }, owner.ipi, 'profile', owner.id),
      fact('publisher_name', { layer: 'contributor', userId: owner.id }, owner.publisher, 'profile', owner.id),
      fact('songwriter_roles', { layer: 'contributor', userId: owner.id }, owner.industry_roles, 'profile', owner.id)
    )
  }

  const memberCollaboratorIds = new Set(source.members.map(member => member.collaborator_id).filter(Boolean))
  for (const collaborator of source.collaborators) {
    if (!memberCollaboratorIds.has(collaborator.id)) continue
    const target = { layer: 'contributor' as const, collaboratorId: collaborator.id }
    facts.push(
      fact('professional_name', target, collaborator.name, 'collaborator', collaborator.id),
      fact('legal_name', target, collaborator.legal_name, 'collaborator', collaborator.id),
      fact('pro_affiliation', target, collaborator.pro, 'collaborator', collaborator.id),
      fact('ipi_cae', target, collaborator.ipi, 'collaborator', collaborator.id),
      fact('publisher_name', target, collaborator.publisher, 'collaborator', collaborator.id)
    )
  }

  const writtenBlocks = source.lyricBlocks
    .filter(block => block.text.trim())
    .sort((left, right) => left.position - right.position)
  if (writtenBlocks.length > 0) {
    const lyrics = writtenBlocks
      .map(block => `[${block.custom_label?.trim() || humanize(block.block_type)}]\n${block.text.trim()}`)
      .join('\n\n')
    const revision = writtenBlocks.map(block => `${block.id}-${block.updated_at ?? 'original'}`).join('_')
    facts.push(fact('lyrics', { layer: 'composition' }, lyrics, 'lyric_block', source.work.id, revision))
  }

  for (const version of source.versions) {
    const target = { layer: 'recording_version' as const, workVersionId: version.id }
    facts.push(
      fact('version_label', target, version.label || 'Untitled take', 'work_version', version.id, version.created_at),
      fact('performers', target, version.performers, 'work_version', version.id, version.created_at),
      fact('duration_seconds', target, version.duration_seconds, 'work_version', version.id, version.created_at),
      fact('vocal_type', target, source.work.vocal_state, 'work_version', version.id, version.created_at)
    )
  }

  const sheet = source.splitSheet
  if (sheet) {
    facts.push(
      fact(
        'writers',
        { layer: 'composition' },
        sheet.parties.map(party => ({
          userId: party.user_id ?? null,
          collaboratorId: party.collaborator_id ?? null,
          name: party.name,
          role: party.role ?? null,
        })),
        'split_sheet',
        sheet.id,
        sheet.updated_at
      ),
      fact(
        'publishing_shares',
        { layer: 'composition' },
        Object.fromEntries(
          sheet.parties.map(party => [party.user_id ?? party.collaborator_id ?? party.name, Number(party.split_percentage)])
        ),
        'split_sheet',
        sheet.id,
        sheet.updated_at
      )
    )
  }

  const project = source.releaseProject
  if (project) {
    const projectTarget = { layer: 'release' as const, vaultProjectId: project.id }
    facts.push(
      fact('release_title', projectTarget, project.title, 'release_project', project.id),
      fact('release_date', projectTarget, project.release_date, 'release_project', project.id),
      fact('label_name', projectTarget, project.label, 'release_project', project.id),
      fact('upc', projectTarget, project.upc, 'release_project', project.id),
      fact('catalog_number', projectTarget, project.catalog_number, 'release_project', project.id)
    )
    for (const track of project.tracks ?? []) {
      const trackTarget = { layer: 'release' as const, vaultProjectId: project.id, trackId: track.id }
      facts.push(
        fact('release_title', trackTarget, track.title, 'track_metadata', track.id),
        fact('track_number', trackTarget, track.track_number, 'track_metadata', track.id),
        fact('isrc', trackTarget, track.isrc, 'track_metadata', track.id),
        fact('p_line', trackTarget, track.p_line, 'track_metadata', track.id),
        fact('c_line', trackTarget, track.c_line, 'track_metadata', track.id)
      )
    }
  }

  return facts
}

function fact(
  fieldKey: LegacyPassportFact['fieldKey'],
  target: LegacyPassportFact['target'],
  value: unknown,
  sourceKind: LegacyPassportFact['sourceKind'],
  sourceRecordId: string,
  sourceRevision?: string | null
): LegacyPassportFact {
  return { fieldKey, target, value, sourceKind, sourceRecordId, sourceRevision }
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}
