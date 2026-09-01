import {
  buildRoomPresenceViews,
  normalizeRoomActivity,
  roomActivityLabel,
  type RoomPresencePerson,
} from './room-presence'

const people: RoomPresencePerson[] = [
  { userId: 'peter', name: 'Peter Zora', avatarUrl: null, isViewer: true },
  { userId: 'maya', name: 'Maya Reyes', avatarUrl: '/maya.jpg', isViewer: false },
]

describe('Writer Room presence presentation', () => {
  it('coalesces multiple tabs into one person using the newest activity', () => {
    const views = buildRoomPresenceViews(
      {
        peter: [
          { kind: 'in_room', updated_at: '2026-09-01T00:00:00Z' },
          { kind: 'editing_lyrics', label: 'Verse 1', updated_at: '2026-09-01T00:00:03Z' },
        ],
      },
      people
    )

    expect(views).toHaveLength(1)
    expect(views[0]?.activity.kind).toBe('editing_lyrics')
    expect(roomActivityLabel(views[0]!.activity)).toBe('Editing Verse 1')
  })

  it('ignores unknown presence keys instead of trusting payload identity', () => {
    const views = buildRoomPresenceViews(
      { stranger: [{ kind: 'in_room', updated_at: '2026-09-01T00:00:00Z' }] },
      people
    )
    expect(views).toEqual([])
  })

  it('rejects unknown activity kinds and malformed timestamps', () => {
    expect(normalizeRoomActivity({ kind: 'editing_contracts', updated_at: '2026-09-01T00:00:00Z' })).toBeNull()
    expect(normalizeRoomActivity({ kind: 'in_room', updated_at: 'not-a-date' })).toBeNull()
  })

  it('normalizes and bounds the optional display label', () => {
    const activity = normalizeRoomActivity({
      kind: 'listening',
      label: `  Take   ${'x'.repeat(100)}  `,
      updated_at: '2026-09-01T00:00:00Z',
    })
    expect(activity?.label?.startsWith('Take x')).toBe(true)
    expect(activity?.label).toHaveLength(80)
  })
})
