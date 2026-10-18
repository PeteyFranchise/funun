// The public pitch response routes reject a malformed token before any
// database work.
const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))

import { POST as acceptPitch } from '@/app/api/pitch/accept/[token]/route'
import { POST as declinePitch } from '@/app/api/pitch/decline/[token]/route'
import { POST as unsubscribePitch } from '@/app/api/pitch/unsubscribe/[token]/route'

const routes = [
  ['accept', acceptPitch],
  ['decline', declinePitch],
  ['unsubscribe', unsubscribePitch],
] as const

beforeEach(() => mockCreateServiceClient.mockReset())

describe.each(routes)('POST /api/pitch/%s/[token]', (_name, handler) => {
  it('returns 404 for a malformed token without touching the database', async () => {
    const res = await handler(
      new Request('http://t.local/api/pitch/x/not-a-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      { params: Promise.resolve({ token: 'not-a-token' }) }
    )
    expect(res.status).toBe(404)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })
})
