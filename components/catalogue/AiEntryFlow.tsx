'use client'

import { useState } from 'react'
import {
  AI_ENTRY_COMPONENT_LABELS,
  AI_ENTRY_COMPONENT_VALUES,
  AI_ENTRY_MODE_LABELS,
  isFirstEverAiEntry,
  type AiEntryComponent,
  type AiEntryMode,
  type Receipt,
} from '@/lib/catalogue/ai-entries'
import { HumFirstMoment } from './HumFirstMoment'
import type { HumCaptureButtonProps } from './HumCaptureButton'
import type { AiEntry, WorkVersion } from '@/types/catalogue'

// ─── AiEntryFlow — conversational first, two doors after (002-B then A) ─
//
// ONE component, two presentations, switched by `isFirstEverAiEntry()`
// (plan 03) — never by a re-derived `=== 0` check here. First-timers need
// pacing, veterans need speed; the split serves both (catalogue-hygiene-
// ui.md's own rejected-alternatives note: a single mode cannot).
//
// VOCABULARY RULE, load-bearing: DDEX's component words (vocal / instrument
// / lyric / melody / full) appear ONLY inside <ReceiptBlock> below — every
// other string in this file is plain English. Their labels are always
// read from lib/catalogue/ai-entries.ts's exported *_LABELS records, never
// retyped here, so the flow and the receipt cannot drift apart. No AI
// tool or vendor name appears anywhere in this file.
//
// RECEIPT RULE, load-bearing (T-37-56): this component composes no
// citation. `submit()` posts only the artist's raw answers to plan 06's
// route; whatever that route returns is rendered as-is by <ReceiptBlock>.
// A client-composed citation would drift from the one actually stored on
// the row the moment this file's copy ever changed — the receipt is the
// artist's own record of what they attested to, so it has to be the
// server's own words, every time.
//
// WHEN-IN-DOUBT RULE, load-bearing (T-37-57): "Not sure" in conversational
// mode does not fall back to a softer label — it routes straight into
// HumFirstMoment's hum-evidence check (task 2). Doubt is resolved by
// recording something, not by picking gentler wording; a server refusal
// (guidance !== null) is rendered as re-author guidance, never silently
// swapped for a different citation.

export type AiEntryFlowResult = {
  data: AiEntry
  receipt: Receipt
  guidance: string | null
}

export type AiEntryFlowProps = {
  workId: string
  songTitle: string
  /**
   * How many AI entries this account has ever filed — the single input
   * `isFirstEverAiEntry()` needs to decide which pacing opens. Owned by
   * the parent (plan 12), which already has this count from its own
   * fetch; this component makes no query of its own.
   */
  priorAiEntryCount: number
  /** The DDEX component this entry concerns in conversational mode. Two-door mode lets the artist choose via chips instead, starting from this value. */
  defaultComponent?: AiEntryComponent
  versionId?: string | null
  blockId?: string | null
  /**
   * The diary-anchored human take this entry can point to, when the
   * artist already has one on record for this song. `resolveCitation()`
   * (plan 03) only reaches the safe citation when this is present AND
   * mode is 'performance' — passing a value here does not itself grant
   * the citation, it only makes it possible.
   */
  humanSourceVersionId?: string | null
  onFiled?: (result: AiEntryFlowResult) => void
  /** Bubbled up when the hum-evidence check (task 2) produces a new take. */
  onHumCaptured?: (version: WorkVersion) => void
  /** Forwarded to HumFirstMoment's "attach an existing take" path — owned by the parent, this flow does not implement uploading. */
  onAttachExisting?: () => void
  onCancel?: () => void
  /** Passed straight through to HumCaptureButton/HumFirstMoment — see those components' own doc comments for why this seam exists. */
  isTypeSupported?: HumCaptureButtonProps['isTypeSupported']
  /**
   * Test seam only: seeds the receipt block without a real POST round
   * trip, mirroring HumCaptureButton's `initialError`. There is no jsdom
   * in this repo to drive an actual fetch-then-render cycle. A production
   * caller never sets this.
   */
  initialResult?: AiEntryFlowResult | null
}

// ─── The receipt — the only place DDEX vocabulary is allowed ───────────

function ReceiptBlock({ receipt, guidance }: { receipt: Receipt; guidance: string | null }) {
  return (
    <div className="mt-[14px] rounded-r-[10px] border-l-[3px] border-blue-400 bg-blue-400/[.07] px-[14px] py-[11px]">
      <b className="text-[11px] uppercase tracking-[.08em] text-blue-400">Your receipt</b>
      <p data-receipt-line="citation" className="mt-[4px] text-[12px] text-white">
        {receipt.citation}
      </p>
      <p data-receipt-line="splits" className="mt-[5px] text-[11px] text-lavdim">
        {receipt.splitsEffect}
      </p>
      <p data-receipt-line="release" className="text-[11px] text-lavdim">
        {receipt.releaseEffect}
      </p>
      <p data-receipt-line="crate" className="text-[11px] text-lavdim">
        {receipt.crateConsequence}
      </p>
      {guidance && (
        <p className="mt-[8px] border-t border-hair pt-[8px] text-[11px] text-amber-400">{guidance}</p>
      )}
    </div>
  )
}

