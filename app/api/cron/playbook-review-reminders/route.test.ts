import { createServiceClient } from '@/lib/supabase/server'
import { GET } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))

const ORIGINAL_ENV = process.env

function request(secret?: string) {
  return new Request('http://t.local/api/cron/playbook-review-reminders', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test-secret' }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('GET /api/cron/playbook-review-reminders', () => {
  it('fails closed when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET

    const response = await GET(request('undefined'))

    expect(response.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects the wrong secret before touching the database', async () => {
    const response = await GET(request('wrong'))

    expect(response.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('enqueues due reminders through the service-only atomic function', async () => {
    const rpc = jest.fn(async () => ({ data: 3, error: null }))
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })

    const response = await GET(request('test-secret'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, queued: 3 })
    expect(rpc).toHaveBeenCalledWith('enqueue_due_playbook_review_reminders', { p_limit: 100 })
  })

  it('does not expose a database error message', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'sensitive database detail' } }))
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })

    const response = await GET(request('test-secret'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('Could not enqueue Playbook review reminders.')
    expect(JSON.stringify(body)).not.toContain('sensitive database detail')
  })
})
