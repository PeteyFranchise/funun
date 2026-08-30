'use client'

import { useEffect, useRef, useState } from 'react'
import { LearnWhy } from '@/components/ui/LearnWhy'
import type { WorkVocalState } from '@/types/catalogue'

// ─── WorkHeader — the live title, the three vocal states, the chips ────
// (sketch 001-A/C's header card + 006-A's live title input, folded into
// one header — plan 11.)
//
// This component owns two mutations directly (debounced title PATCH, and
// an immediate vocal-state PATCH) against plan 05's
// `PATCH /api/works/[workId]`, the same "fetch from inside the
// component" shape used throughout components/vault/* (e.g.
// DistributorPicker.tsx, DocumentStage.tsx) rather than the
// callback-only shape ComposerCard.tsx uses — this component is a
// persistent settings surface with its own network calls, not a pure
// verb dispatcher.

const TITLE_SAVE_DEBOUNCE_MS = 600

const VOCAL_STATE_OPTIONS: { value: WorkVocalState; glyph: string; label: string }[] = [
  { value: 'primary', glyph: '🎤', label: 'Primary performer' },
  { value: 'varies', glyph: '⇄', label: 'Varies' },
  { value: 'instrumental', glyph: '🎼', label: 'Instrumental' },
]

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-lav/[.08] px-2.5 py-1 text-[11px] font-semibold text-lav'
const CHIP_SPLITS_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300'

export type WorkHeaderProps = {
  workId: string
  title: string
  /** The work owner's @handle — always rendered first among the identity chips, per sketch 001. */
  ownerHandle: string
  /** Non-owner contributor display names. Deliberately just names — see the splits-chip comment below for why no number ever sits beside one. */
  contributorNames: string[]
  /**
   * A STATE WORD only ('draft', 'executed', …) — never a percentage.
   * CAT-Q1a (doctrine, verbatim): the system never proposes a
   * contribution-weighted split, and nudges name PEOPLE, never NUMBERS.
   * This header is the single most tempting place in the product to show
   * a percentage next to a name — the splits chip below renders a status
   * word and nothing else, on purpose, forever.
   */
  splitsStatus: string
  vocalState: WorkVocalState
  /**
   * The resolved display handle/name for the current primary performer
   * (when `vocalState === 'primary'`), or null when none is set yet.
   * Resolution (collaborator id / user id → a human-readable handle) is
   * the caller's job (plan 12's page already has the profile/collaborator
   * lookups it needs for the diary) — this component stays presentational
   * and does no id-to-name resolution of its own.
   */
  primaryPerformerLabel: string | null
  /**
   * Whether the current viewer may edit the title and vocal setting. In
   * 37.1 BOTH tiers (contribute and administer) can edit a work's content
   * — migration 136's own policy comment is explicit that ADMINISTER is
   * not a row-write distinction in this phase. This prop exists because
   * the header must still honour whatever access answer the caller
   * resolves (and 37.2 may narrow that answer for the destination doors
   * this header's right-hand slot is reserved for) — it is a real prop
   * this component obeys, not a case exercised by any 37.1 caller today.
   */
  canEdit: boolean
  /** Fires after a title PATCH the server accepted. */
  onTitleChange?: (title: string) => void
  /** Fires after a vocal-state PATCH the server accepted. */
  onVocalStateChange?: (vocalState: WorkVocalState) => void
}

