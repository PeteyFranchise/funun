import { renderToStaticMarkup } from 'react-dom/server'
import { RightsSetupCompanion } from './RightsSetupCompanion'
import { buildRightsSetupState } from '@/lib/profile/rights-setup'

const noop = () => undefined

describe('RightsSetupCompanion', () => {
  it('renders supportive actions for an incomplete profile without blocking language', () => {
    const markup = renderToStaticMarkup(
      <RightsSetupCompanion
        state={buildRightsSetupState({
          legalNameLockedAt: null,
          pro: null,
          ipi: null,
          publisher: null,
        })}
        onJumpTo={noop}
        onMarkUnaffiliated={noop}
        onMarkSelfPublished={noop}
      />
    )

    expect(markup).toContain('Stay on top of the business side')
    expect(markup).toContain('Nothing here blocks songwriting')
    expect(markup).toContain('Not affiliated yet')
    expect(markup).toContain('I’m self-published')
    expect(markup).toContain('Remind me later')
    expect(markup).not.toContain('readiness score')
  })

  it('renders the caught-up state without setup or reminder actions', () => {
    const markup = renderToStaticMarkup(
      <RightsSetupCompanion
        state={buildRightsSetupState({
          legalNameLockedAt: '2026-09-02T12:00:00.000Z',
          pro: 'BMI',
          ipi: '00123456789',
          publisher: 'Example Songs',
        })}
        onJumpTo={noop}
        onMarkUnaffiliated={noop}
        onMarkSelfPublished={noop}
      />
    )

    expect(markup).toContain('You’re caught up')
    expect(markup).toContain('All handled')
    expect(markup).not.toContain('Continue setup')
    expect(markup).not.toContain('Remind me later')
  })
})
