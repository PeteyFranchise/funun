const mockRpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}))

import {
  COLLABORATOR_INVITE_RATE_LIMITS,
  isCollaboratorInviteRateLimited,
} from '@/lib/collaborators/invite-quota'

const USER_ID = 'user-123'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('isCollaboratorInviteRateLimited', () => {
  it('is not limited when both windows are under their maximum', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    await expect(isCollaboratorInviteRateLimited(USER_ID)).resolves.toBe(false)
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('checks the hourly key then the daily key with the configured windows', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    await isCollaboratorInviteRateLimited(USER_ID)

    const { hourly, daily } = COLLABORATOR_INVITE_RATE_LIMITS
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'check_rate_limit', {
      p_key: `collab-invite:hour:${USER_ID}`,
      p_window_seconds: hourly.windowMs / 1000,
      p_max: hourly.maxAttempts,
    })
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'check_rate_limit', {
      p_key: `collab-invite:day:${USER_ID}`,
      p_window_seconds: daily.windowMs / 1000,
      p_max: daily.maxAttempts,
    })
  })

  it('is limited, without checking the daily key, when the hourly key is over', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null })
    await expect(isCollaboratorInviteRateLimited(USER_ID)).resolves.toBe(true)
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('is limited when only the daily key is over', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
    await expect(isCollaboratorInviteRateLimited(USER_ID)).resolves.toBe(true)
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('is limited when the limiter returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc unavailable' } })
    await expect(isCollaboratorInviteRateLimited(USER_ID)).resolves.toBe(true)
  })

  it('is limited when the limiter throws', async () => {
    mockRpc.mockRejectedValue(new Error('fetch failed'))
    await expect(isCollaboratorInviteRateLimited(USER_ID)).resolves.toBe(true)
  })

  it('both limits are fail-closed', () => {
    expect(COLLABORATOR_INVITE_RATE_LIMITS.hourly.failClosed).toBe(true)
    expect(COLLABORATOR_INVITE_RATE_LIMITS.daily.failClosed).toBe(true)
  })
})
