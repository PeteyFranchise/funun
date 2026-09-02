// ─── Song Passport — Phase 37.3 canonical vocabulary ───────────────────
// Safe to import on the server or client: this module is pure data/types.
// Database migration 151 mirrors these value sets with CHECK constraints.

export const PASSPORT_LAYERS = [
  'contributor',
  'composition',
  'recording_version',
  'release',
] as const

export type PassportLayer = (typeof PASSPORT_LAYERS)[number]

export const PASSPORT_VALUE_STATES = [
  'inherited',
  'draft',
  'confirmed',
  'locked',
  'outdated',
  'disputed',
] as const

export type PassportValueState = (typeof PASSPORT_VALUE_STATES)[number]

export const PASSPORT_VISIBILITIES = [
  'public',
  'collaborators',
  'delivery_safe',
  'private_identity',
  'legal_restricted',
] as const

export type PassportVisibility = (typeof PASSPORT_VISIBILITIES)[number]

export const PASSPORT_SOURCE_KINDS = [
  'manual',
  'profile',
  'collaborator',
  'work',
  'lyric_block',
  'split_sheet',
  'contract',
  'work_version',
  'release_project',
  'track_metadata',
  'registration',
  'import',
  'system',
] as const

export type PassportSourceKind = (typeof PASSPORT_SOURCE_KINDS)[number]

export const PASSPORT_SNAPSHOT_PURPOSES = [
  'confirmation',
  'approval',
  'release',
  'export',
  'registration',
  'delivery',
  'custody_transfer',
  'audit',
] as const

export type PassportSnapshotPurpose = (typeof PASSPORT_SNAPSHOT_PURPOSES)[number]

export const PASSPORT_LEDGER_ACTIONS = [
  'confirm',
  'approve',
  'reject',
  'lock',
  'mark_outdated',
  'dispute',
  'resolve_dispute',
  'revoke_approval',
] as const

export type PassportLedgerAction = (typeof PASSPORT_LEDGER_ACTIONS)[number]

export type PassportFieldValueType =
  | 'text'
  | 'text_list'
  | 'number'
  | 'boolean'
  | 'date'
  | 'identifier'
  | 'people'
  | 'percentage_map'
  | 'object'

export type PassportFieldDefinition = {
  key: string
  label: string
  layer: PassportLayer
  valueType: PassportFieldValueType
  defaultVisibility: PassportVisibility
  deliverySafe: boolean
  allowedSources: readonly PassportSourceKind[]
}

const IDENTITY_SOURCES = ['profile', 'collaborator', 'manual', 'import'] as const
const COMPOSITION_SOURCES = [
  'work',
  'lyric_block',
  'split_sheet',
  'contract',
  'manual',
  'import',
] as const
const VERSION_SOURCES = ['work_version', 'contract', 'manual', 'import', 'system'] as const
const RELEASE_SOURCES = [
  'release_project',
  'track_metadata',
  'contract',
  'registration',
  'manual',
  'import',
] as const

