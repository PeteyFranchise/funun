'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BLOCK_TYPE_LABELS, BLOCK_TYPE_VALUES, deriveBlockNumerals, resolveRepeat } from '@/lib/catalogue/blocks'
import type { SectionLockView } from '@/lib/catalogue/room-collaboration'
import type { LyricBlock, LyricBlockType, WorkVocalState } from '@/types/catalogue'
import {
  LyricBlockCard,
  type LyricBlockAuthor,
  type LyricBlockLockState,
  type LyricBlockSinger,
} from './LyricBlockCard'
import { CopyLyricMenu } from './CopyLyricMenu'
import { clearTextDraft, readTextDraft, writeTextDraft } from '@/lib/catalogue/local-drafts'
import {
  WRITER_ROOM_LAYOUT_VERSION,
  lyricIdFromLayoutKey,
  lyricOrderFromWriterRoomLayout,
  reconcileWriterRoomLayout,
  setWriterRoomItemWidth,
  snapWriterRoomLyrics,
  type WriterRoomLayout,
  type WriterRoomLayoutKey,
  type WriterRoomLayoutWidth,
  type WriterRoomModuleKey,
} from '@/lib/catalogue/writer-room-layout'

// ─── The lyrics pad — sortable container, header, insert-anywhere ──────
// (sketch 006-A)
//
// This is the second half of what an artist owns — the hum evidences the
// melody, the pad evidences the words. Structure, positions and repeat
// links are consumed exactly as plan 02's pure module and plan 07's
// routes shaped them; nothing here recomputes a numeral, a repeat's
// text, or an export string (see LyricBlockCard.tsx and CopyLyricMenu.tsx
// for where those specific prohibitions live).
//
// Every mutation is a callback prop — this component performs no fetch.
// `onReorder` is awaited so a plan-07 409 (a real, expected outcome in a
// shared pad under concurrent editing) can revert the optimistic order
// rather than leave the pad showing a sequence the server never accepted.

export type LyricsPadBlock = LyricBlock & {
  /** The ✍ writer badge's display info. Null when unresolved or (per LyricBlockCard) suppressed on a repeat. Resolved upstream — this component does no user-id lookup of its own. */
  authorDisplay: LyricBlockAuthor | null
  /** The 🎤 declared singer cluster's display info, resolved from `performers` upstream. */
  singerDisplays: LyricBlockSinger[]
}

export type WriterRoomModule = {
  key: WriterRoomModuleKey
  label: string
  description: string
  content: ReactNode
  empty?: boolean
}

export type LyricsPadProps = {
  blocks: LyricsPadBlock[]
  draftOwnerId?: string
  vocalState: WorkVocalState
  onHum: () => void
  /** Debounced internally — see AUTOSAVE_DEBOUNCE_MS below — before this fires. */
  onTextChange: (blockId: string, text: string) => Promise<boolean>
  sectionLocks: Record<string, SectionLockView>
  onBeginEdit: (blockId: string, takeover?: boolean) => Promise<boolean>
  onEndEdit: (blockId: string) => Promise<void>
  onOpenHistory: (blockId: string, label: string, currentText: string) => void
  onOpenComments?: (blockId: string, label: string) => void
  onOpenSuggestions?: (blockId: string, label: string, currentText: string) => void
  suggestionCounts?: Record<string, number>
  onAddSinger: (blockId: string) => void
  onDetach: (blockId: string) => void
  /** Delete a section. The card confirms in place first when the block still holds words. */
  onRemoveBlock: (blockId: string) => void
  /** `index` undefined appends at the end (the bottom add-section row); a number inserts at that gap (a divider). */
  onInsertSingle: (blockType: LyricBlockType, index: number | undefined, customLabel?: string) => void
  onInsertRepeat: (sourceBlockId: string, index: number | undefined) => void
  /** Should reject (throw) on failure — a 409 reverts the optimistic order and surfaces the thrown message. */
  onReorder: (order: { id: string; position: number }[]) => Promise<void>
  /** Bulk paste on an empty pad — plan 07's `paste` creation shape, never one giant block. */
  onPasteImport: (text: string) => void
  /** Fixed room modules that may be placed between lyric blocks. */
  roomModules?: WriterRoomModule[]
  /** The authenticated viewer's private presentation state. */
  roomLayout?: WriterRoomLayout | null
  /** Persists presentation only; it must never write lyric/version/Diary facts. */
  onRoomLayoutChange?: (layout: WriterRoomLayout) => Promise<void>
  /** Expands a movable module when an outside shortcut opens its content. */
  expandedRoomModuleKey?: WriterRoomModuleKey | null
}

