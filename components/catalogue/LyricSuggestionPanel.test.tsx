import { renderToStaticMarkup } from 'react-dom/server'
import { LyricSuggestionPanel } from './LyricSuggestionPanel'
import type { LyricBlockSuggestionView } from '@/types/catalogue'

const suggestion: LyricBlockSuggestionView = {
  id: 'suggestion-1', blockId: 'block-1', baseText: 'We drove all night',
  proposedText: 'We chased the light', note: '@maya try this cadence',
  author: { userId: 'writer-1', name: 'Ben', handle: 'ben', avatarUrl: null },
  mentioned: [], status: 'pending', decidedByName: null, decidedAt: null,
  createdAt: '2026-09-03T12:00:00Z', canAccept: true, canDecline: true, isStale: false,
}

describe('LyricSuggestionPanel', () => {
  it('compares current and proposed lyrics without presenting them as rights facts', () => {
    const markup = renderToStaticMarkup(
      <LyricSuggestionPanel
        label="Verse 1"
        currentText="We drove all night"
        suggestions={[suggestion]}
        participants={[]}
        loading={false}
        saving={false}
        error={null}
        onCreate={async () => true}
        onDecision={async () => true}
        onClose={() => undefined}
      />
    )
    expect(markup).toContain('Current lyric')
    expect(markup).toContain('Ben&#x27;s alternate')
    expect(markup).toContain('Use this for Verse 1')
    expect(markup).toContain('not a split, ownership decision, rights approval, or legal credit')
  })

  it('warns and disables acceptance when the canonical lyric changed', () => {
    const markup = renderToStaticMarkup(
      <LyricSuggestionPanel
        label="Verse 1"
        currentText="Changed since then"
        suggestions={[{ ...suggestion, isStale: true }]}
        participants={[]}
        loading={false}
        saving={false}
        error={null}
        onCreate={async () => true}
        onDecision={async () => true}
        onClose={() => undefined}
      />
    )
    expect(markup).toContain('current lyric changed')
    expect(markup).toMatch(/disabled=""[^>]*>Use this for Verse 1/)
  })
})