export function WorkHeader({
  workId,
  title,
  ownerHandle,
  contributorNames,
  splitsStatus,
  vocalState,
  primaryPerformerLabel,
  canEdit,
  onTitleChange,
  onVocalStateChange,
}: WorkHeaderProps) {
  const [localTitle, setLocalTitle] = useState(title)
  const [localVocalState, setLocalVocalState] = useState<WorkVocalState>(vocalState)
  const [savingVocal, setSavingVocal] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the local echo in sync when the parent refreshes with a newer
  // server value (e.g. another tab, or a collaborator's own edit).
  useEffect(() => {
    setLocalTitle(title)
  }, [title])
  useEffect(() => {
    setLocalVocalState(vocalState)
  }, [vocalState])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    []
  )

  async function saveTitle(next: string) {
    const trimmed = next.trim()
    if (!trimmed) return // PatchWorkSchema refuses an empty title server-side too; skip the round-trip
    const res = await fetch(`/api/works/${workId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    })
    if (res.ok) onTitleChange?.(trimmed)
    // RENAME RULE: identity is the work id, never the title. A failed
    // PATCH here leaves the input showing the artist's in-progress text —
    // nothing about "who this song is" was ever at stake, only its
    // presentation, so this deliberately does not roll the input back on
    // failure (the artist is still mid-thought; the next debounce tick
    // retries with whatever they've typed since).
  }

  // RENAME RULE, implemented here (sketch 006-A's own words, "lyrics
  // saving automatically · every edit timestamped" — this is the same
  // pattern applied to the title). Identity is the work id; the title is
  // presentation. That is why this is a bare, borderless, live input with
  // no save button rather than a form: renaming is free at any time, and
  // migration 138's capture_work_rename_event() trigger (fired by plan
  // 05's PATCH route) diaries every change with BOTH the old and new
  // title, so a collaborator who still remembers "Late Drive" can find
  // "Midnight" by searching the diary. Graduation (37.2) carries whatever
  // the title is at that moment into the release, where it takes its
  // final form.
  function handleTitleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setLocalTitle(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void saveTitle(next)
    }, TITLE_SAVE_DEBOUNCE_MS)
  }

  async function handleVocalStateSelect(next: WorkVocalState) {
    if (!canEdit || next === localVocalState || savingVocal) return
    const previous = localVocalState
    setSavingVocal(true)
    setLocalVocalState(next)
    try {
      const res = await fetch(`/api/works/${workId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vocal_state: next }),
      })
      if (res.ok) {
        onVocalStateChange?.(next)
      } else {
        setLocalVocalState(previous)
      }
    } catch {
      setLocalVocalState(previous)
    } finally {
      setSavingVocal(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-[12px] border border-hair bg-card px-5 py-[18px]">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.16em] text-lavdim">Unreleased work</p>

        <input
          type="text"
          aria-label="Song title"
          value={localTitle}
          disabled={!canEdit}
          onChange={handleTitleInput}
          className="mt-0.5 w-full border-b border-transparent bg-transparent text-[22px] font-extrabold leading-tight text-white outline-none transition focus:border-hairstrong disabled:cursor-default"
        />

        {/* Identity line — owner handle, contributor names, splits status.
            Matches sketch 001's header row. No percentage sits beside any
            name here, ever (CAT-Q1a) — see splitsStatus's own doc comment
            above. */}
        <div className="mt-[7px] flex flex-wrap items-center gap-[6px]">
          <span className={CHIP_CLASS}>@{ownerHandle}</span>
          {contributorNames.map(name => (
            <span key={name} className={CHIP_CLASS}>
              {name}
            </span>
          ))}
          <span className={CHIP_SPLITS_CLASS}>Splits: {splitsStatus}</span>
        </div>

        {/* The three-state vocal control (DEFAULT-PERFORMER RULE). */}
        <div className="mt-4">
          <div role="group" aria-label="Vocal setting" className="inline-flex gap-1.5">
            {VOCAL_STATE_OPTIONS.map(opt => {
              const active = localVocalState === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={active}
                  onClick={() => handleVocalStateSelect(opt.value)}
                  className={[
                    'rounded-[9px] border px-[11px] py-[5px] text-[11.5px] font-semibold transition disabled:cursor-default',
                    active
                      ? 'border-brandindigo/50 bg-brandindigo/10 text-white'
                      : 'border-hairstrong bg-lav/[.04] text-lav hover:text-white',
                  ].join(' ')}
                >
                  <span aria-hidden="true">{opt.glyph}</span> {opt.label}
                </button>
              )
            })}
          </div>

          {/* Each state does real work and gets its own line — this is
              deliberately not decoration, it's the fact the state sets. */}
          {localVocalState === 'primary' && (
            <p className="mt-[7px] text-[11.5px] text-lavdim">
              🎤 primary performer: {primaryPerformerLabel ? `@${primaryPerformerLabel}` : 'you'} —
              sections inherit unless tagged.
            </p>
          )}
          {localVocalState === 'varies' && (
            <p className="mt-[7px] text-[11.5px] text-lavdim">
              Varies — per-block 🎤 tags in the pad decide who sings each section.
            </p>
          )}
          {localVocalState === 'instrumental' && (
            // INSTRUMENTAL IS NOT COSMETIC. Every who-sings prompt
            // disappears and blocks stay pure structure in producer
            // vocabulary (Intro/Drop/Bridge, never "who sings this");
            // the Crate vocal check passes BY CONSTRUCTION, because
            // there are no vocals for the hard no to trigger on; DDEX
            // exports omit vocal performer roles entirely; and this is
            // the exact same fact as an 'instrumental' label anywhere
            // else in the product — not a separate, weaker claim.
            <p className="mt-[7px] text-[11.5px] text-lavdim">
              Instrumental — no vocals. Every who-sings prompt disappears, and this song passes
              the Crate vocal check by definition.
            </p>
          )}

          <div className="mt-2">
            <LearnWhy label="Why does inheritance work this way?">
              {/* Guardrail 1: a default fills the PLAN, never the
                  RECORD. Folded behind LearnWhy rather than printed
                  inline — see components/ui/LearnWhy.tsx's own doctrine
                  comment: what stays visible is the rule (the line
                  above), what collapses is the why. */}
              <p className="text-[11.5px] text-lavdim">
                The default just fills in who&apos;s likely singing, so you don&apos;t have to tag
                every section — it&apos;s a plan, not a credit. Nobody&apos;s credited for a part
                until a real recording actually has them performing it.
              </p>
              {/* Guardrail 2: an AI vocal can never hide under the
                  default. */}
              <p className="text-[11.5px] text-lavdim">
                AI vocals can&apos;t hide behind the default either — adding audio always asks
                whether it&apos;s AI, and what you declare wins over the default.
              </p>
            </LearnWhy>
          </div>
        </div>
      </div>

      {/* Right-hand slot, deliberately empty. Sketch 004's destination
          lights (Crate / Release / Registration / Distribution) are
          37.2 — reserving the slot here means that surface mounts
          without a layout rewrite when it lands. */}
      <div aria-hidden="true" className="hidden shrink-0 sm:block sm:w-0" />
    </div>
  )
}
