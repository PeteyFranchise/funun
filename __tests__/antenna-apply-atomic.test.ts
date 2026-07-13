import { POST } from '@/app/api/antenna/opportunities/[opportunityId]/apply/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { emitActivity } from '@/lib/social/activity-emit'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

jest.mock('@/lib/social/activity-emit', () => ({
  emitActivity: jest.fn(),
}))

function jsonRequest(body: unknown) {
  return new Request('http://test.local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockAuthedApi(userId = 'artist-1') {
  ;(createApiClient as jest.Mock).mockReturnValue({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: userId } } })),
    },
  })
}

function mockRpcResult(data: unknown, error: unknown = null) {
  const single = jest.fn(async () => ({ data, error }))
  const rpc = jest.fn(() => ({ single }))
  ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
  return { rpc, single }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createNotification as jest.Mock).mockResolvedValue(undefined)
  ;(emitActivity as jest.Mock).mockResolvedValue(undefined)
})

describe('Antenna apply route atomic RPC', () => {
  it('uses the atomic apply RPC and runs side effects after success', async () => {
    mockAuthedApi()
    const { rpc } = mockRpcResult({
      result: 'applied',
      opportunity_title: 'Sync Brief',
      opportunity_created_by: 'industry-1',
      project_title: 'Project Song',
      submission_id: 'submission-1',
    })

    const res = await POST(jsonRequest({ projectId: 'project-1', note: 'Please consider this.' }), {
      params: Promise.resolve({ opportunityId: 'opportunity-1' }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { submission: { id: 'submission-1' }, applied: true },
    })
    expect(rpc).toHaveBeenCalledWith('apply_to_opportunity_atomic', {
      p_opportunity_id: 'opportunity-1',
      p_project_id: 'project-1',
      p_user_id: 'artist-1',
      p_note: 'Please consider this.',
    })
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'industry-1',
        type: 'application_received',
        body: '"Project Song" applied to Sync Brief.',
      })
    )
    expect(emitActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'artist-1',
        kind: 'placement',
        body: 'Pitched “Project Song” to Sync Brief.',
      })
    )
  })

  it('returns full when the atomic RPC reports no slots remain', async () => {
    mockAuthedApi()
    mockRpcResult({
      result: 'full',
      opportunity_title: 'Sync Brief',
      opportunity_created_by: 'industry-1',
      project_title: 'Project Song',
      submission_id: null,
    })

    const res = await POST(jsonRequest({ projectId: 'project-1' }), {
      params: Promise.resolve({ opportunityId: 'opportunity-1' }),
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'All slots have been filled' })
    expect(createNotification).not.toHaveBeenCalled()
    expect(emitActivity).not.toHaveBeenCalled()
  })
})

