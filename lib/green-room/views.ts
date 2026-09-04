export const GREEN_ROOM_VIEW_VALUES = ['room', 'people', 'network'] as const

export type GreenRoomView = (typeof GREEN_ROOM_VIEW_VALUES)[number]

export function isGreenRoomView(value: string | null | undefined): value is GreenRoomView {
  return (GREEN_ROOM_VIEW_VALUES as readonly string[]).includes(value ?? '')
}

export function normalizeGreenRoomView(value: string | string[] | null | undefined): GreenRoomView {
  const candidate = Array.isArray(value) ? value[0] : value
  return isGreenRoomView(candidate) ? candidate : 'room'
}
