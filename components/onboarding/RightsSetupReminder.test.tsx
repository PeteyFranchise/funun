import { renderToStaticMarkup } from 'react-dom/server'
import { RightsSetupReminder } from './RightsSetupReminder'

describe('RightsSetupReminder', () => {
  it('keeps the reminder supportive and links back to Settings', () => {
    const markup = renderToStaticMarkup(<RightsSetupReminder remainingCount={2} />)

    expect(markup).toContain('Pick up your rights setup')
    expect(markup).toContain('2 profile details')
    expect(markup).toContain('Nothing here blocks songwriting')
    expect(markup).toContain('href="/settings"')
    expect(markup).not.toContain('readiness score')
  })

  it('uses singular copy for one remaining detail', () => {
    const markup = renderToStaticMarkup(<RightsSetupReminder remainingCount={1} />)

    expect(markup).toContain('1 profile detail')
    expect(markup).not.toContain('1 profile details')
  })
})
