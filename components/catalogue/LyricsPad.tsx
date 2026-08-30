'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BLOCK_TYPE_LABELS, BLOCK_TYPE_VALUES, deriveBlockNumerals, resolveRepeat } from '@/lib/catalogue/blocks'
import type { LyricBlock, LyricBlockType, WorkVocalState } from '@/types/catalogue'
import { LyricBlockCard, type LyricBlockAuthor, type LyricBlockSinger } from './LyricBlockCard'
import { CopyLyricMenu } from './CopyLyricMenu'

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

export type LyricsPadProps = {
  blocks: LyricsPadBlock[]
  vocalState: WorkVocalState
  onHum: () => void
  /** Debounced internally — see AUTOSAVE_DEBOUNCE_MS below — before this fires. */
  onTextChange: (blockId: string, text: string) => void
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
}

// Migration 138's edit trigger fires once per SAVE, not per keystroke —
// this debounce is what keeps the diary reading as section-level history
// ("Chorus edited by @peterzora · just now") instead of a wall of
// "lyrics changed" entries for every letter typed.
const AUTOSAVE_DEBOUNCE_MS = 600

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
  id,
  label,
  text,
  isRepeat,
  author,
  vocalState,
  singers,
  onTextChange,
  onAddSinger,
  onDetach,
  onRemove,
}: {
  id: string
  label: string
  text: string
  isRepeat: boolean
  author: LyricBlockAuthor | null
  vocalState: WorkVocalState
  singers: LyricBlockSinger[]
  onTextChange: (text: string) => void
  onAddSinger: () => void
  onDetach: () => void
  onRemove: () => void
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
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
      onTextChange={onTextChange}
      onAddSinger={onAddSinger}
      onDetach={onDetach}
      onRemove={onRemove}
      containerRef={setNodeRef}
      containerStyle={style}
      dragHandleRef={setActivatorNodeRef}
      dragHandleAttributes={attributes}
      dragHandleListeners={listeners}
      isDragging={isDragging}
    />
  )
}

// ─── LyricsPad ───────────────────────────────────────────────────────────

export function LyricsPad({
  blocks,
  vocalState,
  onHum,
  onTextChange,
  onAddSinger,
  onDetach,
  onRemoveBlock,
  onInsertSingle,
  onInsertRepeat,
  onReorder,
  onPasteImport,
}: LyricsPadProps) {
  const labeled = deriveBlockNumerals(blocks)
  const byId = new Map(blocks.map(block => [block.id, block]))

  const [order, setOrder] = useState<string[]>(() => labeled.map(block => block.id))
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [openDivider, setOpenDivider] = useState<number | null>(null)
  const [pendingText, setPendingText] = useState<Record<string, string>>({})
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Resync the visual order whenever the SET of block ids actually
  // changes (an add, a delete, or an externally-applied reorder) — never
  // on every render, which would clobber an in-flight optimistic drag.
  const blockIdsKey = blocks.map(block => block.id).join(',')
  useEffect(() => {
    setOrder(labeled.map(block => block.id))
    // labeled is derived from blocks on every render; blockIdsKey is the
    // intentionally narrower dependency — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdsKey])

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
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [blocks])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      Object.values(timers).forEach(clearTimeout)
    }
  }, [])

  const handleBlockTextChange = useCallback(
    (blockId: string, text: string) => {
      setPendingText(prev => ({ ...prev, [blockId]: text }))
      const existing = timersRef.current[blockId]
      if (existing) clearTimeout(existing)
      timersRef.current[blockId] = setTimeout(() => {
        onTextChange(blockId, text)
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [onTextChange]
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const orderedBlocks = order
    .map(id => labeled.find(block => block.id === id))
    .filter((block): block is (typeof labeled)[number] => Boolean(block))

  const hasChorus = blocks.some(block => block.block_type === 'chorus')
  const chorusBlocksInOrder = labeled.filter(block => block.block_type === 'chorus')
  const latestChorusId =
    chorusBlocksInOrder.length > 0 ? chorusBlocksInOrder[chorusBlocksInOrder.length - 1].id : null

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
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
        // A concurrent edit in a shared pad is expected, not exceptional
        // — plan 07's reorder route returns 409 exactly for this case.
        // Revert to the last known server order rather than leave the
        // pad showing a sequence the server never accepted.
        setOrder(snapshot)
        setReorderError(err instanceof Error ? err.message : "Couldn't save the new order — try again.")
      }
    },
    [order, onReorder]
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

  return (
    <div>
      {/* Header — autosave status + the melody button. The work's TITLE
          input is deliberately NOT here: it lives once, in plan 11's
          WorkHeader, so a live rename input never exists twice on the
          same page. */}
      <div className="mb-[10px] flex items-center justify-between gap-3 rounded-[12px] border border-hair bg-card px-4 py-[14px]">
        <p className="text-[11px] text-lavdim">lyrics saving automatically · every edit timestamped</p>
        <div className="flex shrink-0 items-center gap-2">
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

      {orderedBlocks.length === 0 ? (
        <div className="rounded-[12px] border border-hair bg-card px-4 py-4">
          <textarea
            onPaste={handlePaste}
            placeholder="Paste a full lyric here to auto-split it into sections, or add one below —"
            rows={3}
            className="mb-3 w-full resize-none rounded-[10px] border border-hair bg-transparent px-3 py-2 text-[13px] text-white/95 outline-none placeholder:text-lavdim"
          />
          <p className="mb-[7px] text-[11px] text-lavdim">Add a section —</p>
          <AddSectionChips onPick={bottomChips.onPick} onPickCustom={bottomChips.onPickCustom} />
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div>
                {orderedBlocks.map((block, index) => {
                  const resolved = resolveRepeat(block, byId)
                  const dividerChips = addSectionAt(index)
                  const text = resolved.isRepeat ? resolved.text : (pendingText[block.id] ?? resolved.text)

                  return (
                    <div key={block.id}>
                      <InsertDivider
                        index={index}
                        hasChorus={hasChorus}
                        isOpen={openDivider === index}
                        onToggle={() => setOpenDivider(current => (current === index ? null : index))}
                        onInsertRepeat={() => {
                          if (latestChorusId) onInsertRepeat(latestChorusId, index)
                          setOpenDivider(null)
                        }}
                        onInsertSingle={dividerChips.onPick}
                        onInsertCustom={dividerChips.onPickCustom}
                      />
                      <SortableLyricBlock
                        id={block.id}
                        label={block.label}
                        text={text}
                        isRepeat={resolved.isRepeat}
                        author={block.authorDisplay}
                        vocalState={vocalState}
                        singers={block.singerDisplays}
                        onTextChange={value => handleBlockTextChange(block.id, value)}
                        onAddSinger={() => onAddSinger(block.id)}
                        onDetach={() => onDetach(block.id)}
                        onRemove={() => onRemoveBlock(block.id)}
                      />
                    </div>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>

          <p className="mb-[7px] mt-1 text-[11px] text-lavdim">Add a section —</p>
          <AddSectionChips onPick={bottomChips.onPick} onPickCustom={bottomChips.onPickCustom} />
        </>
      )}
    </div>
  )
}
