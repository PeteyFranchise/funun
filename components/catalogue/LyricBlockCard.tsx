'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SectionLockView } from '@/lib/catalogue/room-collaboration'
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

export type LyricBlockLockState = SectionLockView | { state: 'acquiring' }

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
  /** Uncast creative direction, distinct from every named singer and credit. */
  vocalDirection?: string | null
  /** Fires on every keystroke in the (non-repeat) lyric body — LyricsPad debounces before it PATCHes. */
  onTextChange: (text: string) => void
  /** Text editing opens only after the server grants this tab a short section lease. */
  lockState?: LyricBlockLockState
  onBeginEdit?: () => void
  onTakeOver?: () => void
  /** LyricsPad flushes the pending save before releasing the lease. */
  onEndEdit?: () => void
  /** Opens immutable recovery points for this section. Linked repeats use their source's history instead. */
  onOpenHistory?: () => void
  /** Opens the private creative discussion attached to this original section. */
  onOpenComments?: () => void
  /** Opens non-destructive alternate lyric proposals for this original section. */
  onOpenSuggestions?: () => void
  /** Pending proposals only; historical accepted/declined suggestions stay inside the panel. */
  suggestionCount?: number
  /** "＋🎤 who sings this?" — opens the singer picker. Owned entirely by the caller. */
  onAddSinger: () => void
  /** "Detach to vary" — copy-on-write, only ever shown on a repeat. */
  onDetach: () => void
  /**
   * Remove this section entirely (DELETE). The card confirms in place
   * first whenever the block still holds words — an empty just-added
   * block, or a repeat (whose words live on its source), removes on a
   * single click, so clearing out spare sections stays one tap while a
   * written verse is never lost to a stray click.
   */
  onRemove: () => void
  /** dnd-kit's `setNodeRef` for the sortable wrapper, forwarded from LyricsPad. */
  containerRef?: (node: HTMLDivElement | null) => void
  /** dnd-kit's transform/transition style, forwarded from LyricsPad. */
  containerStyle?: CSSProperties
  /** dnd-kit's `setActivatorNodeRef`, applied to the grip button so only the grip (not the whole card) starts a drag. */
  dragHandleRef?: (node: HTMLButtonElement | null) => void
  /**
   * dnd-kit's `DraggableAttributes`/`SyntheticListenerMap`, spread onto
   * the grip button as-is. Typed as `object` (not dnd-kit's own types)
   * so this component stays framework-decoupled — it just spreads
   * whatever LyricsPad's `useSortable()` call hands it.
   */
  dragHandleAttributes?: object
  dragHandleListeners?: object
  isDragging?: boolean
  /** Personal presentation width in the hybrid room; never changes lyric content or song order. */
  layoutWidth?: 'full' | 'half'
  onToggleLayoutWidth?: () => void
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
  vocalDirection,
  onAddSinger,
}: {
  singers: LyricBlockSinger[]
  vocalDirection: string | null
  onAddSinger: () => void
}) {
  if (singers.length === 0 && !vocalDirection) {
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

  if (singers.length === 0 && vocalDirection) {
    return (
      <span className="flex max-w-[250px] items-center gap-2">
        <span className="truncate text-[10.5px] text-lavdim">Voice: {vocalDirection}</span>
        <button
          type="button"
          onClick={onAddSinger}
          aria-label={`Assign a performer without replacing the direction: ${vocalDirection}`}
          className="shrink-0 whitespace-nowrap text-[10px] font-semibold text-brandindigo hover:text-white"
        >
          Assign performer
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onAddSinger}
      aria-label="Edit this section's vocal plan"
      className="flex max-w-[210px] items-center gap-2 text-left text-[10.5px] text-lavdim hover:text-white"
    >
      {singers.length > 0 && (
        <span className="flex shrink-0 items-center -space-x-1.5">
          {singers.map(singer => (
            <AvatarDot key={singer.key} initial={singer.initial} name={singer.name} isOwner={singer.isOwner} />
          ))}
        </span>
      )}
      {vocalDirection && <span className="truncate">Voice: {vocalDirection}</span>}
    </button>
  )
}

export function LyricBlockCard({
  label,
  text,
  isRepeat,
  author,
  vocalState,
  singers,
  vocalDirection = null,
  onTextChange,
  lockState = { state: 'available' },
  onBeginEdit,
  onTakeOver,
  onEndEdit,
  onOpenHistory,
  onOpenComments,
  onOpenSuggestions,
  suggestionCount = 0,
  onAddSinger,
  onDetach,
  onRemove,
  containerRef,
  containerStyle,
  dragHandleRef,
  dragHandleAttributes,
  dragHandleListeners,
  isDragging,
  layoutWidth = 'full',
  onToggleLayoutWidth,
}: LyricBlockCardProps) {
  const showSingerAffordance = vocalState !== 'instrumental'
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [confirmingTakeover, setConfirmingTakeover] = useState(false)

  useEffect(() => {
    if (lockState.state !== 'other') setConfirmingTakeover(false)
  }, [lockState.state])
  // Confirm only when there are words to lose. An empty just-added block or
  // a repeat (its words live on the source) removes on a single click.
  const removeNeedsConfirm = !isRepeat && text.trim().length > 0

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
        {onToggleLayoutWidth && (
          <button
            type="button"
            onClick={onToggleLayoutWidth}
            aria-label={layoutWidth === 'full' ? `Make ${label} half width` : `Make ${label} full width`}
            title={layoutWidth === 'full' ? 'Place beside another item' : 'Make full width'}
            className="rounded-full border border-hair px-2 py-0.5 text-[9px] font-semibold text-lavdim hover:border-brandindigo hover:text-white"
          >
            {layoutWidth === 'full' ? '½ width' : '↔ full'}
          </button>
        )}
        {isRepeat && (
          <span
            title="A linked repeat — editing the source updates every repeat"
            className="rounded-full bg-brandindigo/10 px-[7px] py-[1px] text-[10px] font-semibold text-brandindigo"
          >
            ↺ repeat
          </span>
        )}
        {!isRepeat && lockState.state === 'mine' && (
          <span className="rounded-full bg-emerald-400/10 px-[7px] py-[1px] text-[10px] font-semibold text-emerald-300">
            You&apos;re editing
          </span>
        )}
        {!isRepeat && lockState.state === 'acquiring' && (
          <span className="rounded-full bg-brandindigo/10 px-[7px] py-[1px] text-[10px] font-semibold text-brandindigo">
            Reserving…
          </span>
        )}
        {!isRepeat && lockState.state === 'other' && (
          <span className="rounded-full bg-amber-400/10 px-[7px] py-[1px] text-[10px] font-semibold text-amber-200">
            {lockState.holderName} is editing
          </span>
        )}
        <span className="ml-auto flex items-center gap-[10px]">
          {!isRepeat && onOpenSuggestions && (
            <button
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={onOpenSuggestions}
              aria-label={`Suggest alternate lyrics for ${label}`}
              className="whitespace-nowrap text-[10px] font-semibold text-brandindigo hover:text-white"
            >
              ⇄ Alternates{suggestionCount > 0 ? ` (${suggestionCount})` : ''}
            </button>
          )}
          {!isRepeat && onOpenComments && (
            <button
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={onOpenComments}
              aria-label={`Open comments for ${label}`}
              className="whitespace-nowrap text-[10px] font-semibold text-lavdim hover:text-white"
            >
              💬 Comments
            </button>
          )}
          {!isRepeat && onOpenHistory && (
            <button
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={onOpenHistory}
              aria-label={`Open recovery history for ${label}`}
              className="whitespace-nowrap text-[10px] font-semibold text-lavdim hover:text-white"
            >
              ↶ History
            </button>
          )}
          {/* REPEAT RULE: attribution stays with the original writer — a
              repeat block never shows its own author affordance, which
              would otherwise read as a second, false authorship claim. */}
          {!isRepeat && author && <WriterBadge author={author} />}
          {showSingerAffordance && (
            <SingerCluster
              singers={singers}
              vocalDirection={vocalDirection}
              onAddSinger={onAddSinger}
            />
          )}
        </span>
        {/* Remove — far right, kept apart from the identity badges. The
            two-step confirm below only appears for a block that still
            holds words (removeNeedsConfirm), so spare empty sections
            clear on a single tap. */}
        {confirmingRemove ? (
          <span className="flex items-center gap-[7px] text-[11px]">
            <span className="text-lavdim">Remove?</span>
            <button
              type="button"
              onClick={onRemove}
              className="font-semibold text-rose-400 hover:text-rose-300"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="text-lavdim hover:text-lav"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => (removeNeedsConfirm ? setConfirmingRemove(true) : onRemove())}
            aria-label={`Remove ${label}`}
            title="Remove this section"
            className="text-[13px] leading-none text-lavdim hover:text-rose-400"
          >
            ✕
          </button>
        )}
      </div>

      {isRepeat ? (
        // A linked repeat's own text is never editable here — its words
        // come from the source block. Dimmed to read as "borrowed," per
        // the sketch's repeat treatment.
        <div className="whitespace-pre-line px-[14px] py-[11px] text-[14px] leading-[1.85] text-lavdim">{text}</div>
      ) : (
        <>
          {lockState.state === 'other' && (
            <div className="mx-[14px] mt-[10px] rounded-[9px] border border-amber-300/20 bg-amber-300/[.06] px-3 py-2">
              <p className="text-[11px] text-amber-100">
                {lockState.holderName} is editing {label}. {onOpenSuggestions
                  ? 'You can wait, suggest an alternate, or intentionally take over.'
                  : 'You can wait or intentionally take over.'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {onOpenSuggestions && (
                  <button
                    type="button"
                    onClick={onOpenSuggestions}
                    className="text-[10px] font-semibold text-brandindigo hover:text-white"
                  >
                    Suggest an alternate
                  </button>
                )}
                {confirmingTakeover ? (
                  <>
                    <span className="text-[10px] text-lavdim">This may interrupt their edit.</span>
                    <button
                      type="button"
                      onClick={onTakeOver}
                      className="text-[10px] font-semibold text-amber-200 hover:text-white"
                    >
                      Take over anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingTakeover(false)}
                      className="text-[10px] text-lavdim hover:text-lav"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingTakeover(true)}
                    className="text-[10px] font-semibold text-amber-200 hover:text-white"
                  >
                    Take over editing
                  </button>
                )}
              </div>
            </div>
          )}
          <textarea
            value={text}
            onChange={event => onTextChange(event.target.value)}
            onFocus={() => {
              if (lockState.state === 'available') onBeginEdit?.()
            }}
            onBlur={() => {
              if (lockState.state === 'mine') onEndEdit?.()
            }}
            readOnly={lockState.state !== 'mine'}
            aria-readonly={lockState.state !== 'mine'}
            rows={Math.max(2, text.split('\n').length)}
            className={`w-full resize-none whitespace-pre-line bg-transparent px-[14px] py-[11px] text-[14px] leading-[1.85] outline-none placeholder:text-lavdim ${
              lockState.state === 'mine' ? 'text-white/95' : 'cursor-default text-lav'
            }`}
            placeholder="Start writing…"
          />
        </>
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
