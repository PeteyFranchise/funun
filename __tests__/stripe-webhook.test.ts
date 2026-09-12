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

const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

import { POST } from '@/app/api/webhooks/stripe/route'

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

function checkoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'checkout.session.completed',
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

  it('returns 400 for incomplete or unpaid checkout data', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent({ metadata: {}, payment_status: 'unpaid' }))
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
