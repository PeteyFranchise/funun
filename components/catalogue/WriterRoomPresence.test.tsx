import { renderToStaticMarkup } from 'react-dom/server'
import { WriterRoomPresence } from './WriterRoomPresence'

describe('WriterRoomPresence', () => {
  it('shows the viewer immediately with privacy-safe creative context', () => {
    const viewer = { userId: 'peter', name: 'Peter Zora', avatarUrl: null, isViewer: true }
    const markup = renderToStaticMarkup(
      <WriterRoomPresence
        workId="00000000-0000-4000-8000-000000000001"
        viewer={viewer}
        people={[viewer]}
        activity={{ kind: 'editing_lyrics', label: 'Verse 1', updatedAt: '2026-09-01T00:00:00Z' }}
      />
    )

    expect(markup).toContain("Writer&#x27;s Room presence")
    expect(markup).toContain("In the Writer&#x27;s Room")
    expect(markup).toContain('Peter Zora (you)')
    expect(markup).toContain('Editing Verse 1')
    expect(markup).toContain('no keystrokes or productivity tracking')
    expect(markup).not.toContain('00000000-0000-4000-8000-000000000001')
  })
})
