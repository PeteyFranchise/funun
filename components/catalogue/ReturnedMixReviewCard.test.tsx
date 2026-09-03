import { renderToStaticMarkup } from 'react-dom/server'
import { ReturnedMixReviewCard, type ReturnedMixReviewItem } from './ReturnedMixReviewCard'

const returned: ReturnedMixReviewItem = {
  returnId: 'return-1',
  versionId: 'version-5',
  versionDisplay: 'v5',
  versionLabel: 'Producer mix — drums up',
  producerName: 'Marcus Lee',
  note: 'Opened the hook and brought the drums forward.',
  returnedAt: '2026-09-03T12:00:00Z',
  isWorking: false,
}

describe('ReturnedMixReviewCard', () => {
  it('presents every decision as optional and keeps creative actions visible', () => {
    const markup = renderToStaticMarkup(
      <ReturnedMixReviewCard
        items={[returned]}
        canCompare
        hasWorkingTake
        onCompare={() => undefined}
        onReview={async () => ({ ok: true })}
      />
    )
    expect(markup).toContain('Producer return · v5')
    expect(markup).toContain('Compare with working take')
    expect(markup).toContain('Make this the working take')
    expect(markup).toContain('Keep current working take')
    expect(markup).toContain('Later')
    expect(markup).toContain('never blocks writing, recording, comments, or another upload')
    expect(markup).toContain('not master approval')
  })

  it('stays absent when there is nothing awaiting review', () => {
    expect(renderToStaticMarkup(
      <ReturnedMixReviewCard
        items={[]}
        canCompare={false}
        hasWorkingTake={false}
        onCompare={() => undefined}
        onReview={async () => ({ ok: true })}
      />
    )).toBe('')
  })
})
