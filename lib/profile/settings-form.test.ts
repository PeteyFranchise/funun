import type { UserProfile } from '@/types'
import {
  toForm,
  SETTINGS_TABS,
  RIGHTS_FIELDS,
  PUBLIC_FIELDS,
  CLIENT_ONLY_FIELDS,
  isTabDirty,
  buildTabPayload,
  saveThenNavigate,
  buildSaversForTab,
  type FormState,
  type SaveResult,
  type TabSaver,
} from '@/lib/profile/settings-form'

// toForm() coalesces every field, so an empty profile literal is a valid
// minimal baseline — that is the point of the ?? defaults.
const BASELINE: FormState = toForm({} as UserProfile)

const ok = (): Promise<SaveResult> => Promise.resolve({ ok: true })
const fail = (error: string) => (): Promise<SaveResult> => Promise.resolve({ ok: false, error })

describe('SETTINGS_TABS', () => {
  it('is ordered rights → profile → payouts with segments matching useSelectedLayoutSegment()', () => {
    expect(SETTINGS_TABS.map(t => t.id)).toEqual(['rights', 'profile', 'payouts'])
    expect(SETTINGS_TABS.map(t => t.href)).toEqual([
      '/settings',
      '/settings/profile',
      '/settings/payouts',
    ])
    // The index route's segment is null, not '' and not '/settings'.
    expect(SETTINGS_TABS.map(t => t.segment)).toEqual([null, 'profile', 'payouts'])
  })
})

describe('saveThenNavigate — the two cases that silently regress', () => {
  it('navigates immediately and issues zero writes when nothing is dirty', async () => {
    const navigate = jest.fn()
    const saver = jest.fn(ok)

    const result = await saveThenNavigate([{ dirty: false, save: saver }], navigate)

    expect(saver).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ navigated: true, error: null, writes: 0 })
  })

  it('navigates with zero writes when there are no savers at all (the payouts tab)', async () => {
    const navigate = jest.fn()
    const result = await saveThenNavigate([], navigate)

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ navigated: true, error: null, writes: 0 })
  })

  it('does NOT navigate when a dirty save fails, and reports the error', async () => {
    const navigate = jest.fn()

    const result = await saveThenNavigate(
      [{ dirty: true, save: fail('Could not save profile') }],
      navigate
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(result.navigated).toBe(false)
    expect(result.error).toBe('Could not save profile')
    expect(result.writes).toBe(1)
  })

  it('navigates only after the save promise resolves', async () => {
    const order: string[] = []
    const navigate = jest.fn(() => {
      order.push('navigate')
    })
    const saver: TabSaver = {
      dirty: true,
      save: () =>
        new Promise<SaveResult>(resolve => {
          setTimeout(() => {
            order.push('save')
            resolve({ ok: true })
          }, 0)
        }),
    }

    const result = await saveThenNavigate([saver], navigate)

    expect(order).toEqual(['save', 'navigate'])
    expect(result).toEqual({ navigated: true, error: null, writes: 1 })
  })

  it('stops at the first failure — the second saver never runs and navigate never fires', async () => {
    const navigate = jest.fn()
    const second = jest.fn(ok)

    const result = await saveThenNavigate(
      [
        { dirty: true, save: fail('profile write failed') },
        { dirty: true, save: second },
      ],
      navigate
    )

    expect(second).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(result).toEqual({ navigated: false, error: 'profile write failed', writes: 1 })
  })

  it('runs both dirty savers and navigates once when they both succeed', async () => {
    const navigate = jest.fn()
    const first = jest.fn(ok)
    const second = jest.fn(ok)

    const result = await saveThenNavigate(
      [
        { dirty: true, save: first },
        { dirty: true, save: second },
      ],
      navigate
    )

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ navigated: true, error: null, writes: 2 })
  })

  it('skips clean savers and only writes the dirty ones', async () => {
    const navigate = jest.fn()
    const clean = jest.fn(ok)
    const dirty = jest.fn(ok)

    const result = await saveThenNavigate(
      [
        { dirty: false, save: clean },
        { dirty: true, save: dirty },
      ],
      navigate
    )

    expect(clean).not.toHaveBeenCalled()
    expect(dirty).toHaveBeenCalledTimes(1)
    expect(result.writes).toBe(1)
    expect(result.navigated).toBe(true)
  })
})

