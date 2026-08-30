import { renderToStaticMarkup } from 'react-dom/server'
import { ReauthorPrompt } from './ReauthorPrompt'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx.

const VENDOR_NAMES = ['suno', 'udio', 'anthropic', 'claude', 'openai', 'chatgpt', 'gpt']

describe('ReauthorPrompt', () => {
  const noop = () => {}

  function render() {
    return renderToStaticMarkup(
      <ReauthorPrompt entryHeadline="v4 · AI guitar solo (bars 57–64)" onReauthor={noop} onKeepAsIs={noop} />
    )
  }

  it('renders the entry headline it was given', () => {
    expect(render()).toContain('v4 · AI guitar solo (bars 57–64)')
  })

  it('renders the "owned by no one" chip', () => {
    expect(render()).toContain('owned by no one')
  })

  it('renders both actions, re-author as the primary (gradient) action', () => {
    const markup = render()
    expect(markup).toContain('Re-author it')
    expect(markup).toContain('Keep as-is, disclosed')
    // The primary spends the surface's one gradient, and appears before
    // the secondary — the gradient class must precede "Re-author it" in
    // the markup, not "Keep as-is".
    const gradientIndex = markup.indexOf('bg-grad ')
    const reauthorIndex = markup.indexOf('Re-author it')
    const keepAsIsIndex = markup.indexOf('Keep as-is, disclosed')
    expect(gradientIndex).toBeGreaterThan(-1)
    expect(gradientIndex).toBeLessThan(reauthorIndex)
    expect(reauthorIndex).toBeLessThan(keepAsIsIndex)
  })

  it('renders the note-for-note-does-not-count closing line', () => {
    expect(render()).toContain('Note-for-note replay doesn')
    expect(render()).toContain('doesn&#x27;t count')
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
