import {
  AI_ENTRY_COMPONENT_VALUES,
  AI_ENTRY_MODE_VALUES,
  composeReceipt,
  isFirstEverAiEntry,
  resolveCitation,
  resolveCrateConsequence,
  resolveLevel,
  type AiEntryComponent,
  type AiEntryMode,
} from './ai-entries'

// No vendor/tool name should ever appear in a string this module returns.
const VENDOR_NAMES = ['suno', 'udio', 'anthropic', 'claude', 'openai', 'chatgpt', 'gpt']

function assertNoVendorNames(text: string) {
  const lower = text.toLowerCase()
  for (const vendor of VENDOR_NAMES) {
    expect(lower).not.toContain(vendor)
  }
}

describe('resolveCitation', () => {
  it('returns the safe citation for a performance vocal with a human source', () => {
    const outcome = resolveCitation({ mode: 'performance', component: 'vocal', hasHumanSource: true })
    expect(outcome.kind).toBe('cited')
    if (outcome.kind === 'cited') {
      expect(outcome.citation).toBe(
        'AI reference vocal — performed a human-written melody, demo only.'
      )
    }
  })

  it('refuses the safe citation for a performance entry with no human source', () => {
    const outcome = resolveCitation({ mode: 'performance', component: 'vocal', hasHumanSource: false })
    expect(outcome.kind).toBe('reauthor')
    if (outcome.kind === 'reauthor') {
      expect(outcome.reason.length).toBeGreaterThan(0)
      expect(outcome.reason.toLowerCase()).toContain('re-author')
    }
  })

  it('never returns the safe citation for generate mode, on any component, with or without a human source', () => {
    for (const component of AI_ENTRY_COMPONENT_VALUES) {
      for (const hasHumanSource of [true, false]) {
        const outcome = resolveCitation({ mode: 'generate', component, hasHumanSource })
        expect(outcome.kind).not.toBe('cited')
        expect(outcome.kind).toBe('unowned')
      }
    }
  })

  it('marks generate-mode material as owned by no one', () => {
    const outcome = resolveCitation({ mode: 'generate', component: 'melody', hasHumanSource: false })
    expect(outcome.kind).toBe('unowned')
    if (outcome.kind === 'unowned') {
      expect(outcome.reason.toLowerCase()).toContain('owned by no one')
    }
  })

  it('is structurally incapable of citing performance without a human source for any component', () => {
    for (const component of AI_ENTRY_COMPONENT_VALUES) {
      const outcome = resolveCitation({ mode: 'performance', component, hasHumanSource: false })
      expect(outcome.kind).not.toBe('cited')
    }
  })

  it('never mentions a vendor or tool name in any citation string', () => {
    for (const mode of AI_ENTRY_MODE_VALUES) {
      for (const component of AI_ENTRY_COMPONENT_VALUES) {
        for (const hasHumanSource of [true, false]) {
          const outcome = resolveCitation({ mode, component, hasHumanSource })
          const text = outcome.kind === 'cited' ? outcome.citation : outcome.reason
          assertNoVendorNames(text)
        }
      }
    }
  })
})

describe('resolveLevel', () => {
  it('places every performance entry at the version level, regardless of component', () => {
    for (const component of AI_ENTRY_COMPONENT_VALUES) {
      expect(resolveLevel('performance', component)).toBe('version')
    }
  })

  it('places a generated lyric or melody at the work level', () => {
    expect(resolveLevel('generate', 'lyric')).toBe('work')
    expect(resolveLevel('generate', 'melody')).toBe('work')
  })

  it('places a generated vocal or instrument at the version level', () => {
    expect(resolveLevel('generate', 'vocal')).toBe('version')
    expect(resolveLevel('generate', 'instrument')).toBe('version')
  })
})

