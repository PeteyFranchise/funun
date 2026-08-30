'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ComposerCard, ComposerCardEmptyState } from './ComposerCard'
import { GuidingLine } from './GuidingLine'
import { DiaryFeed, type DiaryFeedEntry } from './DiaryFeed'
import { WorkHeader } from './WorkHeader'
import { WorkRoster, type WorkRosterMember } from './WorkRoster'
import { LyricsPad, type LyricsPadBlock } from './LyricsPad'
import { HumCaptureButton } from './HumCaptureButton'
import { HumFirstMoment } from './HumFirstMoment'
import { ReauthorPrompt } from './ReauthorPrompt'
import { AiEntryFlow, type AiEntryFlowResult } from './AiEntryFlow'
import { pickSupportedMimeType } from '@/lib/catalogue/hum-capture'
import type { GuidingLineStep } from '@/lib/catalogue/guiding-line'
import type { AiEntryComponent } from '@/lib/catalogue/ai-entries'
import type { WorkTier } from '@/lib/catalogue/membership'
import type { LyricBlockType, PerformerRef, WorkVersion, WorkVocalState } from '@/types/catalogue'

// ─── WorkPage — the composer room, assembled (37-12) ───────────────────
// The client shell every plan-08-through-11 component mounts into, and
// the ONLY place any of them mount. This component never fetches to
// RENDER anything — every prop below comes from
// app/(artist)/vault/works/[workId]/page.tsx's own server-side load. It
// DOES originate writes (the four verbs, the pad's edits, the roster's
// own mutations run inside WorkHeader/WorkRoster themselves) — that is
// the same "component owns its own mutation" shape those two components
// already established in plan 11, not a violation of the page/component
// fetch boundary, which is about READS.
//
// LAYOUT (locked, do not "simplify" later): desktop is sketch 001-C — a
// two-column grid, versions sticky left, diary right, the header
// spanning above both. Mobile is 001-A — a single stream defaulting to
// the diary, reached alongside the version cards through a Diary|
// Versions toggle (001-B survives ONLY as this toggle's second tab, per
// catalogue-hygiene-ui.md's own "what was tried and rejected" note).
//
// ORDER (005-C's rule, structural): WorkHeader, then the composer, then
// AT MOST one GuidingLine, then the diary. Creation leads; the song gets
// one sentence; the diary follows clean.
//
// HYGIENE MOMENTS fire INSIDE the add flows (005-C), never beside them —
// the small state machine below (`Flow`) is what makes that true: there
// is no separate "hygiene chore" screen, only transitions an add flow
// walks through on its way back to a quiet page.

export type VersionCardData = {
  id: string
  /** "v4" — deriveVersionNumerals()'s own display string, from the server. */
  display: string
  description: string
  /** An ai_entries row exists at level='version' pointing at this take. */
  isAiTagged: boolean
  /** Signed server-side (plan 06) — this component never constructs one. */
  playbackUrl: string | null
  durationSeconds: number | null
}

export type WorkPageProps = {
  workId: string
  songTitle: string
  /** No versions AND no blocks — the empty-state pitch renders instead of the composer + guiding line. */
  isEmpty: boolean
  header: {
    title: string
    ownerHandle: string
    contributorNames: string[]
    splitsStatus: string
    vocalState: WorkVocalState
    primaryPerformerLabel: string | null
    canEdit: boolean
  }
  roster: {
    members: WorkRosterMember[]
    viewerTier: WorkTier | null
    viewerIsOwner: boolean
  }
  /** resolveGuidingLine()'s own return — a single step or null, already resolved server-side. */
  guidingLineStep: GuidingLineStep | null
  diaryEntries: DiaryFeedEntry[]
  versions: VersionCardData[]
  lyricsBlocks: LyricsPadBlock[]
  vocalState: WorkVocalState
  /** Account-wide — isFirstEverAiEntry()'s own input, fed straight through to AiEntryFlow. */
  priorAiEntryCount: number
  /** True once the hum-first moment has already run for THIS song (cookie, or this work already has an AI entry on record). */
  hasHumFirstFired: boolean
  /**
   * Test seam only — forces the breakpoint treatment for a deterministic,
   * single-pass render with no jsdom/matchMedia in this repo's Jest
   * environment. A production caller never sets this; the real viewport
   * is detected client-side after mount (see the effect below).
   */
  initialViewport?: 'mobile' | 'desktop'
}

