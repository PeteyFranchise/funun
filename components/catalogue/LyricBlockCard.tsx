'use client'

import type { CSSProperties } from 'react'
import type { WorkVocalState } from '@/types/catalogue'

// ─── The section card (sketch 006-A) ───────────────────────────────────
// Structure blocks: a grip, an uppercase indigo section label, a badge
// cluster, and the lyric body below a hairline divider. Presentational
// only — every action is a callback prop, this component performs no
// fetch and owns no debounce (LyricsPad.tsx debounces before it PATCHes).
//
// `label` comes from `deriveBlockNumerals()` (lib/catalogue/blocks.ts,
// plan 02) as a prop, never computed here — RENUMBERING RULE: a numeral
// is derived from position among same-type siblings, and a component that
// recomputed its own would diverge from the export and the diary the
// moment two same-type blocks are on screen at once.
//
// Avatar gradient note: the owner writer/singer badge uses an explicit
// `from-brandindigo to-brandfuchsia` gradient built from the same two
// tokens as `bg-grad`, but deliberately NOT the shared `bg-grad`
// background-image utility itself. `bg-grad` is this codebase's reserved
// single-spend CTA treatment (see ComposerCard.tsx's empty-state comment
// and GuidingLine.tsx's header comment) — an identity avatar that repeats
// once per owner-authored block is a completely different visual weight
// than a primary-action fill, but reusing the literal `bg-grad` class N
// times across N blocks would still read as "spending the gradient again"
// against this plan's own prohibition. Building the same two stops from
// their individual tokens keeps the sketch's exact avatar treatment
// without ever touching the reserved utility.

export type LyricBlockAuthor = {
  /** One or two glyphs to show inside the avatar circle. */
  initial: string
  /** Display name, shown beside the avatar for a collaborator (sketch shows "Ben" beside Ben's avatar, nothing beside the owner's). */
  name: string | null
  /** Owner gets the indigo-to-fuchsia avatar; a collaborator gets the green-to-blue variant (sketch's `.av` vs `.av.b`). */
  isOwner: boolean
}

export type LyricBlockSinger = {
  key: string
  initial: string
  name: string | null
  isOwner: boolean
}

export type LyricBlockCardProps = {
  /** The derived display label, e.g. "Verse 2", "Chorus" (lone), or a custom label — from `deriveBlockNumerals()`. Never computed here. */
  label: string
  /**
   * The text to render. For an ordinary block this is the block's own
   * `text`; for a linked repeat this is `resolveRepeat()`'s resolved text
   * — the source's words, never assembled or looked up by this component.
   */
  text: string
  /** True when this block links to another (REPEAT RULE). */
  isRepeat: boolean
  /**
   * The ✍ writer badge — automatic, whoever typed. Null when the block is
   * a repeat (attribution stays with the original writer, so this
   * component suppresses its own author affordance entirely rather than
   * showing a second, misleading claim) or when no author is known yet.
   */
  author: LyricBlockAuthor | null
  /** DEFAULT-PERFORMER RULE's three states. `instrumental` removes every who-sings affordance below, on every block — not cosmetic: an instrumental work's blocks are pure structure in producer vocabulary and there is nothing to ask. */
  vocalState: WorkVocalState
  /** The 🎤 declared singer cluster. Empty means "inherits the work's primary performer" for display — this component does not resolve that inheritance itself, it is handed the resolved list (or an empty one) by its caller. */
  singers: LyricBlockSinger[]
  /** Fires on every keystroke in the (non-repeat) lyric body — LyricsPad debounces before it PATCHes. */
  onTextChange: (text: string) => void
  /** "＋🎤 who sings this?" — opens the singer picker. Owned entirely by the caller. */
  onAddSinger: () => void
  /** "Detach to vary" — copy-on-write, only ever shown on a repeat. */
  onDetach: () => void
  /** dnd-kit's `setNodeRef` for the sortable wrapper, forwarded from LyricsPad. */
  containerRef?: (node: HTMLDivElement | null) => void
  /** dnd-kit's transform/transition style, forwarded from LyricsPad. */
  containerStyle?: CSSProperties
  /** dnd-kit's `setActivatorNodeRef`, applied to the grip button so only the grip (not the whole card) starts a drag. */
  dragHandleRef?: (node: HTMLButtonElement | null) => void
  dragHandleAttributes?: Record<string, unknown>
  dragHandleListeners?: Record<string, unknown>
  isDragging?: boolean
}