// Migration 138's edit trigger fires once per SAVE, not per keystroke —
// this debounce is what keeps the diary reading as section-level history
// ("Chorus edited by @peterzora · just now") instead of a wall of
// "lyrics changed" entries for every letter typed.
const AUTOSAVE_DEBOUNCE_MS = 600

function lyricDraftKey(ownerId: string, blockId: string): string {
  return `funun:user:${ownerId}:lyric-block:${blockId}:draft`
}

const ADD_SECTION_TYPES = BLOCK_TYPE_VALUES // sketch 006-A's own order: Verse, Pre-Chorus, Chorus, Bridge, Intro, Outro, Hook, Custom

// ─── Add-section chip row (sketch 006-A) ────────────────────────────────
// Custom-named sections never renumber (RENUMBERING RULE) — this is the
// one chip that asks for a label first, via an inline field rather than
// a native `window.prompt` (untestable, and out of step with this
// codebase's inline-form convention — see ChecklistAdmin.tsx).

function AddSectionChips({
  onPick,
  onPickCustom,
}: {
  onPick: (blockType: Exclude<LyricBlockType, 'custom'>) => void
  onPickCustom: (label: string) => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customLabel, setCustomLabel] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-[7px]">
      {ADD_SECTION_TYPES.map(blockType => {
        if (blockType === 'custom') {
          return (
            <span key="custom" className="inline-flex items-center gap-[6px]">
              {customOpen ? (
                <>
                  <input
                    value={customLabel}
                    onChange={event => setCustomLabel(event.target.value)}
                    placeholder="Section name"
                    className="w-28 rounded-full border border-hairstrong bg-transparent px-[10px] py-[5px] text-[12px] text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = customLabel.trim()
                      if (!trimmed) return
                      onPickCustom(trimmed)
                      setCustomLabel('')
                      setCustomOpen(false)
                    }}
                    className="rounded-full border border-hairstrong px-[10px] py-[5px] text-[12px] font-semibold text-lav hover:text-white"
                  >
                    Add
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomOpen(true)}
                  className="rounded-full border border-hairstrong px-[13px] py-[6px] text-[12px] font-semibold text-lavdim hover:text-lav"
                >
                  ＋ Custom…
                </button>
              )}
            </span>
          )
        }
        return (
          <button
            key={blockType}
            type="button"
            onClick={() => onPick(blockType)}
            className="rounded-full border border-hairstrong px-[13px] py-[6px] text-[12px] font-semibold text-lav hover:border-brandindigo hover:text-white"
          >
            ＋ {BLOCK_TYPE_LABELS[blockType]}
          </button>
        )
      })}
    </div>
  )
}

// ─── Insert-anywhere divider (INSERT-ANYWHERE RULE) ─────────────────────
// Revealed on hover (opacity), tappable on touch — a plus affordance that
// opens a mini chip row inserting exactly at this gap. "Chorus repeat" is
// offered FIRST once a chorus exists, ahead of the ordinary chips.
// Fallback ladder when a gap isn't the right tool: the end-of-song add-
// section row below the blocks, then dragging into place.

