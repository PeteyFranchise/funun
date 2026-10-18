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
  data: { id: string }[] | null = [{ id: 'curator-1' }],
  suppressionError: { message: string } | null = null
) {
  const select = jest.fn().mockResolvedValue({ data, error })
  const eq = jest.fn(() => ({ select }))
  const update = jest.fn(() => ({ eq }))
  const upsert = jest.fn().mockResolvedValue({ error: suppressionError })
  const from = jest.fn((table: string) => (table === 'email_suppressions' ? { upsert } : { update }))
  return { client: { from }, from, update, eq, select, upsert }
}

function hardBounce(to: string) {
  mockVerifyResendWebhook.mockReturnValue({
    ok: true,
    event: {
      type: 'email.bounced',
      data: { to: [to], bounce: { type: 'HardBounce' } },
    },
  })
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

  it('records a curator hard bounce in email_suppressions with the svix id and a normalized address', async () => {
    hardBounce('Curator@Example.com ')
    const service = serviceWithUpdateError(null)
    mockCreateServiceClient.mockReturnValue(service.client)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(service.from).toHaveBeenCalledWith('email_suppressions')
    expect(service.upsert).toHaveBeenCalledWith(
      { email: 'curator@example.com', reason: 'hard_bounce', source_event_id: 'msg_1' },
      { onConflict: 'email', ignoreDuplicates: true }
    )
    expect(service.update).toHaveBeenCalledWith({ email_valid: false })
  })

  it('still suppresses an address outside the curator directory and keeps the ignored contract', async () => {
    hardBounce('collaborator@example.com')
    const service = serviceWithUpdateError(null, [])
    mockCreateServiceClient.mockReturnValue(service.client)

    const response = await POST(request())

    expect(service.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'collaborator@example.com', reason: 'hard_bounce' }),
      { onConflict: 'email', ignoreDuplicates: true }
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true })
  })

  it('returns 500 so Resend retries when the suppression write fails, after the curator flag was still applied', async () => {
    hardBounce('curator@example.com')
    // Simulates migration 246 being unapplied: the suppression write errors,
    // but the pre-existing curator invalidation must not regress.
    const service = serviceWithUpdateError(null, [{ id: 'curator-1' }], {
      message: 'relation "public.email_suppressions" does not exist',
    })
    mockCreateServiceClient.mockReturnValue(service.client)

    const response = await POST(request())

    expect(service.update).toHaveBeenCalledWith({ email_valid: false })
    expect(service.eq).toHaveBeenCalledWith('email', 'curator@example.com')
    expect(service.upsert).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(500)
  })

  it('returns 500 for a non-curator address when the suppression write fails', async () => {
    hardBounce('collaborator@example.com')
    const service = serviceWithUpdateError(null, [], { message: 'database unavailable' })
    mockCreateServiceClient.mockReturnValue(service.client)

    const response = await POST(request())

    expect(response.status).toBe(500)
  })

  it('writes nothing for a soft bounce', async () => {
    mockVerifyResendWebhook.mockReturnValue({
      ok: true,
      event: {
        type: 'email.bounced',
        data: { to: ['curator@example.com'], bounce: { type: 'SoftBounce' } },
      },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('writes nothing when the bounce type is missing', async () => {
    mockVerifyResendWebhook.mockReturnValue({
      ok: true,
      event: { type: 'email.bounced', data: { to: ['curator@example.com'] } },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })
})
