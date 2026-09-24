import {
  ambiguousCollaboratorIds,
  collaboratorDisplayName,
  collaboratorEditActionLabel,
  collaboratorInitials,
  collaboratorSearchText,
  formatMemberHandle,
  isMemberVisible,
  matchesCollaboratorSearch,
  memberAffordances,
  normalizeIdentityText,
  memberProfileHref,
  readIdentityHints,
  visibleHandle,
} from './display-identity'

// A hint always carries BOTH signals. `memberVisible` defaults to true here
// because that is the resolver's answer for every unblocked member, hidden or
// not: only a block sets it false.
function hintFor(handle: string | null, memberVisible = true) {
  return { handle, memberVisible }
}

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
    expect(memberProfileHref(hintFor('ericsmith'))).toBe('/u/ericsmith')
    expect(memberProfileHref(hintFor(null))).toBeNull()
    expect(memberProfileHref(null)).toBeNull()
  })

  it('renders no handle at all once memberVisible is false, however well-formed it is', () => {
    // One gate, at the point every surface reads the handle: the label's text,
    // the profile href, the picker's search index and the ambiguity predicate
    // all route through visibleHandle, and a gate repeated four times is a
    // gate that gets forgotten once.
    expect(visibleHandle(hintFor('ericsmith', false))).toBeNull()
    expect(memberProfileHref(hintFor('ericsmith', false))).toBeNull()
    expect(collaboratorSearchText(row({ first_name: 'Eric' }), hintFor('ericsmith', false)))
      .not.toContain('ericsmith')
    expect(matchesCollaboratorSearch(row({ first_name: 'Eric' }), hintFor('ericsmith', false), 'ericsmith'))
      .toBe(false)
  })

  it('still reads a raw profile row, which carries no memberVisible key', () => {
    // The resolver calls visibleHandle on a bare `{ handle }` off user_profiles
    // AFTER it has already applied the block predicate, so an absent key must
    // not read as a refusal.
    expect(visibleHandle({ handle: 'ericsmith' })).toBe('ericsmith')
  })
})

describe('collaborator display identity — search', () => {
  const eric = row({ id: 'row-1', first_name: 'Eric', last_name: 'Smith', name: 'Eric Smith' })
  const hint = hintFor('ericsmith')

  it('finds the member by last name, by bare handle, and by @handle', () => {
    expect(matchesCollaboratorSearch(eric, hint, 'smith')).toBe(true)
    expect(matchesCollaboratorSearch(eric, hint, 'ericsmith')).toBe(true)
    expect(matchesCollaboratorSearch(eric, hint, '@ericsmith')).toBe(true)
    expect(matchesCollaboratorSearch(eric, hint, 'ERIC')).toBe(true)
    expect(matchesCollaboratorSearch(eric, hint, '')).toBe(true)
  })

  it('does not match a handle the viewer may not see', () => {
    expect(matchesCollaboratorSearch(eric, null, 'ericsmith')).toBe(false)
    expect(matchesCollaboratorSearch(eric, hintFor(null), '@ericsmith')).toBe(false)
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
      { a: hintFor('ericsmith') }
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
        'row-1': { handle: 'ericsmith', memberVisible: true },
        'row-2': { handle: null, memberVisible: true },
        'row-3': { handle: 'not a handle', memberVisible: true },
        'row-4': 'ericsmith',
        'row-5': { handle: 42, memberVisible: true },
      })
    ).toEqual({ 'row-1': { handle: 'ericsmith', memberVisible: true } })
  })

  it('keeps a suppression-only entry, which carries no handle at all', () => {
    // Dropping it would fall back to "no hint", and no hint reads as visible —
    // so the blocked member's badge and Message link would come back in every
    // picker that parses this payload.
    expect(readIdentityHints({ 'row-1': { handle: null, memberVisible: false } })).toEqual({
      'row-1': { handle: null, memberVisible: false },
    })
  })

  it('treats an absent memberVisible key as visible, because an absent ROW already is', () => {
    expect(readIdentityHints({ 'row-1': { handle: 'ericsmith' } })).toEqual({
      'row-1': { handle: 'ericsmith', memberVisible: true },
    })
  })

  it('returns no hints for a missing or non-object payload', () => {
    expect(readIdentityHints(undefined)).toEqual({})
    expect(readIdentityHints(null)).toEqual({})
    expect(readIdentityHints([{ handle: 'ericsmith' }])).toEqual({})
  })
})

describe('collaborator display identity — member affordances', () => {
  const claimed = row({ claimed_by: 'ffffffff-ffff-ffff-ffff-ffffffffffff' })

  it('offers the profile link and the Message link to an unblocked member', () => {
    expect(memberAffordances(claimed, hintFor('ericsmith'))).toEqual({
      memberVisible: true,
      profileHref: '/u/ericsmith',
      messageHref: '/messages?with=ffffffff-ffff-ffff-ffff-ffffffffffff',
    })
  })

  it('withholds BOTH links when a block exists in either direction', () => {
    expect(memberAffordances(claimed, hintFor('ericsmith', false))).toEqual({
      memberVisible: false,
      profileHref: null,
      messageHref: null,
    })
  })

  it('still offers the Message link to a HIDDEN member — hiding is not blocking (D-01a)', () => {
    // A hidden / connections-only / is_public:false member resolves NO handle,
    // so there is no profile link — but they are still a member this owner may
    // message, and whether their membership may be disclosed is Phase 41's
    // D-01a, an open owner decision this predicate must not settle.
    expect(memberAffordances(claimed, hintFor(null))).toEqual({
      memberVisible: true,
      profileHref: null,
      messageHref: '/messages?with=ffffffff-ffff-ffff-ffff-ffffffffffff',
    })
  })

  it('has no Message link for an unclaimed row, and none once claimed_by is stripped', () => {
    expect(memberAffordances(row({ claimed_by: null }), null).messageHref).toBeNull()
    expect(memberAffordances(row(), hintFor(null, false)).messageHref).toBeNull()
  })

  it('reads an absent hint as visible, because absent means "no member to suppress"', () => {
    expect(isMemberVisible(null)).toBe(true)
    expect(isMemberVisible(undefined)).toBe(true)
    expect(isMemberVisible(hintFor(null))).toBe(true)
    expect(isMemberVisible(hintFor(null, false))).toBe(false)
  })
})
