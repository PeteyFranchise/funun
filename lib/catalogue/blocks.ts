// ─── Lyric block logic — numerals, repeats, detach ────────────────────
// Pure module in the style of lib/split-sheets/approval.ts: no Supabase
// client, no framework import, no I/O. Everything here operates over a
// structural row shape (declared locally — plan 04's types/catalogue.ts
// is the eventual DB row type and is structurally compatible with it).
//
// Two doctrine rules this module exists to make provably true:
//
// RENUMBERING RULE — section numerals are DERIVED from a block's position
// among same-type siblings, never stored. Authorship binds to a block's
// identity (its id), never to its numeral, so a drag-reorder swaps labels
// instantly and cannot smudge who wrote what. A stored numeral would need
// a renumbering write cascade on every reorder/delete (RESEARCH Pitfall 5)
// — do not reintroduce one.
//
// REPEAT RULE — a repeated section (chorus x2, etc.) is a LINKED block,
// not a duplicate. It resolves to the source block's text and the
// source's author; editing the source updates every repeat with no write
// to the repeat rows. Detaching a repeat ("detach to vary") is
// copy-on-write: the detached row takes the source's current text as its
// own starting text and its own authorship from that moment — the source
// is never touched.

// ─── Types ──────────────────────────────────────────────────────────

/** The seven fixed structure types plus a free-named custom section. */
export type BlockType =
  | 'verse'
  | 'pre_chorus'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'outro'
  | 'hook'
  | 'custom'

export type AuthorKind = 'human' | 'ai'

/**
 * A block-shaped input record. Declared locally so this module has no
 * wave-1 sibling dependency — plan 04's DB row type will be structurally
 * compatible with this shape (id, block_type, custom_label, position,
 * text, author_kind, author_user_id, repeat_of_block_id and nothing that
 * could encode a stored ordinal).
 */
export type LyricBlockRecord = {
  id: string
  block_type: BlockType
  custom_label: string | null
  position: number
  text: string
  author_kind: AuthorKind
  author_user_id: string | null
  repeat_of_block_id: string | null
}

/** Lookup accepted by the repeat-resolving functions — a Map or a plain object keyed by id. */
export type BlockLookup<T extends LyricBlockRecord> = Map<string, T> | Record<string, T>

function toMap<T extends LyricBlockRecord>(lookup: BlockLookup<T>): Map<string, T> {
  return lookup instanceof Map ? lookup : new Map(Object.entries(lookup))
}

// ─── Display vocabulary ────────────────────────────────────────────

/** The seven fixed types' display labels (sketch 006-A), plus a neutral fallback for custom. */
export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  verse: 'Verse',
  pre_chorus: 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  hook: 'Hook',
  custom: 'Custom',
}

export const BLOCK_TYPE_VALUES = Object.keys(BLOCK_TYPE_LABELS) as BlockType[]

// ─── Numeral derivation (RENUMBERING RULE) ─────────────────────────

export type BlockWithLabel<T extends LyricBlockRecord = LyricBlockRecord> = T & {
  /** One-based ordinal among same-type siblings; null when the type needs none. */
  numeral: number | null
  /** The resolved display label, e.g. "Verse 2", "Chorus" (lone), or a custom label. */
  label: string
}

/**
 * Returns every block, in position order, alongside its derived display
 * label. Nothing here reads a stored ordinal — the numeral is always
 * recomputed from position among same-type siblings, because authorship
 * binds to a block's identity and a stored numeral would let a reshuffle
 * rewrite history. Two rules: a type with exactly one instance gets no
 * numeral at all (a lone chorus is "Chorus", not "Chorus 1"), and custom
 * blocks are excluded from numbering entirely — they always show their
 * own `custom_label` (falling back to a neutral label when blank).
 */
