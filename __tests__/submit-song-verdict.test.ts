import { resolveCrateConsequence } from '@/lib/catalogue/ai-entries'
import { resolveQuestionnaireVerdict } from '@/lib/onboarding/submit-song-verdict'

const a = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v]]))

describe('it defers to resolveCrateConsequence rather than restating it', () => {
  it('the wholly-AI verdict IS the resolver’s own object, not a copy of its wording', () => {
    const v = resolveQuestionnaireVerdict(a({ ai: 'whole' }), true)
    expect(v.kind).toBe('resolved')
    expect(v.kind === 'resolved' && v.consequence).toEqual(
      resolveCrateConsequence({ mode: 'generate', component: 'full', hasHumanSource: false })
    )
  })

  it('the no-human-take verdict IS the resolver’s own object', () => {
    const v = resolveQuestionnaireVerdict(a({ ai: 'partial', vocals: 'no_human_take' }), true)
    expect(v.kind === 'resolved' && v.consequence).toEqual(
      resolveCrateConsequence({ mode: 'performance', component: 'vocal', hasHumanSource: false })
    )
  })

  it('a take the tool built from IS eligible, because the resolver says so', () => {
    const v = resolveQuestionnaireVerdict(a({ ai: 'partial', vocals: 'built_from_take' }), true)
    expect(v.kind === 'resolved' && v.consequence.eligible).toBe(true)
    expect(v.kind === 'resolved' && v.consequence).toEqual(
      resolveCrateConsequence({ mode: 'performance', component: 'vocal', hasHumanSource: true })
    )
  })

  it('inherits a future rule change for free — nothing here hardcodes an outcome', () => {
    // If ai-entries.ts ever flips one of these, this mapper changes with it and
    // the assertions above still hold. That is the point of the indirection.
    for (const hasHumanSource of [true, false]) {
      const expected = resolveCrateConsequence({ mode: 'performance', component: 'vocal', hasHumanSource })
      const v = resolveQuestionnaireVerdict(
        a({ ai: 'partial', vocals: hasHumanSource ? 'all_human' : 'no_human_take' }),
        true
      )
      expect(v.kind === 'resolved' && v.consequence).toEqual(expected)
    }
  })
})

describe('it refuses to invent a verdict it has not earned', () => {
  it('returns unknown when the AI question was skipped', () => {
    expect(resolveQuestionnaireVerdict({}, true).kind).toBe('unknown')
    expect(resolveQuestionnaireVerdict(a({ room: 'done' }), true).kind).toBe('unknown')
  })

  it('returns unknown when the vocal follow-up was skipped on a vocal song', () => {
    expect(resolveQuestionnaireVerdict(a({ ai: 'partial' }), true).kind).toBe('unknown')
  })

  it('returns needs_entry for partial AI on an instrumental — no follow-up was asked', () => {
    // We asked nothing that distinguishes an instrument from a melody from a
    // lyric line. Guessing a component to produce a verdict would be inventing
    // the answer at the moment the artist decides whether to submit.
    expect(resolveQuestionnaireVerdict(a({ ai: 'partial' }), false).kind).toBe('needs_entry')
  })

  it('returns clear only when the artist said no AI at all', () => {
    expect(resolveQuestionnaireVerdict(a({ ai: 'none' }), true).kind).toBe('clear')
    expect(resolveQuestionnaireVerdict(a({ ai: 'none' }), false).kind).toBe('clear')
  })
})
