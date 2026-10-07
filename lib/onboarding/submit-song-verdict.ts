// ─── Questionnaire answers → the Crate verdict ────────────────────────────
//
// A MAPPER, NOT A RESOLVER. The authority on Crate eligibility is
// resolveCrateConsequence() in lib/catalogue/ai-entries.ts. This module's only
// job is to express the questionnaire's two AI answers in that function's
// input shape and hand them over.
//
// Writing a second eligibility computation here would be the defect, not the
// feature: two implementations drift, and the one that drifts is the one the
// artist reads at the exact moment they decide whether to submit. If a rule
// changes, it must change in ai-entries.ts and be inherited here for free --
// the tests assert that inheritance rather than restating the outcomes.
//
// The questionnaire asks a coarser question than AiEntryFlow does, so the
// mapping is deliberately conservative:
//
//   ai = 'none'    → no AI element at all. Nothing to resolve, nothing to
//                    disclose. Returns null, which the summary reads as "the
//                    Crate has no AI objection to this song."
//   ai = 'whole'   → component 'full'. The wholly-AI master case.
//   ai = 'partial' → component 'vocal' WHEN the song has vocals, because the
//                    vocal rule is the strict one and the vocal answer is the
//                    only follow-up we asked. hasHumanSource comes straight
//                    from that answer.
//
// 'partial' on an instrumental is NOT resolved here. We asked no follow-up
// that could distinguish an instrument from a melody from a lyric line, and
// guessing a component in order to produce a verdict would be inventing the
// answer. The summary says what is actually true -- that this needs a real AI
// entry before the Crate question can be answered -- rather than a verdict the
// artist might rely on.

import {
  resolveCrateConsequence,
  type CrateConsequence,
} from '@/lib/catalogue/ai-entries'
import type { QuestionId } from '@/lib/onboarding/submit-song-copy'

export type Answers = Partial<Record<QuestionId, string[]>>

export type Verdict =
  | { kind: 'clear' }
  | { kind: 'resolved'; consequence: CrateConsequence }
  | { kind: 'needs_entry' }
  | { kind: 'unknown' }

const first = (answers: Answers, id: QuestionId): string | undefined => answers[id]?.[0]

export function resolveQuestionnaireVerdict(answers: Answers, hasVocals: boolean): Verdict {
  const ai = first(answers, 'ai')
  if (!ai) return { kind: 'unknown' }
  if (ai === 'none') return { kind: 'clear' }

  if (ai === 'whole') {
    return {
      kind: 'resolved',
      consequence: resolveCrateConsequence({
        mode: 'generate',
        component: 'full',
        hasHumanSource: false,
      }),
    }
  }

  // ai === 'partial'
  if (!hasVocals) return { kind: 'needs_entry' }

  const vocals = first(answers, 'vocals')
  if (!vocals) return { kind: 'unknown' }

  return {
    kind: 'resolved',
    consequence: resolveCrateConsequence({
      mode: 'performance',
      component: 'vocal',
      hasHumanSource: vocals !== 'no_human_take',
    }),
  }
}
