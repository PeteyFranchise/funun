// ─── Stripe webhook — persistence integrity (audit #9) ────────────────
// Proves the handler NEVER acks (200) an event whose required DB write
// failed: a transient error on the select or either update must surface as
// a retryable 5xx so Stripe redelivers, instead of permanently leaving a
// paid deal marked unpaid or a Connect account's payout state stale.
// The legitimate no-op paths (unknown session, already-paid replay,
// unmatched account) must still return 200.
//
// NOTHING here touches live Stripe or a live DB — the Stripe SDK's
// constructEvent and the service client are mocked wholesale.

const mockConstructEvent = jest.fn()
jest.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) } },
}))

const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...a: unknown[]) => mockCreateServiceClient(...a),
}))

import { POST } from '@/app/api/webhooks/stripe/route'

// ─── Fake service client ──────────────────────────────────────────────
// Mirrors the repo's docuseal-webhook harness: eq() returns a value that is
// BOTH awaitable (the update outcome) AND chainable to maybeSingle() (the
// select outcome).
function makeService(opts: { selectResult?: { data: unknown; error: unknown }; updateError?: unknown } = {}) {
  const selectResult = opts.selectResult ?? { data: null, error: null }
  const updates: { table: string; values: Record<string, unknown> }[] = []

  const from = jest.fn((table: string) => {
    const q: Record<string, unknown> = {}
    const resolved = () => Object.assign(Promise.resolve({ error: opts.updateError ?? null }), q)
    q.select = jest.fn(() => q)
    q.update = jest.fn((values: Record<string, unknown>) => {
      updates.push({ table, values })
      return q
    })
    q.eq = jest.fn(() => resolved())
    q.maybeSingle = jest.fn(() => Promise.resolve(selectResult))
    return q
  })

  return { client: { from } as unknown, updates }
}

function makeRequest(sig: string | null = 't=1,v1=fake', body = '{}') {
  return {
    text: async () => body,
    headers: { get: (k: string) => (k.toLowerCase() === 'stripe-signature' ? sig : null) },
  } as unknown as Request
}

const checkoutEvent = (paymentIntent: string | null = 'pi_1') => ({
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', payment_intent: paymentIntent } },
})

const accountEvent = () => ({
  type: 'account.updated',
  data: {
    object: { id: 'acct_1', charges_enabled: true, payouts_enabled: true, details_submitted: true },
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_do_not_use_live'
})

describe('stripe webhook — signature gate (behavior preserved)', () => {
  it('returns 503 when the webhook secret is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 when the stripe-signature header is missing', async () => {
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 and does NOT construct the service client on a bad signature', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('bad signature')
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })
})

describe('stripe webhook — checkout.session.completed persistence', () => {
  it('marks the deal paid and returns 200 (happy path)', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const svc = makeService({ selectResult: { data: { id: 'd1', payment_status: 'pending' }, error: null } })
    mockCreateServiceClient.mockReturnValue(svc.client)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(svc.updates).toHaveLength(1)
    expect(svc.updates[0]).toMatchObject({ table: 'license_requests', values: { payment_status: 'paid' } })
  })

  it('is a no-op 200 on an already-paid replay', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const svc = makeService({ selectResult: { data: { id: 'd1', payment_status: 'paid' }, error: null } })
    mockCreateServiceClient.mockReturnValue(svc.client)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(svc.updates).toHaveLength(0)
  })

  it('is a no-op 200 for an unknown session (no deal, no error)', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const svc = makeService({ selectResult: { data: null, error: null } })
    mockCreateServiceClient.mockReturnValue(svc.client)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(svc.updates).toHaveLength(0)
  })

  it('returns 503 (retryable) when the deal lookup errors — never a swallowed 200', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const svc = makeService({ selectResult: { data: null, error: { message: 'db unavailable' } } })
    mockCreateServiceClient.mockReturnValue(svc.client)

    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
    expect(svc.updates).toHaveLength(0)
  })

  it('returns 503 (retryable) when marking the deal paid fails', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent())
    const svc = makeService({
      selectResult: { data: { id: 'd1', payment_status: 'pending' }, error: null },
      updateError: { message: 'write failed' },
    })
    mockCreateServiceClient.mockReturnValue(svc.client)

    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
  })
})

describe('stripe webhook — account.updated persistence', () => {
  it('persists Connect flags and returns 200 (happy path)', async () => {
    mockConstructEvent.mockReturnValue(accountEvent())
    const svc = makeService()
    mockCreateServiceClient.mockReturnValue(svc.client)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(svc.updates).toHaveLength(1)
    expect(svc.updates[0]).toMatchObject({
      table: 'user_profiles',
      values: { stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true },
    })
  })

  it('returns 503 (retryable) when persisting the Connect state fails', async () => {
    mockConstructEvent.mockReturnValue(accountEvent())
    const svc = makeService({ updateError: { message: 'write failed' } })
    mockCreateServiceClient.mockReturnValue(svc.client)

    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
  })
})