// ─── Guiding-line / hum-first cookies — the WRITE side ──────────────────
// See app/(artist)/vault/works/[workId]/page.tsx's own header comment for
// the full rationale (37.1 has no dedicated column/table for this state;
// cookies are the simplest durable place that needs no migration). THIS
// file is the only place that writes them — a Server Component can only
// read. Same shared-cookie shape as lib/selects/viewer-cookie.ts.
function dismissedCookieName(workId: string) {
  return `catalogue_gl_dismissed_${workId}`
}
function firedCookieName(workId: string) {
  return `catalogue_gl_fired_${workId}`
}
function humFirstCookieName(workId: string) {
  return `catalogue_hum_first_${workId}`
}

function readCookieList(name: string): string[] {
  if (typeof document === 'undefined') return []
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  if (!match) return []
  try {
    return decodeURIComponent(match[1]!)
      .split(',')
      .filter(Boolean)
  } catch {
    return []
  }
}

function appendCookieValue(name: string, value: string) {
  if (typeof document === 'undefined') return
  const current = readCookieList(name)
  if (current.includes(value)) return
  const next = [...current, value]
  document.cookie = `${name}=${encodeURIComponent(next.join(','))};path=/;max-age=31536000;samesite=lax`
}

function setHumFirstCookie(workId: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${humFirstCookieName(workId)}=1;path=/;max-age=31536000;samesite=lax`
}

// ─── The flow state machine — every hygiene moment lives here ──────────

type Flow =
  | { kind: 'hum' }
  | { kind: 'hum-first'; pendingVersionId: string | null }
  | { kind: 'ai-question'; versionId: string | null }
  | { kind: 'ai-entry'; versionId: string | null; humanSourceVersionId: string | null }
  | { kind: 'reauthor'; headline: string; component: AiEntryComponent }
  | { kind: 'note' }
  | { kind: 'add-singer'; blockId: string }

function FlowOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/80 px-6 py-10">
      {children}
    </div>
  )
}

function VersionsList({ versions }: { versions: VersionCardData[] }) {
  if (versions.length === 0) {
    return <p className="text-[11px] text-lavdim">No takes yet.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {versions.map(v => (
        <div key={v.id} className="rounded-[10px] border border-hair bg-card px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <b className="text-[12px] text-white">
              {v.display} {v.description}
            </b>
            {v.isAiTagged && <span className="text-[11px] text-blue-400">AI</span>}
          </div>
          {v.playbackUrl && (
            <audio controls src={v.playbackUrl} className="mt-1.5 h-8 w-full" />
          )}
        </div>
      ))}
    </div>
  )
}

function AiInvolvedPrompt({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <FlowOverlay>
      <div className="w-full max-w-[380px] rounded-[12px] border border-hair bg-card px-6 py-6 text-center">
        <p className="mb-1 text-[13px] font-semibold text-white">Was AI involved in that add?</p>
        <p className="mb-4 text-[11px] text-lavdim">
          Asked here, once, as part of adding — never a separate chore.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onYes}
            className="rounded-[9px] bg-grad px-[13px] py-[7px] text-[12px] font-semibold text-white shadow-cta"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={onNo}
            className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
          >
            No
          </button>
        </div>
      </div>
    </FlowOverlay>
  )
}

function NoteComposer({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string) => Promise<{ ok: boolean; error?: string }>
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    const result = await onSubmit(trimmed)
    setSaving(false)
    if (!result.ok) setError(result.error ?? 'Could not save the note')
  }

  return (
    <div className="w-full max-w-[420px] rounded-[12px] border border-hair bg-card px-6 py-6">
      <p className="mb-3 text-[13px] font-semibold text-white">Add a note</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        placeholder="Anything worth remembering about this song"
        className="w-full resize-none rounded-[10px] border border-hair bg-transparent px-3 py-2 text-[13px] text-white outline-none placeholder:text-lavdim"
      />
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || !text.trim()}
          onClick={() => void submit()}
          className="rounded-[9px] bg-grad px-[13px] py-[7px] text-[12px] font-semibold text-white shadow-cta disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </div>
  )
}

function AddSingerPicker({
  onPick,
  onCancel,
}: {
  onPick: (performer: PerformerRef) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  return (
    <div className="w-full max-w-[360px] rounded-[12px] border border-hair bg-card px-6 py-6">
      <p className="mb-1 text-[13px] font-semibold text-white">Who sings this?</p>
      <p className="mb-4 text-[11px] text-lavdim">
        Declares a credit — it moves who&apos;s shown, never the splits.
      </p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Name"
        className="w-full rounded-lg border border-hairstrong bg-card2 px-3 py-2 text-[13px] text-white outline-none placeholder:text-lavdim/60"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onPick({ kind: 'guest', name: name.trim() })}
          className="rounded-[9px] bg-grad px-[13px] py-[7px] text-[12px] font-semibold text-white shadow-cta disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  )
}

export function WorkPage({
  workId,
  songTitle,
  isEmpty,
  header,
  roster,
  guidingLineStep,
  diaryEntries,
  versions,
  lyricsBlocks,
  vocalState,
  priorAiEntryCount,
  hasHumFirstFired,
  initialViewport,
}: WorkPageProps) {
  const router = useRouter()

  const [flow, setFlow] = useState<Flow | null>(null)
  const [humFirstFired, setHumFirstFiredState] = useState(hasHumFirstFired)
  // Capture support is asked of the platform (never the user agent) —
  // pickSupportedMimeType() (plan 09/lib/catalogue/hum-capture.ts). This
  // starts false (matching what the server can ever know) and is
  // corrected once, client-side, after mount — avoiding an SSR/hydration
  // mismatch at the cost of a one-frame flash on unsupported browsers,
  // which are rare.
  const [supportsCapture, setSupportsCapture] = useState(false)
  useEffect(() => {
    setSupportsCapture(pickSupportedMimeType() !== null)
  }, [])

  // Desktop is 001-C, mobile is 001-A — decided treatments, not a guess.
  // `initialViewport` is a test-only seam (mirrors this codebase's
  // existing isTypeSupported/initialResult convention): when set, the
  // real matchMedia detection below never runs, so a single render is
  // fully deterministic with no jsdom in this repo's Jest environment.
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>(initialViewport ?? 'desktop')
  const [mobileTab, setMobileTab] = useState<'diary' | 'versions'>('diary')
  useEffect(() => {
    if (initialViewport) return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(min-width: 1024px)')
    const update = () => setViewport(mql.matches ? 'desktop' : 'mobile')
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [initialViewport])

  const lyricsRef = useRef<HTMLDivElement | null>(null)
  const rosterRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Gate 1 of the guiding line's own cadence rule (lib/catalogue/
  // guiding-line.ts): a splits step must fire AT MOST ONCE per
  // contributor, ever — firing IS the cadence event, dismissal is only a
  // courtesy on top of it. The server can compute the step but cannot
  // write the "fired for" cookie mid-render (Server Components only
  // read); this effect is what actually records the firing, the moment
  // the step is shown.
  useEffect(() => {
    if (guidingLineStep?.key === 'splits' && guidingLineStep.contributorIdentity) {
      appendCookieValue(firedCookieName(workId), guidingLineStep.contributorIdentity)
    }
  }, [workId, guidingLineStep?.key, guidingLineStep?.contributorIdentity])

  function markHumFirstFired() {
    if (humFirstFired) return
    setHumFirstFiredState(true)
    setHumFirstCookie(workId)
  }

  function scrollToLyrics() {
    lyricsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function scrollToRoster() {
    rosterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ─── The AI question, inline (005-C) — fires after an add, never as a
  // separate chore ───────────────────────────────────────────────────
  function requestAiQuestion(versionId: string | null) {
    setFlow({ kind: 'ai-question', versionId })
  }

  function handleAiYes(versionId: string | null) {
    if (!humFirstFired) {
      setFlow({ kind: 'hum-first', pendingVersionId: versionId })
    } else {
      setFlow({ kind: 'ai-entry', versionId, humanSourceVersionId: null })
    }
  }

  // ─── The four verbs ─────────────────────────────────────────────────

  function handleHum() {
    setFlow({ kind: 'hum' })
  }

  function triggerAddAudio() {
    fileInputRef.current?.click()
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('source', 'upload')
      const res = await fetch(`/api/works/${workId}/versions`, { method: 'POST', body: form })
      const body = (await res.json().catch(() => ({}))) as { data?: WorkVersion; error?: string }
      if (!res.ok || !body.data) return
      router.refresh()
      requestAiQuestion(body.data.id)
    } catch {
      // Best effort — a failed upload just leaves the composer as it was;
      // the artist can retry the same verb.
    }
  }

  // ─── The pad's mutations — every one PATCHes/POSTs plan 07's routes,
  // then refreshes the server data (numerals, the diary, the guiding
  // line all come from the server; a local guess would drift) ────────

  async function postBlocks(body: Record<string, unknown>) {
    const res = await fetch(`/api/works/${workId}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) router.refresh()
  }

  function handleInsertSingle(blockType: LyricBlockType, index: number | undefined, customLabel?: string) {
    void postBlocks({ kind: 'single', block_type: blockType, index, custom_label: customLabel })
  }

  function handleInsertRepeat(sourceBlockId: string, index: number | undefined) {
    const source = lyricsBlocks.find(b => b.id === sourceBlockId)
    if (!source) return
    void postBlocks({ kind: 'repeat', block_type: source.block_type, source_block_id: sourceBlockId, index })
  }

  function handlePasteImport(text: string) {
    void postBlocks({ kind: 'paste', text })
  }

  async function handleTextChange(blockId: string, text: string) {
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (res.ok) router.refresh()
  }

  async function handleDetach(blockId: string) {
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detach: true }),
    })
    if (res.ok) router.refresh()
  }

  async function handleReorder(order: { id: string; position: number }[]) {
    const res = await fetch(`/api/works/${workId}/blocks/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? "Couldn't save the new order — try again.")
    }
    router.refresh()
  }

  async function handleAddSingerPick(blockId: string, performer: PerformerRef) {
    const block = lyricsBlocks.find(b => b.id === blockId)
    setFlow(null)
    if (!block) return
    const nextPerformers = [...block.performers, performer]
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ performers: nextPerformers }),
    })
    if (res.ok) router.refresh()
  }

  // ─── Guiding line ───────────────────────────────────────────────────

  function handleGuidingLineDoIt(step: GuidingLineStep) {
    if (step.actionTarget === 'hum') {
      handleHum()
    } else if (step.actionTarget === 'splits') {
      scrollToRoster()
    }
  }

  function handleGuidingLineDismiss(step: GuidingLineStep) {
    // Splits dismissals are namespaced per contributor — see
    // lib/catalogue/guiding-line.ts's own `splits:${identityKey}` check.
    const key =
      step.key === 'splits' && step.contributorIdentity ? `splits:${step.contributorIdentity}` : step.key
    appendCookieValue(dismissedCookieName(workId), key)
    router.refresh()
  }

  return (
    <div>
      <WorkHeader
        workId={workId}
        title={header.title}
        ownerHandle={header.ownerHandle}
        contributorNames={header.contributorNames}
        splitsStatus={header.splitsStatus}
        vocalState={header.vocalState}
        primaryPerformerLabel={header.primaryPerformerLabel}
        canEdit={header.canEdit}
        // Both PATCHes fire a diary row via migration 138's own triggers
        // (rename / vocal-state is not diaried itself, but the pad's
        // inheritance-affecting facts downstream may read stale without a
        // refresh) — refresh rather than hand-patch, per this plan's own
        // rule that anything the database derives is the server's to say.
        onTitleChange={() => router.refresh()}
        onVocalStateChange={() => router.refresh()}
      />

      {/* Creation leads (005-C): the composer (or its empty-state pitch),
          then AT MOST one guiding line, then the diary. */}
      <div className="mt-4">
        {isEmpty ? (
          <ComposerCardEmptyState
            onHumYourIdea={handleHum}
            onStartWithLyrics={scrollToLyrics}
            supportsCapture={supportsCapture}
            onAddAudio={triggerAddAudio}
          />
        ) : (
          <>
            <ComposerCard
              onHum={handleHum}
              onWriteLyrics={scrollToLyrics}
              onAddAudio={triggerAddAudio}
              onNote={() => setFlow({ kind: 'note' })}
              supportsCapture={supportsCapture}
            />
            <GuidingLine
              step={guidingLineStep}
              onDoIt={handleGuidingLineDoIt}
              onDismiss={handleGuidingLineDismiss}
            />
          </>
        )}
      </div>

      {/* ── Versions + diary — 001-C two columns (desktop) / 001-A single
          stream with a Diary|Versions toggle (mobile). ──────────────── */}
      <div className="mt-6">
        {viewport === 'desktop' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr] lg:items-start">
            <div className="lg:sticky lg:top-4">
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-lavdim">Versions</p>
              <VersionsList versions={versions} />
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-lavdim">Diary</p>
              <DiaryFeed entries={diaryEntries} layout="compact" />
            </div>
          </div>
        ) : (
          <div>
            <div
              role="tablist"
              aria-label="Diary or versions"
              className="mb-3 inline-flex rounded-[10px] border border-hair bg-card2 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'diary'}
                onClick={() => setMobileTab('diary')}
                className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold ${
                  mobileTab === 'diary' ? 'bg-card text-white' : 'text-lavdim'
                }`}
              >
                Diary
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'versions'}
                onClick={() => setMobileTab('versions')}
                className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold ${
                  mobileTab === 'versions' ? 'bg-card text-white' : 'text-lavdim'
                }`}
              >
                Versions
              </button>
            </div>
            {mobileTab === 'diary' ? (
              <DiaryFeed entries={diaryEntries} layout="rail" />
            ) : (
              <VersionsList versions={versions} />
            )}
          </div>
        )}
      </div>

      {/* ── The pad — the other half of what an artist owns. ─────────── */}
      <div ref={lyricsRef} className="mt-8">
        <p className="mb-2 text-[13px] font-semibold text-white">Lyrics</p>
        <LyricsPad
          blocks={lyricsBlocks}
          vocalState={vocalState}
          onHum={handleHum}
          onTextChange={handleTextChange}
          onAddSinger={blockId => setFlow({ kind: 'add-singer', blockId })}
          onDetach={blockId => void handleDetach(blockId)}
          onInsertSingle={handleInsertSingle}
          onInsertRepeat={handleInsertRepeat}
          onReorder={handleReorder}
          onPasteImport={handlePasteImport}
        />
      </div>

      {/*
        ── Who's on this song — membership + the living split sheet. ──
        Suppressed on the empty state on purpose: ComposerCardEmptyState's
        hero already spends this page's one gradient (the "🎙 Hum your
        idea" button), and a canManage viewer's WorkRoster spends its own
        ("Send invite") the moment it renders. The empty state IS the
        pitch (ComposerCard.tsx's own header comment) — a brand-new song's
        very first screen should not simultaneously present a membership
        panel competing with it, and mounting WorkRoster only once the
        song has content keeps this page's single-gradient budget true in
        every reachable state, not just the steady one.
      */}
      {!isEmpty && (
        <div ref={rosterRef} className="mt-8">
          <WorkRoster
            workId={workId}
            members={roster.members}
            viewerTier={roster.viewerTier}
            viewerIsOwner={roster.viewerIsOwner}
            // A new member or a writer promotion both move facts the
            // guiding line's own snapshot depends on
            // (writersMissingFromSheet, the splits chip) — refresh rather
            // than hand-patch.
            onMemberAdded={() => router.refresh()}
            onWriterPromoted={() => router.refresh()}
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={e => void handleFileChosen(e)}
      />

      {/* ── The hygiene moments — every one fires INSIDE an add flow ─── */}

      {flow?.kind === 'hum' && (
        <FlowOverlay>
          <div className="w-full max-w-[380px] rounded-[12px] border border-hair bg-card px-6 py-6 text-center">
            <p className="mb-4 text-[13px] font-semibold text-white">Hum it in</p>
            <HumCaptureButton
              workId={workId}
              onCaptured={version => {
                router.refresh()
                requestAiQuestion(version.id)
              }}
            />
            <button
              type="button"
              onClick={() => setFlow(null)}
              className="mt-4 border-0 bg-transparent p-0 text-[11px] text-lavdim hover:text-white"
            >
              Cancel
            </button>
          </div>
        </FlowOverlay>
      )}

      {flow?.kind === 'ai-question' && (
        <AiInvolvedPrompt onYes={() => handleAiYes(flow.versionId)} onNo={() => setFlow(null)} />
      )}

      {/* The once-per-song deliberate minute (003-B) — mounted before this
          song's FIRST AI entry, gated by `humFirstFired` above, never
          again after. */}
      {flow?.kind === 'hum-first' && (
        <HumFirstMoment
          workId={workId}
          songTitle={songTitle}
          onCaptured={version => {
            markHumFirstFired()
            router.refresh()
            setFlow({ kind: 'ai-entry', versionId: flow.pendingVersionId, humanSourceVersionId: version.id })
          }}
          onAttachExisting={() => {
            markHumFirstFired()
            setFlow({ kind: 'ai-entry', versionId: flow.pendingVersionId, humanSourceVersionId: null })
          }}
          onSkip={() => {
            markHumFirstFired()
            setFlow({ kind: 'ai-entry', versionId: flow.pendingVersionId, humanSourceVersionId: null })
          }}
        />
      )}

      {flow?.kind === 'ai-entry' && (
        <FlowOverlay>
          <div className="w-full max-w-[480px]">
            <AiEntryFlow
              workId={workId}
              songTitle={songTitle}
              priorAiEntryCount={priorAiEntryCount}
              versionId={flow.versionId}
              humanSourceVersionId={flow.humanSourceVersionId}
              onFiled={(result: AiEntryFlowResult) => {
                router.refresh()
                if (result.guidance) {
                  // The re-author moment, mounted where the artist meets
                  // THIS entry (right after filing it) — never stapled
                  // onto a diary row (DiaryFeed's own header comment).
                  setFlow({
                    kind: 'reauthor',
                    headline: `${result.data.component} — this song's newest AI contribution`,
                    component: result.data.component,
                  })
                } else {
                  setFlow(null)
                }
              }}
              onCancel={() => setFlow(null)}
            />
          </div>
        </FlowOverlay>
      )}

      {flow?.kind === 'reauthor' && (
        <FlowOverlay>
          <div className="w-full max-w-[420px]">
            <ReauthorPrompt
              entryHeadline={flow.headline}
              onReauthor={() => {
                const component = flow.component
                setFlow(null)
                if (component === 'lyric') scrollToLyrics()
                else handleHum()
              }}
              onKeepAsIs={() => setFlow(null)}
            />
          </div>
        </FlowOverlay>
      )}

      {flow?.kind === 'note' && (
        <FlowOverlay>
          <NoteComposer
            onSubmit={async text => {
              const res = await fetch(`/api/works/${workId}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
              })
              if (res.ok) {
                router.refresh()
                setFlow(null)
                return { ok: true }
              }
              const body = (await res.json().catch(() => ({}))) as { error?: string }
              return { ok: false, error: body.error }
            }}
            onCancel={() => setFlow(null)}
          />
        </FlowOverlay>
      )}

      {flow?.kind === 'add-singer' && (
        <FlowOverlay>
          <AddSingerPicker
            onPick={performer => void handleAddSingerPick(flow.blockId, performer)}
            onCancel={() => setFlow(null)}
          />
        </FlowOverlay>
      )}
    </div>
  )
}