// ─── Two-door mode (002-A) — the veteran path ───────────────────────────

function doorClasses(selected: boolean): string {
  const base =
    'block w-full rounded-[12px] border bg-card2 px-[16px] py-[14px] text-left transition'
  return selected ? `${base} border-brandindigo` : `${base} border-hair hover:border-hairstrong`
}

function chipClasses(selected: boolean): string {
  const base = 'rounded-full border px-[12px] py-[6px] text-[12px] font-medium'
  return selected
    ? `${base} border-transparent bg-grad text-white`
    : `${base} border-hairstrong bg-transparent text-lav hover:text-white`
}

type TwoDoorModeProps = {
  songTitle: string
  mode: AiEntryMode | null
  component: AiEntryComponent
  submitting: boolean
  error: string | null
  onSelectMode: (mode: AiEntryMode) => void
  onSelectComponent: (component: AiEntryComponent) => void
  onWalkThroughAgain: () => void
  onCancel?: () => void
  onSubmit: () => void
}

function TwoDoorMode({
  songTitle,
  mode,
  component,
  submitting,
  error,
  onSelectMode,
  onSelectComponent,
  onWalkThroughAgain,
  onCancel,
  onSubmit,
}: TwoDoorModeProps) {
  return (
    <div className="rounded-[12px] border border-hair bg-card px-5 py-5">
      <p className="text-[10px] uppercase tracking-[.16em] text-lavdim">
        Adding to {songTitle} · AI was involved
      </p>
      <b className="mt-[4px] block text-[16px] text-white">What did the AI do?</b>
      <p className="mb-3 mt-[2px] text-[12px] text-lavdim">
        Honest answer here keeps your song yours. There is no wrong door.
      </p>

      <div className="flex flex-col gap-[9px]">
        <button type="button" onClick={() => onSelectMode('performance')} className={doorClasses(mode === 'performance')}>
          <b className="block text-[12px] text-white">{AI_ENTRY_MODE_LABELS.performance}</b>
          <span className="mt-[2px] block text-[11px] text-lavdim">
            Sang our melody, played our part, or re-voiced a human take. Ownership untouched.
          </span>
          <span className="mt-[2px] block text-[11px] text-emerald-400">✓ the safe path — cite it proudly</span>
        </button>
        <button type="button" onClick={() => onSelectMode('generate')} className={doorClasses(mode === 'generate')}>
          <b className="block text-[12px] text-white">{AI_ENTRY_MODE_LABELS.generate}</b>
          <span className="mt-[2px] block text-[11px] text-lavdim">
            Invented a melody, lyric, solo, or arrangement we kept. That part is owned by no one.
          </span>
          <span className="mt-[2px] block text-[11px] text-amber-400">→ we&apos;ll show you how to make it yours</span>
        </button>
      </div>

      <div className="mt-4 border-t border-hair pt-[14px]">
        <b className="mb-[8px] block text-[12px] text-white">Step 2 · What did it touch?</b>
        <div className="flex flex-wrap gap-[7px]">
          {AI_ENTRY_COMPONENT_VALUES.map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onSelectComponent(value)}
              className={chipClasses(component === value)}
            >
              {AI_ENTRY_COMPONENT_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-[11px] text-rose-300">{error}</p>}

      <div className="mt-[14px] flex items-center justify-between gap-2">
        {/* Reopens the conversational pacing (002-B) — first-timers need
            it, and a veteran having a genuinely uncertain moment should
            not be stuck with only the fast form. */}
        <button
          type="button"
          onClick={onWalkThroughAgain}
          className="border-0 bg-transparent p-0 text-[11px] text-lavdim underline hover:text-white"
        >
          walk me through it again
        </button>
        <div className="flex gap-[8px]">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!mode || submitting}
            onClick={onSubmit}
            className="rounded-[9px] bg-grad px-[13px] py-[7px] text-[12px] font-semibold text-white shadow-cta disabled:opacity-50"
          >
            {submitting ? 'Recording…' : 'Record it'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Conversational mode (002-B) — the first-timer path ────────────────

type ConversationalModeProps = {
  songTitle: string
  component: AiEntryComponent
  submitting: boolean
  error: string | null
  onAnswer: (mode: AiEntryMode) => void
  onNotSure: () => void
}

function ConversationalMode({ songTitle, component, submitting, error, onAnswer, onNotSure }: ConversationalModeProps) {
  const componentLabel = AI_ENTRY_COMPONENT_LABELS[component].toLowerCase()

  return (
    <div className="flex flex-col gap-[12px] rounded-[12px] border border-hair bg-card px-5 py-5">
      <div>
        <span className="text-[11px] text-lavdim">Funūn</span>
        <div className="mt-[3px] inline-block rounded-[12px] rounded-bl-[4px] bg-card2 px-[13px] py-[10px]">
          <span className="text-[12px]">
            You added to <b>{songTitle}</b> — was AI involved anywhere in the {componentLabel}?
          </span>
        </div>
      </div>

      <div className="text-right">
        <div className="inline-block rounded-[12px] rounded-br-[4px] bg-grad px-[13px] py-[9px]">
          <span className="text-[12px] text-white">Yes — AI was involved</span>
        </div>
      </div>

      <div>
        <span className="text-[11px] text-lavdim">Funūn</span>
        <div className="mt-[3px] inline-block rounded-[12px] rounded-bl-[4px] bg-card2 px-[13px] py-[10px]">
          <span className="block text-[12px]">Did it sing or play something a human wrote — or make one up?</span>
          <span className="mt-[3px] block text-[11px] text-lavdim">
            If you can point to the human version that came first, you own everything.
          </span>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-[8px]">
        <button
          type="button"
          disabled={submitting}
          onClick={() => onAnswer('performance')}
          className="rounded-[9px] bg-grad px-[13px] py-[7px] text-[12px] font-semibold text-white shadow-cta disabled:opacity-50"
        >
          We wrote it — it just sang
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => onAnswer('generate')}
          className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white disabled:opacity-50"
        >
          It improvised parts
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onNotSure}
          className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white disabled:opacity-50"
        >
          Not sure
        </button>
      </div>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </div>
  )
}

// ─── AiEntryFlow ─────────────────────────────────────────────────────

export function AiEntryFlow({
  workId,
  songTitle,
  priorAiEntryCount,
  defaultComponent = 'vocal',
  versionId = null,
  blockId = null,
  humanSourceVersionId = null,
  onFiled,
  onHumCaptured,
  onAttachExisting,
  onCancel,
  isTypeSupported,
  initialResult = null,
}: AiEntryFlowProps) {
  const [conversational, setConversational] = useState(isFirstEverAiEntry(priorAiEntryCount))
  const [showHumEvidence, setShowHumEvidence] = useState(false)
  const [component, setComponent] = useState<AiEntryComponent>(defaultComponent)
  const [mode, setMode] = useState<AiEntryMode | null>(null)
  const [result, setResult] = useState<AiEntryFlowResult | null>(initialResult)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(chosenMode: AiEntryMode, chosenComponent: AiEntryComponent, humanSource: string | null) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/works/${workId}/ai-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: chosenMode,
          component: chosenComponent,
          versionId,
          blockId,
          humanSourceVersionId: humanSource,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as Partial<AiEntryFlowResult> & { error?: string }
      if (!res.ok || !body.data || !body.receipt) {
        setError(body.error ?? 'Could not file this entry.')
        return
      }
      const filed: AiEntryFlowResult = { data: body.data, receipt: body.receipt, guidance: body.guidance ?? null }
      setResult(filed)
      onFiled?.(filed)
    } catch {
      setError('Could not file this entry.')
    } finally {
      setSubmitting(false)
    }
  }

  // Already filed — the receipt is what was ACTUALLY stored, rendered in
  // exactly the same way regardless of which mode got the artist here.
  if (result) {
    return <ReceiptBlock receipt={result.receipt} guidance={result.guidance} />
  }

  // "Not sure" (conversational) routes here instead of a softer label —
  // the when-in-doubt rule's UI expression (T-37-57). Capturing a hum
  // becomes the human source for a performance citation; attaching an
  // existing take or skipping both return to the question without
  // resolving it, never blocking the artist either way (T-37-58).
  if (showHumEvidence) {
    return (
      <HumFirstMoment
        workId={workId}
        songTitle={songTitle}
        isTypeSupported={isTypeSupported}
        onCaptured={version => {
          onHumCaptured?.(version)
          setShowHumEvidence(false)
          void submit('performance', component, version.id)
        }}
        onAttachExisting={() => {
          setShowHumEvidence(false)
          onAttachExisting?.()
        }}
        onSkip={() => setShowHumEvidence(false)}
      />
    )
  }

  if (conversational) {
    return (
      <ConversationalMode
        songTitle={songTitle}
        component={component}
        submitting={submitting}
        error={error}
        onAnswer={chosenMode => void submit(chosenMode, component, chosenMode === 'performance' ? humanSourceVersionId : null)}
        onNotSure={() => setShowHumEvidence(true)}
      />
    )
  }

  return (
    <TwoDoorMode
      songTitle={songTitle}
      mode={mode}
      component={component}
      submitting={submitting}
      error={error}
      onSelectMode={setMode}
      onSelectComponent={setComponent}
      onWalkThroughAgain={() => setConversational(true)}
      onCancel={onCancel}
      onSubmit={() => mode && void submit(mode, component, mode === 'performance' ? humanSourceVersionId : null)}
    />
  )
}
