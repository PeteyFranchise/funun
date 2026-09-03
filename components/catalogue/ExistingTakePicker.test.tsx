import { renderToStaticMarkup } from 'react-dom/server'
import { ExistingTakePicker } from './ExistingTakePicker'

const noop = () => undefined

describe('ExistingTakePicker', () => {
  it('renders playable earlier takes without claiming the timestamp proves authorship', () => {
    const markup = renderToStaticMarkup(
      <ExistingTakePicker
        takes={[
          {
            id: 'v1',
            display: 'v1',
            description: 'Scratch hum',
            playbackUrl: 'https://signed.example/v1.webm',
            durationSeconds: 24,
            createdAt: '2026-09-01T10:00:00.000Z',
            isAiTagged: false,
          },
        ]}
        onSelect={noop}
        onBack={noop}
        initialSelectedId="v1"
      />
    )

    expect(markup).toContain('Attach an earlier take')
    expect(markup).toContain('v1 · Scratch hum')
    expect(markup).toContain('<audio')
    expect(markup).toContain('you confirm what the recording represents')
    expect(markup).toContain('Attach this take')
  })

  it('renders an honest empty state without an attach action', () => {
    const markup = renderToStaticMarkup(
      <ExistingTakePicker takes={[]} onSelect={noop} onBack={noop} />
    )

    expect(markup).toContain('No eligible earlier takes')
    expect(markup).not.toContain('Attach this take')
  })
})
