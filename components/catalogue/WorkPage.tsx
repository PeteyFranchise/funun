'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ComposerCard, ComposerCardEmptyState } from './ComposerCard'
import { GuidingLine } from './GuidingLine'
import { DiaryFeed, type DiaryFeedEntry } from './DiaryFeed'
import { WorkHeader } from './WorkHeader'
import { WorkRoster, type WorkRosterMember } from './WorkRoster'
import { LyricsPad, type LyricsPadBlock, type WriterRoomModule } from './LyricsPad'
import { LyricCommentsPanel } from './LyricCommentsPanel'
import { LyricSuggestionPanel } from './LyricSuggestionPanel'
import { LyricHistoryPanel } from './LyricHistoryPanel'
import { HumCaptureButton } from './HumCaptureButton'
import { HumFirstMoment } from './HumFirstMoment'
import { ReauthorPrompt } from './ReauthorPrompt'
import { AiEntryFlow, type AiEntryFlowResult } from './AiEntryFlow'
import { WriterRoomPresence, type WriterRoomLiveHandle } from './WriterRoomPresence'
import { SongPassportPanel } from './SongPassportPanel'
import { SingerPicker } from './SingerPicker'
import { TimedTrackPlayer } from './TimedTrackPlayer'
import { ExistingTakePicker } from './ExistingTakePicker'
import { VersionComparisonPanel, type ComparableVersion } from './VersionComparisonPanel'
import { RecordOverBeatStudio } from './RecordOverBeatStudio'
import { ReturnedMixReviewCard, type ReturnedMixReviewItem } from './ReturnedMixReviewCard'
import { ProducerHandoffTimeline, type ProducerHandoffTimelineItem } from './ProducerHandoffTimeline'
import { LyricLiftPanel } from './LyricLiftPanel'
import { StudioNotes } from './StudioNotes'
import { pickSupportedMimeType } from '@/lib/catalogue/hum-capture'
import { AUDIO_FILE_ACCEPT } from '@/lib/catalogue/audio-mime'
import { uploadWorkVersion } from '@/lib/catalogue/version-upload-client'
import { deriveBlockNumerals } from '@/lib/catalogue/blocks'
import type { GuidingLineStep } from '@/lib/catalogue/guiding-line'
import type { RoomActivity, RoomActivityKind, RoomPresencePerson } from '@/lib/catalogue/room-presence'
import {
  activeLocksByBlock,
  normalizeCollaborationHint,
  normalizeLyricSectionLock,
  sectionLockView,
  type LyricSectionLock,
} from '@/lib/catalogue/room-collaboration'
import { AI_ENTRY_COMPONENT_LABELS, type AiEntryComponent } from '@/lib/catalogue/ai-entries'
import { eligibleEarlierTakes } from '@/lib/catalogue/human-source-takes'
import type { WorkTier } from '@/lib/catalogue/membership'
import type {
  LyricBlock,
  LyricBlockCommentView,
  LyricBlockSnapshotView,
  LyricBlockSuggestionView,
  LyricBlockType,
  LyricCommentParticipant,
  PerformerRef,
  StudioNoteThreadView,
  WorkVocalState,
} from '@/types/catalogue'
import type { SongPassportView } from '@/lib/song-passport/view'
import type { SingerCandidate } from '@/lib/catalogue/singer-options'
import { workingTakeFirst } from '@/lib/catalogue/take-workflow'
import type { ReturnedMixReviewOutcome } from '@/lib/catalogue/returned-mix-review'
import type { LyricLiftView } from '@/lib/catalogue/lyric-lift'
import type { WriterRoomLayout } from '@/lib/catalogue/writer-room-layout'

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
// LAYOUT (approved 2026-09-04): the writing surface is a private hybrid
// grid. Lyric blocks, Versions, and Diary may be reordered and may take a
// full or half desktop row; phones always stack one column. That layout is
// presentation only. Canonical lyric positions still use the reorder RPC,
// version numbering remains chronological, and Diary events never reorder.
//
// ORDER (005-C's rule, structural): WorkHeader, presence + compact people
// controls, then the composer, then AT MOST one GuidingLine, then the hybrid
// writing surface. Creation still leads; reference modules move only inside
// that surface and never become gates in front of writing.
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
  label?: string | null
  /** An ai_entries row exists at level='version' pointing at this take. */
  isAiTagged: boolean
  /** Signed server-side (plan 06) — this component never constructs one. */
  playbackUrl: string | null
  /** Same private signed object with a safe Content-Disposition filename. */
  downloadUrl?: string | null
  durationSeconds: number | null
  createdAt: string
  source?: 'hum' | 'upload' | 'recording'
  archivedAt?: string | null
  canManage?: boolean
  recordingSessionStatus?: 'draft' | 'saved' | null
  isWorking?: boolean
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
  /** Specific people available to the vocal-plan picker; does not grant any access or credit by itself. */
  singerCandidates: SingerCandidate[]
  presence: {
    viewer: RoomPresencePerson
    people: RoomPresencePerson[]
  }
  /** Whole-song, audio-moment, and lyric-section discussions in one facade. */
  studioNotes?: StudioNoteThreadView[]
  /** Current room members eligible for explicit @ notifications. */
  studioNoteParticipants?: LyricCommentParticipant[]
  /** resolveGuidingLine()'s own return — a single step or null, already resolved server-side. */
  guidingLineStep: GuidingLineStep | null
  diaryEntries: DiaryFeedEntry[]
  versions: VersionCardData[]
  /** Unreviewed producer returns only. Review is optional and never gates the room. */
  returnedMixReviews?: ReturnedMixReviewItem[]
  /** Current and prior production rounds, newest first. Every action remains optional. */
  producerHandoffs?: ProducerHandoffTimelineItem[]
  highlightedHandoffId?: string | null
  /** Notification deep-link target; expands and reveals the matching Studio Note. */
  highlightedStudioNoteId?: string | null
  lyricsBlocks: LyricsPadBlock[]
  suggestionCounts?: Record<string, number>
  vocalState: WorkVocalState
  /** Account-wide — isFirstEverAiEntry()'s own input, fed straight through to AiEntryFlow. */
  priorAiEntryCount: number
  /** True once the hum-first moment has already run for THIS song (cookie, or this work already has an AI entry on record). */
  hasHumFirstFired: boolean
  /** undefined keeps the feature entirely absent; null renders the owner-start state. */
  songPassport?: SongPassportView | null
  /** Latest queued, review-ready, or failed transcription draft for this room. */
  lyricLift?: LyricLiftView | null
  /** Private per-viewer presentation state; never authoritative song data. */
  roomLayout?: WriterRoomLayout | null
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

function createLockSessionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// ─── The flow state machine — every hygiene moment lives here ──────────

type Flow =
  | { kind: 'hum' }
  | { kind: 'hum-first'; pendingVersionId: string | null }
  | { kind: 'ai-question'; versionId: string | null }
  | { kind: 'ai-entry'; versionId: string | null; humanSourceVersionId: string | null }
  | { kind: 'reauthor'; headline: string; component: AiEntryComponent }
  | { kind: 'add-singer'; blockId: string }
  | { kind: 'existing-take'; targetVersionId: string | null }
  | { kind: 'compare-versions'; preferredVersionId?: string }
  | { kind: 'record-over'; version: VersionCardData & { playbackUrl: string } }
  | { kind: 'lyric-lift-offer'; versionId: string }

