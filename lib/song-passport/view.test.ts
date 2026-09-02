import { buildSongPassportView, type PassportCurrentValueRow } from '@/lib/song-passport/view'

const value = (overrides: Partial<PassportCurrentValueRow>): PassportCurrentValueRow => ({
  id: 'value-1', layer: 'composition', field_key: 'composition_title', target_key: 'work',
  subject_user_id: null, collaborator_id: null, work_version_id: null, vault_project_id: null,
  track_id: null, value_jsonb: 'Song', state: 'inherited', visibility: 'collaborators',
  source_kind: 'work', source_record_id: 'work-1', created_at: '2026-09-01T00:00:00Z', ...overrides,
})

function view(values: PassportCurrentValueRow[], permissions: any[] = []) {
  return buildSongPassportView({
    passport: { id: 'passport-1', work_id: 'work-1', lifecycle_state: 'active' },
    values, issues: [], tasks: [], snapshots: [], viewerUserId: 'viewer-1', viewerIsMember: true,
    permissions, collaboratorClaims: { 'collab-1': 'viewer-1' },
  })
}

describe('Song Passport privacy-scoped view', () => {
  it('shows a person their own private identity but hides another person’s', () => {
    const result = view([
      value({ id: 'own', layer: 'contributor', field_key: 'legal_name', target_key: 'collaborator:collab-1', collaborator_id: 'collab-1', visibility: 'private_identity' }),
      value({ id: 'other', layer: 'contributor', field_key: 'legal_name', target_key: 'user:other', subject_user_id: 'other', visibility: 'private_identity' }),
    ])
    expect(result.fields.map(field => field.id)).toEqual(['own'])
    expect(result.fields[0]?.canConfirm).toBe(true)
  })

  it('requires an explicit legal grant', () => {
    const legal = value({ field_key: 'publishing_shares', visibility: 'legal_restricted' })
    expect(view([legal]).fields).toHaveLength(0)
    expect(view([legal], ['view_legal']).fields).toHaveLength(1)
  })

  it('does not count tasks as trusted facts', () => {
    const result = view([value({ state: 'confirmed' }), value({ id: 'draft', state: 'draft' })])
    expect(result.trustedFacts).toBe(1)
    expect(result.visibleFacts).toBe(2)
  })
})
