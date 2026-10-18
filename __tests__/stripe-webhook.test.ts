// Stripe webhook persistence and reconciliation integrity.
// Stripe and Supabase are mocked wholesale; no live services are touched.

const mockConstructEvent = jest.fn()
const mockRetrievePaymentIntent = jest.fn()
jest.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
    paymentIntents: { retrieve: (...args: unknown[]) => mockRetrievePaymentIntent(...args) },
  },
}))

const mockCaptureMessage = jest.fn()
const mockFlush = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  flush: (...args: unknown[]) => mockFlush(...args),
}))

const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

import { POST } from '@/app/api/webhooks/stripe/route'
import { scrubKnownSensitiveKeys } from '@/lib/observability/scrub'

function makeService(
  opts: {
    rpcResult?: { data: unknown; error: unknown }
    updateError?: unknown
  } = {}
) {
  const updates: { table: string; values: Record<string, unknown> }[] = []
  const rpc = jest.fn(async () => opts.rpcResult ?? { data: true, error: null })
  const from = jest.fn((table: string) => {
    const query: Record<string, unknown> = {}
    const resolved = () => Object.assign(Promise.resolve({ error: opts.updateError ?? null }), query)
    query.update = jest.fn((values: Record<string, unknown>) => {
      updates.push({ table, values })
      return query
    })
    query.eq = jest.fn(() => resolved())
    return query
  })
  return { client: { from, rpc }, updates, rpc }
}

function makeRequest(signature: string | null = 't=1,v1=fake', body = '{}') {
  return {
    text: async () => body,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'stripe-signature' ? signature : null),
    },
  } as unknown as Request
}

function checkoutEvent(overrides: Record<string, unknown> = {}, type = 'checkout.session.completed') {
  return {
    id: 'evt_1',
    type,
    data: {
      object: {
        id: 'cs_1',
        payment_intent: 'pi_1',
        payment_status: 'paid',
        amount_total: 10_000,
        currency: 'usd',
        metadata: { license_request_id: 'd1', economics_fingerprint: 'fingerprint-1' },
        ...overrides,
      },
    },
  }
}

function chargeEvent(type: string, object: Record<string, unknown>) {
  return { id: 'evt_2', type, data: { object } }
}

function accountEvent() {
  return {
    type: 'account.updated',
    data: {
      object: {
        id: 'acct_1',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFlush.mockResolvedValue(true)
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_do_not_use_live'
  mockRetrievePaymentIntent.mockResolvedValue({
    id: 'pi_1',
    application_fee_amount: 1_500,
    transfer_data: { destination: 'acct_artist_1' },
  })
})

describe('stripe webhook — signature gate', () => {
  it('returns 503 when the webhook secret is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const response = await POST(makeRequest())
    expect(response.status).toBe(503)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 when the stripe-signature header is missing', async () => {
    const response = await POST(makeRequest(null))
    expect(response.status).toBe(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 without constructing a service client on a bad signature', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('bad signature')
    })
    const response = await POST(makeRequest())
    expect(response.status).toBe(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })
})

describe('stripe webhook — checkout reconciliation', () => {
  it('reconciles signed payment facts atomically and returns 200', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)

    const response = await POST(makeRequest())
    expect(response.status).toBe(200)
    expect(mockRetrievePaymentIntent).toHaveBeenCalledWith('pi_1')
    expect(service.rpc).toHaveBeenCalledWith('complete_license_checkout', {
      p_deal_id: 'd1',
      p_checkout_session_id: 'cs_1',
      p_economics_fingerprint: 'fingerprint-1',
      p_payment_intent_id: 'pi_1',
      p_amount_cents: 10_000,
      p_currency: 'usd',
      p_application_fee_cents: 1_500,
      p_transfer_destination: 'acct_artist_1',
    })
  })

  it('accepts an idempotent replay when the reconciliation RPC does', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const service = makeService({ rpcResult: { data: true, error: null } })
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
  })

  it('returns 409 when the database rejects mismatched economics or identity', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const service = makeService({ rpcResult: { data: false, error: null } })
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(409)
  })

  it('returns 400 for a paid checkout with missing reconciliation metadata', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({ metadata: {} }))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(400)
    expect(service.rpc).not.toHaveBeenCalled()
  })

  it('returns 503 when Stripe cannot independently retrieve the payment intent', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    mockRetrievePaymentIntent.mockRejectedValue(new Error('stripe unavailable'))
    mockCreateServiceClient.mockReturnValue(makeService().client)
    expect((await POST(makeRequest())).status).toBe(503)
  })

  it('returns 503 when atomic persistence fails', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const service = makeService({ rpcResult: { data: null, error: { message: 'db unavailable' } } })
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(503)
  })
})

