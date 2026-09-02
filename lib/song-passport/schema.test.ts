import {
  PASSPORT_FIELD_DEFINITIONS,
  PASSPORT_LAYERS,
  PASSPORT_SOURCE_KINDS,
  PASSPORT_VALUE_STATES,
  PASSPORT_VISIBILITIES,
  canEmbedPassportField,
  isPassportFieldKey,
  passportFieldDefinition,
  passportTargetKey,
} from '@/lib/song-passport/schema'

describe('Song Passport schema vocabulary', () => {
  it('locks the approved layers, states, visibility classes and source families', () => {
    expect(PASSPORT_LAYERS).toEqual(['contributor', 'composition', 'recording_version', 'release'])
    expect(PASSPORT_VALUE_STATES).toEqual([
      'inherited',
      'draft',
      'confirmed',
      'locked',
      'outdated',
      'disputed',
    ])
    expect(PASSPORT_VISIBILITIES).toEqual([
      'public',
      'collaborators',
      'delivery_safe',
      'private_identity',
      'legal_restricted',
    ])
    expect(PASSPORT_SOURCE_KINDS).toContain('split_sheet')
    expect(PASSPORT_SOURCE_KINDS).toContain('contract')
    expect(PASSPORT_SOURCE_KINDS).toContain('track_metadata')
  })

  it('defines unique stable keys with valid database-safe names', () => {
    const keys = PASSPORT_FIELD_DEFINITIONS.map(field => field.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
  })

  it('covers the four source-of-truth layers and required anchor fields', () => {
    for (const layer of PASSPORT_LAYERS) {
      expect(PASSPORT_FIELD_DEFINITIONS.some(field => field.layer === layer)).toBe(true)
    }
    expect(passportFieldDefinition('professional_name')?.layer).toBe('contributor')
    expect(passportFieldDefinition('composition_title')?.layer).toBe('composition')
    expect(passportFieldDefinition('version_label')?.layer).toBe('recording_version')
    expect(passportFieldDefinition('isrc')?.layer).toBe('release')
  })

  it('never marks private identity or legal fields as delivery safe', () => {
    for (const field of PASSPORT_FIELD_DEFINITIONS) {
      if (field.defaultVisibility === 'private_identity' || field.defaultVisibility === 'legal_restricted') {
        expect(field.deliverySafe).toBe(false)
        expect(canEmbedPassportField(field.key)).toBe(false)
      }
    }
  })

  it('requires delivery-safe embedding to be explicit', () => {
    expect(canEmbedPassportField('composition_title')).toBe(true)
    expect(canEmbedPassportField('professional_contact')).toBe(false)
    expect(canEmbedPassportField('publishing_shares')).toBe(false)
    expect(canEmbedPassportField('not_a_field')).toBe(false)
  })

  it('builds stable target keys only from layer-correct typed targets', () => {
    expect(passportTargetKey({ layer: 'composition' })).toBe('work')
    expect(passportTargetKey({ layer: 'contributor', userId: 'user-1' })).toBe('user:user-1')
    expect(passportTargetKey({ layer: 'contributor', collaboratorId: 'collab-1' })).toBe('collaborator:collab-1')
    expect(passportTargetKey({ layer: 'recording_version', workVersionId: 'version-1' })).toBe('version:version-1')
    expect(passportTargetKey({ layer: 'release', vaultProjectId: 'project-1' })).toBe('project:project-1')
    expect(
      passportTargetKey({ layer: 'release', vaultProjectId: 'project-1', trackId: 'track-1' })
    ).toBe('track:track-1')
  })

  it('rejects ambiguous or missing typed targets', () => {
    expect(() => passportTargetKey({ layer: 'contributor' })).toThrow('exactly one')
    expect(() =>
      passportTargetKey({ layer: 'contributor', userId: 'user-1', collaboratorId: 'collab-1' })
    ).toThrow('exactly one')
    expect(() => passportTargetKey({ layer: 'recording_version', workVersionId: '' })).toThrow('version')
    expect(() => passportTargetKey({ layer: 'release', vaultProjectId: '', trackId: 'track-1' })).toThrow('project')
  })

  it('recognizes only registered field keys', () => {
    expect(isPassportFieldKey('composition_title')).toBe(true)
    expect(isPassportFieldKey('not_a_field')).toBe(false)
  })
})
