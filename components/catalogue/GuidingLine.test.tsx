import { renderToStaticMarkup } from 'react-dom/server'
import type { GuidingLineStep } from '@/lib/catalogue/guiding-line'
import { GuidingLine, type GuidingLineProps } from './GuidingLine'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, matching components/handles/ChooseHandleGate.test.tsx.

const mockStep: GuidingLineStep = {
  key: 'hum_to_claim',
  headline: 'Start with a hum',
  reason: 'Save and protect your idea by just humming or singing right now.',
  actionLabel: 'Hum it in',
  actionTarget: 'hum',
}

describe('GuidingLine', () => {
  const noop = () => {}

  it('renders the lamp, the bold prefix, the sentence, the action label and the dismiss', () => {
    const markup = renderToStaticMarkup(<GuidingLine step={mockStep} onDoIt={noop} onDismiss={noop} />)
    expect(markup).toContain('💡')
    expect(markup).toContain('Start with a hum')
    expect(markup).toContain('Hum it in')
    expect(markup).toContain('✕')
  })

  it('renders nothing at all — not an empty container — when the step is null', () => {
    const markup = renderToStaticMarkup(<GuidingLine step={null} onDoIt={noop} onDismiss={noop} />)
    expect(markup).toBe('')
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(<GuidingLine step={mockStep} onDoIt={noop} onDismiss={noop} />)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('never spends the full bg-grad gradient — only a border/wash tint', () => {
    const markup = renderToStaticMarkup(<GuidingLine step={mockStep} onDoIt={noop} onDismiss={noop} />)
    // Word-boundary match: "bg-gradient-to-r" (the faint wash) must not be
    // mistaken for "bg-grad" (the primary action's single spent gradient).
    expect(markup).not.toMatch(/\bbg-grad\b(?!ient)/)
  })

  // Type-level assertion: GuidingLineProps['step'] is GuidingLineStep | null,
  // never an array — the component is structurally incapable of rendering
  // a stack. This function is never called; TypeScript still type-checks
  // its body, so a drift here fails `npx tsc --noEmit` (and this suite,
  // since ts-jest shares the same compiler).
  it('cannot type-check an array as the step prop (type-level assertion — never a stack)', () => {
    const assertSingleStepOnly = (): void => {
      // @ts-expect-error — step must be a single GuidingLineStep | null, never GuidingLineStep[].
      const invalid: GuidingLineProps = { step: [mockStep], onDoIt: noop, onDismiss: noop }
      void invalid
    }
    expect(assertSingleStepOnly).toBeDefined()
  })
})
