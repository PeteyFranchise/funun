const mockCreateServiceClient = jest.fn()
const mockVerifyResendWebhook = jest.fn()
const mockCaptureMessage = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

jest.mock('@/lib/webhooks/resend-verify', () => ({
  verifyResendWebhook: (...args: unknown[]) => mockVerifyResendWebhook(...args),
}))

jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
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

// Payload shapes copied from Resend's documented examples (field names and
// nesting are exactly theirs; the values are fake):
//   https://resend.com/docs/webhooks/emails/bounced
//   https://resend.com/docs/webhooks/emails/complained
function bouncedPayload(overrides: { to?: string[]; bounceType?: string } = {}) {
  return {
    type: 'email.bounced',
    created_at: '2026-11-22T23:41:12.126Z',
    data: {
      broadcast_id: '8b146471-e88e-4322-86af-016cd36fd216',
      created_at: '2026-11-22T23:41:11.894Z',
      email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
      message_id: '<111-222-333@email.example.com>',
      from: 'Acme <onboarding@resend.dev>',
      to: overrides.to ?? ['delivered@resend.dev'],
      subject: 'Sending this example',
      template_id: '43f68331-0622-4e15-8202-246a0388854b',
      bounce: {
        message:
          "The recipient's email address is on the suppression list because it has a recent history of producing hard bounces.",
        subType: 'Suppressed',
        type: overrides.bounceType ?? 'Permanent',
      },
      tags: { category: 'confirm_email' },
    },
  }
}

function complainedPayload(to: string[] = ['delivered@resend.dev']) {
  return {
    type: 'email.complained',
    created_at: '2026-02-22T23:41:12.126Z',
    data: {
      broadcast_id: '8b146471-e88e-4322-86af-016cd36fd216',
      created_at: '2026-02-22T23:41:11.894Z',
      email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
      message_id: '<111-222-333@email.example.com>',
      from: 'Acme <onboarding@resend.dev>',
      to,
      subject: 'Sending this example',
      template_id: '43f68331-0622-4e15-8202-246a0388854b',
      tags: { category: 'confirm_email' },
    },
  }
}

