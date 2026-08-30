import { renderToStaticMarkup } from 'react-dom/server'
import { HumFirstMoment } from './HumFirstMoment'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx. isTypeSupported is
// passed through to HumCaptureButton (task 1's own test seam) so the
// record affordance actually renders here rather than degrading silently.

const VENDOR_NAMES = ['suno', 'udio', 'anthropic', 'claude', 'openai', 'chatgpt', 'gpt']

describe('HumFirstMoment', () => {
  const noop = () => {}

  function render() {
    return renderToStaticMarkup(
      <HumFirstMoment
        workId="w1"
        songTitle="Midnight"
        onCaptured={noop}
        onAttachExisting={noop}
        onSkip={noop}
        isTypeSupported={() => true}
      />
    )
  }

  it('names the song in the small uppercase label', () => {
    expect(render()).toContain('Before the AI sings on Midnight')
  })

  it('renders the verbatim headline', () => {
    expect(render()).toContain('Save and protect your idea by just humming or singing right now')
  })

  it('renders the verbatim rule line, in lavender', () => {
    const markup = render()
    expect(markup).toContain('Hum every melody you want to own, and the song is entirely yours.')
  })

  it('the skip is present and names the risk rather than hiding it', () => {
    expect(render()).toContain('Continue without — I understand the risk')
  })

  it('offers "attach an existing take" as the second path', () => {
    expect(render()).toContain('Attach an existing take')
  })

  it('the read-more control is present, with its content collapsed on first paint', () => {
    const markup = render()
    expect(markup).toContain('Why this protects you')
    // LearnWhy starts closed (useState(false)) — the depth text must not
    // appear in the static markup of a first render.
    expect(markup).not.toContain('timestamped the moment you make it')
  })

  it('mounts the HumCaptureButton record affordance for the actual take', () => {
    expect(render()).toContain('tap to record')
  })

  it('names no AI tool or vendor', () => {
    const lower = render().toLowerCase()
    for (const vendor of VENDOR_NAMES) {
      expect(lower).not.toContain(vendor)
    }
  })

  it('contains no raw hex colour', () => {
    expect(render()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
