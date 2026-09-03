type TextDraft = { text: string; baseText?: string; updatedAt: number }

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readTextDraft(key: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): TextDraft | null {
  try {
    const parsed = JSON.parse(storage()?.getItem(key) ?? 'null') as Partial<TextDraft> | null
    if (!parsed || typeof parsed.text !== 'string' || typeof parsed.updatedAt !== 'number') return null
    if (Date.now() - parsed.updatedAt > maxAgeMs) {
      storage()?.removeItem(key)
      return null
    }
    return { text: parsed.text, baseText: typeof parsed.baseText === 'string' ? parsed.baseText : undefined, updatedAt: parsed.updatedAt }
  } catch {
    return null
  }
}

export function writeTextDraft(key: string, text: string, baseText?: string) {
  try {
    storage()?.setItem(key, JSON.stringify({ text, baseText, updatedAt: Date.now() }))
  } catch {
    // Storage can be disabled or full. The visible editor remains usable.
  }
}

export function clearTextDraft(key: string) {
  try { storage()?.removeItem(key) } catch {}
}