function verified(event: unknown) {
  mockVerifyResendWebhook.mockReturnValue({ ok: true, event })
}

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('bounce classification (documented Resend payload)', () => {
    it('treats bounce.type "Permanent" as a hard bounce: flags the curator and suppresses the address', async () => {
      verified(bouncedPayload({ to: ['Curator@Example.com'] }))
      const service = serviceWithUpdateError(null)
      mockCreateServiceClient.mockReturnValue(service.client)

      const response = await POST(request())

      expect(response.status).toBe(200)
      expect(service.update).toHaveBeenCalledWith({ email_valid: false })
      expect(service.eq).toHaveBeenCalledWith('email', 'curator@example.com')
      expect(service.upsert).toHaveBeenCalledWith(
        { email: 'curator@example.com', reason: 'hard_bounce', source_event_id: 'msg_1' },
        { onConflict: 'email', ignoreDuplicates: true }
      )
    })

    it('matches the type case-insensitively', async () => {
      verified(bouncedPayload({ bounceType: 'permanent' }))
      const service = serviceWithUpdateError(null)
      mockCreateServiceClient.mockReturnValue(service.client)

      await POST(request())

      expect(service.upsert).toHaveBeenCalledTimes(1)
    })

    it('still accepts the legacy "HardBounce" value', async () => {
      verified(bouncedPayload({ bounceType: 'HardBounce' }))
      const service = serviceWithUpdateError(null)
      mockCreateServiceClient.mockReturnValue(service.client)

      await POST(request())

      expect(service.upsert).toHaveBeenCalledTimes(1)
    })

    it.each(['Transient', 'Temporary', 'Undetermined', 'SoftBounce', ''])(
      'writes nothing for bounce.type %p',
      async (bounceType) => {
        verified(bouncedPayload({ bounceType }))

        const response = await POST(request())

        expect(response.status).toBe(200)
        expect(mockCreateServiceClient).not.toHaveBeenCalled()
      }
    )

    it('writes nothing when the bounce object is missing', async () => {
      const event = bouncedPayload()
      delete (event.data as { bounce?: unknown }).bounce
      verified(event)

      const response = await POST(request())

      expect(response.status).toBe(200)
      expect(mockCreateServiceClient).not.toHaveBeenCalled()
    })
  })

  describe('recipient handling', () => {
    it('normalizes a display-name recipient the same way sendEmail does', async () => {
      verified(bouncedPayload({ to: ['Some Curator <Curator@Example.com>'] }))
      const service = serviceWithUpdateError(null)
      mockCreateServiceClient.mockReturnValue(service.client)

      await POST(request())

      expect(service.eq).toHaveBeenCalledWith('email', 'curator@example.com')
      expect(service.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'curator@example.com' }),
        expect.anything()
      )
    })

    it('suppresses nothing and reports to Sentry (no addresses) when the event lists several recipients', async () => {
      verified(bouncedPayload({ to: ['one@example.com', 'two@example.com'] }))

      const response = await POST(request())

      expect(response.status).toBe(200)
      expect(mockCreateServiceClient).not.toHaveBeenCalled()
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
      const serialized = JSON.stringify(mockCaptureMessage.mock.calls[0])
      expect(serialized).not.toContain('example.com')
      expect(serialized).toContain('ambiguous-recipients')
    })

    it('suppresses nothing when the event has no recipients', async () => {
      verified(bouncedPayload({ to: [] }))

      const response = await POST(request())

      expect(response.status).toBe(200)
      expect(mockCreateServiceClient).not.toHaveBeenCalled()
    })
  })

  describe('persistence and retries', () => {
    it('returns 5xx and reports to Sentry (no address) when the curator write fails', async () => {
      verified(bouncedPayload({ to: ['CURATOR@EXAMPLE.COM'] }))
      const service = serviceWithUpdateError({ message: 'database unavailable' })
      mockCreateServiceClient.mockReturnValue(service.client)

      const response = await POST(request())

      expect(response.status).toBe(500)
      expect(service.eq).toHaveBeenCalledWith('email', 'curator@example.com')
      expect(service.upsert).not.toHaveBeenCalled()
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
      const serialized = JSON.stringify(mockCaptureMessage.mock.calls[0])
      expect(serialized).toContain('curator-write')
      expect(serialized.toLowerCase()).not.toContain('curator@example.com')
    })

    it('acknowledges a permanent bounce for an address outside the curator directory as ignored, after suppressing it', async () => {
      verified(bouncedPayload({ to: ['collaborator@example.com'] }))
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

    it('returns 500 and reports to Sentry when the suppression write fails, after the curator flag was still applied', async () => {
      verified(bouncedPayload({ to: ['curator@example.com'] }))
      // Simulates migration 246 being unapplied: the suppression write errors,
      // but the pre-existing curator invalidation must not regress.
      const service = serviceWithUpdateError(null, [{ id: 'curator-1' }], {
        message: 'relation "public.email_suppressions" does not exist',
      })
      mockCreateServiceClient.mockReturnValue(service.client)

      const response = await POST(request())

      expect(service.update).toHaveBeenCalledWith({ email_valid: false })
      expect(service.upsert).toHaveBeenCalledTimes(1)
      expect(response.status).toBe(500)
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
      const serialized = JSON.stringify(mockCaptureMessage.mock.calls[0])
      expect(serialized).toContain('suppression-write')
      expect(serialized).not.toContain('curator@example.com')
    })

    it('returns 500 for a non-curator address when the suppression write fails', async () => {
      verified(bouncedPayload({ to: ['collaborator@example.com'] }))
      const service = serviceWithUpdateError(null, [], { message: 'database unavailable' })
      mockCreateServiceClient.mockReturnValue(service.client)

      const response = await POST(request())

      expect(response.status).toBe(500)
    })
  })

  describe('email.complained', () => {
    it('suppresses the address with reason "complaint" and does not touch curators', async () => {
      verified(complainedPayload(['Reader <Reader@Example.com>']))
      const service = serviceWithUpdateError(null)
      mockCreateServiceClient.mockReturnValue(service.client)

      const response = await POST(request())

      expect(response.status).toBe(200)
      expect(service.update).not.toHaveBeenCalled()
      expect(service.upsert).toHaveBeenCalledWith(
        { email: 'reader@example.com', reason: 'complaint', source_event_id: 'msg_1' },
        { onConflict: 'email', ignoreDuplicates: true }
      )
    })

    it('returns 500 and reports to Sentry when the suppression write fails', async () => {
      verified(complainedPayload())
      const service = serviceWithUpdateError(null, [], { message: 'database unavailable' })
      mockCreateServiceClient.mockReturnValue(service.client)

      const response = await POST(request())

      expect(response.status).toBe(500)
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    })

    it('suppresses nothing and reports when a complaint lists several recipients', async () => {
      verified(complainedPayload(['a@example.com', 'b@example.com']))

      const response = await POST(request())

      expect(response.status).toBe(200)
      expect(mockCreateServiceClient).not.toHaveBeenCalled()
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    })
  })

  it('acknowledges verified unrelated events without constructing a service client', async () => {
    verified({ type: 'email.delivered', data: {} })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('rejects an unverified request without writing', async () => {
    mockVerifyResendWebhook.mockReturnValue({ ok: false, status: 400 })

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })
})
