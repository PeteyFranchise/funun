import { renderToStaticMarkup } from 'react-dom/server'
import { LyricHistoryPanel } from './LyricHistoryPanel'

const noop = () => {}

describe('LyricHistoryPanel', () => {
  it('explains session-level recovery and previews current and earlier words', () => {
    const markup = renderToStaticMarkup(
      <LyricHistoryPanel
        label="Verse 1"
        currentText="Current city lights"
        snapshots={[
          {
            id: 's1',
            block_id: 'b1',
            reason: 'edit_session_start',
            text: 'Earlier city lights',
            created_at: '2026-09-01T04:00:00.000Z',
            actorName: 'Maya',
          },
        ]}
        loading={false}
        error={null}
        restoringId={null}
        onRestore={noop}
        onClose={noop}
      />
    )

    expect(markup).toContain('Recovery history')
    expect(markup).toContain('Current city lights')
    expect(markup).toContain('Earlier city lights')
    expect(markup).toContain('Saved before Maya edited this section')
    expect(markup).toContain('not for every keystroke')
    expect(markup).toContain('Review restore')
  })

  it('describes an empty history without implying anything was lost', () => {
    const markup = renderToStaticMarkup(
      <LyricHistoryPanel
        label="Chorus"
        currentText="Hook"
        snapshots={[]}
        loading={false}
        error={null}
        restoringId={null}
        onRestore={noop}
        onClose={noop}
      />
    )
    expect(markup).toContain('No earlier version yet')
    expect(markup).toContain('appears after this section is changed and saved')
  })
})