describe('stripe webhook — account.updated persistence', () => {
  it('persists Connect flags and returns 200', async () => {
    mockConstructEvent.mockReturnValue(accountEvent())
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    const response = await POST(makeRequest())
    expect(response.status).toBe(200)
    expect(service.updates).toHaveLength(1)
    expect(service.updates[0]).toMatchObject({
      table: 'user_profiles',
      values: {
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: true,
      },
    })
  })

  it('returns 503 when persisting Connect state fails', async () => {
    mockConstructEvent.mockReturnValue(accountEvent())
    mockCreateServiceClient.mockReturnValue(
      makeService({ updateError: { message: 'write failed' } }).client
    )
    expect((await POST(makeRequest())).status).toBe(503)
  })
})

const COMPLETE_ARGS = {
  p_deal_id: 'd1',
  p_checkout_session_id: 'cs_1',
  p_economics_fingerprint: 'fingerprint-1',
  p_payment_intent_id: 'pi_1',
  p_amount_cents: 10_000,
  p_currency: 'usd',
  p_application_fee_cents: 1_500,
  p_transfer_destination: 'acct_artist_1',
}

type Captured = { message: string; level: string; tags: Record<string, string>; extra: Record<string, unknown> }

function captured(index = 0): Captured {
  const [message, options] = mockCaptureMessage.mock.calls[index] as [
    string,
    { level: string; tags: Record<string, string>; extra: Record<string, unknown> },
  ]
  return { message, ...options }
}

describe('stripe webhook - delayed payments', () => {
  it('acknowledges an unpaid (delayed method) completion, writes nothing, and reports at info', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({ payment_status: 'unpaid' }))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
    expect(mockRetrievePaymentIntent).not.toHaveBeenCalled()
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const call = captured()
    expect(call.level).toBe('info')
    expect(call.tags).toEqual({ stripe_event: 'checkout.session.completed' })
    expect(call.extra).toMatchObject({
      event_id: 'evt_1',
      checkout_ref: 'cs_1',
      payment_intent_id: 'pi_1',
      license_request_id: 'd1',
    })
    expect(mockFlush).toHaveBeenCalledWith(2000)
  })

  it('acknowledges any other non-paid status with a warning and never completes', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({ payment_status: 'no_payment_required' }))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
    expect(mockRetrievePaymentIntent).not.toHaveBeenCalled()
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const call = captured()
    expect(call.level).toBe('warning')
    expect(call.extra).toMatchObject({ checkout_ref: 'cs_1', payment_status: 'no_payment_required' })
  })

  it('completes the deal on async_payment_succeeded through the paid-completion path', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({}, 'checkout.session.async_payment_succeeded'))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)

    expect((await POST(makeRequest())).status).toBe(200)
    expect(mockRetrievePaymentIntent).toHaveBeenCalledWith('pi_1')
    expect(service.rpc).toHaveBeenCalledTimes(1)
    expect(service.rpc).toHaveBeenCalledWith('complete_license_checkout', COMPLETE_ARGS)
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('does not complete on async_payment_succeeded unless the session is paid', async () => {
    mockConstructEvent.mockReturnValue(
      checkoutEvent({ payment_status: 'unpaid' }, 'checkout.session.async_payment_succeeded')
    )
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
    expect(mockRetrievePaymentIntent).not.toHaveBeenCalled()
    expect(captured().level).toBe('warning')
  })

  it('returns 409 on a paid completion the database rejects, and alerts at error', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({}, 'checkout.session.async_payment_succeeded'))
    mockCreateServiceClient.mockReturnValue(makeService({ rpcResult: { data: false, error: null } }).client)
    expect((await POST(makeRequest())).status).toBe(409)
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    expect(captured().level).toBe('error')
    expect(captured().extra).toMatchObject({ checkout_ref: 'cs_1', payment_intent_id: 'pi_1' })
  })

  it('returns 400 on a paid completion with missing metadata, and alerts at error', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({ metadata: {} }, 'checkout.session.async_payment_succeeded'))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(400)
    expect(service.rpc).not.toHaveBeenCalled()
    expect(captured().level).toBe('error')
  })
})

