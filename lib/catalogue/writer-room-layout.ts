import { z } from 'zod'

// ─── Personal Writer's Room layout ─────────────────────────────────────
//
// This model stores presentation only. Lyric text/order, version numbering,
// Diary chronology, membership, and splits remain in their authoritative
// tables. A layout may place a module between lyric blocks, but it can never
// invent content or alter evidence.

export const WRITER_ROOM_LAYOUT_VERSION = 1 as const

export const WRITER_ROOM_MODULE_KEYS = ['module:versions', 'module:diary'] as const
export type WriterRoomModuleKey = (typeof WRITER_ROOM_MODULE_KEYS)[number]
export type WriterRoomLayoutKey = `lyric:${string}` | WriterRoomModuleKey
export type WriterRoomLayoutWidth = 'full' | 'half'

export type WriterRoomLayoutItem = {
  key: WriterRoomLayoutKey
  width: WriterRoomLayoutWidth
}

export type WriterRoomLayout = {
  version: typeof WRITER_ROOM_LAYOUT_VERSION
  items: WriterRoomLayoutItem[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function lyricLayoutKey(blockId: string): `lyric:${string}` {
  return `lyric:${blockId}`
}

export function lyricIdFromLayoutKey(key: string): string | null {
  if (!key.startsWith('lyric:')) return null
  const id = key.slice('lyric:'.length)
  return id.length > 0 ? id : null
}

export function isWriterRoomModuleKey(key: string): key is WriterRoomModuleKey {
  return (WRITER_ROOM_MODULE_KEYS as readonly string[]).includes(key)
}

export function isWriterRoomLayoutKey(key: string): key is WriterRoomLayoutKey {
  const lyricId = lyricIdFromLayoutKey(key)
  return isWriterRoomModuleKey(key) || (lyricId !== null && UUID_PATTERN.test(lyricId))
}

const WriterRoomLayoutItemSchema = z
  .object({
    key: z.string().trim().min(1).max(80).refine(isWriterRoomLayoutKey),
    width: z.enum(['full', 'half']),
  })
  .strict()

export const WriterRoomLayoutSchema = z
  .object({
    version: z.literal(WRITER_ROOM_LAYOUT_VERSION),
    items: z.array(WriterRoomLayoutItemSchema).max(250),
  })
  .strict()
  .superRefine((layout, context) => {
    const seen = new Set<string>()
    layout.items.forEach((item, index) => {
      if (seen.has(item.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Layout item keys must be unique',
          path: ['items', index, 'key'],
        })
      }
      seen.add(item.key)
    })
  })

export function parseWriterRoomLayout(value: unknown): WriterRoomLayout | null {
  const parsed = WriterRoomLayoutSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function defaultWriterRoomLayout(lyricBlockIds: string[]): WriterRoomLayout {
  return {
    version: WRITER_ROOM_LAYOUT_VERSION,
    items: [
      ...lyricBlockIds.map(id => ({ key: lyricLayoutKey(id), width: 'full' as const })),
      ...WRITER_ROOM_MODULE_KEYS.map(key => ({ key, width: 'full' as const })),
    ],
  }
}

/**
 * Reconciles saved presentation state against live content. Unknown/deleted
 * lyric ids disappear, newly-created blocks arrive in canonical order, and
 * missing fixed modules are restored. Relative lyric order always comes from
 * the authoritative lyric-block query, not stale personal JSON.
 */
export function reconcileWriterRoomLayout(
  saved: WriterRoomLayout | null | undefined,
  lyricBlockIds: string[]
): WriterRoomLayout {
  if (!saved) return defaultWriterRoomLayout(lyricBlockIds)

  const canonicalLyricKeys = lyricBlockIds.map(lyricLayoutKey)
  const allowed = new Set<string>([...canonicalLyricKeys, ...WRITER_ROOM_MODULE_KEYS])
  const widthByKey = new Map(saved.items.map(item => [item.key, item.width] as const))
  const seenModules = new Set<WriterRoomModuleKey>()
  const nextItems: WriterRoomLayoutItem[] = []
  let lyricIndex = 0

  for (const item of saved.items) {
    if (!allowed.has(item.key)) continue
    if (isWriterRoomModuleKey(item.key)) {
      if (seenModules.has(item.key)) continue
      seenModules.add(item.key)
      nextItems.push({ key: item.key, width: item.width })
      continue
    }

    const canonicalKey = canonicalLyricKeys[lyricIndex]
    if (!canonicalKey) continue
    lyricIndex += 1
    nextItems.push({ key: canonicalKey, width: widthByKey.get(canonicalKey) ?? 'full' })
  }

  if (lyricIndex < canonicalLyricKeys.length) {
    const missingLyrics = canonicalLyricKeys.slice(lyricIndex).map(key => ({
      key,
      width: widthByKey.get(key) ?? 'full' as WriterRoomLayoutWidth,
    }))
    const lastLyricIndex = nextItems.findLastIndex(item => lyricIdFromLayoutKey(item.key) !== null)
    nextItems.splice(lastLyricIndex + 1, 0, ...missingLyrics)
  }

  for (const key of WRITER_ROOM_MODULE_KEYS) {
    if (!seenModules.has(key)) nextItems.push({ key, width: widthByKey.get(key) ?? 'full' })
  }

  return { version: WRITER_ROOM_LAYOUT_VERSION, items: nextItems }
}

export function lyricOrderFromWriterRoomLayout(layout: WriterRoomLayout): string[] {
  return layout.items.flatMap(item => {
    const blockId = lyricIdFromLayoutKey(item.key)
    return blockId ? [blockId] : []
  })
}

export function setWriterRoomItemWidth(
  layout: WriterRoomLayout,
  key: WriterRoomLayoutKey,
  width: WriterRoomLayoutWidth
): WriterRoomLayout {
  return {
    ...layout,
    items: layout.items.map(item => (item.key === key ? { ...item, width } : item)),
  }
}

export function snapWriterRoomLyrics(
  layout: WriterRoomLayout,
  canonicalLyricIds: string[]
): WriterRoomLayout {
  const reconciled = reconcileWriterRoomLayout(layout, canonicalLyricIds)
  const modules = reconciled.items.filter(item => isWriterRoomModuleKey(item.key))
  return {
    version: WRITER_ROOM_LAYOUT_VERSION,
    items: [
      ...canonicalLyricIds.map(id => ({ key: lyricLayoutKey(id), width: 'full' as const })),
      ...modules,
    ],
  }
}
