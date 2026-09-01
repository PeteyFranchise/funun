export const ROOM_ACTIVITY_KINDS = [
  'in_room',
  'editing_lyrics',
  'listening',
  'recently_active',
] as const

export type RoomActivityKind = (typeof ROOM_ACTIVITY_KINDS)[number]

export type RoomActivity = {
  kind: RoomActivityKind
  label: string | null
  updatedAt: string
}
export type RoomPresencePerson = {
  userId: string
  name: string
  avatarUrl: string | null
  isViewer: boolean
}

export type RoomPresenceView = RoomPresencePerson & {
  activity: RoomActivity
}

const ACTIVITY_SET = new Set<string>(ROOM_ACTIVITY_KINDS)
const MAX_LABEL_LENGTH = 80

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH)
  return clean || null
}

export function normalizeRoomActivity(value: unknown): RoomActivity | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.kind !== 'string' || !ACTIVITY_SET.has(raw.kind)) return null
  if (typeof raw.updated_at !== 'string' || !Number.isFinite(Date.parse(raw.updated_at))) return null

  return {
    kind: raw.kind as RoomActivityKind,
    label: cleanLabel(raw.label),
    updatedAt: raw.updated_at,
  }
}

function newestActivity(metas: unknown[]): RoomActivity {
  const activities = metas
    .map(normalizeRoomActivity)
    .filter((activity): activity is RoomActivity => activity !== null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

  return (
    activities[0] ?? {
      kind: 'in_room',
      label: null,
      updatedAt: new Date(0).toISOString(),
    }
  )
}

/**
 * Converts the untrusted Presence payload into views backed by the server-
 * supplied room roster. Unknown keys are ignored and multiple tabs coalesce
 * into one person using that person's most recently published activity.
 */
export function buildRoomPresenceViews(
  state: Record<string, unknown[]>,
  people: RoomPresencePerson[]
): RoomPresenceView[] {
  const peopleById = new Map(people.map(person => [person.userId, person]))
  const views: RoomPresenceView[] = []

  for (const [userId, metas] of Object.entries(state)) {
    const person = peopleById.get(userId)
    if (!person || !Array.isArray(metas) || metas.length === 0) continue
    views.push({ ...person, activity: newestActivity(metas) })
  }

  return views.sort((a, b) => Number(b.isViewer) - Number(a.isViewer) || a.name.localeCompare(b.name))
}

export function roomActivityLabel(activity: RoomActivity): string {
  if (activity.kind === 'editing_lyrics') return activity.label ? `Editing ${activity.label}` : 'Editing lyrics'
  if (activity.kind === 'listening') return activity.label ? `Listening to ${activity.label}` : 'Listening to a take'
  if (activity.kind === 'recently_active') return 'Recently active'
  return 'In the room'
}