export const PASSPORT_FIELD_DEFINITIONS = [
  // Contributor identity
  field('professional_name', 'Professional name', 'contributor', 'text', 'delivery_safe', true, IDENTITY_SOURCES),
  field('legal_name', 'Legal name', 'contributor', 'text', 'private_identity', false, IDENTITY_SOURCES),
  field('songwriter_roles', 'Songwriter roles', 'contributor', 'text_list', 'delivery_safe', true, IDENTITY_SOURCES),
  field('performer_roles', 'Performer roles', 'contributor', 'text_list', 'delivery_safe', true, IDENTITY_SOURCES),
  field('pro_affiliation', 'PRO affiliation', 'contributor', 'text', 'collaborators', false, IDENTITY_SOURCES),
  field('ipi_cae', 'IPI/CAE', 'contributor', 'identifier', 'collaborators', false, IDENTITY_SOURCES),
  field('ipn', 'IPN', 'contributor', 'identifier', 'collaborators', false, IDENTITY_SOURCES),
  field('isni', 'ISNI', 'contributor', 'identifier', 'collaborators', false, IDENTITY_SOURCES),
  field('publisher_name', 'Publisher', 'contributor', 'text', 'delivery_safe', true, IDENTITY_SOURCES),
  field('professional_contact', 'Professional contact', 'contributor', 'object', 'private_identity', false, IDENTITY_SOURCES),

  // Composition
  field('composition_title', 'Song title', 'composition', 'text', 'delivery_safe', true, COMPOSITION_SOURCES),
  field('alternate_titles', 'Alternate titles', 'composition', 'text_list', 'collaborators', false, COMPOSITION_SOURCES),
  field('writers', 'Writers', 'composition', 'people', 'delivery_safe', true, COMPOSITION_SOURCES),
  field('publishing_shares', 'Publishing shares', 'composition', 'percentage_map', 'legal_restricted', false, COMPOSITION_SOURCES),
  field('lyrics', 'Lyrics', 'composition', 'text', 'delivery_safe', true, COMPOSITION_SOURCES),
  field('lyrics_language', 'Lyrics language', 'composition', 'text', 'delivery_safe', true, COMPOSITION_SOURCES),
  field('iswc', 'ISWC', 'composition', 'identifier', 'delivery_safe', true, COMPOSITION_SOURCES),
  field('composition_publishers', 'Composition publishers', 'composition', 'people', 'delivery_safe', true, COMPOSITION_SOURCES),
  field('copyright_provenance', 'Copyright and authorship provenance', 'composition', 'object', 'legal_restricted', false, COMPOSITION_SOURCES),
  field('ai_contributions', 'AI contribution history', 'composition', 'object', 'collaborators', false, COMPOSITION_SOURCES),

  // Recording version
  field('version_label', 'Version label', 'recording_version', 'text', 'delivery_safe', true, VERSION_SOURCES),
  field('performers', 'Performers', 'recording_version', 'people', 'delivery_safe', true, VERSION_SOURCES),
  field('producers', 'Producers', 'recording_version', 'people', 'delivery_safe', true, VERSION_SOURCES),
  field('engineers', 'Engineers', 'recording_version', 'people', 'delivery_safe', true, VERSION_SOURCES),
  field('recording_date', 'Recording date', 'recording_version', 'date', 'collaborators', false, VERSION_SOURCES),
  field('recording_country', 'Recording country', 'recording_version', 'text', 'collaborators', false, VERSION_SOURCES),
  field('duration_seconds', 'Duration', 'recording_version', 'number', 'delivery_safe', true, VERSION_SOURCES),
  field('vocal_type', 'Vocal or instrumental', 'recording_version', 'text', 'delivery_safe', true, VERSION_SOURCES),
  field('bpm', 'BPM', 'recording_version', 'number', 'delivery_safe', true, VERSION_SOURCES),
  field('musical_key', 'Musical key', 'recording_version', 'text', 'delivery_safe', true, VERSION_SOURCES),
  field('master_designation', 'Master designation', 'recording_version', 'text', 'collaborators', false, VERSION_SOURCES),
  field('recording_owner', 'Recording/master ownership', 'recording_version', 'object', 'legal_restricted', false, VERSION_SOURCES),
  field('ai_performed_elements', 'AI-performed elements', 'recording_version', 'object', 'collaborators', false, VERSION_SOURCES),
  field('source_asset_sha256', 'Source asset SHA-256', 'recording_version', 'identifier', 'legal_restricted', false, VERSION_SOURCES),

  // Release
  field('release_title', 'Release title', 'release', 'text', 'delivery_safe', true, RELEASE_SOURCES),
  field('primary_artist', 'Primary artist', 'release', 'people', 'delivery_safe', true, RELEASE_SOURCES),
  field('featured_artists', 'Featured artists', 'release', 'people', 'delivery_safe', true, RELEASE_SOURCES),
  field('isrc', 'ISRC', 'release', 'identifier', 'delivery_safe', true, RELEASE_SOURCES),
  field('upc', 'UPC', 'release', 'identifier', 'delivery_safe', true, RELEASE_SOURCES),
  field('release_date', 'Release date', 'release', 'date', 'delivery_safe', true, RELEASE_SOURCES),
  field('label_name', 'Label', 'release', 'text', 'delivery_safe', true, RELEASE_SOURCES),
  field('catalog_number', 'Catalogue number', 'release', 'identifier', 'delivery_safe', true, RELEASE_SOURCES),
  field('track_number', 'Track number', 'release', 'number', 'delivery_safe', true, RELEASE_SOURCES),
  field('p_line', 'P-line', 'release', 'text', 'delivery_safe', true, RELEASE_SOURCES),
  field('c_line', 'C-line', 'release', 'text', 'delivery_safe', true, RELEASE_SOURCES),
  field('distributor', 'Distributor', 'release', 'text', 'collaborators', false, RELEASE_SOURCES),
  field('territories', 'Release territories', 'release', 'text_list', 'legal_restricted', false, RELEASE_SOURCES),
] as const satisfies readonly PassportFieldDefinition[]

export type PassportFieldKey = (typeof PASSPORT_FIELD_DEFINITIONS)[number]['key']

const FIELD_BY_KEY = new Map<string, PassportFieldDefinition>(
  PASSPORT_FIELD_DEFINITIONS.map(definition => [definition.key, definition])
)

export function isPassportFieldKey(value: string): value is PassportFieldKey {
  return FIELD_BY_KEY.has(value)
}

export function passportFieldDefinition(key: string): PassportFieldDefinition | undefined {
  return FIELD_BY_KEY.get(key)
}

export function canEmbedPassportField(key: string): boolean {
  const definition = passportFieldDefinition(key)
  return definition?.deliverySafe === true && definition.defaultVisibility === 'delivery_safe'
}

export type PassportTarget =
  | { layer: 'composition' }
  | { layer: 'contributor'; userId?: string; collaboratorId?: string }
  | { layer: 'recording_version'; workVersionId: string }
  | { layer: 'release'; vaultProjectId: string; trackId?: string }

export function passportTargetKey(target: PassportTarget): string {
  if (target.layer === 'composition') return 'work'

  if (target.layer === 'contributor') {
    const userId = target.userId?.trim()
    const collaboratorId = target.collaboratorId?.trim()
    if (Boolean(userId) === Boolean(collaboratorId)) {
      throw new Error('Contributor Passport fields require exactly one user or collaborator target')
    }
    return userId ? `user:${userId}` : `collaborator:${collaboratorId}`
  }

  if (target.layer === 'recording_version') {
    const versionId = target.workVersionId.trim()
    if (!versionId) throw new Error('Recording-version Passport fields require a version target')
    return `version:${versionId}`
  }

  const projectId = target.vaultProjectId.trim()
  if (!projectId) throw new Error('Release Passport fields require a project target')
  const trackId = target.trackId?.trim()
  return trackId ? `track:${trackId}` : `project:${projectId}`
}

function field<
  const Key extends string,
  const Layer extends PassportLayer,
  const ValueType extends PassportFieldValueType,
  const Visibility extends PassportVisibility,
>(
  key: Key,
  label: string,
  layer: Layer,
  valueType: ValueType,
  defaultVisibility: Visibility,
  deliverySafe: boolean,
  allowedSources: readonly PassportSourceKind[]
) {
  return {
    key,
    label,
    layer,
    valueType,
    defaultVisibility,
    deliverySafe,
    allowedSources,
  } as const
}
