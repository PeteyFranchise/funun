import {
  WRITER_ROOM_LAYOUT_VERSION,
  WriterRoomLayoutSchema,
  lyricLayoutKey,
  lyricOrderFromWriterRoomLayout,
  parseWriterRoomLayout,
  reconcileWriterRoomLayout,
  setWriterRoomItemWidth,
  snapWriterRoomLyrics,
  type WriterRoomLayout,
} from './writer-room-layout'

const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'
const B3 = '33333333-3333-4333-8333-333333333333'

describe('writer-room-layout', () => {
  it('builds the familiar all-full-width layout when a user has no saved preference', () => {
    expect(reconcileWriterRoomLayout(null, [B1, B2])).toEqual({
      version: WRITER_ROOM_LAYOUT_VERSION,
      items: [
        { key: lyricLayoutKey(B1), width: 'full' },
        { key: lyricLayoutKey(B2), width: 'full' },
        { key: 'module:versions', width: 'full' },
        { key: 'module:diary', width: 'full' },
      ],
    })
  })

  it('preserves module placement and item widths while restoring current canonical lyric order', () => {
    const saved: WriterRoomLayout = {
      version: 1,
      items: [
        { key: lyricLayoutKey(B2), width: 'half' },
        { key: 'module:versions', width: 'half' },
        { key: lyricLayoutKey(B1), width: 'full' },
        { key: 'module:diary', width: 'half' },
      ],
    }

    expect(reconcileWriterRoomLayout(saved, [B1, B2])).toEqual({
      version: 1,
      items: [
        { key: lyricLayoutKey(B1), width: 'full' },
        { key: 'module:versions', width: 'half' },
        { key: lyricLayoutKey(B2), width: 'half' },
        { key: 'module:diary', width: 'half' },
      ],
    })
  })

  it('drops deleted ids, restores missing modules, and inserts new lyric blocks', () => {
    const saved = parseWriterRoomLayout({
      version: 1,
      items: [
        { key: lyricLayoutKey(B1), width: 'half' },
        { key: `lyric:${B3}`, width: 'half' },
        { key: 'module:diary', width: 'half' },
      ],
    })

    expect(reconcileWriterRoomLayout(saved, [B1, B2])).toEqual({
      version: 1,
      items: [
        { key: lyricLayoutKey(B1), width: 'half' },
        { key: lyricLayoutKey(B2), width: 'full' },
        { key: 'module:diary', width: 'half' },
        { key: 'module:versions', width: 'full' },
      ],
    })
  })

  it('snaps lyrics together in canonical order and makes them full width', () => {
    const layout: WriterRoomLayout = {
      version: 1,
      items: [
        { key: 'module:versions', width: 'half' },
        { key: lyricLayoutKey(B2), width: 'half' },
        { key: 'module:diary', width: 'full' },
        { key: lyricLayoutKey(B1), width: 'half' },
      ],
    }

    const snapped = snapWriterRoomLyrics(layout, [B1, B2])
    expect(snapped.items).toEqual([
      { key: lyricLayoutKey(B1), width: 'full' },
      { key: lyricLayoutKey(B2), width: 'full' },
      { key: 'module:versions', width: 'half' },
      { key: 'module:diary', width: 'full' },
    ])
    expect(lyricOrderFromWriterRoomLayout(snapped)).toEqual([B1, B2])
  })

  it('changes presentation width without touching item order', () => {
    const layout = reconcileWriterRoomLayout(null, [B1])
    expect(setWriterRoomItemWidth(layout, lyricLayoutKey(B1), 'half').items).toEqual([
      { key: lyricLayoutKey(B1), width: 'half' },
      { key: 'module:versions', width: 'full' },
      { key: 'module:diary', width: 'full' },
    ])
  })

  it('rejects duplicate, forged, oversized, and future-version payloads', () => {
    expect(WriterRoomLayoutSchema.safeParse({
      version: 1,
      items: [
        { key: lyricLayoutKey(B1), width: 'full' },
        { key: lyricLayoutKey(B1), width: 'half' },
      ],
    }).success).toBe(false)
    expect(parseWriterRoomLayout({ version: 1, items: [{ key: 'module:members', width: 'full' }] })).toBeNull()
    expect(parseWriterRoomLayout({ version: 2, items: [] })).toBeNull()
    expect(parseWriterRoomLayout({
      version: 1,
      items: Array.from({ length: 251 }, (_, index) => ({
        key: `lyric:${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
        width: 'full',
      })),
    })).toBeNull()
  })
})
