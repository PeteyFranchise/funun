import { POST } from '@/app/api/admin/green-room/placements/route'
import { PATCH } from '@/app/api/admin/green-room/placements/[id]/route'
import { verifyAdmin } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
import { isDestinationVisible } from '@/lib/green-room/placements-admin'

jest.mock('@/lib/admin/gate', () => ({ verifyAdmin: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/green-room/placements-admin', () => {
  const actual = jest.requireActual('@/lib/green-room/placements-admin')
  return { ...actual, isDestinationVisible: jest.fn() }
})

const UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function jsonRequest(body: unknown) {
  return new Request('http://t.local/api/admin/green-room/placements', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// Insert builder that resolves the created row.
function insertClient() {
  return {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: { id: 'new' }, error: null })) })),
      })),
    })),
  }
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/admin/green-room/placements', () => {
  it('rejects non-admins', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('blocks activation when the destination is not visible', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(insertClient())
    ;(isDestinationVisible as jest.Mock).mockResolvedValue(false)

    const res = await POST(
      jsonRequest({
        placement_kind: 'featured',
        label: 'Featured',
        title: 'Meet Nova',
        destination_type: 'profile',
        destination_id: UUID,
        status: 'active',
      })
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'Destination is not public/visible — cannot activate this placement',
    })
  })

  it('creates an active placement when the destination is visible', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(insertClient())
    ;(isDestinationVisible as jest.Mock).mockResolvedValue(true)

    const res = await POST(
      jsonRequest({
        placement_kind: 'featured',
        label: 'Featured',
        title: 'Meet Nova',
        destination_type: 'profile',
        destination_id: UUID,
        status: 'active',
      })
    )
    expect(res.status).toBe(201)
  })
})

describe('PATCH /api/admin/green-room/placements/[id]', () => {
  function patchClient(existing: unknown) {
    return {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: existing, error: null })) })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: { id: 'p1', status: 'active' }, error: null })) })),
          })),
        })),
      })),
    }
  }

  it('blocks activation toward a now-private destination', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(
      patchClient({ id: 'p1', destination_type: 'profile', destination_id: UUID, destination_url: null, starts_at: '2026-07-01T00:00:00Z', ends_at: null })
    )
    ;(isDestinationVisible as jest.Mock).mockResolvedValue(false)

    const req = new Request('http://t.local/api/admin/green-room/placements/p1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(409)
  })
})
