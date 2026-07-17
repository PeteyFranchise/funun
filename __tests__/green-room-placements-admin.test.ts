import {
  validatePlacementCreate,
  validatePlacementPatch,
  isDestinationVisible,
  isHttpUrl,
} from '@/lib/green-room/placements-admin'

const UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function base(overrides: Record<string, unknown> = {}) {
  return {
    placement_kind: 'featured',
    label: 'Featured',
    title: 'Meet Nova',
    destination_type: 'profile',
    destination_id: UUID,
    ...overrides,
  }
}

describe('validatePlacementCreate', () => {
  it('accepts a valid internal placement and defaults to draft', () => {
    const res = validatePlacementCreate(base())
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.status).toBe('draft')
      expect(res.value.destination_id).toBe(UUID)
      expect(res.value.destination_url).toBeNull()
    }
  })

  it('rejects unknown placement_kind', () => {
    const res = validatePlacementCreate(base({ placement_kind: 'banner_ad' }))
    expect(res.ok).toBe(false)
  })

  it('requires a valid http(s) url for external placements', () => {
    expect(validatePlacementCreate(base({ destination_type: 'external', destination_id: null, destination_url: 'javascript:alert(1)' })).ok).toBe(false)
    expect(validatePlacementCreate(base({ destination_type: 'external', destination_id: null, destination_url: 'https://ok.example' })).ok).toBe(true)
  })

  it('requires a UUID destination_id for internal placements', () => {
    expect(validatePlacementCreate(base({ destination_id: 'not-a-uuid' })).ok).toBe(false)
  })

  it('rejects an empty/too-long label or title', () => {
    expect(validatePlacementCreate(base({ label: '' })).ok).toBe(false)
    expect(validatePlacementCreate(base({ title: 'x'.repeat(200) })).ok).toBe(false)
  })

  it('rejects ends_at before starts_at', () => {
    const res = validatePlacementCreate(
      base({ starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-07-01T00:00:00Z' })
    )
    expect(res.ok).toBe(false)
  })

  it('only allows draft or active status on create', () => {
    expect(validatePlacementCreate(base({ status: 'archived' })).ok).toBe(false)
    expect(validatePlacementCreate(base({ status: 'active' })).ok).toBe(true)
  })
})

describe('validatePlacementPatch', () => {
  it('rejects an empty update', () => {
    expect(validatePlacementPatch({}).ok).toBe(false)
  })

  it('does not permit changing the destination (immutable)', () => {
    const res = validatePlacementPatch({ destination_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', status: 'paused' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect('destination_id' in res.value).toBe(false)
      expect(res.value.status).toBe('paused')
    }
  })

  it('validates status enum', () => {
    expect(validatePlacementPatch({ status: 'live' }).ok).toBe(false)
    expect(validatePlacementPatch({ status: 'archived' }).ok).toBe(true)
  })
})

describe('isHttpUrl', () => {
  it('only allows http/https', () => {
    expect(isHttpUrl('https://a.example')).toBe(true)
    expect(isHttpUrl('http://a.example')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:text/html,x')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
  })
})

describe('isDestinationVisible', () => {
  function serviceReturning(row: unknown) {
    return {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(function eq() {
            return {
              eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: row })) })),
              maybeSingle: jest.fn(async () => ({ data: row })),
            }
          }),
        })),
      })),
    }
  }

  it('passes for a public profile destination', async () => {
    const service = serviceReturning({ id: UUID })
    await expect(isDestinationVisible(service as never, 'profile', UUID, null)).resolves.toBe(true)
  })

  it('fails for a private/missing profile destination', async () => {
    const service = serviceReturning(null)
    await expect(isDestinationVisible(service as never, 'profile', UUID, null)).resolves.toBe(false)
  })

  it('gates external destinations by URL shape only', async () => {
    const service = serviceReturning(null)
    await expect(isDestinationVisible(service as never, 'external', null, 'https://ok.example')).resolves.toBe(true)
    await expect(isDestinationVisible(service as never, 'external', null, 'ftp://x')).resolves.toBe(false)
  })
})
