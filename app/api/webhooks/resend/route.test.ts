const mockCreateServiceClient = jest.fn()
const mockVerifyResendWebhook = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

jest.mock('@/lib/webhooks/resend-verify', () => ({
  verifyResendWebhook: (...args: unknown[]) => mockVerifyResendWebhook(...args),
}))

import { POST } from './route'

function request() {
  return new Request('http://test.local/api/webhooks/resend', {
    method: 'POST',
    body: '{"type":"email.bounced"}',
    headers: {
      'svix-id': 'msg_1',
      'svix-timestamp': '123',
      'svix-signature': 'v1,test',
    },
  })
}

function serviceWithUpdateError(
  error: { message: string } | null,
  data: { id: string }[] | null = [{ id: 'curator-1' }]
) {
  const select = jest.fn().mockResolvedValue({ data, error })
  const eq = jest.fn(() => ({ select }))
  const update = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ update }))
  return { client: { from }, from, update, eq, select }
}

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 5xx so a hard bounce is retried when persistence fails', async () => {
    mockVerifyResendWebhook.mockReturnValue({
      ok: true,
      event: {
        type: 'email.bounced',
        data: { to: ['CURATOR@EXAMPLE.COM'], bounce: { type: 'HardBounce' } },
      },
    })
    const service = serviceWithUpdateError({ message: 'database unavailable' })
    mockCreateServiceClient.mockReturnValue(service.client)

    const response = await POST(request())

    expect(response.status).toBe(500)
    expect(service.eq).toHaveBeenCalledWith('email', 'curator@example.com')
  })

  it('acknowledges a hard bounce only after the invalid-email flag is stored', async () => {
    mockVerifyResendWebhook.mockReturnValue({
      ok: true,
      event: {
        type: 'email.bounced',
        data: { email: 'curator@example.com', bounce_type: 'HardBounce' },
      },
    })
    const service = serviceWithUpdateError(null)
    mockCreateServiceClient.mockReturnValue(service.client)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(service.update).toHaveBeenCalledWith({ email_valid: false })
  })

  it('acknowledges verified non-bounce events without constructing a service client', async () => {
    mockVerifyResendWebhook.mockReturnValue({
      ok: true,
      event: { type: 'email.delivered', data: {} },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('acknowledges a hard bounce for an address outside the curator directory as ignored', async () => {
    mockVerifyResendWebhook.mockReturnValue({
      ok: true,
      event: {
        type: 'email.bounced',
        data: { email: 'unknown@example.com', bounce_type: 'HardBounce' },
      },
    })
    mockCreateServiceClient.mockReturnValue(serviceWithUpdateError(null, []).client)

    const response = await POST(request())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true })
  })
})