describe('stripe webhook - dead checkout reset', () => {
  it('resets the deal on async_payment_failed, reports a warning, and returns 200', async () => {
    mockConstructEvent.mockReturnValue(
      checkoutEvent({ payment_status: 'unpaid' }, 'checkout.session.async_payment_failed')
    )
    const service = makeService({ rpcResult: { data: true, error: null } })
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).toHaveBeenCalledTimes(1)
    expect(service.rpc).toHaveBeenCalledWith('reset_license_checkout', {
      p_deal_id: 'd1',
      p_checkout_session_id: 'cs_1',
    })
    expect(service.client.from).not.toHaveBeenCalled()
    expect(mockRetrievePaymentIntent).not.toHaveBeenCalled()
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    expect(captured().level).toBe('warning')
  })

  it('resets the deal on checkout.session.expired and returns 200 without a Sentry report', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({ payment_status: 'unpaid' }, 'checkout.session.expired'))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).toHaveBeenCalledWith('reset_license_checkout', {
      p_deal_id: 'd1',
      p_checkout_session_id: 'cs_1',
    })
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('returns 200 when the reset matches no row (paid deal or newer session)', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({ payment_status: 'unpaid' }, 'checkout.session.expired'))
    mockCreateServiceClient.mockReturnValue(makeService({ rpcResult: { data: false, error: null } }).client)
    expect((await POST(makeRequest())).status).toBe(200)
  })

  it.each(['checkout.session.async_payment_failed', 'checkout.session.expired'])(
    'returns 503 on %s when the reset RPC errors so Stripe retries, and alerts at error',
    async (type) => {
      mockConstructEvent.mockReturnValue(checkoutEvent({ payment_status: 'unpaid' }, type))
      mockCreateServiceClient.mockReturnValue(
        makeService({ rpcResult: { data: null, error: { message: 'db unavailable' } } }).client
      )
      expect((await POST(makeRequest())).status).toBe(503)
      const last = captured(mockCaptureMessage.mock.calls.length - 1)
      expect(last.level).toBe('error')
    }
  )

  it('skips the reset when the session carries no deal id', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({ metadata: {} }, 'checkout.session.expired'))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
  })
})

