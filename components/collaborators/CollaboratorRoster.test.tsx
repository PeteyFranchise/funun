import { readFileSync } from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { CollaboratorRoster } from './CollaboratorRoster'

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
