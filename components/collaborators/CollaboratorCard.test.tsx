import { renderToStaticMarkup } from 'react-dom/server'
import { CollaboratorCard } from './CollaboratorCard'
import type { CollaboratorIdentityHint } from '@/lib/collaborators/display-identity'

// Jest here is node-only with no jsdom (jest.config.js), so these assert
// static markup — enough for an identity contract, which is entirely a
// question of what gets rendered.

const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// Every private field the roster row can carry is populated, so a test that
// passes proves the CARD is not the channel through which they reach a page.
const PRIVATE_VALUES = {
  email: 'eric@private.example',
  phone: '+15555550123',
  legal_name: 'Erical Smithson',
  ipi: '00123456789',
  publisher: 'Backroom Publishing LLC',
  administrator: 'Backroom Admin LLC',
  mlc_id: 'MLC-99887',
  soundexchange_id: 'SX-44221',
  mailing_address: { line1: '12 Hidden Lane', city: 'Detroit' },
}

function collaborator(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Eric Smith',
    first_name: 'Eric',
    last_name: 'Smith',
    pro: 'ASCAP',
    claimed_by: MEMBER_ID,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...PRIVATE_VALUES,
    ...overrides,
  } as never
}

function render(
  overrides: Record<string, unknown> = {},
  hint: CollaboratorIdentityHint | null = { handle: 'ericsmith' },
  props: Record<string, unknown> = {}
) {
  return renderToStaticMarkup(
    <CollaboratorCard
      collaborator={collaborator(overrides)}
      onEdit={() => {}}
      identityHint={hint}
      {...props}
    />
  )
}

describe('CollaboratorCard identity stack', () => {
  it('renders the owner-entered name with the safely visible @handle beneath it', () => {
    const markup = render()

    expect(markup).toContain('Eric Smith')
    expect(markup).toContain('@ericsmith')
    expect(markup).not.toContain('@@ericsmith')
    expect(markup).toContain('href="/u/ericsmith"')
    expect(markup).toContain('ES')
  })

  it('names the person in the overflow trigger instead of a generic label', () => {
    expect(render()).toContain('aria-label="More actions for Eric Smith"')
    expect(render()).not.toContain('aria-label="More actions"')
  })

  it('shows no handle and no profile link when the resolver cleared none', () => {
    const markup = render({}, null)

    expect(markup).toContain('Eric Smith')
    expect(markup).not.toContain('@ericsmith')
    expect(markup).not.toContain('/u/')
    // The member state itself is not the identity channel, but it stays.
    expect(markup).toContain('Funūn member')
  })

  it('renders no private field from the roster row', () => {
    const markup = render()

    expect(markup).not.toContain(PRIVATE_VALUES.email)
    expect(markup).not.toContain(PRIVATE_VALUES.phone)
    expect(markup).not.toContain(PRIVATE_VALUES.legal_name)
    expect(markup).not.toContain(PRIVATE_VALUES.ipi)
    expect(markup).not.toContain(PRIVATE_VALUES.publisher)
    expect(markup).not.toContain(PRIVATE_VALUES.administrator)
    expect(markup).not.toContain(PRIVATE_VALUES.mlc_id)
    expect(markup).not.toContain(PRIVATE_VALUES.soundexchange_id)
    expect(markup).not.toContain('Hidden Lane')
    // No internal UUID is ever an identity hint. claimed_by still reaches the
    // ⋯ menu's Message link, which is an ACTION target, not a visible label —
    // so it must not appear in any rendered text node.
    expect(markup).not.toContain(`>${MEMBER_ID}<`)
  })

  it('keeps the PRO line, the IPI nudge and the member state intact', () => {
    expect(render()).toContain('ASCAP (US)')
    expect(render({ ipi: null })).toContain('IPI missing')
    expect(render({ pro: null, ipi: 'x' })).toContain('No PRO on file')
  })
})

describe('CollaboratorCard legacy duplicate remediation', () => {
  it('asks for the missing last name on an ambiguous unclaimed row', () => {
    const markup = render(
      { name: 'Eric', first_name: 'Eric', last_name: null, claimed_by: null },
      null,
      { isAmbiguous: true }
    )

    expect(markup).toContain('Add last name')
    expect(markup).toContain('ER')
  })

  it('sends an ambiguous row that already has a last name to the full form', () => {
    const markup = render(
      { name: 'Eric Smith', claimed_by: null },
      null,
      { isAmbiguous: true }
    )

    expect(markup).toContain('Edit details')
    expect(markup).not.toContain('Add last name')
  })

  it('offers no remediation when a visible handle already disambiguates', () => {
    const markup = render({}, { handle: 'ericsmith' }, { isAmbiguous: true })

    expect(markup).not.toContain('Add last name')
    expect(markup).not.toContain('Edit details')
  })

  it('offers no remediation on a row nothing collides with', () => {
    const markup = render({ claimed_by: null }, null)

    expect(markup).not.toContain('Add last name')
    expect(markup).not.toContain('Edit details')
  })
})

describe('CollaboratorCard card and row variants', () => {
  it('renders the identical identity stack in both layouts', () => {
    const card = render({}, { handle: 'ericsmith' }, { variant: 'card' })
    const row = render({}, { handle: 'ericsmith' }, { variant: 'row' })

    for (const markup of [card, row]) {
      expect(markup).toContain('Eric Smith')
      expect(markup).toContain('@ericsmith')
      expect(markup).toContain('href="/u/ericsmith"')
      expect(markup).toContain('aria-label="More actions for Eric Smith"')
      expect(markup).toContain('ASCAP (US)')
      expect(markup).not.toContain(PRIVATE_VALUES.email)
      expect(markup).not.toContain(PRIVATE_VALUES.ipi)
    }
  })
})
