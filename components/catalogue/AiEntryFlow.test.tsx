import { renderToStaticMarkup } from 'react-dom/server'
import { AiEntryFlow } from './AiEntryFlow'
import type { Receipt } from '@/lib/catalogue/ai-entries'
import type { AiEntry } from '@/types/catalogue'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx. There is no real
// fetch here; the receipt state is exercised via `initialResult`, the
// same test-seam pattern as HumCaptureButton's `initialError`.

const VENDOR_NAMES = ['suno', 'udio', 'anthropic', 'claude', 'openai', 'chatgpt', 'gpt']

// No apostrophes in these fixtures on purpose — renderToStaticMarkup HTML-
// escapes them (' becomes &#x27;), which would make a plain toContain()
// check on the raw string fail for reasons unrelated to what this suite
// is actually testing.
const FAKE_RECEIPT: Receipt = {
  citation: 'AI reference vocal — performed a human-written melody, demo only.',
  splitsEffect: 'Splits: unaffected. AI takes zero — on every entry, every time.',
  releaseEffect:
    'Release: only matters if this take reaches the released master — it washes out automatically the moment a human re-records, and needs no disclosure until then.',
  crateConsequence: 'Crate: eligible — built from a human take on file, production not generation, disclosed to the buyer.',
}

const FAKE_AI_ENTRY: AiEntry = {
  id: 'e1',
  work_id: 'w1',
  level: 'version',
  version_id: 'v1',
  block_id: null,
  component: 'vocal',
  mode: 'performance',
  citation: FAKE_RECEIPT.citation,
  human_source_version_id: 'v0',
  created_by: 'u1',
  created_at: new Date().toISOString(),
}

describe('AiEntryFlow — mode routing', () => {
  it('renders the conversational pacing for the account\'s first-ever AI entry', () => {
    const markup = renderToStaticMarkup(
      <AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={0} />
    )
    expect(markup).toContain('was AI involved anywhere in the')
    expect(markup).toContain('Did it sing or play something a human wrote — or make one up?')
    expect(markup).toContain('We wrote it — it just sang')
    expect(markup).toContain('It improvised parts')
    expect(markup).toContain('Not sure')
  })

  it('renders the two-door form for every later entry', () => {
    const markup = renderToStaticMarkup(
      <AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={3} />
    )
    expect(markup).toContain('What did the AI do?')
    expect(markup).toContain('It performed something we wrote')
    expect(markup).toContain('It created something new')
  })

  it('the two-door form renders all five component chips, taken from ai-entries.ts labels', () => {
    const markup = renderToStaticMarkup(
      <AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={3} />
    )
    expect(markup).toContain('Vocal')
    expect(markup).toContain('Instrument')
    expect(markup).toContain('Lyrics')
    expect(markup).toContain('Melody')
    expect(markup).toContain('Whole track')
  })

  it('"walk me through it again" is present in two-door mode only', () => {
    const doors = renderToStaticMarkup(<AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={3} />)
    const conversational = renderToStaticMarkup(<AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={0} />)
    expect(doors).toContain('walk me through it again')
    expect(conversational).not.toContain('walk me through it again')
  })

  it('names no AI tool or vendor in either mode', () => {
    const doors = renderToStaticMarkup(<AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={3} />).toLowerCase()
    const conversational = renderToStaticMarkup(
      <AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={0} />
    ).toLowerCase()
    for (const vendor of VENDOR_NAMES) {
      expect(doors).not.toContain(vendor)
      expect(conversational).not.toContain(vendor)
    }
  })

  it('contains no raw hex colour in either mode', () => {
    const doors = renderToStaticMarkup(<AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={3} />)
    const conversational = renderToStaticMarkup(<AiEntryFlow workId="w1" songTitle="Midnight" priorAiEntryCount={0} />)
    expect(doors).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(conversational).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('AiEntryFlow — the receipt block', () => {
  it('renders exactly four statements when given a receipt, and none of DDEX\'s component words leak outside it', () => {
    const markup = renderToStaticMarkup(
      <AiEntryFlow
        workId="w1"
        songTitle="Midnight"
        priorAiEntryCount={3}
        initialResult={{ data: FAKE_AI_ENTRY, receipt: FAKE_RECEIPT, guidance: null }}
      />
    )
    const lineCount = (markup.match(/data-receipt-line=/g) ?? []).length
    expect(lineCount).toBe(4)
    expect(markup).toContain(FAKE_RECEIPT.citation)
    expect(markup).toContain(FAKE_RECEIPT.splitsEffect)
    expect(markup).toContain(FAKE_RECEIPT.releaseEffect)
    expect(markup).toContain(FAKE_RECEIPT.crateConsequence)
    // The doors/chips form must not render once the receipt is showing —
    // the receipt replaces the form, it doesn't sit inside it.
    expect(markup).not.toContain('What did the AI do?')
  })

  it('renders the server\'s re-author guidance verbatim when the safe citation was refused', () => {
    const markup = renderToStaticMarkup(
      <AiEntryFlow
        workId="w1"
        songTitle="Midnight"
        priorAiEntryCount={3}
        initialResult={{
          data: FAKE_AI_ENTRY,
          receipt: FAKE_RECEIPT,
          guidance: "There's no human take of this in the diary yet, so the citation can't be trusted — re-author the part first, then it becomes true.",
        }}
      />
    )
    expect(markup).toContain("re-author the part first, then it becomes true")
  })

  it('a receipt with no guidance renders no guidance line', () => {
    const markup = renderToStaticMarkup(
      <AiEntryFlow
        workId="w1"
        songTitle="Midnight"
        priorAiEntryCount={3}
        initialResult={{ data: FAKE_AI_ENTRY, receipt: FAKE_RECEIPT, guidance: null }}
      />
    )
    expect(markup).not.toContain('re-author')
  })
})
