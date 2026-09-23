import {
  ambiguousCollaboratorIds,
  collaboratorDisplayName,
  collaboratorEditActionLabel,
  collaboratorInitials,
  collaboratorSearchText,
  formatMemberHandle,
  matchesCollaboratorSearch,
  normalizeIdentityText,
  memberProfileHref,
  readIdentityHints,
  visibleHandle,
} from './display-identity'

// Minimal roster rows — only the identity-bearing columns matter here.
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    name: 'Eric',
    archived_at: null,
    ...overrides,
  } as never
}

describe('collaborator display identity — primary label and initials', () => {
  it('derives ES from a structured first/last name and ER from a legacy single name', () => {
    expect(collaboratorInitials(row({ first_name: 'Eric', last_name: 'Smith' }))).toBe('ES')
    expect(collaboratorInitials(row({ name: 'Eric' }))).toBe('ER')
  })

  it('assembles the owner-entered structured name, suffix included', () => {
    expect(
      collaboratorDisplayName(
        row({ first_name: 'Eric', middle_name: 'T', last_name: 'Smith', name_suffix: 'Jr.' })
      )
    ).toBe('Eric T Smith, Jr.')
  })

  it('falls back to the legacy name column when no structured parts exist', () => {
    expect(collaboratorDisplayName(row({ name: '  Eric  ' }))).toBe('Eric')
  })
})

describe('collaborator display identity — handle formatting', () => {
  it('renders exactly one leading @ no matter how the handle is stored', () => {
    expect(formatMemberHandle('ericsmith')).toBe('@ericsmith')
    expect(formatMemberHandle('@ericsmith')).toBe('@ericsmith')
    expect(formatMemberHandle('@@ericsmith')).toBe('@ericsmith')
    expect(formatMemberHandle('  @ericsmith  ')).toBe('@ericsmith')
  })

  it('renders nothing for an absent or empty handle', () => {
    expect(formatMemberHandle(null)).toBeNull()
    expect(formatMemberHandle('  ')).toBeNull()
    expect(formatMemberHandle('@')).toBeNull()
  })

  it('refuses a handle that does not match the stored grammar, so it can never become a path', () => {
    // Migration 134: ^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$, length 3-30.
    expect(visibleHandle({ handle: '../../admin' })).toBeNull()
    expect(visibleHandle({ handle: 'eric smith' })).toBeNull()
    expect(visibleHandle({ handle: 'er' })).toBeNull()
    expect(visibleHandle({ handle: 'e'.repeat(31) })).toBeNull()
    expect(visibleHandle({ handle: 'eric_smith-2' })).toBe('eric_smith-2')
    expect(memberProfileHref({ handle: 'ericsmith' })).toBe('/u/ericsmith')
    expect(memberProfileHref({ handle: null })).toBeNull()
    expect(memberProfileHref(null)).toBeNull()
  })
})

describe('collaborator display identity — search', () => {
  const eric = row({ id: 'row-1', first_name: 'Eric', last_name: 'Smith', name: 'Eric Smith' })
  const hint = { handle: 'ericsmith' }

  it('finds the member by last name, by bare handle, and by @handle', () => {
    expect(matchesCollaboratorSearch(eric, hint, 'smith')).toBe(true)
    expect(matchesCollaboratorSearch(eric, hint, 'ericsmith')).toBe(true)
    expect(matchesCollaboratorSearch(eric, hint, '@ericsmith')).toBe(true)
    expect(matchesCollaboratorSearch(eric, hint, 'ERIC')).toBe(true)
    expect(matchesCollaboratorSearch(eric, hint, '')).toBe(true)
  })

  it('does not match a handle the viewer may not see', () => {
    expect(matchesCollaboratorSearch(eric, null, 'ericsmith')).toBe(false)
    expect(matchesCollaboratorSearch(eric, { handle: null }, '@ericsmith')).toBe(false)
  })

  it('never indexes private fields, so the picker cannot be used as a lookup oracle', () => {
    const withPrivate = row({
      first_name: 'Eric',
      last_name: 'Smith',
      email: 'eric@private.example',
      phone: '+15555550123',
      ipi: '00123456789',
      legal_name: 'Erical Smithson',
      mlc_id: 'MLC-9',
      claimed_by: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    })
    const text = collaboratorSearchText(withPrivate, hint)
    for (const secret of ['private.example', '5555550123', '00123456789', 'smithson', 'mlc-9', 'ffffffff']) {
      expect(text).not.toContain(secret)
    }
  })
})

describe('collaborator display identity — collision detection', () => {
  it('normalizes case, whitespace and compatibility forms before comparing', () => {
    expect(normalizeIdentityText('  Eric   SMITH ')).toBe('eric smith')
    expect(normalizeIdentityText('Eric Smith')).toBe('eric smith')
  })

  it('flags two active rows whose names differ only by case or spacing', () => {
    const ids = ambiguousCollaboratorIds([
      row({ id: 'a', name: 'Eric' }),
      row({ id: 'b', name: '  eric ' }),
      row({ id: 'c', name: 'Maya' }),
    ])
    expect(ids).toEqual(new Set(['a', 'b']))
  })

  it('does not flag rows a visible handle already tells apart', () => {
    const ids = ambiguousCollaboratorIds(
      [row({ id: 'a', name: 'Eric' }), row({ id: 'b', name: 'Eric' })],
      { a: { handle: 'ericsmith' } }
    )
    expect(ids).toEqual(new Set())
  })

  it('ignores archived rows — they are not on the roster the owner is scanning', () => {
    const ids = ambiguousCollaboratorIds([
      row({ id: 'a', name: 'Eric' }),
      row({ id: 'b', name: 'Eric', archived_at: '2026-01-01T00:00:00Z' }),
    ])
    expect(ids).toEqual(new Set())
  })

  it('asks for the missing piece, or sends an already-complete row to the form', () => {
    expect(collaboratorEditActionLabel(row({ last_name: null }))).toBe('Add last name')
    expect(collaboratorEditActionLabel(row({ last_name: '  ' }))).toBe('Add last name')
    expect(collaboratorEditActionLabel(row({ last_name: 'Smith' }))).toBe('Edit details')
  })
})

describe('collaborator display identity — API hint parsing', () => {
  it('keeps well-formed handles and drops everything else', () => {
    expect(
      readIdentityHints({
        'row-1': { handle: 'ericsmith' },
        'row-2': { handle: null },
        'row-3': { handle: 'not a handle' },
        'row-4': 'ericsmith',
        'row-5': { handle: 42 },
      })
    ).toEqual({ 'row-1': { handle: 'ericsmith' } })
  })

  it('returns no hints for a missing or non-object payload', () => {
    expect(readIdentityHints(undefined)).toEqual({})
    expect(readIdentityHints(null)).toEqual({})
    expect(readIdentityHints([{ handle: 'ericsmith' }])).toEqual({})
  })
})
