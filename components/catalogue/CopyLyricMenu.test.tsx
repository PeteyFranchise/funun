import { renderToStaticMarkup } from 'react-dom/server'
import { CopyLyricMenu } from './CopyLyricMenu'
import type { LyricBlockRecord } from '@/lib/catalogue/blocks'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx.

const blocks: LyricBlockRecord[] = [
  {
    id: 'b1',
    block_type: 'verse',
    custom_label: null,
    position: 0,
    text: 'City lights are burning',
    author_kind: 'human',
    author_user_id: 'u1',
    repeat_of_block_id: null,
  },
  {
    id: 'b2',
    block_type: 'chorus',
    custom_label: null,
    position: 1,
    text: 'Meet me at midnight',
    author_kind: 'human',
    author_user_id: 'u1',
    repeat_of_block_id: null,
  },
]

const KNOWN_VENDOR_NAMES = ['Suno', 'Udio', 'ChatGPT', 'OpenAI', 'Anthropic', 'Claude', 'Google', 'Gemini']

describe('CopyLyricMenu', () => {
  it('offers both flavour options with tool-agnostic labels', () => {
    const markup = renderToStaticMarkup(<CopyLyricMenu blocks={blocks} />)
    expect(markup).toContain('Tagged (with section headings)')
    expect(markup).toContain('Plain (words only)')
    expect(markup).toContain('ready to paste into any tool or document')
  })

  it('contains no vendor name anywhere in the markup', () => {
    const markup = renderToStaticMarkup(<CopyLyricMenu blocks={blocks} />)
    for (const vendor of KNOWN_VENDOR_NAMES) {
      expect(markup).not.toContain(vendor)
    }
  })

  it('does not render the confirmation state on first paint', () => {
    const markup = renderToStaticMarkup(<CopyLyricMenu blocks={blocks} />)
    expect(markup).not.toContain('Copied —')
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(<CopyLyricMenu blocks={blocks} />)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('spends no gradient (this pad reserves bg-grad for nothing on this control)', () => {
    const markup = renderToStaticMarkup(<CopyLyricMenu blocks={blocks} />)
    expect(markup).not.toContain('bg-grad')
  })
})