describe('resolveCrateConsequence', () => {
  it('is not eligible for a generated vocal with no human source, with the one-pass fix stated', () => {
    const consequence = resolveCrateConsequence({ mode: 'generate', component: 'vocal', hasHumanSource: false })
    expect(consequence.eligible).toBe(false)
    if (!consequence.eligible) {
      expect(consequence.fix).toBeDefined()
      expect(consequence.fix!.toLowerCase()).toContain('rough')
      expect(consequence.fix!.toLowerCase()).toContain('human take')
    }
  })

  it('is eligible and disclosed for a voice-converted layer that points at a human take', () => {
    const consequence = resolveCrateConsequence({ mode: 'generate', component: 'vocal', hasHumanSource: true })
    expect(consequence.eligible).toBe(true)
    if (consequence.eligible) {
      expect(consequence.disclosed).toBe(true)
    }
  })

  it('is eligible and disclosed for a generated instrument inside a human-produced master', () => {
    const consequence = resolveCrateConsequence({ mode: 'generate', component: 'instrument', hasHumanSource: false })
    expect(consequence.eligible).toBe(true)
    if (consequence.eligible) {
      expect(consequence.disclosed).toBe(true)
    }
  })

  it('is not eligible for a whole generated track, on ownership grounds', () => {
    const consequence = resolveCrateConsequence({ mode: 'generate', component: 'full', hasHumanSource: false })
    expect(consequence.eligible).toBe(false)
    if (!consequence.eligible) {
      expect(consequence.reason.toLowerCase()).toContain('ownership')
    }
  })

  it('is not eligible for a whole performed track either — the master is still wholly AI-rendered', () => {
    const consequence = resolveCrateConsequence({ mode: 'performance', component: 'full', hasHumanSource: true })
    expect(consequence.eligible).toBe(false)
  })
})

describe('composeReceipt', () => {
  it('always returns exactly four statements', () => {
    const receipt = composeReceipt({ mode: 'performance', component: 'vocal', hasHumanSource: true })
    const keys = Object.keys(receipt)
    expect(keys.sort()).toEqual(['citation', 'crateConsequence', 'releaseEffect', 'splitsEffect'].sort())
  })

  it('walks every mode/component combination and asserts the splits effect is always zero', () => {
    const expected = 'Splits: unaffected. AI takes zero — on every entry, every time.'
    for (const mode of AI_ENTRY_MODE_VALUES as AiEntryMode[]) {
      for (const component of AI_ENTRY_COMPONENT_VALUES as AiEntryComponent[]) {
        for (const hasHumanSource of [true, false]) {
          const receipt = composeReceipt({ mode, component, hasHumanSource })
          expect(receipt.splitsEffect).toBe(expected)
          expect(receipt.citation.length).toBeGreaterThan(0)
          expect(receipt.releaseEffect.length).toBeGreaterThan(0)
          expect(receipt.crateConsequence.length).toBeGreaterThan(0)
          assertNoVendorNames(receipt.citation)
          assertNoVendorNames(receipt.releaseEffect)
          assertNoVendorNames(receipt.crateConsequence)
        }
      }
    }
  })

  it('states the safe citation verbatim when performance + human source', () => {
    const receipt = composeReceipt({ mode: 'performance', component: 'vocal', hasHumanSource: true })
    expect(receipt.citation).toBe('AI reference vocal — performed a human-written melody, demo only.')
  })

  it('states the Crate consequence for a generated vocal with no source', () => {
    const receipt = composeReceipt({ mode: 'generate', component: 'vocal', hasHumanSource: false })
    expect(receipt.crateConsequence.toLowerCase()).toContain('not eligible')
    expect(receipt.crateConsequence.toLowerCase()).toContain('rough')
  })
})

describe('isFirstEverAiEntry', () => {
  it('is true when the account has filed none', () => {
    expect(isFirstEverAiEntry(0)).toBe(true)
  })

  it('is false once at least one entry exists', () => {
    expect(isFirstEverAiEntry(1)).toBe(false)
    expect(isFirstEverAiEntry(7)).toBe(false)
  })
})
