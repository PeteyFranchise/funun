import { readFileSync } from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { CollaboratorRoster } from './CollaboratorRoster'
import type { RosterView } from './CollaboratorRoster'

function renderCredits(credits: unknown[]) {
  return renderToStaticMarkup(
    <CollaboratorRoster
      collaborators={[]}
      credits={credits as never}
      initialTab="credits"
    />
  )
}

describe('CollaboratorRoster My Credits', () => {
  it('does not present a claimed identity row without a song relationship as a credit', () => {
    const markup = renderCredits([
      {
        id: 'identity-1',
        name: 'Peter Zora',
        split_sheet_parties: [],
      },
    ])

    expect(markup).toContain('No credits yet')
    expect(markup).not.toContain('Peter Zora')
  })

  it('renders each actual split-sheet relationship as a song credit', () => {
    const markup = renderCredits([
      {
        id: 'identity-1',
        name: 'Peter Zora',
        split_sheet_parties: [
          {
            id: 'party-1',
            role: 'Writer',
            split_percentage: 50,
            split_sheets: {
              song_name: 'Heartburn',
              vault_project_id: 'project-1',
            },
          },
        ],
      },
    ])

    expect(markup).not.toContain('No credits yet')
    expect(markup).toContain('Heartburn')
    expect(markup).toContain('Writer')
    expect(markup).toContain('50%')
    expect(markup).toContain('href="/split-sheets?project=project-1"')
  })

  it('requires a real split-sheet relationship in the server query', () => {
    const page = readFileSync(
      path.join(process.cwd(), 'app/(artist)/collaborators/page.tsx'),
      'utf8'
    )

    expect(page).toContain('split_sheet_parties!inner')
  })
})

// ─── Roster layout toggle (owner addition) ──────────────────────────────
// Both the card grid and the dense list row must render the SAME identity
// stack. A second layout that owned its own name markup would defeat the
// single display contract on day one, so this is asserted directly.

const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const ROSTER_PRIVATE = {
  email: 'eric@private.example',
  phone: '+15555550123',
  legal_name: 'Erical Smithson',
  ipi: '00123456789',
  publisher: 'Backroom Publishing LLC',
  mlc_id: 'MLC-99887',
  soundexchange_id: 'SX-44221',
}

function rosterRow(overrides: Record<string, unknown> = {}) {
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
    ...ROSTER_PRIVATE,
    ...overrides,
  }
}

function renderRoster(rows: unknown[], initialView: RosterView, hints: Record<string, { handle: string | null }> = {}) {
  return renderToStaticMarkup(
    <CollaboratorRoster
      collaborators={rows as never}
      credits={[]}
      initialTab="roster"
      identityHints={hints}
      initialView={initialView}
    />
  )
}

describe('CollaboratorRoster layout toggle', () => {
  const views: RosterView[] = ['cards', 'list']

  it.each(views)('renders the same identity stack in the %s view', view => {
    const markup = renderRoster([rosterRow()], view, { 'row-1': { handle: 'ericsmith' } })

    expect(markup).toContain('Eric Smith')
    expect(markup).toContain('@ericsmith')
    expect(markup).not.toContain('@@ericsmith')
    expect(markup).toContain('href="/u/ericsmith"')
    expect(markup).toContain('aria-label="More actions for Eric Smith"')
  })

  it.each(views)('leaks no private roster field in the %s view', view => {
    const markup = renderRoster([rosterRow()], view, { 'row-1': { handle: 'ericsmith' } })

    for (const secret of Object.values(ROSTER_PRIVATE)) {
      expect(markup).not.toContain(secret)
    }
    expect(markup).not.toContain(`>${MEMBER_ID}<`)
  })

  it.each(views)('shows no handle in the %s view when the resolver cleared none', view => {
    const markup = renderRoster([rosterRow()], view, {})

    expect(markup).toContain('Eric Smith')
    expect(markup).not.toContain('@ericsmith')
    expect(markup).not.toContain('/u/ericsmith')
  })

  it.each(views)('offers the same remediation on two legacy same-name rows in the %s view', view => {
    const markup = renderRoster(
      [
        rosterRow({ id: 'row-1', name: 'Eric', last_name: null, claimed_by: null }),
        rosterRow({ id: 'row-2', name: '  eric ', last_name: null, claimed_by: null }),
      ],
      view
    )

    expect(markup.match(/Add last name/g)).toHaveLength(2)
  })

  it('offers both layouts from one quiet control, defaulting to cards on first paint', () => {
    const markup = renderRoster([rosterRow()], 'cards')

    expect(markup).toContain('aria-label="Roster layout"')
    expect(markup).toContain('>cards<')
    expect(markup).toContain('>list<')
  })
})
