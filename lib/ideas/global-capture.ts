const WORK_PATH = /^\/vault\/works\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/)?$/i

export function writerRoomIdFromPath(pathname: string): string | null {
  return pathname.match(WORK_PATH)?.[1] ?? null
}

export function shouldOpenCaptureShortcut(input: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  repeat: boolean
  defaultPrevented: boolean
  editableTarget: boolean
}): boolean {
  return !input.repeat
    && !input.defaultPrevented
    && !input.editableTarget
    && input.shiftKey
    && (input.metaKey || input.ctrlKey)
    && input.key.toLocaleLowerCase() === 'u'
}

export function isEditableCaptureTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}
