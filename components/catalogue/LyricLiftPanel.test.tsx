import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LyricLiftPanel } from '@/components/catalogue/LyricLiftPanel'
import { LYRIC_LIFT_NO_VOCALS_MESSAGE } from '@/lib/catalogue/lyric-lift'

describe('LyricLiftPanel no-vocals outcome', () => {
  it('shows a neutral instrumental result without offering a paid retry', () => {
    const markup = renderToStaticMarkup(
      <LyricLiftPanel
        workId="work-1"
        lift={{
          id: 'lift-1',
          workId: 'work-1',
          versionId: 'version-1',
          status: 'failed',
          language: null,
          errorMessage: LYRIC_LIFT_NO_VOCALS_MESSAGE,
          createdAt: '2026-09-04T00:00:00.000Z',
          completedAt: null,
          appliedAt: null,
          sections: [],
        }}
        sourceVersion={{ display: 'v1', description: 'uploaded audio', playbackUrl: null }}
        hasExistingLyrics={false}
        onChange={() => undefined}
        onApplied={() => undefined}
        onDiscarded={() => undefined}
      />
    )

    expect(markup).toContain(LYRIC_LIFT_NO_VOCALS_MESSAGE)
    expect(markup).toContain('Your recording is still safe')
    expect(markup).toContain('>No vocals<')
    expect(markup).toContain('>Dismiss<')
    expect(markup).not.toContain('>Try again<')
    expect(markup).not.toContain('border-red-400')
  })
})
