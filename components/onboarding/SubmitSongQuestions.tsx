'use client'

// ─── The six-question stack ───────────────────────────────────────────────
//
// Rendered AFTER the song is already in the artist's Sound Vault. Nothing here
// gates capture -- ACCOUNT-TYPES.md puts capture ahead of every ask, and a
// questionnaire that blocks the upload inverts that rule.
//
// THREE PROPERTIES THIS COMPONENT GUARANTEES
//
// 1. Every question is skippable, individually and in bulk, and skipping
//    discards nothing already answered.
// 2. A response that PROMISES a write (Answer.requiresWrite) is never rendered
//    until that write has actually landed. This is the structural fix for the
//    Pass 2 failure, where copy promised a record the product did not keep.
//    Until the write is wired (next slice), such a response simply does not
//    appear -- silence is honest; a promise is not.
// 3. The vocal question is asked only when the song has vocals, matching the
//    BGV clause's scope.
//
// All strings come from lib/onboarding/submit-song-copy, which is under test
// against the four doctrine rules.

import { useEffect, useRef, useState } from 'react'
import {
  QUESTIONS,
  SKIP_ALL_LABEL,
  SKIP_LABEL,
  type Question,
  type QuestionId,
} from '@/lib/onboarding/submit-song-copy'

export type Answers = Partial<Record<QuestionId, string[]>>

type Props = {
  /** Controls whether the vocal-specific question is asked at all. */
  hasVocals: boolean
  /**
   * Values whose promised write has already succeeded. A response flagged
   * requiresWrite renders ONLY if its value appears here.
   */
  fulfilledWrites?: readonly string[]
  /**
   * Called when an answer is chosen, BEFORE the artist advances. Performs any
   * write that answer promises and resolves to the values now fulfilled.
   *
   * This exists because a promised response has to appear next to the answer
   * that triggered it -- deferring the write to the end of the flow would mean
   * either showing the promise before it is true, or showing it nowhere.
   */
  onAnswer?: (questionId: QuestionId, values: string[]) => Promise<void>
  onFinish: (answers: Answers) => void
}

function isAsked(q: Question, hasVocals: boolean): boolean {
  return q.conditional !== 'has_vocals' || hasVocals
}

export function SubmitSongQuestions({ hasVocals, fulfilledWrites = [], onAnswer, onFinish }: Props) {
  const asked = QUESTIONS.filter(q => isAsked(q, hasVocals))
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})

  const question = asked[index]
  const done = index >= asked.length

  // onFinish is a side effect and must not run during render: React would warn,
  // and under StrictMode the double-invoked render would fire it twice -- which,
  // for a callback that will later perform writes, means duplicate rows.
  //
  // A ref rather than a dependency array, deliberately. The honest dependency
  // list is [done, answers, onFinish], and a parent passing an inline arrow for
  // onFinish changes its identity on every render -- so the effect would re-fire
  // after completion, repeatedly. The latch makes "exactly once" a property of
  // the component instead of a property of how the caller happens to memoise.
  const finished = useRef(false)
  useEffect(() => {
    if (!done || finished.current) return
    finished.current = true
    onFinish(answers)
  }, [done, answers, onFinish])

  if (done || !question) return null

  const chosen = answers[question.id] ?? []
  const picked = question.answers.filter(a => chosen.includes(a.value))

  function choose(value: string) {
    const existing = answers[question.id] ?? []
    const next = !question.multi
      ? [value]
      : existing.includes(value)
        ? existing.filter(v => v !== value)
        : [...existing, value]

    setAnswers(prev => ({ ...prev, [question.id]: next }))
    // Fire-and-report: a failed write leaves fulfilledWrites unchanged, so the
    // promised response stays hidden rather than appearing over a write that
    // did not happen. The artist is never blocked by it either way.
    void onAnswer?.(question.id, next)
  }

  // Skipping advances without clearing anything already chosen, so a change of
  // mind mid-question is not punished by losing the earlier answers.
  const advance = () => setIndex(i => i + 1)

  return (
    <section className="rounded-[12px] border border-hair bg-card px-[26px] py-[26px]">
      <p className="text-[10px] uppercase tracking-[.16em] text-lavdim">
        {index + 1} of {asked.length} · all optional
      </p>
      <h2 className="mt-[6px] text-[18px] font-bold leading-snug text-white">{question.prompt}</h2>

      <div className="mt-5 flex flex-col gap-2">
        {question.answers.map(a => {
          const isChosen = chosen.includes(a.value)
          return (
            <button
              key={a.value}
              type="button"
              aria-pressed={isChosen}
              onClick={() => choose(a.value)}
              className={`rounded-lg border px-3.5 py-2.5 text-left text-[14px] transition ${
                isChosen
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-hair bg-card2 text-lavdim hover:border-white/25 hover:text-white'
              }`}
            >
              {a.label}
            </button>
          )
        })}
      </div>

      {picked.map(a => {
        // The guard. A response that commits the product to a record is held
        // back until that record exists.
        if (a.requiresWrite && !fulfilledWrites.includes(a.value)) return null
        if (!a.response) return null
        return (
          <p
            key={`r-${a.value}`}
            className="mt-4 rounded-lg border border-hair bg-card2 px-3.5 py-3 text-[13px] leading-relaxed text-lavdim"
          >
            {a.response}
          </p>
        )
      })}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={advance}
          disabled={chosen.length === 0}
          className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-40"
        >
          Next
        </button>
        <button
          type="button"
          onClick={advance}
          className="text-[13px] text-lavdim transition hover:text-white"
        >
          {SKIP_LABEL}
        </button>
        <button
          type="button"
          onClick={() => setIndex(asked.length)}
          className="ml-auto text-[13px] text-lavdim transition hover:text-white"
        >
          {SKIP_ALL_LABEL}
        </button>
      </div>
    </section>
  )
}
