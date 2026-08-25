import { sourceLabel } from './GamePlanPanel'

// ─── sourceLabel (WR-01) ────────────────────────────────────────────────
// Proves the centralized topic-source label mapping shared by the
// suggestion pills and the persisted-topic badge: a Playbook-authored
// topic (source `playbook:<uuid>`) gets its own "From Playbook" label
// instead of being lumped in with Selects, and no source ever falls
// through to a raw id/unknown string in AE-facing UI.

describe('sourceLabel', () => {
  it('labels a seeded topic', () => {
    expect(sourceLabel('seeded')).toBe('Seeded default')
  })

  it('labels any selects:* source "From Selects"', () => {
    expect(sourceLabel('selects:Late Night Drive')).toBe('From Selects')
    expect(sourceLabel('selects:')).toBe('From Selects')
  })

  it('labels any playbook:* source "From Playbook" — not lumped in with Selects', () => {
    expect(sourceLabel('playbook:3f9a1c2e-...')).toBe('From Playbook')
    expect(sourceLabel('playbook:')).toBe('From Playbook')
  })

  it('returns null for a custom (AE-typed) topic — source is null', () => {
    expect(sourceLabel(null)).toBeNull()
  })

  it('never renders a raw/unknown source string — unrecognized sources return null', () => {
    expect(sourceLabel('mystery-source')).toBeNull()
    expect(sourceLabel('playbook')).toBeNull()
  })
})