function InsertDivider({
  index,
  hasChorus,
  isOpen,
  onToggle,
  onInsertRepeat,
  onInsertSingle,
  onInsertCustom,
}: {
  index: number
  hasChorus: boolean
  isOpen: boolean
  onToggle: () => void
  onInsertRepeat: () => void
  onInsertSingle: (blockType: Exclude<LyricBlockType, 'custom'>) => void
  onInsertCustom: (label: string) => void
}) {
  return (
    <div className="group relative flex h-3 items-center justify-center">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Insert a section here (position ${index + 1})`}
        className="z-10 flex h-5 w-5 items-center justify-center rounded-full border border-hairstrong bg-card text-[12px] leading-none text-lavdim opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 hover:text-white"
      >
        +
      </button>
      {isOpen && (
        <div className="absolute top-full z-20 mt-1 flex flex-wrap items-center gap-[7px] rounded-[10px] border border-hair bg-card p-2 shadow-2xl">
          {hasChorus && (
            <button
              type="button"
              onClick={onInsertRepeat}
              className="rounded-full border border-brandindigo/50 px-[13px] py-[6px] text-[12px] font-semibold text-brandindigo hover:text-white"
            >
              ↺ Chorus repeat
            </button>
          )}
          <AddSectionChips onPick={onInsertSingle} onPickCustom={onInsertCustom} />
        </div>
      )}
    </div>
  )
}

// ─── The sortable wrapper — dnd-kit's useSortable feeding LyricBlockCard ─
// Same sensor/strategy shape as components/admin/ChecklistAdmin.tsx.

function SortableLyricBlock({
  sortableId,
  label,
  text,
  isRepeat,
  author,
  vocalState,
  singers,
  vocalDirection,
  lockState,
  onTextChange,
  onBeginEdit,
  onTakeOver,
  onEndEdit,
  onOpenHistory,
  onOpenComments,
  onOpenSuggestions,
  suggestionCount,
  onAddSinger,
  onDetach,
  onRemove,
  layoutWidth,
  onToggleLayoutWidth,
}: {
  sortableId: string
  label: string
  text: string
  isRepeat: boolean
  author: LyricBlockAuthor | null
  vocalState: WorkVocalState
  singers: LyricBlockSinger[]
  vocalDirection: string | null
  lockState: LyricBlockLockState
  onTextChange: (text: string) => void
  onBeginEdit: () => void
  onTakeOver: () => void
  onEndEdit: () => void
  onOpenHistory: () => void
  onOpenComments?: () => void
  onOpenSuggestions?: () => void
  suggestionCount: number
  onAddSinger: () => void
  onDetach: () => void
  onRemove: () => void
  layoutWidth?: WriterRoomLayoutWidth
  onToggleLayoutWidth?: () => void
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: sortableId,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <LyricBlockCard
      label={label}
      text={text}
      isRepeat={isRepeat}
      author={author}
      vocalState={vocalState}
      singers={singers}
      vocalDirection={vocalDirection}
      lockState={lockState}
      onTextChange={onTextChange}
      onBeginEdit={onBeginEdit}
      onTakeOver={onTakeOver}
      onEndEdit={onEndEdit}
      onOpenHistory={onOpenHistory}
      onOpenComments={onOpenComments}
      onOpenSuggestions={onOpenSuggestions}
      suggestionCount={suggestionCount}
      onAddSinger={onAddSinger}
      onDetach={onDetach}
      onRemove={onRemove}
      containerRef={setNodeRef}
      containerStyle={style}
      dragHandleRef={setActivatorNodeRef}
      dragHandleAttributes={attributes}
      dragHandleListeners={listeners}
      isDragging={isDragging}
      layoutWidth={layoutWidth}
      onToggleLayoutWidth={onToggleLayoutWidth}
    />
  )
}

// A room module is movable presentation around authoritative content. The
// Versions child still owns playback/take mutations and DiaryFeed still owns
// chronological history; this wrapper only supplies drag, width, and collapse.
function SortableRoomModule({
  roomModule,
  width,
  onToggleWidth,
  forceExpanded,
}: {
  roomModule: WriterRoomModule
  width: WriterRoomLayoutWidth
  onToggleWidth: () => void
  forceExpanded: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: roomModule.key,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  useEffect(() => {
    if (forceExpanded) setCollapsed(false)
  }, [forceExpanded])

  return (
    <section
      ref={setNodeRef}
      style={style}
      aria-label={roomModule.label}
      className={`overflow-hidden rounded-[11px] border bg-card transition-shadow ${
        isDragging ? 'border-brandindigo/60 shadow-2xl' : 'border-hair'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-hair px-3 py-2">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Drag to move ${roomModule.label}`}
          className="cursor-grab text-[13px] text-lavdim hover:text-lav active:cursor-grabbing"
        >
          ⠿
        </button>
        <span className="text-[11px] font-bold uppercase tracking-[.08em] text-brandindigo">{roomModule.label}</span>
        <span className="text-[10px] text-lavdim">{roomModule.description}</span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleWidth}
            aria-label={width === 'full' ? `Make ${roomModule.label} half width` : `Make ${roomModule.label} full width`}
            title={width === 'full' ? 'Place beside another item' : 'Make full width'}
            className="rounded-full border border-hair px-2 py-0.5 text-[9px] font-semibold text-lavdim hover:border-brandindigo hover:text-white"
          >
            {width === 'full' ? '½ width' : '↔ full'}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(current => !current)}
            aria-expanded={!collapsed}
            className="text-[10px] font-semibold text-lavdim hover:text-white"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </span>
      </div>
      {!collapsed && <div className="p-3">{roomModule.content}</div>}
    </section>
  )
}

