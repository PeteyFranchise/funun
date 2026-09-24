import { renderToStaticMarkup } from 'react-dom/server'
import { CollaboratorCard, CollaboratorCardMenu } from './CollaboratorCard'
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

// A hint always carries BOTH signals. `memberVisible` defaults to true: it is
// false ONLY when a block exists in either direction.
function hintFor(handle: string | null, memberVisible = true): CollaboratorIdentityHint {
  return { handle, memberVisible }
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
  hint: CollaboratorIdentityHint | null = hintFor('ericsmith'),
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

  // Reversed 2026-09-24 by owner decision. The handle disambiguates the ROWS;
  // it does not supply the surname a split sheet needs, so it must not silence
  // the ask. The original test asserted the opposite.
  it('still offers remediation on an ambiguous row that already shows a handle', () => {
    const markup = render(
      { name: 'Eric', first_name: 'Eric', last_name: null },
      hintFor('djsoko'),
      { isAmbiguous: true }
    )

    expect(markup).toContain('@djsoko')
    expect(markup).toContain('Add last name')
  })

  it('offers no remediation on a row nothing collides with', () => {
    const markup = render({ claimed_by: null }, null)

    expect(markup).not.toContain('Add last name')
    expect(markup).not.toContain('Edit details')
  })
})

describe('CollaboratorCard card and row variants', () => {
  it('renders the identical identity stack in both layouts', () => {
    const card = render({}, hintFor('ericsmith'), { variant: 'card' })
    const row = render({}, hintFor('ericsmith'), { variant: 'row' })

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


// ─────────────────────────────────────────────────────────────────────────
// Block-aware roster reads.
//
// `claim_collaborators()` stamps `claimed_by` at signup, when no block can
// exist. A block placed afterwards was never applied to the stamped row, and
// there is no write left to gate — only reads. These are the three things the
// card still disclosed after PR #98 withheld the @handle.
//
// The menu is rendered DIRECTLY rather than through the card, because the ⋯
// panel only exists behind `menuOpen` state and Jest here is node-only with no
// jsdom: a `not.toContain('/messages?with=')` assertion against the closed
// card passes whether or not the gate exists, which is a check that verifies
// nothing while printing green.
// ─────────────────────────────────────────────────────────────────────────

function renderMenu(
  overrides: Record<string, unknown> = {},
  hint: CollaboratorIdentityHint | null = hintFor('ericsmith'),
  canResendInvite = false
) {
  return renderToStaticMarkup(
    <CollaboratorCardMenu
      collaborator={collaborator(overrides) as never}
      identityHint={hint}
      canResendInvite={canResendInvite}
      onClose={() => {}}
      onEdit={() => {}}
      onArchive={() => {}}
      onDelete={() => {}}
      onResend={() => {}}
    />
  )
}

describe('CollaboratorCard — a blocked pair', () => {
  const BLOCKED_HINT = hintFor(null, false)

  // `claimed_by` STILL PRESENT. The server strips it (redactHiddenMemberLinks)
  // but these cases deliberately do not, so the only thing that can suppress
  // the affordances is the card's own memberVisible check. Asserting against
  // the already-redacted row would pass with the check deleted.
  it('renders no member badge, no Message link and no profile link', () => {
    const card = render({}, BLOCKED_HINT)
    const menu = renderMenu({}, BLOCKED_HINT)

    expect(card).not.toContain('Funūn member')
    expect(card).not.toContain('/u/')
    expect(menu).not.toContain('/messages?with=')
    expect(menu).not.toContain('>Message<')
    expect(menu).not.toContain('View profile')
    expect(menu).not.toContain('/u/')
    // The account id itself must not reach the markup as a link target.
    expect(menu).not.toContain(MEMBER_ID)
  })

  it('withholds the Message link even when the handle would otherwise be visible', () => {
    // The two signals are separate, and the block one wins: a public member
    // with a perfectly good handle still loses every affordance once blocked.
    const menu = renderMenu({}, hintFor('ericsmith', false))
    const card = render({}, hintFor('ericsmith', false))

    expect(menu).not.toContain('/messages?with=')
    expect(menu).not.toContain('/u/ericsmith')
    expect(card).not.toContain('@ericsmith')
    expect(card).not.toContain('Funūn member')
  })

  it('drops "Start a split sheet" too — its presence is itself a membership tell', () => {
    expect(renderMenu({}, BLOCKED_HINT)).not.toContain('Start a split sheet')
  })

  it("still shows the OWNER'S OWN entry — the row is filtered, not severed", () => {
    const card = render({}, BLOCKED_HINT)

    expect(card).toContain('Eric Smith')
    expect(card).toContain('ASCAP (US)')
    expect(card).toContain('aria-label="More actions for Eric Smith"')
    expect(renderMenu({}, BLOCKED_HINT)).toContain('>Edit<')
  })

  it('reads as an ordinary unclaimed row once the server has stripped claimed_by', () => {
    // What the roster page and GET /api/collaborators actually send. Keeping
    // the Invite button here is deliberate: a lone card with no call to action
    // would be as legible a tell as the badge it replaced, and the invite route
    // refuses this pair with the same generic error any other failure returns.
    const card = render({ claimed_by: null }, BLOCKED_HINT)
    const menu = renderMenu({ claimed_by: null }, BLOCKED_HINT)

    expect(card).toContain('>Invite<')
    expect(card).not.toContain('Funūn member')
    expect(menu).toContain('>Delete<')
    expect(menu).not.toContain('Archive')
    expect(menu).not.toContain('/messages?with=')
  })
})

describe('CollaboratorCard — a HIDDEN member is not a blocked member (Phase 41 D-01a)', () => {
  // The assertion that stops this work settling an open owner decision by
  // accident. A hidden / connections-only / is_public:false member resolves NO
  // handle — PR #98's chain — but they are still a member, and memberVisible
  // stays true. Whether their membership may be disclosed to the roster owner
  // is D-01a. Collapsing the two signals into one would answer it, in the
  // suppressing direction, without anyone deciding to.
  const HIDDEN_HINT = hintFor(null, true)

  it('keeps the member badge and the Message link for a hidden member with no handle', () => {
    const card = render({}, HIDDEN_HINT)
    const menu = renderMenu({}, HIDDEN_HINT)

    expect(card).toContain('Funūn member')
    expect(menu).toContain(`/messages?with=${MEMBER_ID}`)
    expect(menu).toContain('>Message<')
  })

  it('still withholds the handle and the profile link — that chain is unchanged', () => {
    const card = render({}, HIDDEN_HINT)
    const menu = renderMenu({}, HIDDEN_HINT)

    expect(card).not.toContain('@ericsmith')
    expect(card).not.toContain('/u/')
    expect(menu).not.toContain('View profile')
  })

  it('is indistinguishable in membership terms from a fully public member', () => {
    // Both show the member state; only the handle differs. If a future change
    // made a hidden member look like a blocked one, this fails.
    expect(render({}, HIDDEN_HINT)).toContain('Funūn member')
    expect(render({}, hintFor('ericsmith'))).toContain('Funūn member')
  })
})

describe('CollaboratorCard — an unblocked member is untouched', () => {
  it('keeps the badge, the Message link, the profile link and the handle', () => {
    const card = render()
    const menu = renderMenu()

    expect(card).toContain('Funūn member')
    expect(card).toContain('@ericsmith')
    expect(card).toContain('href="/u/ericsmith"')
    expect(menu).toContain('href="/u/ericsmith"')
    expect(menu).toContain('View profile')
    expect(menu).toContain(`/messages?with=${MEMBER_ID}`)
    expect(menu).toContain('Start a split sheet')
  })

  it('keeps the Invite button on a plain unclaimed row, which no hint describes', () => {
    const card = render({ claimed_by: null }, null)

    expect(card).toContain('>Invite<')
    expect(card).not.toContain('Funūn member')
  })
})