const OWNER_GRADIENT = 'bg-gradient-to-br from-brandindigo to-brandfuchsia'
const COLLABORATOR_GRADIENT = 'bg-gradient-to-br from-emerald-400 to-blue-400'

function AvatarDot({ initial, name, isOwner }: { initial: string; name: string | null; isOwner: boolean }) {
  return (
    <span
      title={name ?? undefined}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-card text-[9px] font-extrabold text-white ${
        isOwner ? OWNER_GRADIENT : COLLABORATOR_GRADIENT
      }`}
    >
      {initial}
    </span>
  )
}

function WriterBadge({ author }: { author: LyricBlockAuthor }) {
  return (
    <span className="flex items-center gap-1">
      {!author.isOwner && author.name && <span className="text-[11px] text-lavdim">{author.name}</span>}
      <AvatarDot initial={author.initial} name={author.name} isOwner={author.isOwner} />
    </span>
  )
}

function SingerCluster({
  singers,
  onAddSinger,
}: {
  singers: LyricBlockSinger[]
  onAddSinger: () => void
}) {
  if (singers.length === 0) {
    return (
      <button
        type="button"
        onClick={onAddSinger}
        className="whitespace-nowrap text-[11px] text-lavdim hover:text-lav"
      >
        ＋🎤 who sings this?
      </button>
    )
  }

  return (
    <span className="flex items-center -space-x-1.5">
      {singers.map(singer => (
        <AvatarDot key={singer.key} initial={singer.initial} name={singer.name} isOwner={singer.isOwner} />
      ))}
    </span>
  )
}

export function LyricBlockCard({
  label,
  text,
  isRepeat,
  author,
  vocalState,
  singers,
  onTextChange,
  onAddSinger,
  onDetach,
  containerRef,
  containerStyle,
  dragHandleRef,
  dragHandleAttributes,
  dragHandleListeners,
  isDragging,
}: LyricBlockCardProps) {
  const showSingerAffordance = vocalState !== 'instrumental'

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={`mb-[9px] overflow-hidden rounded-[11px] border bg-card2 transition-shadow ${
        isDragging ? 'border-brandindigo/60 shadow-2xl' : 'border-hair'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-hair px-3 py-2">
        <button
          ref={dragHandleRef}
          {...dragHandleAttributes}
          {...dragHandleListeners}
          type="button"
          aria-label={`Drag to reorder ${label}`}
          className="cursor-grab text-[13px] text-lavdim hover:text-lav active:cursor-grabbing"
        >
          ⠿
        </button>
        <span className="text-[11px] font-bold uppercase tracking-[.08em] text-brandindigo">{label}</span>
        {isRepeat && (
          <span
            title="A linked repeat — editing the source updates every repeat"
            className="rounded-full bg-brandindigo/10 px-[7px] py-[1px] text-[10px] font-semibold text-brandindigo"
          >
            ↺ repeat
          </span>
        )}
        <span className="ml-auto flex items-center gap-[10px]">
          {/* REPEAT RULE: attribution stays with the original writer — a
              repeat block never shows its own author affordance, which
              would otherwise read as a second, false authorship claim. */}
          {!isRepeat && author && <WriterBadge author={author} />}
          {showSingerAffordance && <SingerCluster singers={singers} onAddSinger={onAddSinger} />}
        </span>
      </div>

      {isRepeat ? (
        // A linked repeat's own text is never editable here — its words
        // come from the source block. Dimmed to read as "borrowed," per
        // the sketch's repeat treatment.
        <div className="whitespace-pre-line px-[14px] py-[11px] text-[14px] leading-[1.85] text-lavdim">{text}</div>
      ) : (
        <textarea
          value={text}
          onChange={event => onTextChange(event.target.value)}
          rows={Math.max(2, text.split('\n').length)}
          className="w-full resize-none whitespace-pre-line bg-transparent px-[14px] py-[11px] text-[14px] leading-[1.85] text-white/95 outline-none placeholder:text-lavdim"
          placeholder="Start writing…"
        />
      )}

      {isRepeat && (
        <div className="border-t border-hair px-[14px] py-[7px]">
          <button type="button" onClick={onDetach} className="text-[11px] text-lavdim hover:text-lav">
            Detach to vary
          </button>
        </div>
      )}
    </div>
  )
}
