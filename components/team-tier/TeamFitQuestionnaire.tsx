'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  SEAT_ANSWER_VALUES,
  SEAT_ANSWER_LABELS,
  CATALOGUE_ANSWER_VALUES,
  CATALOGUE_ANSWER_LABELS,
  PAIN_POINT_VALUES,
  PAIN_POINT_LABELS,
  MAX_PAIN_POINTS,
  resolveRouting,
  bdEndingCopy,
  selfServeEndingCopy,
  type SeatAnswer,
  type CatalogueAnswer,
  type PainPoint,
} from '@/lib/team-tier/qualification'

// ─── TeamFitQuestionnaire — /team-fit's three-question flow (261004-ttq) ──
// Client component. No account required anywhere in this flow. Contact
// info is collected ONLY on the step leading to the bd branch — the only
// branch that promises a human reply.
//
// The locally-computed resolveRouting(seatAnswer) call below is a
// UX-sequencing decision only, not a security boundary: the server
// independently recomputes routingOutcome from the submitted seatAnswer
// and never trusts a client value. The final rendered ending always keys
// off the SERVER's response, not this local preview.

type Step = 'q1' | 'q2' | 'q3' | 'contact' | 'done'

type SubmitResult =
  | { ok: true; routingOutcome: 'bd' | 'self_serve' }
  | { ok: false; error: string }

const OPTION_BUTTON =
  'w-full rounded-[11px] border px-[13px] py-3 text-left text-[13.5px] leading-[1.4] transition'
const OPTION_INACTIVE = 'border-hair bg-white/[0.04] text-white hover:border-[rgba(129,140,248,.4)]'
const OPTION_ACTIVE = 'border-[rgba(129,140,248,.7)] bg-[rgba(129,140,248,.14)] text-white'
const INPUT_CLASS =
  'h-[42px] w-full rounded-[11px] border border-hair bg-white/[0.04] px-[13px] text-[13.5px] text-white outline-none transition placeholder:text-[#5b5f8c] focus:border-[rgba(129,140,248,.6)] focus:shadow-[0_0_0_3px_rgba(129,140,248,.16)]'
const LABEL_CLASS = 'mb-1.5 block text-[11.5px] font-semibold text-[color:#c7c7e0]'
const CTA_CLASS =
  'inline-flex h-[44px] w-full items-center justify-center rounded-[12px] bg-[image:linear-gradient(135deg,#818CF8,#D946EF)] text-[14px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100'

