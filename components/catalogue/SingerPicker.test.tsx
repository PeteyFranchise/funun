import { renderToStaticMarkup } from 'react-dom/server'
import { SingerPicker } from './SingerPicker'

const candidates = [
  {
    key: 'user:user-1',
    name: 'Peter Zora',
    source: 'self' as const,
    performer: { kind: 'self' as const, userId: 'user-1', name: 'Peter Zora' },
  },
  {
    key: 'user:user-2',
    name: 'Ben Cooke',
    source: 'room' as const,
    performer: { kind: 'collaborator' as const, userId: 'user-2', name: 'Ben Cooke' },
  },
  {
    key: 'collaborator:collab-3',
    name: 'Maya Reyes',
    source: 'roster' as const,
    performer: { kind: 'collaborator' as const, collaboratorId: 'collab-3', name: 'Maya Reyes' },
  },
]

const noop = async () => undefined

describe('SingerPicker', () => {
  it('offers specific people from self, the room, and My Roster without implying rights', () => {
    const markup = renderToStaticMarkup(
      <SingerPicker
        candidates={candidates}
        currentPerformers={[]}
        currentDirection={null}
        onSavePerformers={noop}
        onSaveDirection={noop}
        onCancel={() => undefined}
      />
    )

    expect(markup).toContain('Peter Zora')
    expect(markup).toContain('Ben Cooke')
    expect(markup).toContain('Maya Reyes')
    expect(markup).toContain('My Roster')
    expect(markup).toContain('no Writer&#x27;s Room access, invitation, ownership, or split')
  })

  it('offers free-form vocal direction separately from performer identity', () => {
    const markup = renderToStaticMarkup(
      <SingerPicker
        candidates={candidates}
        currentPerformers={[]}
        currentDirection="A gospel choir"
        onSavePerformers={noop}
        onSaveDirection={noop}
        onCancel={() => undefined}
        initialMode="direction"
      />
    )

    expect(markup).toContain('A gospel choir')
    expect(markup).toContain('Male rapper')
    expect(markup).toContain('Female vocalist')
    expect(markup).toContain('Creative direction only—not a person, credit, collaborator, or invitation')
  })
})
