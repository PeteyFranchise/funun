const mockVerifyAdmin = jest.fn()
const mockRpc = jest.fn()

jest.mock('@/lib/admin/gate', () => ({
  verifyAdmin: (...args: unknown[]) => mockVerifyAdmin(...args),
  SECTION_VALUES: ['before_release', 'week_1', 'week_2', 'weeks_3_4'],
  ACTION_TYPE_VALUES: ['internal_tool', 'external_url'],
  KEY_REGEX: /^[a-z0-9_]+$/,
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}))

import { PATCH } from './route'

function request(order: unknown) {
  return new Request('http://test.local/api/admin/checklist', {
    method: 'PATCH',
    body: JSON.stringify({ order }),
  })
}

describe('PATCH /api/admin/checklist — atomic reorder', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockVerifyAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockRpc.mockResolvedValue({ data: 2, error: null })
  })

  it('sends the full reorder through one transactional RPC', async () => {
    const order = [
      { key: 'second', sort_order: 0 },
      { key: 'first', sort_order: 1 },
    ]

    const response = await PATCH(request(order))

    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('reorder_launchpad_checklist', { p_order: order })
  })

  it.each([
    [[{ key: 'first', sort_order: 0.5 }], 'integer'],
    [[{ key: 'first', sort_order: 0 }, { key: 'first', sort_order: 1 }], 'duplicate'],
    [[{ key: 'first', sort_order: 1 }], 'contiguous'],
  ])('rejects invalid order %# before touching the database', async (order, message) => {
    const response = await PATCH(request(order))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain(message)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('bounds the number of reordered items', async () => {
    const order = Array.from({ length: 201 }, (_, index) => ({
      key: `item_${index}`,
      sort_order: index,
    }))

    const response = await PATCH(request(order))

    expect(response.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns a conflict without partial writes when the current key set changed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'stale order' } })

    const response = await PATCH(request([{ key: 'first', sort_order: 0 }]))

    expect(response.status).toBe(409)
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})