export function deriveBlockNumerals<T extends LyricBlockRecord>(blocks: T[]): BlockWithLabel<T>[] {
  const ordered = [...blocks].sort((a, b) => a.position - b.position)

  const countByType = new Map<BlockType, number>()
  for (const block of ordered) {
    if (block.block_type === 'custom') continue
    countByType.set(block.block_type, (countByType.get(block.block_type) ?? 0) + 1)
  }

  const seenByType = new Map<BlockType, number>()
  return ordered.map(block => {
    if (block.block_type === 'custom') {
      const label = block.custom_label?.trim() || 'Custom'
      return { ...block, numeral: null, label }
    }

    const seen = (seenByType.get(block.block_type) ?? 0) + 1
    seenByType.set(block.block_type, seen)
    const total = countByType.get(block.block_type) ?? 1
    const baseLabel = BLOCK_TYPE_LABELS[block.block_type]

    if (total <= 1) {
      return { ...block, numeral: null, label: baseLabel }
    }
    return { ...block, numeral: seen, label: `${baseLabel} ${seen}` }
  })
}

// ─── Linked repeats (REPEAT RULE) ──────────────────────────────────

export type ResolvedRepeat = {
  text: string
  authorKind: AuthorKind
  authorUserId: string | null
  isRepeat: boolean
}

/** Hard cap on chain length — guards a cyclic link against an infinite walk. */
const MAX_REPEAT_DEPTH = 50

/**
 * Resolves a block's effective text and effective author, following a
 * linked repeat back to its source. Attribution follows the link: a
 * repeat is the same words by the same writer, so it must never create a
 * second authorship claim. Guards a missing target (returns empty text,
 * never throws) and a cycle (walks with a visited set and a hard depth
 * cap, returning the last resolvable node rather than recursing forever).
 */
export function resolveRepeat<T extends LyricBlockRecord>(
  block: T,
  byId: BlockLookup<T>
): ResolvedRepeat {
  if (!block.repeat_of_block_id) {
    return {
      text: block.text,
      authorKind: block.author_kind,
      authorUserId: block.author_user_id,
      isRepeat: false,
    }
  }

  const lookup = toMap(byId)
  const visited = new Set<string>([block.id])
  let current: T | undefined = lookup.get(block.repeat_of_block_id)
  let last: T | undefined
  let depth = 0

  while (current && depth < MAX_REPEAT_DEPTH && !visited.has(current.id)) {
    visited.add(current.id)
    last = current
    depth += 1
    current = current.repeat_of_block_id ? lookup.get(current.repeat_of_block_id) : undefined
  }

  if (!last) {
    return { text: '', authorKind: 'human', authorUserId: null, isRepeat: true }
  }

  return {
    text: last.text,
    authorKind: last.author_kind,
    authorUserId: last.author_user_id,
    isRepeat: true,
  }
}

export type DetachPatch = {
  text: string
  repeat_of_block_id: null
  author_kind: 'human'
  author_user_id: string
}

export type DetachResult<T extends LyricBlockRecord> = {
  /** The field patch the detach route should write to the detaching block. */
  patch: DetachPatch
  /** The source block, returned unchanged — detach never mutates the source. */
  source: T | null
}

/**
 * Plans a "detach to vary" — copy-on-write for the final-chorus-lift case.
 * The detached row's new text is the source's CURRENT resolved text (so a
 * chain resolves to the original, not an intermediate link), its link is
 * cleared, and it takes the detaching user as its own author from this
 * moment — the source block is returned untouched. The detach is itself a
 * diary event (plan 01's trigger fires on the link being cleared) and the
 * new block's authorship starts here, not before.
 */
export function planDetach<T extends LyricBlockRecord>(
  block: T,
  byId: BlockLookup<T>,
  detachingUserId: string
): DetachResult<T> {
  const lookup = toMap(byId)
  const resolved = resolveRepeat(block, lookup)
  const source = block.repeat_of_block_id ? lookup.get(block.repeat_of_block_id) ?? null : null

  return {
    patch: {
      text: resolved.text,
      repeat_of_block_id: null,
      author_kind: 'human',
      author_user_id: detachingUserId,
    },
    source,
  }
}