describe('isTabDirty', () => {
  it('does not mark the rights tab dirty for a public-group edit, or vice versa', () => {
    const publicEdit: FormState = { ...BASELINE, artist_name: 'New Name' }
    expect(isTabDirty('rights', publicEdit, BASELINE)).toBe(false)
    expect(isTabDirty('profile', publicEdit, BASELINE)).toBe(true)

    const rightsEdit: FormState = { ...BASELINE, ipi: '00000000123' }
    expect(isTabDirty('rights', rightsEdit, BASELINE)).toBe(true)
    expect(isTabDirty('profile', rightsEdit, BASELINE)).toBe(false)
  })

  it('is clean when nothing changed', () => {
    expect(isTabDirty('rights', { ...BASELINE }, BASELINE)).toBe(false)
    expect(isTabDirty('profile', { ...BASELINE }, BASELINE)).toBe(false)
  })

  it('compares array-valued public fields by content, not identity', () => {
    // Same content, different array instance — must NOT read as dirty.
    expect(isTabDirty('profile', { ...BASELINE, genres: [] }, BASELINE)).toBe(false)
    expect(isTabDirty('profile', { ...BASELINE, genres: ['r&b'] }, BASELINE)).toBe(true)
    expect(
      isTabDirty('profile', { ...BASELINE, roles: [{ kind: 'preset', slug: 'artist' }] }, BASELINE)
    ).toBe(true)
    expect(isTabDirty('profile', { ...BASELINE, open_to: ['sync'] }, BASELINE)).toBe(true)
    expect(isTabDirty('profile', { ...BASELINE, industry_roles: ['producer'] }, BASELINE)).toBe(true)
  })

  it('marks the rights tab dirty when only mailing_address_structured changed', () => {
    const structured: FormState = {
      ...BASELINE,
      mailing_address_structured: { raw: '1 Main St', locality: 'LA' },
    }
    expect(isTabDirty('rights', structured, BASELINE)).toBe(true)
    expect(isTabDirty('profile', structured, BASELINE)).toBe(false)
  })

  it('is always false for payouts — that tab owns no fields', () => {
    const everythingChanged: FormState = {
      ...BASELINE,
      artist_name: 'x',
      ipi: 'y',
      mailing_address_structured: { raw: 'z' },
    }
    expect(isTabDirty('payouts', everythingChanged, BASELINE)).toBe(false)
  })
})

describe('buildTabPayload', () => {
  it('sends only the rights keys on the rights tab', () => {
    const keys = Object.keys(buildTabPayload('rights', BASELINE))
    for (const k of PUBLIC_FIELDS) expect(keys).not.toContain(k)
    for (const k of RIGHTS_FIELDS) expect(keys).toContain(k)
    // The client-only companion is never sent under its own key.
    expect(keys).not.toContain('mailing_address_structured')
  })

  it('sends only the public keys on the profile tab', () => {
    const keys = Object.keys(buildTabPayload('profile', BASELINE))
    for (const k of RIGHTS_FIELDS) expect(keys).not.toContain(k)
    for (const k of PUBLIC_FIELDS) expect(keys).toContain(k)
    expect(keys).not.toContain('mailing_address_structured')
  })

  it('still sends `genre` (singular) — inputless, but in EDITABLE_FIELDS', () => {
    expect(Object.keys(buildTabPayload('profile', BASELINE))).toContain('genre')
  })

  it('composes mailing_address exactly as the single-form save did', () => {
    // Blank → null.
    expect(buildTabPayload('rights', BASELINE).mailing_address).toBeNull()
    expect(
      buildTabPayload('rights', { ...BASELINE, mailing_address: '   ' }).mailing_address
    ).toBeNull()

    // Verified structured object wins when present.
    const structured = { raw: '1 Main St', locality: 'Los Angeles' }
    expect(
      buildTabPayload('rights', {
        ...BASELINE,
        mailing_address: '1 Main St',
        mailing_address_structured: structured,
      }).mailing_address
    ).toEqual(structured)

    // Otherwise the trimmed raw string, wrapped.
    expect(
      buildTabPayload('rights', { ...BASELINE, mailing_address: '  1 Main St  ' }).mailing_address
    ).toEqual({ raw: '1 Main St' })
  })

  it('returns an empty body for payouts', () => {
    expect(buildTabPayload('payouts', BASELINE)).toEqual({})
  })
})