export function TeamFitQuestionnaire() {
  const [step, setStep] = useState<Step>('q1')
  const [seatAnswer, setSeatAnswer] = useState<SeatAnswer | null>(null)
  const [catalogueAnswer, setCatalogueAnswer] = useState<CatalogueAnswer | null>(null)
  const [painPoints, setPainPoints] = useState<PainPoint[]>([])
  const [painPointsOther, setPainPointsOther] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)

  function togglePainPoint(point: PainPoint) {
    setPainPoints(prev => {
      if (prev.includes(point)) return prev.filter(p => p !== point)
      // Clicking a third option when two are already selected is a no-op —
      // the array never silently grows past MAX_PAIN_POINTS.
      if (prev.length >= MAX_PAIN_POINTS) return prev
      return [...prev, point]
    })
  }

  async function submit(answers: {
    seatAnswer: SeatAnswer
    catalogueAnswer: CatalogueAnswer
    contactName?: string
    contactEmail?: string
  }) {
    setSubmitting(true)
    setResult(null)
    try {
      const body: Record<string, unknown> = {
        seatAnswer: answers.seatAnswer,
        catalogueAnswer: answers.catalogueAnswer,
        painPoints,
        painPointsOther: painPointsOther.trim() || undefined,
      }
      if (answers.contactName) body.contactName = answers.contactName
      if (answers.contactEmail) body.contactEmail = answers.contactEmail

      const res = await fetch('/api/team-tier-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        routingOutcome?: 'bd' | 'self_serve'
        error?: string
      }

      if (!res.ok || !data.ok || !data.routingOutcome) {
        setResult({ ok: false, error: data.error || 'Something went wrong. Please try again.' })
        return
      }

      setResult({ ok: true, routingOutcome: data.routingOutcome })
      setStep('done')
    } catch {
      setResult({ ok: false, error: 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  function handleQ3Continue() {
    if (!seatAnswer || !catalogueAnswer) return
    const preview = resolveRouting(seatAnswer)
    if (preview === 'bd') {
      setStep('contact')
    } else {
      void submit({ seatAnswer, catalogueAnswer })
    }
  }

  function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!seatAnswer || !catalogueAnswer) return
    void submit({
      seatAnswer,
      catalogueAnswer,
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
    })
  }

  if (step === 'q1') {
    return (
      <div className="flex flex-col gap-4">
        <p className={LABEL_CLASS}>How many people would be in here with you?</p>
        <div className="flex flex-col gap-2">
          {SEAT_ANSWER_VALUES.map(value => (
            <button
              key={value}
              type="button"
              className={`${OPTION_BUTTON} ${seatAnswer === value ? OPTION_ACTIVE : OPTION_INACTIVE}`}
              onClick={() => setSeatAnswer(value)}
            >
              {SEAT_ANSWER_LABELS[value]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={CTA_CLASS}
          disabled={!seatAnswer}
          onClick={() => setStep('q2')}
        >
          Continue
        </button>
      </div>
    )
  }

  if (step === 'q2') {
    return (
      <div className="flex flex-col gap-4">
        <p className={LABEL_CLASS}>How much music are we talking about?</p>
        <div className="flex flex-col gap-2">
          {CATALOGUE_ANSWER_VALUES.map(value => (
            <button
              key={value}
              type="button"
              className={`${OPTION_BUTTON} ${catalogueAnswer === value ? OPTION_ACTIVE : OPTION_INACTIVE}`}
              onClick={() => setCatalogueAnswer(value)}
            >
              {CATALOGUE_ANSWER_LABELS[value]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`${OPTION_BUTTON} ${OPTION_INACTIVE} flex-none px-5 text-center`}
            onClick={() => setStep('q1')}
          >
            Back
          </button>
          <button
            type="button"
            className={CTA_CLASS}
            disabled={!catalogueAnswer}
            onClick={() => setStep('q3')}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (step === 'q3') {
    return (
      <div className="flex flex-col gap-4">
        <p className={LABEL_CLASS}>What keeps going wrong? (pick up to {MAX_PAIN_POINTS})</p>
        <div className="flex flex-wrap gap-2">
          {PAIN_POINT_VALUES.map(value => {
            const active = painPoints.includes(value)
            return (
              <button
                key={value}
                type="button"
                className={[
                  'rounded-full border px-3 py-1.5 text-[12.5px] transition',
                  active
                    ? 'border-[rgba(129,140,248,.7)] bg-[rgba(129,140,248,.14)] text-white'
                    : 'border-hair bg-white/[0.04] text-white hover:border-[rgba(129,140,248,.4)]',
                ].join(' ')}
                onClick={() => togglePainPoint(value)}
              >
                {PAIN_POINT_LABELS[value]}
              </button>
            )
          })}
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="team-fit-pain-other">
            Anything else? (optional)
          </label>
          <input
            id="team-fit-pain-other"
            className={INPUT_CLASS}
            value={painPointsOther}
            onChange={e => setPainPointsOther(e.target.value)}
            placeholder="Tell us more"
          />
        </div>
        {result && !result.ok && (
          <p className="text-[12.5px] text-rose-300">{result.error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className={`${OPTION_BUTTON} ${OPTION_INACTIVE} flex-none px-5 text-center`}
            onClick={() => setStep('q2')}
          >
            Back
          </button>
          <button type="button" className={CTA_CLASS} disabled={submitting} onClick={handleQ3Continue}>
            {submitting ? 'Submitting…' : 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'contact') {
    return (
      <form className="flex flex-col gap-4" onSubmit={handleContactSubmit}>
        <p className={LABEL_CLASS}>One more thing — where should we send the reply?</p>
        <div>
          <label className={LABEL_CLASS} htmlFor="team-fit-contact-name">
            Name
          </label>
          <input
            id="team-fit-contact-name"
            className={INPUT_CLASS}
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="team-fit-contact-email">
            Email
          </label>
          <input
            id="team-fit-contact-email"
            type="email"
            className={INPUT_CLASS}
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            required
          />
        </div>
        {result && !result.ok && (
          <p className="text-[12.5px] text-rose-300">{result.error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className={`${OPTION_BUTTON} ${OPTION_INACTIVE} flex-none px-5 text-center`}
            onClick={() => setStep('q3')}
          >
            Back
          </button>
          <button type="submit" className={CTA_CLASS} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    )
  }

  // step === 'done'
  if (!result || !result.ok) return null
  const copy = result.routingOutcome === 'bd' ? bdEndingCopy() : selfServeEndingCopy()

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[17px] font-bold text-white">{copy.headline}</h2>
      <p className="text-[13.5px] leading-[1.55] text-[color:#c7c7e0]">{copy.body}</p>
      {copy.cta && (
        <Link href={copy.cta.href} className={`${CTA_CLASS} mt-2`}>
          {copy.cta.label}
        </Link>
      )}
    </div>
  )
}