// ─── LyricsPad ───────────────────────────────────────────────────────────

export function LyricsPad({
  blocks,
  draftOwnerId = 'viewer',
  vocalState,
  onHum,
  onTextChange,
  sectionLocks,
  onBeginEdit,
  onEndEdit,
  onOpenHistory,
  onOpenComments,
  onOpenSuggestions,
  suggestionCounts = {},
  onAddSinger,
  onDetach,
  onRemoveBlock,
  onInsertSingle,
  onInsertRepeat,
  onReorder,
  onPasteImport,
  roomModules = [],
  roomLayout = null,
  onRoomLayoutChange,
  expandedRoomModuleKey = null,
}: LyricsPadProps) {
  const labeled = deriveBlockNumerals(blocks)
  const byId = new Map(blocks.map(block => [block.id, block]))
  const moduleByKey = new Map(roomModules.map(module => [module.key, module] as const))
  const hybridEnabled = roomModules.length > 0

  const [order, setOrder] = useState<string[]>(() => labeled.map(block => block.id))
  const [layout, setLayout] = useState<WriterRoomLayout>(() =>
    reconcileWriterRoomLayout(roomLayout, labeled.map(block => block.id))
  )
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [openDivider, setOpenDivider] = useState<number | null>(null)
  const [pendingText, setPendingText] = useState<Record<string, string>>({})
  const [acquiringBlockId, setAcquiringBlockId] = useState<string | null>(null)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const pendingTextRef = useRef<Record<string, string>>({})
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Resync the visual order whenever the SET of block ids actually
  // changes (an add, a delete, or an externally-applied reorder) — never
  // on every render, which would clobber an in-flight optimistic drag.
  const blockIdsKey = blocks.map(block => block.id).join(',')
  const moduleKeysKey = roomModules.map(module => module.key).join(',')
  const savedLayoutKey = JSON.stringify(roomLayout)
  useEffect(() => {
    setOrder(labeled.map(block => block.id))
    // labeled is derived from blocks on every render; blockIdsKey is the
    // intentionally narrower dependency — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdsKey, draftOwnerId])

  useEffect(() => {
    setLayout(reconcileWriterRoomLayout(roomLayout, labeled.map(block => block.id)))
    setLayoutError(null)
    // `labeled` and roomLayout are re-created as props change. These stable
    // keys intentionally resync only for server layout/content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdsKey, moduleKeysKey, savedLayoutKey, draftOwnerId])

  useEffect(() => {
    const recovered: Record<string, string> = {}
    for (const block of blocks) {
      const draft = readTextDraft(lyricDraftKey(draftOwnerId, block.id))
      if (draft && draft.text !== block.text && draft.baseText === block.text) {
        recovered[block.id] = draft.text
        pendingTextRef.current[block.id] = draft.text
      }
    }
    if (Object.keys(recovered).length > 0) setPendingText(current => ({ ...current, ...recovered }))
    // Recovery is intentionally keyed to the set of sections, not every
    // server refresh; a stale local draft must not overwrite newer words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdsKey, draftOwnerId])

  // Drop a pending (debounced-but-not-yet-confirmed) text override once
  // the caller's own `blocks` prop catches up to it — keeps a slow
  // network from flashing a textarea back to stale text mid-debounce,
  // without holding a stale override forever if the caller's state moves
  // on for some other reason.
  useEffect(() => {
    setPendingText(prev => {
      let changed = false
      const next = { ...prev }
      for (const block of blocks) {
        if (next[block.id] !== undefined && next[block.id] === block.text) {
          delete next[block.id]
          delete pendingTextRef.current[block.id]
          clearTextDraft(lyricDraftKey(draftOwnerId, block.id))
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [blocks, draftOwnerId])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      Object.values(timers).forEach(clearTimeout)
    }
  }, [])

  const saveBlockText = useCallback(
    async (blockId: string, text: string): Promise<boolean> => {
      try {
        const saved = await onTextChange(blockId, text)
        if (!saved) {
          setSaveErrors(current => ({
            ...current,
            [blockId]: 'This section changed hands before the save completed. Your words are still visible here so you can copy them.',
          }))
          return false
        }
        if (pendingTextRef.current[blockId] === text) {
          delete pendingTextRef.current[blockId]
          clearTextDraft(lyricDraftKey(draftOwnerId, blockId))
          setPendingText(current => {
            if (current[blockId] !== text) return current
            const next = { ...current }
            delete next[blockId]
            return next
          })
        }
        setSaveErrors(current => {
          if (!current[blockId]) return current
          const next = { ...current }
          delete next[blockId]
          return next
        })
        return true
      } catch {
        setSaveErrors(current => ({
          ...current,
          [blockId]: 'Could not save this section. Your words are still visible here so you can copy them.',
        }))
        return false
      }
    },
    [draftOwnerId, onTextChange]
  )

  const handleBlockTextChange = useCallback(
    (blockId: string, text: string) => {
      pendingTextRef.current[blockId] = text
      const baseText = blocks.find(block => block.id === blockId)?.text ?? ''
      writeTextDraft(lyricDraftKey(draftOwnerId, blockId), text, baseText)
      setPendingText(prev => ({ ...prev, [blockId]: text }))
      setSaveErrors(current => {
        if (!current[blockId]) return current
        const next = { ...current }
        delete next[blockId]
        return next
      })
      const existing = timersRef.current[blockId]
      if (existing) clearTimeout(existing)
      timersRef.current[blockId] = setTimeout(() => {
        void saveBlockText(blockId, text)
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [blocks, draftOwnerId, saveBlockText]
  )

  const handleBeginEditing = useCallback(
    async (blockId: string, takeover = false) => {
      setAcquiringBlockId(blockId)
      const granted = await onBeginEdit(blockId, takeover).catch(() => false)
      setAcquiringBlockId(current => (current === blockId ? null : current))
      if (!granted) {
        setSaveErrors(current => ({
          ...current,
          [blockId]: takeover
            ? 'Could not take over this section. Refresh and try again.'
            : 'Another writer reserved this section first. You can wait or choose Take over.',
        }))
      }
    },
    [onBeginEdit]
  )

  const handleEndEditing = useCallback(
    async (blockId: string) => {
      const timer = timersRef.current[blockId]
      if (timer) {
        clearTimeout(timer)
        delete timersRef.current[blockId]
      }
      const pending = pendingTextRef.current[blockId]
      const saved = pending === undefined ? true : await saveBlockText(blockId, pending)
      if (saved) await onEndEdit(blockId)
    },
    [onEndEdit, saveBlockText]
  )

  const handleOpenBlockHistory = useCallback(
    async (blockId: string, label: string, currentText: string) => {
      const timer = timersRef.current[blockId]
      if (timer) {
        clearTimeout(timer)
        delete timersRef.current[blockId]
      }

      const pending = pendingTextRef.current[blockId]
      if (pending !== undefined) {
        const saved = await saveBlockText(blockId, pending)
        if (!saved) return
      }
      if (sectionLocks[blockId]?.state === 'mine') await onEndEdit(blockId)
      onOpenHistory(blockId, label, pending ?? currentText)
    },
    [onEndEdit, onOpenHistory, saveBlockText, sectionLocks]
  )

  const handleOpenBlockComments = useCallback(
    async (blockId: string, label: string) => {
      if (!onOpenComments) return
      const timer = timersRef.current[blockId]
      if (timer) {
        clearTimeout(timer)
        delete timersRef.current[blockId]
      }

      const pending = pendingTextRef.current[blockId]
      if (pending !== undefined) {
        const saved = await saveBlockText(blockId, pending)
        if (!saved) return
      }
      if (sectionLocks[blockId]?.state === 'mine') await onEndEdit(blockId)
      onOpenComments(blockId, label)
    },
    [onEndEdit, onOpenComments, saveBlockText, sectionLocks]
  )

  const handleOpenBlockSuggestions = useCallback(
    async (blockId: string, label: string, currentText: string) => {
      if (!onOpenSuggestions) return
      const timer = timersRef.current[blockId]
      if (timer) {
        clearTimeout(timer)
        delete timersRef.current[blockId]
      }

      const pending = pendingTextRef.current[blockId]
      if (pending !== undefined) {
        const saved = await saveBlockText(blockId, pending)
        if (!saved) return
      }
      if (sectionLocks[blockId]?.state === 'mine') await onEndEdit(blockId)
      onOpenSuggestions(blockId, label, pending ?? currentText)
    },
    [onEndEdit, onOpenSuggestions, saveBlockText, sectionLocks]
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const orderedBlocks = order
    .map(id => labeled.find(block => block.id === id))
    .filter((block): block is (typeof labeled)[number] => Boolean(block))
  const visibleLayoutItems = layout.items.filter(item => {
    const lyricId = lyricIdFromLayoutKey(item.key)
    return lyricId ? byId.has(lyricId) : moduleByKey.has(item.key as WriterRoomModuleKey)
  })

  const hasChorus = blocks.some(block => block.block_type === 'chorus')
  const chorusBlocksInOrder = labeled.filter(block => block.block_type === 'chorus')
  const latestChorusId =
    chorusBlocksInOrder.length > 0 ? chorusBlocksInOrder[chorusBlocksInOrder.length - 1].id : null

  const persistRoomLayout = useCallback(
    async (next: WriterRoomLayout) => {
      setLayout(next)
      setLayoutError(null)
      if (!onRoomLayoutChange) return
      try {
        await onRoomLayoutChange(next)
      } catch (error) {
        setLayoutError(error instanceof Error ? error.message : "Couldn't save your room layout — try again.")
      }
    },
    [onRoomLayoutChange]
  )

  const handleRoomWidthToggle = useCallback(
    (key: WriterRoomLayoutKey) => {
      const item = layout.items.find(candidate => candidate.key === key)
      if (!item) return
      const nextWidth: WriterRoomLayoutWidth = item.width === 'full' ? 'half' : 'full'
      void persistRoomLayout(setWriterRoomItemWidth(layout, key, nextWidth))
    },
    [layout, persistRoomLayout]
  )

  const handleSnapLyrics = useCallback(() => {
    void persistRoomLayout(snapWriterRoomLyrics(layout, order))
  }, [layout, order, persistRoomLayout])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      if (!hybridEnabled) {
        const oldIndex = order.indexOf(String(active.id))
        const newIndex = order.indexOf(String(over.id))
        if (oldIndex === -1 || newIndex === -1) return

        const snapshot = order
        const reordered = arrayMove(order, oldIndex, newIndex)
        setOrder(reordered)
        setReorderError(null)
        try {
          await onReorder(reordered.map((id, position) => ({ id, position })))
        } catch (err) {
          setOrder(snapshot)
          setReorderError(err instanceof Error ? err.message : "Couldn't save the new order — try again.")
        }
        return
      }

      const activeKey = String(active.id)
      const overKey = String(over.id)
      const oldIndex = layout.items.findIndex(item => item.key === activeKey)
      const newIndex = layout.items.findIndex(item => item.key === overKey)
      if (oldIndex === -1 || newIndex === -1) return

      const snapshotLayout = layout
      const snapshotOrder = order
      const reorderedItems = arrayMove(layout.items, oldIndex, newIndex)
      const reorderedLayout: WriterRoomLayout = {
        version: WRITER_ROOM_LAYOUT_VERSION,
        items: reorderedItems,
      }
      const nextLyricOrder = lyricOrderFromWriterRoomLayout(reorderedLayout)
      const lyricOrderChanged = nextLyricOrder.some((id, index) => id !== order[index])

      setLayout(reorderedLayout)
      setLayoutError(null)
      setReorderError(null)

      if (lyricOrderChanged) {
        setOrder(nextLyricOrder)
        try {
          await onReorder(nextLyricOrder.map((id, position) => ({ id, position })))
        } catch (err) {
          // A presentation move must never leave the canonical song order
          // lying about a rejected collaborative reorder.
          setLayout(snapshotLayout)
          setOrder(snapshotOrder)
          setReorderError(err instanceof Error ? err.message : "Couldn't save the new order — try again.")
          return
        }
      }

      await persistRoomLayout(reorderedLayout)
    },
    [hybridEnabled, layout, onReorder, order, persistRoomLayout]
  )

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData('text')
    if (!text.trim()) return
    event.preventDefault()
    onPasteImport(text)
  }

  const addSectionAt = (index: number | undefined) => ({
    onPick: (blockType: Exclude<LyricBlockType, 'custom'>) => {
      onInsertSingle(blockType, index)
      setOpenDivider(null)
    },
    onPickCustom: (label: string) => {
      onInsertSingle('custom', index, label)
      setOpenDivider(null)
    },
  })

  const bottomChips = addSectionAt(undefined)

  function renderLyricItem({
    block,
    canonicalIndex,
    sortableId,
    width,
    layoutKey,
  }: {
    block: (typeof labeled)[number]
    canonicalIndex: number
    sortableId: string
    width?: WriterRoomLayoutWidth
    layoutKey?: WriterRoomLayoutKey
  }) {
    const resolved = resolveRepeat(block, byId)
    const dividerChips = addSectionAt(canonicalIndex)
    const text = resolved.isRepeat ? resolved.text : (pendingText[block.id] ?? resolved.text)

    return (
      <div
        key={sortableId}
        className={hybridEnabled ? (width === 'half' ? 'min-w-0 lg:col-span-1' : 'min-w-0 lg:col-span-2') : undefined}
      >
        <InsertDivider
          index={canonicalIndex}
          hasChorus={hasChorus}
          isOpen={openDivider === canonicalIndex}
          onToggle={() => setOpenDivider(current => (current === canonicalIndex ? null : canonicalIndex))}
          onInsertRepeat={() => {
            if (latestChorusId) onInsertRepeat(latestChorusId, canonicalIndex)
            setOpenDivider(null)
          }}
          onInsertSingle={dividerChips.onPick}
          onInsertCustom={dividerChips.onPickCustom}
        />
        <SortableLyricBlock
          sortableId={sortableId}
          label={block.label}
          text={text}
          isRepeat={resolved.isRepeat}
          author={block.authorDisplay}
          vocalState={vocalState}
          singers={block.singerDisplays}
          vocalDirection={block.vocal_direction ?? null}
          lockState={
            acquiringBlockId === block.id
              ? { state: 'acquiring' }
              : (sectionLocks[block.id] ?? { state: 'available' })
          }
          onTextChange={value => handleBlockTextChange(block.id, value)}
          onBeginEdit={() => void handleBeginEditing(block.id)}
          onTakeOver={() => void handleBeginEditing(block.id, true)}
          onEndEdit={() => void handleEndEditing(block.id)}
          onOpenHistory={() => void handleOpenBlockHistory(block.id, block.label, text)}
          onOpenComments={onOpenComments ? () => void handleOpenBlockComments(block.id, block.label) : undefined}
          onOpenSuggestions={onOpenSuggestions ? () => void handleOpenBlockSuggestions(block.id, block.label, text) : undefined}
          suggestionCount={suggestionCounts[block.id] ?? 0}
          onAddSinger={() => onAddSinger(block.id)}
          onDetach={() => onDetach(block.id)}
          onRemove={() => onRemoveBlock(block.id)}
          layoutWidth={width}
          onToggleLayoutWidth={layoutKey ? () => handleRoomWidthToggle(layoutKey) : undefined}
        />
      </div>
    )
  }

  function renderHybridGrid() {
    return (
      <SortableContext items={visibleLayoutItems.map(item => item.key)} strategy={rectSortingStrategy}>
        <div data-writer-room-grid className="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
          {visibleLayoutItems.map(item => {
            const lyricId = lyricIdFromLayoutKey(item.key)
            if (lyricId) {
              const block = labeled.find(candidate => candidate.id === lyricId)
              if (!block) return null
              const canonicalIndex = order.indexOf(lyricId)
              return renderLyricItem({
                block,
                canonicalIndex: canonicalIndex === -1 ? 0 : canonicalIndex,
                sortableId: item.key,
                width: item.width,
                layoutKey: item.key,
              })
            }

            const roomModule = moduleByKey.get(item.key as WriterRoomModuleKey)
            if (!roomModule) return null
            return (
              <div
                key={item.key}
                className={item.width === 'half' ? 'mb-[9px] min-w-0 lg:col-span-1' : 'mb-[9px] min-w-0 lg:col-span-2'}
              >
                <SortableRoomModule
                  roomModule={roomModule}
                  width={item.width}
                  onToggleWidth={() => handleRoomWidthToggle(item.key)}
                  forceExpanded={expandedRoomModuleKey === item.key}
                />
              </div>
            )
          })}
        </div>
      </SortableContext>
    )
  }

  return (
    <div>
      {/* Header — autosave status + the melody button. The work's TITLE
          input is deliberately NOT here: it lives once, in plan 11's
          WorkHeader, so a live rename input never exists twice on the
          same page. */}
      <div className="mb-[10px] flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-hair bg-card px-4 py-[14px]">
        <div>
          <p className="text-[11px] text-lavdim">lyrics saving automatically · every edit timestamped</p>
          {hybridEnabled && (
            <p className="mt-1 text-[10px] text-lavdim">Your arrangement is private. Half-width items placed next to each other share a row.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hybridEnabled && (
            <button
              type="button"
              onClick={handleSnapLyrics}
              className="whitespace-nowrap rounded-[9px] border border-brandindigo/50 bg-brandindigo/10 px-[11px] py-[7px] text-[11px] font-semibold text-brandindigo hover:text-white"
            >
              ⇥ Snap lyrics together
            </button>
          )}
          <CopyLyricMenu blocks={blocks} />
          {/* The hum stays one tap from the words — lyrics and melody
              are the two halves of what an artist owns. */}
          <button
            type="button"
            onClick={onHum}
            className="whitespace-nowrap rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
          >
            🎙 Add the melody — hum it
          </button>
        </div>
      </div>

      {reorderError && (
        <p role="alert" className="mb-[8px] text-[11px] text-rose-400">
          {reorderError}
        </p>
      )}

      {layoutError && (
        <p role="alert" className="mb-[8px] text-[11px] text-rose-400">
          {layoutError}
        </p>
      )}

      {Object.entries(saveErrors).map(([blockId, message]) => (
        <p key={blockId} role="alert" className="mb-[8px] text-[11px] text-rose-300">
          {message}
        </p>
      ))}

      {orderedBlocks.length === 0 ? (
        <>
          <div className="mb-[9px] rounded-[12px] border border-hair bg-card px-4 py-4">
            <textarea
              onPaste={handlePaste}
              placeholder="Paste a full lyric here to auto-split it into sections, or add one below —"
              rows={3}
              className="mb-3 w-full resize-none rounded-[10px] border border-hair bg-transparent px-3 py-2 text-[13px] text-white/95 outline-none placeholder:text-lavdim"
            />
            <p className="mb-[7px] text-[11px] text-lavdim">Add a section —</p>
            <AddSectionChips onPick={bottomChips.onPick} onPickCustom={bottomChips.onPickCustom} />
          </div>
          {hybridEnabled && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {renderHybridGrid()}
            </DndContext>
          )}
        </>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {hybridEnabled ? (
              renderHybridGrid()
            ) : (
              <SortableContext items={order} strategy={rectSortingStrategy}>
                <div>
                  {orderedBlocks.map((block, index) => renderLyricItem({
                    block,
                    canonicalIndex: index,
                    sortableId: block.id,
                  }))}
                </div>
              </SortableContext>
            )}
          </DndContext>

          <p className="mb-[7px] mt-1 text-[11px] text-lavdim">Add a section —</p>
          <AddSectionChips onPick={bottomChips.onPick} onPickCustom={bottomChips.onPickCustom} />
        </>
      )}
    </div>
  )
}