type LyricHistoryState = {
  blockId: string
  label: string
  currentText: string
  snapshots: LyricBlockSnapshotView[]
  loading: boolean
  error: string | null
  restoringId: string | null
}

type LyricCommentsState = {
  blockId: string
  label: string
  comments: LyricBlockCommentView[]
  participants: LyricCommentParticipant[]
  loading: boolean
  error: string | null
  saving: boolean
  resolvingId: string | null
}

type LyricSuggestionsState = {
  blockId: string
  label: string
  currentText: string
  suggestions: LyricBlockSuggestionView[]
  participants: LyricCommentParticipant[]
  loading: boolean
  saving: boolean
  error: string | null
}

function FlowOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/80 px-6 py-10">
      {children}
    </div>
  )
}

// A tiny confirmation toast — plain text, self-dismissing, with a jump to
// where the thing landed. Deliberately NOT the SelectsPlayer toast, which
// renders through an HTML sink (the audit's L-01); this takes a string and
// renders it as a text node.
export function Toast({
  message,
  onView,
  onDismiss,
}: {
  message: string
  onView: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        role="status"
        className="flex items-center gap-3 rounded-[11px] border border-hairstrong bg-card2 px-4 py-2.5 shadow-2xl"
      >
        <span className="text-[12px] text-white">{message}</span>
        <button
          type="button"
          onClick={onView}
          className="text-[12px] font-semibold text-brandindigo hover:text-white"
        >
          View ↓
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-[13px] leading-none text-lavdim hover:text-lav"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function VersionsList({
  workId,
  versions,
  onActivity,
  commentRefreshes,
  onCommentChanged,
  onCompare,
  onRecordOver,
  onPullLyrics,
  onTakeManaged,
  onTakeRenamed,
  onWorkingTake,
  draftOwnerId,
}: {
  workId: string
  versions: VersionCardData[]
  onActivity: (kind: RoomActivityKind, label?: string) => void
  commentRefreshes: Record<string, number>
  onCommentChanged: (versionId: string) => void
  onCompare: () => void
  onRecordOver: (version: VersionCardData & { playbackUrl: string }) => void
  onPullLyrics: (versionId: string) => void
  onTakeManaged: (versionId: string, archived: boolean) => Promise<void>
  onTakeRenamed: (versionId: string, label: string) => Promise<{ ok: boolean; error?: string }>
  onWorkingTake: (versionId: string) => Promise<{ ok: boolean; error?: string }>
  draftOwnerId: string
}) {
  if (versions.length === 0) {
    return <p className="text-[11px] text-lavdim">No takes yet.</p>
  }
  const chronologicalActiveVersions = versions.filter(version => !version.archivedAt)
  const activeVersions = workingTakeFirst(chronologicalActiveVersions, versions.find(version => version.isWorking)?.id ?? null)
  const latestVersionId = chronologicalActiveVersions[0]?.id ?? null
  const archivedVersions = versions.filter(version => version.archivedAt)
  return (
    <div className="flex flex-col gap-2">
      {activeVersions.filter(version => version.playbackUrl).length >= 2 && (
        <button
          type="button"
          onClick={onCompare}
          className="mb-1 rounded-[9px] border border-hairstrong bg-card2 px-3 py-2 text-[11px] font-semibold text-brandindigo hover:border-brandindigo hover:text-white"
        >
          ⇄ Compare two takes
        </button>
      )}
      {activeVersions.map(v => v.playbackUrl ? (
        <TimedTrackPlayer
          key={v.id}
          workId={workId}
          versionId={v.id}
          display={v.display}
          description={v.description}
          label={v.label ?? null}
          playbackUrl={v.playbackUrl}
          downloadUrl={v.downloadUrl ?? null}
          durationSeconds={v.durationSeconds}
          isLatest={v.id === latestVersionId}
          isWorking={Boolean(v.isWorking)}
          isAiTagged={v.isAiTagged}
          refreshToken={commentRefreshes[v.id] ?? 0}
          onActivity={playing => onActivity(playing ? 'listening' : 'recently_active', playing ? v.display : undefined)}
          onCommentChanged={() => onCommentChanged(v.id)}
          onRecordOver={() => onRecordOver({ ...v, playbackUrl: v.playbackUrl! })}
          onPullLyrics={v.source === 'upload' ? () => onPullLyrics(v.id) : undefined}
          onArchive={v.canManage ? () => onTakeManaged(v.id, true) : undefined}
          onRename={label => onTakeRenamed(v.id, label)}
          onMakeWorking={() => onWorkingTake(v.id)}
          recordOverLabel={v.recordingSessionStatus === 'draft'
            ? '↻ Resume vocal draft'
            : v.recordingSessionStatus === 'saved'
              ? '✎ Edit vocal session'
              : '● Record over this beat'}
          draftOwnerId={draftOwnerId}
        />
      ) : (
        <div key={v.id} className="rounded-[10px] border border-hair bg-card px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <b className="text-[12px] text-white">{v.display} {v.description}</b>
            {v.isAiTagged && <span className="text-[11px] text-blue-400">AI</span>}
          </div>
          <p className="mt-1 text-[10px] text-lavdim">Playback is unavailable for this take.</p>
        </div>
      ))}
      {archivedVersions.length > 0 && (
        <details className="mt-2 rounded-[10px] border border-hair bg-card/60 px-3 py-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-lavdim">Archived takes ({archivedVersions.length})</summary>
          <div className="mt-2 space-y-2 border-t border-hair pt-2">
            {archivedVersions.map(version => (
              <div key={version.id} className="flex items-center justify-between gap-3 rounded-[8px] bg-card2 px-3 py-2">
                <span className="min-w-0 truncate text-[10px] text-lav"><b className="text-white">{version.display}</b> {version.description}</span>
                <span className="flex shrink-0 items-center gap-3">
                  {version.downloadUrl && <a href={version.downloadUrl} download aria-label={`Download archived ${version.display} ${version.description}`} className="text-[10px] text-lavdim hover:text-white">Download</a>}
                  {version.canManage && <button type="button" onClick={() => void onTakeManaged(version.id, false)} className="text-[10px] font-semibold text-brandindigo hover:text-white">Restore</button>}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
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

export function WorkPage({
  workId,
  songTitle,
  isEmpty,
  header,
  roster,
  singerCandidates,
  presence,
  studioNotes = [],
  studioNoteParticipants = [],
  guidingLineStep,
  diaryEntries,
  versions,
  returnedMixReviews = [],
  producerHandoffs = [],
  highlightedHandoffId = null,
  highlightedStudioNoteId = null,
  lyricsBlocks,
  suggestionCounts = {},
  vocalState,
  priorAiEntryCount,
  hasHumFirstFired,
  songPassport,
  lyricLift = null,
  roomLayout = null,
}: WorkPageProps) {
  const router = useRouter()

  const [flow, setFlow] = useState<Flow | null>(null)
  const [roomActivity, setRoomActivity] = useState<RoomActivity>(() => ({
    kind: 'in_room',
    label: null,
    updatedAt: new Date().toISOString(),
  }))
  const activityTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const liveRoomRef = useRef<WriterRoomLiveHandle | null>(null)
  const lockSessionRef = useRef<string | null>(null)
  const [liveLyricsBlocks, setLiveLyricsBlocks] = useState<LyricsPadBlock[]>(lyricsBlocks)
  const [sectionLocks, setSectionLocks] = useState<Record<string, LyricSectionLock>>({})
  const [activeLockBlockId, setActiveLockBlockId] = useState<string | null>(null)
  const [lyricHistory, setLyricHistory] = useState<LyricHistoryState | null>(null)
  const [lyricComments, setLyricComments] = useState<LyricCommentsState | null>(null)
  const [lyricSuggestions, setLyricSuggestions] = useState<LyricSuggestionsState | null>(null)
  const [liveSuggestionCounts, setLiveSuggestionCounts] = useState<Record<string, number>>(suggestionCounts)
  const [trackCommentRefreshes, setTrackCommentRefreshes] = useState<Record<string, number>>({})
  const [studioNoteComposerOpen, setStudioNoteComposerOpen] = useState(false)
  const [studioNoteDeepLinkOpen, setStudioNoteDeepLinkOpen] = useState(Boolean(highlightedStudioNoteId))
  const [activeLyricLift, setActiveLyricLift] = useState<LyricLiftView | null>(lyricLift)
  const [lyricLiftStartError, setLyricLiftStartError] = useState<string | null>(null)
  const [lyricLiftStartingVersionId, setLyricLiftStartingVersionId] = useState<string | null>(null)
  const roomLayoutSaveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const handleLyricLiftChange = useCallback((next: LyricLiftView) => {
    setActiveLyricLift(next)
  }, [])

  const handleRoomLayoutChange = useCallback((next: WriterRoomLayout): Promise<void> => {
    const save = async () => {
      const response = await fetch(`/api/works/${workId}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (response.ok) return
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? "Couldn't save your room layout — try again.")
    }

    // A quick drag followed by a width change must land in the same order the
    // viewer made them. Serializing these tiny JSON writes prevents a slower
    // older response from overwriting the newest layout.
    const queued = roomLayoutSaveQueueRef.current.catch(() => undefined).then(save)
    roomLayoutSaveQueueRef.current = queued
    return queued
  }, [workId])

  useEffect(() => {
    setLiveLyricsBlocks(lyricsBlocks)
  }, [lyricsBlocks])

  useEffect(() => {
    setLiveSuggestionCounts(suggestionCounts)
  }, [suggestionCounts])

  useEffect(() => {
    setActiveLyricLift(lyricLift)
  }, [lyricLift])

  const lockSessionId = useCallback(() => {
    lockSessionRef.current ??= createLockSessionId()
    return lockSessionRef.current
  }, [])

  const refreshSectionLocks = useCallback(async () => {
    const res = await fetch(`/api/works/${workId}/locks`, { cache: 'no-store' })
    if (!res.ok) return
    const body = (await res.json().catch(() => ({}))) as { data?: unknown[] }
    setSectionLocks(activeLocksByBlock(body.data ?? []))
  }, [workId])

  const refreshLyricBlock = useCallback(
    async (blockId: string) => {
      const res = await fetch(`/api/works/${workId}/blocks/${blockId}`, { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json().catch(() => ({}))) as { data?: LyricBlock }
      if (!body.data) return
      setLiveLyricsBlocks(current =>
        current.map(block => (block.id === blockId ? { ...block, ...body.data } : block))
      )
      setLyricHistory(current =>
        current?.blockId === blockId ? { ...current, currentText: body.data!.text } : current
      )
      setLyricSuggestions(current => current?.blockId === blockId ? {
        ...current,
        currentText: body.data!.text,
        suggestions: current.suggestions.map(suggestion => ({
          ...suggestion,
          isStale: suggestion.status === 'pending' && suggestion.baseText !== body.data!.text,
        })),
      } : current)
    },
    [workId]
  )

  const fetchLyricComments = useCallback(
    async (blockId: string) => {
      const res = await fetch(`/api/works/${workId}/blocks/${blockId}/comments`, {
        cache: 'no-store',
      })
      const body = (await res.json().catch(() => ({}))) as {
        data?: LyricBlockCommentView[]
        participants?: LyricCommentParticipant[]
        error?: string
      }
      return {
        ok: res.ok,
        comments: res.ok && Array.isArray(body.data) ? body.data : [],
        participants: res.ok && Array.isArray(body.participants) ? body.participants : [],
        error: res.ok ? null : (body.error ?? 'Could not load comments for this section.'),
      }
    },
    [workId]
  )

  const refreshLyricComments = useCallback(
    async (blockId: string) => {
      const result = await fetchLyricComments(blockId)
      setLyricComments(current => {
        if (!current || current.blockId !== blockId) return current
        return {
          ...current,
          comments: result.comments,
          participants: result.participants,
          loading: false,
          error: result.error,
        }
      })
    },
    [fetchLyricComments]
  )

  const fetchLyricSuggestions = useCallback(async (blockId: string) => {
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}/suggestions`, { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as {
      data?: LyricBlockSuggestionView[]
      participants?: LyricCommentParticipant[]
      currentText?: string
      error?: string
    }
    return {
      ok: res.ok,
      suggestions: res.ok && Array.isArray(body.data) ? body.data : [],
      participants: res.ok && Array.isArray(body.participants) ? body.participants : [],
      currentText: res.ok && typeof body.currentText === 'string' ? body.currentText : null,
      error: res.ok ? null : (body.error ?? 'Could not load alternate lyrics.'),
    }
  }, [workId])

  const refreshLyricSuggestions = useCallback(async (blockId: string) => {
    const result = await fetchLyricSuggestions(blockId)
    if (result.ok) {
      setLiveSuggestionCounts(current => ({
        ...current,
        [blockId]: result.suggestions.filter(suggestion => suggestion.status === 'pending').length,
      }))
    }
    setLyricSuggestions(current => {
      if (!current || current.blockId !== blockId) return current
      return {
        ...current,
        currentText: result.currentText ?? current.currentText,
        suggestions: result.suggestions,
        participants: result.participants,
        loading: false,
        error: result.error,
      }
    })
  }, [fetchLyricSuggestions])

  const handleLiveHint = useCallback(
    (kind: 'lock_changed' | 'lyric_saved' | 'comment_changed' | 'suggestion_changed' | 'track_comment_changed', payload: unknown) => {
      const hint = normalizeCollaborationHint(kind, payload)
      if (!hint) return
      if (hint.kind === 'lock_changed') void refreshSectionLocks()
      else if (hint.kind === 'lyric_saved') void refreshLyricBlock(hint.blockId)
      else if (hint.kind === 'comment_changed') {
        void refreshLyricComments(hint.blockId)
        router.refresh()
      } else if (hint.kind === 'suggestion_changed') {
        void refreshLyricSuggestions(hint.blockId)
        void refreshLyricBlock(hint.blockId)
        router.refresh()
      } else if (hint.kind === 'track_comment_changed') {
        setTrackCommentRefreshes(current => ({
          ...current,
          [hint.versionId]: (current[hint.versionId] ?? 0) + 1,
        }))
      }
    },
    [refreshLyricBlock, refreshLyricComments, refreshLyricSuggestions, refreshSectionLocks, router]
  )

  const handleRoomResync = useCallback(() => {
    void refreshSectionLocks()
    liveLyricsBlocks.forEach(block => void refreshLyricBlock(block.id))
    setTrackCommentRefreshes(current => Object.fromEntries(
      versions.map(version => [version.id, (current[version.id] ?? 0) + 1])
    ))
  }, [liveLyricsBlocks, refreshLyricBlock, refreshSectionLocks, versions])

  function announceTrackCommentChanged(versionId: string) {
    void liveRoomRef.current?.broadcast('track_comment_changed', { versionId })
  }

  useEffect(() => {
    void refreshSectionLocks()
    const expirySweep = setInterval(() => {
      setSectionLocks(current => activeLocksByBlock(Object.values(current)))
    }, 5_000)
    const canonicalReconciliation = setInterval(() => void refreshSectionLocks(), 10_000)
    return () => {
      clearInterval(expirySweep)
      clearInterval(canonicalReconciliation)
    }
  }, [refreshSectionLocks])

  useEffect(() => {
    if (!activeLockBlockId) return
    const renew = async () => {
      if (document.visibilityState !== 'visible') return
      const res = await fetch(`/api/works/${workId}/blocks/${activeLockBlockId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: lockSessionId(), takeover: false }),
      })
      const body = (await res.json().catch(() => ({}))) as { data?: { lock?: unknown } }
      const lock = normalizeLyricSectionLock(body.data?.lock)
      if (!res.ok || !lock) {
        setActiveLockBlockId(current => (current === activeLockBlockId ? null : current))
        void refreshSectionLocks()
        return
      }
      setSectionLocks(current => ({ ...current, [activeLockBlockId]: lock }))
    }
    const renewal = setInterval(() => void renew(), 10_000)
    return () => clearInterval(renewal)
  }, [activeLockBlockId, lockSessionId, refreshSectionLocks, workId])

  function announceRoomActivity(kind: RoomActivityKind, label?: string) {
    activityTimersRef.current.forEach(clearTimeout)
    activityTimersRef.current = []
    setRoomActivity({ kind, label: label ?? null, updatedAt: new Date().toISOString() })

    if (kind === 'editing_lyrics' || kind === 'listening') {
      activityTimersRef.current.push(
        setTimeout(
          () => setRoomActivity({ kind: 'recently_active', label: null, updatedAt: new Date().toISOString() }),
          10_000
        ),
        setTimeout(
          () => setRoomActivity({ kind: 'in_room', label: null, updatedAt: new Date().toISOString() }),
          30_000
        )
      )
    }
  }

  useEffect(
    () => () => {
      activityTimersRef.current.forEach(clearTimeout)
    },
    []
  )
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

  const lyricsRef = useRef<HTMLDivElement | null>(null)
  const lyricLiftRef = useRef<HTMLDivElement | null>(null)
  const rosterRef = useRef<HTMLDivElement | null>(null)
  const diaryRef = useRef<HTMLDivElement | null>(null)
  const studioNotesRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [audioUploadPhase, setAudioUploadPhase] = useState<'preparing' | 'uploading' | 'finalizing' | null>(null)
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null)

  // A brief, self-dismissing confirmation. A saved note lands in the diary,
  // which now sits below the pad and can be collapsed — without this it can
  // read as "vanished". Plain text only (no HTML sink — the audit's L-01).
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showToast(message: string) {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    },
    []
  )

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

  function scrollToDiary() {
    diaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function openStudioNotes() {
    setStudioNoteComposerOpen(true)
  }

  useEffect(() => {
    if (!studioNoteComposerOpen && !studioNoteDeepLinkOpen) return
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        studioNotesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [studioNoteComposerOpen, studioNoteDeepLinkOpen])

  useEffect(() => {
    if (highlightedStudioNoteId) setStudioNoteDeepLinkOpen(true)
  }, [highlightedStudioNoteId])

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
    setAudioUploadError(null)
    fileInputRef.current?.click()
  }

  async function startLyricLift(versionId: string): Promise<boolean> {
    if (lyricLiftStartingVersionId) return false
    setLyricLiftStartingVersionId(versionId)
    setLyricLiftStartError(null)
    try {
      const response = await fetch(`/api/works/${workId}/versions/${versionId}/lyric-lift`, {
        method: 'POST',
      })
      const body = (await response.json().catch(() => ({}))) as { data?: LyricLiftView; error?: string }
      if (!response.ok || !body.data) {
        setLyricLiftStartError(body.error ?? 'Could not start Lyric Lift.')
        return false
      }
      setActiveLyricLift(body.data)
      window.requestAnimationFrame(() => lyricLiftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return true
    } catch {
      setLyricLiftStartError('Could not reach Lyric Lift. Check your connection and try again.')
      return false
    } finally {
      setLyricLiftStartingVersionId(null)
    }
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAudioUploadError(null)
    try {
      const version = await uploadWorkVersion({
        workId,
        file,
        fileName: file.name,
        source: 'upload',
        onPhase: setAudioUploadPhase,
      })
      router.refresh()
      setFlow({ kind: 'lyric-lift-offer', versionId: version.id })
    } catch (cause) {
      setAudioUploadError(
        cause instanceof Error && cause.message ? cause.message : 'Could not upload that audio file. Please try again.'
      )
    } finally {
      setAudioUploadPhase(null)
    }
  }

  async function handleTakeManaged(versionId: string, archived: boolean) {
    const response = await fetch(`/api/works/${workId}/versions/${versionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    })
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) {
      showToast(body.error ?? `Could not ${archived ? 'archive' : 'restore'} that take.`)
      return
    }
    router.refresh()
    showToast(archived ? 'Take archived — its history is still safe' : 'Take restored')
  }

  async function handleTakeRenamed(versionId: string, label: string): Promise<{ ok: boolean; error?: string }> {
    const response = await fetch(`/api/works/${workId}/versions/${versionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
    })
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) return { ok: false, error: body.error ?? 'Could not rename that take.' }
    showToast(label.trim() ? 'Take renamed' : 'Take name cleared')
    router.refresh()
    return { ok: true }
  }

  async function handleWorkingTake(versionId: string): Promise<{ ok: boolean; error?: string }> {
    const response = await fetch(`/api/works/${workId}/versions/${versionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ working: true }),
    })
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) return { ok: false, error: body.error ?? 'Could not choose that working take.' }
    showToast('Working take updated — this is a creative choice, not a master approval')
    router.refresh()
    return { ok: true }
  }

  async function handleReturnedMixReview(
    returnId: string,
    outcome: ReturnedMixReviewOutcome
  ): Promise<{ ok: boolean; error?: string }> {
    const response = await fetch(`/api/producer-returns/${returnId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    })
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) return { ok: false, error: body.error ?? 'Could not save this returned-mix review.' }
    showToast(outcome === 'made_working'
      ? 'Returned mix is now the working take — not a master approval'
      : 'Review saved — the returned take remains available')
    router.refresh()
    return { ok: true }
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
    const source = liveLyricsBlocks.find(b => b.id === sourceBlockId)
    if (!source) return
    void postBlocks({ kind: 'repeat', block_type: source.block_type, source_block_id: sourceBlockId, index })
  }

  function handlePasteImport(text: string) {
    void postBlocks({ kind: 'paste', text })
  }

  async function handleBeginSectionEdit(blockId: string, takeover = false): Promise<boolean> {
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: lockSessionId(), takeover }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      data?: { granted?: boolean; lock?: unknown }
    }
    const lock = normalizeLyricSectionLock(body.data?.lock)
    if (lock) setSectionLocks(current => ({ ...current, [blockId]: lock }))
    if (!res.ok || body.data?.granted !== true || !lock) return false

    setActiveLockBlockId(blockId)
    const block = deriveBlockNumerals(liveLyricsBlocks).find(candidate => candidate.id === blockId)
    announceRoomActivity('editing_lyrics', block?.label)
    void liveRoomRef.current?.broadcast('lock_changed', { blockId })
    return true
  }

  async function handleEndSectionEdit(blockId: string): Promise<void> {
    const sessionId = lockSessionRef.current
    if (!sessionId) return
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}/lock`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    if (!res.ok) return
    setSectionLocks(current => {
      if (current[blockId]?.sessionId !== sessionId) return current
      const next = { ...current }
      delete next[blockId]
      return next
    })
    setActiveLockBlockId(current => (current === blockId ? null : current))
    announceRoomActivity('recently_active')
    void liveRoomRef.current?.broadcast('lock_changed', { blockId })
  }

  async function handleTextChange(blockId: string, text: string): Promise<boolean> {
    const sessionId = lockSessionRef.current
    if (!sessionId) return false
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lock_session_id: sessionId }),
    })
    const body = (await res.json().catch(() => ({}))) as { data?: LyricBlock }
    if (!res.ok || !body.data) {
      if (res.status === 409) {
        setActiveLockBlockId(current => (current === blockId ? null : current))
        void refreshSectionLocks()
      }
      return false
    }
    const updated = body.data
    setLiveLyricsBlocks(current =>
      current.map(block => (block.id === blockId ? { ...block, ...updated } : block))
    )
    const block = deriveBlockNumerals(liveLyricsBlocks).find(candidate => candidate.id === blockId)
    announceRoomActivity('editing_lyrics', block?.label)
    void liveRoomRef.current?.broadcast('lyric_saved', { blockId })
    return true
  }

  async function handleOpenLyricHistory(blockId: string, label: string, currentText: string) {
    setLyricComments(null)
    setLyricSuggestions(null)
    setLyricHistory({
      blockId,
      label,
      currentText,
      snapshots: [],
      loading: true,
      error: null,
      restoringId: null,
    })

    const res = await fetch(`/api/works/${workId}/blocks/${blockId}/snapshots`, { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as {
      data?: LyricBlockSnapshotView[]
      currentText?: string
      error?: string
    }
    setLyricHistory(current => {
      if (!current || current.blockId !== blockId) return current
      return {
        ...current,
        currentText: res.ok && typeof body.currentText === 'string' ? body.currentText : current.currentText,
        snapshots: res.ok && Array.isArray(body.data) ? body.data : [],
        loading: false,
        error: res.ok ? null : (body.error ?? 'Could not load this section’s recovery history.'),
      }
    })
  }

  async function handleOpenLyricComments(blockId: string, label: string) {
    setLyricHistory(null)
    setLyricSuggestions(null)
    setLyricComments({
      blockId,
      label,
      comments: [],
      participants: [],
      loading: true,
      error: null,
      saving: false,
      resolvingId: null,
    })
    await refreshLyricComments(blockId)
  }

  async function handleOpenLyricSuggestions(blockId: string, label: string, currentText: string) {
    setLyricHistory(null)
    setLyricComments(null)
    setLyricSuggestions({
      blockId,
      label,
      currentText,
      suggestions: [],
      participants: [],
      loading: true,
      saving: false,
      error: null,
    })
    await refreshLyricSuggestions(blockId)
  }

  async function handleCreateLyricSuggestion(proposedText: string, note: string | null): Promise<boolean> {
    const panel = lyricSuggestions
    if (!panel) return false
    setLyricSuggestions(current => current ? { ...current, saving: true, error: null } : current)
    try {
      const res = await fetch(`/api/works/${workId}/blocks/${panel.blockId}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposedText, note }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setLyricSuggestions(current => current ? {
          ...current,
          saving: false,
          error: body.error ?? 'Could not share alternate lyrics.',
        } : current)
        return false
      }
      await refreshLyricSuggestions(panel.blockId)
      setLyricSuggestions(current => current ? { ...current, saving: false } : current)
      void liveRoomRef.current?.broadcast('suggestion_changed', { blockId: panel.blockId })
      showToast(`${panel.label} alternate shared`)
      return true
    } catch {
      setLyricSuggestions(current => current ? {
        ...current,
        saving: false,
        error: 'Could not share alternate lyrics. Try again.',
      } : current)
      return false
    }
  }

  async function handleLyricSuggestionDecision(
    suggestionId: string,
    action: 'accept' | 'decline'
  ): Promise<boolean> {
    const panel = lyricSuggestions
    if (!panel) return false
    setLyricSuggestions(current => current ? { ...current, saving: true, error: null } : current)
    try {
      const res = await fetch(
        `/api/works/${workId}/blocks/${panel.blockId}/suggestions/${suggestionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      )
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        const friendlyError = res.status === 409 && body.error?.includes('lyric_block_busy')
          ? 'Someone is editing this section. Wait until they finish, then accept the alternate.'
          : res.status === 409 && body.error?.includes('suggestion_stale')
            ? 'The lyric changed after this suggestion was made. Keep it for reference or create a fresh alternate.'
            : res.status === 409 && body.error?.includes('suggestion_author_unavailable')
              ? 'The writer who made this suggestion is no longer available, so it cannot be assigned as the canonical lyric.'
            : body.error ?? 'Could not update this alternate.'
        setLyricSuggestions(current => current ? { ...current, saving: false, error: friendlyError } : current)
        return false
      }

      await refreshLyricSuggestions(panel.blockId)
      if (action === 'accept') await refreshLyricBlock(panel.blockId)
      setLyricSuggestions(current => current ? { ...current, saving: false } : current)
      void liveRoomRef.current?.broadcast('suggestion_changed', { blockId: panel.blockId })
      if (action === 'accept') void liveRoomRef.current?.broadcast('lyric_saved', { blockId: panel.blockId })
      router.refresh()
      showToast(action === 'accept'
        ? `${panel.label} updated — the previous lyric is safe in History`
        : 'Alternate kept in the record and marked not used')
      return true
    } catch {
      setLyricSuggestions(current => current ? {
        ...current,
        saving: false,
        error: 'Could not update this alternate. Your current lyric is unchanged.',
      } : current)
      return false
    }
  }

  async function handleSubmitLyricComment(
    body: string,
    parentCommentId: string | null
  ): Promise<boolean> {
    const panel = lyricComments
    if (!panel) return false
    setLyricComments(current => current ? { ...current, saving: true, error: null } : current)
    try {
      const res = await fetch(`/api/works/${workId}/blocks/${panel.blockId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parentCommentId }),
      })
      const response = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setLyricComments(current => current ? {
          ...current,
          saving: false,
          error: response.error ?? 'Could not post this comment.',
        } : current)
        return false
      }
      await refreshLyricComments(panel.blockId)
      setLyricComments(current => current ? { ...current, saving: false } : current)
      void liveRoomRef.current?.broadcast('comment_changed', { blockId: panel.blockId })
      router.refresh()
      return true
    } catch {
      setLyricComments(current => current ? {
        ...current,
        saving: false,
        error: 'Could not post this comment. Try again.',
      } : current)
      return false
    }
  }

  async function handleSetLyricCommentResolved(
    commentId: string,
    resolved: boolean
  ): Promise<boolean> {
    const panel = lyricComments
    if (!panel) return false
    setLyricComments(current => current ? { ...current, resolvingId: commentId, error: null } : current)
    try {
      const res = await fetch(
        `/api/works/${workId}/blocks/${panel.blockId}/comments/${commentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolved }),
        }
      )
      const response = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setLyricComments(current => current ? {
          ...current,
          resolvingId: null,
          error: response.error ?? 'Could not update this comment thread.',
        } : current)
        return false
      }
      await refreshLyricComments(panel.blockId)
      setLyricComments(current => current ? { ...current, resolvingId: null } : current)
      void liveRoomRef.current?.broadcast('comment_changed', { blockId: panel.blockId })
      router.refresh()
      return true
    } catch {
      setLyricComments(current => current ? {
        ...current,
        resolvingId: null,
        error: 'Could not update this comment thread. Try again.',
      } : current)
      return false
    }
  }

  async function handleRestoreLyricSnapshot(snapshotId: string) {
    const history = lyricHistory
    if (!history) return

    setLyricHistory(current => current ? { ...current, restoringId: snapshotId, error: null } : current)
    const acquired = await handleBeginSectionEdit(history.blockId)
    if (!acquired) {
      setLyricHistory(current => current ? {
        ...current,
        restoringId: null,
        error: 'Another writer is editing this section. Wait until it is free, then restore.',
      } : current)
      return
    }

    const sessionId = lockSessionRef.current
    if (!sessionId) {
      await handleEndSectionEdit(history.blockId).catch(() => undefined)
      setLyricHistory(current => current ? {
        ...current,
        restoringId: null,
        error: 'Could not reserve this section for the restore.',
      } : current)
      return
    }

    try {
      const res = await fetch(
        `/api/works/${workId}/blocks/${history.blockId}/snapshots/${snapshotId}/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        }
      )
      const body = (await res.json().catch(() => ({}))) as { data?: LyricBlock; error?: string }
      if (!res.ok || !body.data) {
        setLyricHistory(current => current ? {
          ...current,
          restoringId: null,
          error: body.error ?? 'Could not restore this lyric version.',
        } : current)
        return
      }

      const restored = body.data
      setLiveLyricsBlocks(current =>
        current.map(block => (block.id === history.blockId ? { ...block, ...restored } : block))
      )
      void liveRoomRef.current?.broadcast('lyric_saved', { blockId: history.blockId })
      router.refresh()
      setLyricHistory(null)
      showToast(`${history.label} restored — the version it replaced is still in history`)
    } catch {
      setLyricHistory(current => current ? {
        ...current,
        restoringId: null,
        error: 'Could not restore this lyric version. Your current words are unchanged.',
      } : current)
    } finally {
      await handleEndSectionEdit(history.blockId).catch(() => undefined)
    }
  }

  async function handleDetach(blockId: string) {
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detach: true }),
    })
    if (res.ok) router.refresh()
  }

  async function handleRemoveNote(eventId: string) {
    // Only a note, only your own — the route re-checks both. A clean
    // removal: refresh re-pulls the diary without it, and a toast confirms
    // so it doesn't read as a silent disappearance.
    const res = await fetch(`/api/works/${workId}/notes/${eventId}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
      showToast('Note removed')
    }
  }

  async function handleRemoveBlock(blockId: string) {
    // Plan-07's DELETE renumbers the survivors and, via migration 135's
    // ON DELETE SET NULL, turns any repeat of this block into an ordinary
    // empty block — the refresh re-pulls both, so no local guess is made.
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}`, {
      method: 'DELETE',
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
    const byId = new Map(liveLyricsBlocks.map(block => [block.id, block] as const))
    setLiveLyricsBlocks(order.flatMap(({ id, position }) => {
      const block = byId.get(id)
      return block ? [{ ...block, position }] : []
    }))
  }

  async function patchVocalPlan(blockId: string, patch: { performers?: PerformerRef[]; vocal_direction?: string | null }) {
    const res = await fetch(`/api/works/${workId}/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'Could not save the vocal plan.')
    }
    setFlow(null)
    router.refresh()
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

  const lockViews = Object.fromEntries(
    liveLyricsBlocks.map(block => [
      block.id,
      sectionLockView(
        sectionLocks[block.id],
        presence.viewer.userId,
        lockSessionRef.current,
        presence.people
      ),
    ])
  )
  const activeSingerBlock =
    flow?.kind === 'add-singer'
      ? liveLyricsBlocks.find(block => block.id === flow.blockId) ?? null
      : null
  const comparableVersions: ComparableVersion[] = versions.flatMap(version => version.playbackUrl && !version.archivedAt
    ? [{
        id: version.id,
        display: version.display,
        description: version.description,
        playbackUrl: version.playbackUrl,
        durationSeconds: version.durationSeconds,
        createdAt: version.createdAt,
      }]
    : [])
  const activeVersionCount = versions.filter(version => !version.archivedAt).length
  const openStudioNoteCount = studioNotes.filter(note => note.resolvedAt === null).length
  const roomModules: WriterRoomModule[] = [
    {
      key: 'module:versions',
      label: 'Versions',
      description: `${activeVersionCount} active ${activeVersionCount === 1 ? 'take' : 'takes'}`,
      content: (
        <VersionsList
          workId={workId}
          versions={versions}
          onActivity={announceRoomActivity}
          commentRefreshes={trackCommentRefreshes}
          onCommentChanged={announceTrackCommentChanged}
          onCompare={() => setFlow({ kind: 'compare-versions' })}
          onRecordOver={version => setFlow({ kind: 'record-over', version })}
          onPullLyrics={versionId => void startLyricLift(versionId)}
          onTakeManaged={handleTakeManaged}
          onTakeRenamed={handleTakeRenamed}
          onWorkingTake={handleWorkingTake}
          draftOwnerId={presence.viewer.userId}
        />
      ),
    },
    {
      key: 'module:diary',
      label: 'Diary',
      description: 'Chronological song history',
      content: (
        <div ref={diaryRef}>
          <DiaryFeed
            entries={diaryEntries}
            layout="compact"
            collapseAfter={6}
            onRemoveNote={eventId => void handleRemoveNote(eventId)}
          />
        </div>
      ),
    },
    {
      key: 'module:notes',
      label: 'Studio Notes',
      description: `${openStudioNoteCount} open ${openStudioNoteCount === 1 ? 'thread' : 'threads'}`,
      content: (
        <div ref={studioNotesRef}>
          <StudioNotes
            workId={workId}
            viewerUserId={presence.viewer.userId}
            notes={studioNotes}
            participants={studioNoteParticipants}
            versions={versions
              .filter(version => !version.archivedAt)
              .map(version => ({
                id: version.id,
                label: `${version.display} ${version.description}`.trim(),
                durationSeconds: version.durationSeconds,
              }))}
            lyricBlocks={deriveBlockNumerals(liveLyricsBlocks).map(block => ({ id: block.id, label: block.label }))}
            composerOpen={studioNoteComposerOpen}
            onComposerOpenChange={setStudioNoteComposerOpen}
            highlightedNoteId={highlightedStudioNoteId}
            onChanged={() => {
              announceRoomActivity('recently_active')
              router.refresh()
            }}
          />
        </div>
      ),
    },
  ]

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

      <WriterRoomPresence
        ref={liveRoomRef}
        workId={workId}
        viewer={presence.viewer}
        people={presence.people}
        activity={roomActivity}
        onLiveHint={handleLiveHint}
        onResync={handleRoomResync}
      />

      {/* Compact by default and close to live presence: room access,
          ownership, and invitations are available without occupying the
          whole creative surface. Only one section expands at a time. */}
      {!isEmpty && (
        <div ref={rosterRef} className="mt-4">
          <WorkRoster
            workId={workId}
            members={roster.members}
            viewerTier={roster.viewerTier}
            viewerIsOwner={roster.viewerIsOwner}
            onMemberAdded={() => router.refresh()}
            onWriterPromoted={() => router.refresh()}
          />
        </div>
      )}

      {songPassport !== undefined && (
        <SongPassportPanel
          workId={workId}
          passport={songPassport}
          viewerIsOwner={roster.viewerIsOwner}
          recordingVersions={versions.map(version => ({ id: version.id, label: `${version.display} ${version.description}`.trim() }))}
          songTitle={songTitle}
        />
      )}

      {/* Creation leads (005-C): the composer (or its empty-state pitch),
          then AT MOST one guiding line, then the diary. */}
      <div className="mt-4">
        {isEmpty ? (
          <ComposerCardEmptyState
            onHumYourIdea={handleHum}
            onStartWithLyrics={scrollToLyrics}
            onNote={openStudioNotes}
            supportsCapture={supportsCapture}
            onAddAudio={triggerAddAudio}
          />
        ) : (
          <>
            <ComposerCard
              onHum={handleHum}
              onWriteLyrics={scrollToLyrics}
              onAddAudio={triggerAddAudio}
              onNote={openStudioNotes}
              supportsCapture={supportsCapture}
            />
            <GuidingLine
              step={guidingLineStep}
              onDoIt={handleGuidingLineDoIt}
              onDismiss={handleGuidingLineDismiss}
            />
          </>
        )}
        {audioUploadPhase && (
          <p role="status" className="mt-2 text-[11px] text-lavdim">
            {audioUploadPhase === 'preparing'
              ? 'Preparing your upload…'
              : audioUploadPhase === 'uploading'
                ? 'Uploading audio…'
                : 'Saving the take…'}
          </p>
        )}
        {audioUploadError && (
          <p role="alert" className="mt-2 text-[11px] text-red-300">
            {audioUploadError}
          </p>
        )}
        {lyricLiftStartError && (
          <p role="alert" className="mt-2 text-[11px] text-red-300">
            {lyricLiftStartError}
          </p>
        )}
        <ReturnedMixReviewCard
          items={returnedMixReviews}
          canCompare={comparableVersions.length >= 2}
          hasWorkingTake={versions.some(version => version.isWorking && !version.archivedAt)}
          onCompare={versionId => setFlow({ kind: 'compare-versions', preferredVersionId: versionId })}
          onReview={handleReturnedMixReview}
        />
        <ProducerHandoffTimeline
          items={producerHandoffs}
          highlightedHandoffId={highlightedHandoffId}
          onCompare={(_handoffId, versionId) => setFlow({ kind: 'compare-versions', preferredVersionId: versionId })}
        />
      </div>

      {activeLyricLift && (
        <div ref={lyricLiftRef}>
          <LyricLiftPanel
            workId={workId}
            lift={activeLyricLift}
            sourceVersion={versions.find(version => version.id === activeLyricLift.versionId) ?? null}
            hasExistingLyrics={liveLyricsBlocks.length > 0}
            onChange={handleLyricLiftChange}
            onApplied={(applied, importedCount) => {
              setActiveLyricLift(applied)
              router.refresh()
              showToast(`${importedCount} ${importedCount === 1 ? 'section' : 'sections'} added — review writer credits when you’re ready`)
            }}
            onDiscarded={() => {
              setActiveLyricLift(null)
              showToast('Lyric draft discarded — the recording is still here')
            }}
          />
        </div>
      )}

      {/* Approved hybrid room: lyric blocks and the two reference modules
          share one personal grid. Their arrangement is presentation only;
          lyric reorder, take order, and Diary chronology keep their own
          authoritative persistence paths. */}
      <div ref={lyricsRef} className="mt-6">
        <p className="mb-2 text-[13px] font-semibold text-white">Writing surface</p>
        <LyricsPad
          blocks={liveLyricsBlocks}
          draftOwnerId={presence.viewer.userId}
          vocalState={vocalState}
          onHum={handleHum}
          onTextChange={handleTextChange}
          sectionLocks={lockViews}
          onBeginEdit={handleBeginSectionEdit}
          onEndEdit={handleEndSectionEdit}
          onOpenHistory={(blockId, label, currentText) => void handleOpenLyricHistory(blockId, label, currentText)}
          onOpenComments={(blockId, label) => void handleOpenLyricComments(blockId, label)}
          onOpenSuggestions={(blockId, label, currentText) => void handleOpenLyricSuggestions(blockId, label, currentText)}
          suggestionCounts={liveSuggestionCounts}
          onRemoveBlock={blockId => void handleRemoveBlock(blockId)}
          onAddSinger={blockId => setFlow({ kind: 'add-singer', blockId })}
          onDetach={blockId => void handleDetach(blockId)}
          onInsertSingle={handleInsertSingle}
          onInsertRepeat={handleInsertRepeat}
          onReorder={handleReorder}
          onPasteImport={handlePasteImport}
          roomModules={roomModules}
          roomLayout={roomLayout}
          onRoomLayoutChange={handleRoomLayoutChange}
          expandedRoomModuleKey={studioNoteComposerOpen || studioNoteDeepLinkOpen ? 'module:notes' : null}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_FILE_ACCEPT}
        className="hidden"
        disabled={audioUploadPhase !== null}
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

      {flow?.kind === 'lyric-lift-offer' && (
        <FlowOverlay>
          <div className="w-full max-w-[430px] rounded-[12px] border border-hair bg-card px-6 py-6">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-brandindigo">Lyric Lift</p>
            <p className="mt-2 text-[14px] font-semibold text-white">Use Lyric Lift to pull lyrics from this recording?</p>
            <p className="mt-2 text-[11px] leading-5 text-lavdim">
              Lyric Lift will transcribe them, organize the likely sections, and place a draft beside your Lyric Blocks for you to review. Nothing is added or credited until you approve it.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={lyricLiftStartingVersionId === flow.versionId}
                onClick={() => void (async () => {
                  await startLyricLift(flow.versionId)
                  requestAiQuestion(flow.versionId)
                })()}
                className="rounded-[9px] border border-brandindigo/60 bg-brandindigo/15 px-4 py-2 text-[11px] font-semibold text-white hover:bg-brandindigo/25 disabled:opacity-40"
              >
                {lyricLiftStartingVersionId === flow.versionId ? 'Starting Lyric Lift…' : 'Start Lyric Lift'}
              </button>
              <button type="button" onClick={() => requestAiQuestion(flow.versionId)} className="text-[11px] text-lavdim hover:text-white">
                Not now
              </button>
            </div>
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
            setFlow({ kind: 'existing-take', targetVersionId: flow.pendingVersionId })
          }}
          onSkip={() => {
            markHumFirstFired()
            setFlow({ kind: 'ai-entry', versionId: flow.pendingVersionId, humanSourceVersionId: null })
          }}
        />
      )}

      {flow?.kind === 'existing-take' && (
        <FlowOverlay>
          <ExistingTakePicker
            takes={eligibleEarlierTakes(versions, flow.targetVersionId)}
            onSelect={humanSourceVersionId => {
              markHumFirstFired()
              setFlow({
                kind: 'ai-entry',
                versionId: flow.targetVersionId,
                humanSourceVersionId,
              })
            }}
            onBack={() => setFlow({ kind: 'hum-first', pendingVersionId: flow.targetVersionId })}
          />
        </FlowOverlay>
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
              existingTakes={versions}
              onFiled={(result: AiEntryFlowResult) => {
                router.refresh()
                if (result.guidance) {
                  // The re-author moment, mounted where the artist meets
                  // THIS entry (right after filing it) — never stapled
                  // onto a diary row (DiaryFeed's own header comment). The
                  // headline uses the LABEL, not the raw component value —
                  // same translated vocabulary AiEntryFlow.tsx's own
                  // two-door chips already render outside its receipt
                  // block, never a second, ad hoc rendering of the enum.
                  setFlow({
                    kind: 'reauthor',
                    headline: `${AI_ENTRY_COMPONENT_LABELS[result.data.component]} — this song's newest AI contribution`,
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

      {activeSingerBlock && (
        <FlowOverlay>
          <SingerPicker
            candidates={singerCandidates}
            currentPerformers={activeSingerBlock.performers}
            currentDirection={activeSingerBlock.vocal_direction ?? null}
            initialMode={
              activeSingerBlock.vocal_direction && activeSingerBlock.performers.length === 0
                ? 'direction'
                : 'person'
            }
            onSavePerformers={performers => patchVocalPlan(activeSingerBlock.id, { performers })}
            onSaveDirection={direction => patchVocalPlan(activeSingerBlock.id, { vocal_direction: direction })}
            onCancel={() => setFlow(null)}
          />
        </FlowOverlay>
      )}

      {flow?.kind === 'compare-versions' && comparableVersions.length >= 2 && (
        <FlowOverlay>
          <VersionComparisonPanel
            workId={workId}
            versions={comparableVersions}
            workingVersionId={versions.find(version => version.isWorking)?.id ?? null}
            preferredVersionId={flow.preferredVersionId ?? null}
            onClose={() => setFlow(null)}
            onActivity={(playing, display) => announceRoomActivity(
              playing ? 'listening' : 'recently_active',
              playing ? `${display} comparison` : undefined
            )}
            onCommentChanged={announceTrackCommentChanged}
            refreshToken={Object.values(trackCommentRefreshes).reduce((total, value) => total + value, 0)}
          />
        </FlowOverlay>
      )}

      {flow?.kind === 'record-over' && (
        <FlowOverlay>
          <RecordOverBeatStudio
            workId={workId}
            baseVersionId={flow.version.id}
            baseDisplay={flow.version.display}
            baseDescription={flow.version.description}
            playbackUrl={flow.version.playbackUrl}
            handoffRecipients={presence.people
              .filter(person => person.userId !== presence.viewer.userId)
              .map(person => ({ userId: person.userId, name: person.name }))}
            onSaved={() => {
              setFlow(null)
              router.refresh()
            }}
            onClose={() => {
              setFlow(null)
              router.refresh()
            }}
          />
        </FlowOverlay>
      )}

      {lyricHistory && (
        <FlowOverlay>
          <LyricHistoryPanel
            label={lyricHistory.label}
            currentText={lyricHistory.currentText}
            snapshots={lyricHistory.snapshots}
            loading={lyricHistory.loading}
            error={lyricHistory.error}
            restoringId={lyricHistory.restoringId}
            onRestore={snapshotId => void handleRestoreLyricSnapshot(snapshotId)}
            onClose={() => setLyricHistory(null)}
          />
        </FlowOverlay>
      )}

      {lyricComments && (
        <FlowOverlay>
          <LyricCommentsPanel
            workId={workId}
            label={lyricComments.label}
            comments={lyricComments.comments}
            participants={lyricComments.participants}
            loading={lyricComments.loading}
            error={lyricComments.error}
            saving={lyricComments.saving}
            resolvingId={lyricComments.resolvingId}
            onSubmit={handleSubmitLyricComment}
            onSetResolved={handleSetLyricCommentResolved}
            onReactionChanged={() => void refreshLyricComments(lyricComments.blockId)}
            onClose={() => setLyricComments(null)}
          />
        </FlowOverlay>
      )}

      {lyricSuggestions && (
        <FlowOverlay>
          <LyricSuggestionPanel
            label={lyricSuggestions.label}
            currentText={lyricSuggestions.currentText}
            suggestions={lyricSuggestions.suggestions}
            participants={lyricSuggestions.participants}
            loading={lyricSuggestions.loading}
            saving={lyricSuggestions.saving}
            error={lyricSuggestions.error}
            onCreate={handleCreateLyricSuggestion}
            onDecision={handleLyricSuggestionDecision}
            onClose={() => setLyricSuggestions(null)}
          />
        </FlowOverlay>
      )}

      {toast && (
        <Toast
          message={toast}
          onView={() => {
            scrollToDiary()
            setToast(null)
          }}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