// ── Field-coverage guard ────────────────────────────────────────────────
// This is the test that stops a field from silently going unsaved. Add a key
// to FormState and toForm() without assigning it a tab, and this fails.
describe('field ownership covers every FormState key exactly once', () => {
  it('partitions toForm()’s key set across rights, public, and client-only', () => {
    const formKeys = Object.keys(BASELINE).sort()
    const assigned = [...RIGHTS_FIELDS, ...PUBLIC_FIELDS, ...CLIENT_ONLY_FIELDS]
      .map(String)
      .sort()

    expect(assigned).toEqual(formKeys)
  })

  it('assigns no key to both groups', () => {
    const overlap = RIGHTS_FIELDS.filter(k => PUBLIC_FIELDS.includes(k))
    expect(overlap).toEqual([])
  })
})

// ── Saver composition (save-on-switch wiring) ───────────────────────────
describe('buildSaversForTab', () => {
  const deps = (overrides: Partial<Parameters<typeof buildSaversForTab>[1]> = {}) => ({
    profileDirty: false,
    saveProfile: ok,
    visibilityDirty: false,
    saveVisibility: ok,
    ...overrides,
  })

  it('leaves the rights tab with the main save alone', () => {
    const saveProfile = jest.fn(ok)
    const savers = buildSaversForTab('rights', deps({ profileDirty: true, saveProfile }))

    expect(savers).toHaveLength(1)
    expect(savers[0].dirty).toBe(true)
    expect(savers[0].save).toBe(saveProfile)
  })

  it('leaves the profile tab with the main save then the visibility save, each with its own dirty flag', () => {
    const saveProfile = jest.fn(ok)
    const saveVisibility = jest.fn(ok)
    const savers = buildSaversForTab(
      'profile',
      deps({ profileDirty: true, saveProfile, visibilityDirty: false, saveVisibility })
    )

    expect(savers).toHaveLength(2)
    expect(savers[0].save).toBe(saveProfile)
    expect(savers[0].dirty).toBe(true)
    // Privacy is a SECOND request to a SECOND endpoint — never merged.
    expect(savers[1].save).toBe(saveVisibility)
    expect(savers[1].dirty).toBe(false)
  })

  it('leaves the payouts tab with nothing to save', () => {
    expect(buildSaversForTab('payouts', deps({ profileDirty: true, visibilityDirty: true }))).toEqual([])
  })

  it('writes only visibility when only the privacy selects changed on the profile tab', async () => {
    const navigate = jest.fn()
    const saveProfile = jest.fn(ok)
    const saveVisibility = jest.fn(ok)

    const result = await saveThenNavigate(
      buildSaversForTab(
        'profile',
        deps({ profileDirty: false, saveProfile, visibilityDirty: true, saveVisibility })
      ),
      navigate
    )

    expect(saveProfile).not.toHaveBeenCalled()
    expect(saveVisibility).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ navigated: true, error: null, writes: 1 })
  })

  it('does not navigate away from the profile tab when the visibility write fails', async () => {
    const navigate = jest.fn()

    const result = await saveThenNavigate(
      buildSaversForTab(
        'profile',
        deps({
          profileDirty: true,
          visibilityDirty: true,
          saveVisibility: fail('Could not save privacy settings'),
        })
      ),
      navigate
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(result.error).toBe('Could not save privacy settings')
    expect(result.writes).toBe(2)
  })

  it('leaving payouts issues zero writes and navigates immediately', async () => {
    const navigate = jest.fn()
    const saveProfile = jest.fn(ok)

    const result = await saveThenNavigate(
      buildSaversForTab('payouts', deps({ profileDirty: true, saveProfile })),
      navigate
    )

    expect(saveProfile).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(result.writes).toBe(0)
  })
})
