// ─── Lyric block logic — numerals, repeats, detach, export, paste ────
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

// ─── "Copy full lyric" serializers (S-04) ──────────────────────────

export type LyricsFlavor = 'tagged' | 'plain'

/**
 * Serializes a work's blocks to a single string for "Copy full lyric".
 * `tagged` prefixes each section with its derived label in square
 * brackets on its own line ([Verse], [Chorus 2], …); `plain` emits only
 * the lines. Both flavors are described to the artist in tool-agnostic
 * language ("ready to paste into any tool or document") — the tagged
 * shape happens to be what several AI tools ingest natively, but that is
 * a property of the format, not a marketing line, and no tool name
 * appears anywhere in this module, its comments, or any string it
 * returns; the UI copy that wraps this (plan 08) must stay just as
 * neutral. Every linked repeat is expanded to its source's full text in
 * BOTH flavors — a lyric handed to a collaborator, a registrar or a tool
 * has to read as the finished song; a link is an internal storage detail
 * that must never leak into an export as a placeholder or repeat marker.
 */
export function serializeLyrics<T extends LyricBlockRecord>(
  blocks: T[],
  flavor: LyricsFlavor
): string {
  const byId = new Map(blocks.map(b => [b.id, b]))
  const labeled = deriveBlockNumerals(blocks)

  const sections = labeled.map(block => {
    const resolved = resolveRepeat(block, byId)
    return flavor === 'tagged' ? `[${block.label}]\n${resolved.text}` : resolved.text
  })

  return sections.join('\n\n')
}

// ─── Paste auto-split ──────────────────────────────────────────────

export type DraftBlock = {
  block_type: Exclude<BlockType, 'custom'> | 'verse'
  text: string
}

/**
 * Recognized section names, normalized (lowercase, hyphens/underscores
 * collapsed to a single space) mapped to the block type they adopt.
 * Deliberately excludes "custom" — a pasted heading can only adopt one
 * of the seven fixed types; anything else is left as ordinary text.
 */
const SECTION_NAME_TO_TYPE: Record<string, Exclude<BlockType, 'custom'>> = {
  verse: 'verse',
  'pre chorus': 'pre_chorus',
  prechorus: 'pre_chorus',
  chorus: 'chorus',
  bridge: 'bridge',
  intro: 'intro',
  introduction: 'intro',
  outro: 'outro',
  hook: 'hook',
}

/**
 * Tests a stanza's first line against the recognized section vocabulary,
 * tolerating optional surrounding square brackets, an optional trailing
 * numeral, an optional trailing colon, and any casing. Returns null when
 * the line doesn't match a recognized name.
 */
function matchSectionHeader(line: string): Exclude<BlockType, 'custom'> | null {
  let stripped = line.trim()

  // Peel decorations (brackets, trailing colon, trailing numeral) in any
  // combination and any order — "[Hook]:", "Hook 2:", "[Hook 2]" all
  // reduce to the same bare name.
  let previous: string
  do {
    previous = stripped
    stripped = stripped
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/:$/, '')
      .replace(/\s*\d+$/, '')
      .trim()
  } while (stripped !== previous)

  const normalized = stripped
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return SECTION_NAME_TO_TYPE[normalized] ?? null
}

/**
 * Splits a pasted full lyric into one draft block per stanza, ready for
 * plan 07's bulk-create route. Normalizes line endings first (Windows
 * \r\n and bare \r both fold to \n), then groups lines into stanzas
 * separated by one or more blank (whitespace-only) lines, trimming
 * trailing whitespace per line. Each stanza defaults to a verse; when its
 * first line reads as a recognized section header, that stanza adopts
 * the matching type instead and the header line is dropped from its text.
 */
export function splitPastedLyric(text: string): DraftBlock[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')

  const stanzas: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        stanzas.push(current)
        current = []
      }
      continue
    }
    current.push(line.replace(/\s+$/, ''))
  }
  if (current.length > 0) stanzas.push(current)

  return stanzas.map(stanzaLines => {
    const [firstLine, ...rest] = stanzaLines
    const matchedType = matchSectionHeader(firstLine)
    if (matchedType) {
      return { block_type: matchedType, text: rest.join('\n').trim() }
    }
    return { block_type: 'verse', text: stanzaLines.join('\n').trim() }
  })
}