describe('stripe webhook - refunds, disputes and unknown events', () => {
  it('acknowledges charge.refunded, writes nothing and reports the charge id at warning', async () => {
    mockConstructEvent.mockReturnValue(chargeEvent('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1' }))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
    expect(service.updates).toHaveLength(0)
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    expect(captured().level).toBe('warning')
    expect(JSON.stringify(mockCaptureMessage.mock.calls[0])).toContain('ch_1')
  })

  it('reports charge.dispute.created at error and writes nothing', async () => {
    mockConstructEvent.mockReturnValue(
      chargeEvent('charge.dispute.created', { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_1' })
    )
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
    expect(service.updates).toHaveLength(0)
    expect(captured().level).toBe('error')
  })

  it('reports other dispute subtypes at warning', async () => {
    mockConstructEvent.mockReturnValue(
      chargeEvent('charge.dispute.closed', { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_1' })
    )
    mockCreateServiceClient.mockReturnValue(makeService().client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(captured().level).toBe('warning')
  })

  it('still returns 200 with no side effects for an unknown event type', async () => {
    mockConstructEvent.mockReturnValue(chargeEvent('invoice.paid', { id: 'in_1' }))
    const service = makeService()
    mockCreateServiceClient.mockReturnValue(service.client)
    expect((await POST(makeRequest())).status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })
})

describe('stripe webhook - Sentry delivery', () => {
  it('flushes after a capture', async () => {
    mockConstructEvent.mockReturnValue(chargeEvent('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1' }))
    mockCreateServiceClient.mockReturnValue(makeService().client)
    await POST(makeRequest())
    expect(mockFlush).toHaveBeenCalledWith(2000)
    expect(mockFlush.mock.invocationCallOrder[0]).toBeGreaterThan(mockCaptureMessage.mock.invocationCallOrder[0])
  })

  it('flushes before returning the 409 and 400 responses', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    mockCreateServiceClient.mockReturnValue(makeService({ rpcResult: { data: false, error: null } }).client)
    expect((await POST(makeRequest())).status).toBe(409)
    expect(mockFlush).toHaveBeenCalledTimes(1)

    mockFlush.mockClear()
    mockConstructEvent.mockReturnValue(checkoutEvent({ metadata: {} }))
    mockCreateServiceClient.mockReturnValue(makeService().client)
    expect((await POST(makeRequest())).status).toBe(400)
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })

  it('does not change the response when flush rejects', async () => {
    mockFlush.mockRejectedValue(new Error('network down'))
    mockConstructEvent.mockReturnValue(checkoutEvent({ payment_status: 'unpaid' }))
    mockCreateServiceClient.mockReturnValue(makeService().client)
    expect((await POST(makeRequest())).status).toBe(200)

    mockConstructEvent.mockReturnValue(checkoutEvent())
    mockCreateServiceClient.mockReturnValue(makeService({ rpcResult: { data: false, error: null } }).client)
    expect((await POST(makeRequest())).status).toBe(409)
  })

  it('does not change the response when captureMessage throws', async () => {
    mockCaptureMessage.mockImplementation(() => {
      throw new Error('sentry broke')
    })
    mockConstructEvent.mockReturnValue(chargeEvent('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1' }))
    mockCreateServiceClient.mockReturnValue(makeService().client)
    expect((await POST(makeRequest())).status).toBe(200)
    mockCaptureMessage.mockReset()
  })

  it('keeps every Stripe id readable after the Sentry scrubber runs', async () => {
    const scenarios: { event: unknown; service: ReturnType<typeof makeService>; ids: string[] }[] = [
      {
        event: checkoutEvent({ payment_status: 'unpaid' }),
        service: makeService(),
        ids: ['evt_1', 'cs_1', 'pi_1', 'd1'],
      },
      {
        event: checkoutEvent({ payment_status: 'unpaid' }, 'checkout.session.async_payment_failed'),
        service: makeService(),
        ids: ['evt_1', 'cs_1', 'pi_1', 'd1'],
      },
      {
        event: checkoutEvent(),
        service: makeService({ rpcResult: { data: false, error: null } }),
        ids: ['evt_1', 'cs_1', 'pi_1', 'd1'],
      },
      {
        event: checkoutEvent({ metadata: {} }),
        service: makeService(),
        ids: ['evt_1', 'cs_1', 'pi_1'],
      },
      {
        event: chargeEvent('charge.dispute.created', { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_1' }),
        service: makeService(),
        ids: ['evt_2', 'dp_1', 'ch_1', 'pi_1'],
      },
      {
        event: chargeEvent('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1' }),
        service: makeService(),
        ids: ['evt_2', 'ch_1', 'pi_1'],
      },
    ]

    for (const scenario of scenarios) {
      mockCaptureMessage.mockClear()
      mockConstructEvent.mockReturnValue(scenario.event)
      mockCreateServiceClient.mockReturnValue(scenario.service.client)
      await POST(makeRequest())
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1)

      const scrubbed = JSON.stringify(scrubKnownSensitiveKeys(captured() as unknown as Record<string, unknown>))
      expect(scrubbed).not.toContain('[redacted]')
      for (const id of scenario.ids) expect(scrubbed).toContain(id)
    }
  })
})

