import type { SupabaseClient } from '@supabase/supabase-js'
import { attachUserEmails } from '@/lib/admin/user-emails'

// Proves the batched identity helper (audit #11) deduplicates ids, reuses a
// caller cache across sections, caps concurrency (no unbounded getUserById
// burst), and never throws on a failed lookup.

function makeService() {
  let inFlight = 0
  let maxInFlight = 0
  const getUserById = jest.fn(async (id: string) => {
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise(r => setTimeout(r, 5))
    inFlight--
    if (id === 'boom') throw new Error('gotrue down')
    return { data: { user: { email: `${id}@test.local` } }, error: null }
  })
  const service = { auth: { admin: { getUserById } } } as unknown as SupabaseClient
  return { service, getUserById, maxInFlight: () => maxInFlight }
}

describe('attachUserEmails (audit #11)', () => {
  it('deduplicates ids — the same id is fetched at most once', async () => {
    const { service, getUserById } = makeService()
    const map = await attachUserEmails(service, ['a', 'a', 'b', 'a'])
    expect(getUserById).toHaveBeenCalledTimes(2)
    expect(map.get('a')).toBe('a@test.local')
    expect(map.get('b')).toBe('b@test.local')
  })

  it('reuses a caller-supplied cache across sections — overlapping ids are not re-fetched', async () => {
    const { service, getUserById } = makeService()
    const cache = new Map<string, string>()
    await attachUserEmails(service, ['a', 'b'], { cache })
    await attachUserEmails(service, ['b', 'c'], { cache })
    // a, b from the first call; only c is new in the second (b is cached).
    expect(getUserById).toHaveBeenCalledTimes(3)
    expect([...cache.keys()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('caps concurrency — never more than N lookups in flight at once', async () => {
    const { service, maxInFlight } = makeService()
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`)
    await attachUserEmails(service, ids, { concurrency: 4 })
    expect(maxInFlight()).toBeLessThanOrEqual(4)
    expect(maxInFlight()).toBeGreaterThan(1) // actually parallelized, not serial
  })

  it('never throws — a failed lookup resolves that id to an empty string', async () => {
    const { service } = makeService()
    const map = await attachUserEmails(service, ['a', 'boom', 'b'])
    expect(map.get('boom')).toBe('')
    expect(map.get('a')).toBe('a@test.local')
    expect(map.get('b')).toBe('b@test.local')
  })
})
