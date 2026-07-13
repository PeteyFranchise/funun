// Tests for Phase-11 DM rate-limit/connection-gate helpers
// (lib/social/dm.ts — new exports). Pure unit tests using hand-rolled
// fake Supabase client stubs — no real DB connection needed.
//
// RED (Task 1): The new exports do not exist yet in lib/social/dm.ts —
// this file MUST fail on import or assertion. Task 3 makes it GREEN.

import {
  countRecentRequests,
  isConnected,
  BASELINE_REQUEST_LIMIT,
  VERIFIED_REQUEST_LIMIT,
  PENDING_STACK_CAP,
} from '@/lib/social/dm'

// ─── Rate-limit constants ─────────────────────────────────────────────────

describe('rate-limit constants (D-15/D-18)', () => {
  it('BASELINE_REQUEST_LIMIT is 10', () => {
    expect(BASELINE_REQUEST_LIMIT).toBe(10)
  })

  it('VERIFIED_REQUEST_LIMIT is 30', () => {
    expect(VERIFIED_REQUEST_LIMIT).toBe(30)
  })

  it('PENDING_STACK_CAP is 3', () => {
    expect(PENDING_STACK_CAP).toBe(3)
  })
})

// ─── countRecentRequests ──────────────────────────────────────────────────

describe('countRecentRequests (CONNECT-04, D-14)', () => {
  it('returns the count from the stub when 3 pending requests exist', async () => {
    const fakeClient = makeFakeClientForCount(3)
    const result = await countRecentRequests(fakeClient as any, 'requester-uuid')
    expect(result).toBe(3)
  })

  it('returns 0 when count is null (empty result)', async () => {
    const fakeClient = makeFakeClientForCount(null)
    const result = await countRecentRequests(fakeClient as any, 'requester-uuid')
    expect(result).toBe(0)
  })

  it('queries dm_threads table', async () => {
    const spy = { table: '' }
    const fakeClient = makeFakeClientForCountWithSpy(3, spy)
    await countRecentRequests(fakeClient as any, 'requester-uuid')
    expect(spy.table).toBe('dm_threads')
  })

  it('filters by status=pending', async () => {
    const spy = { filters: [] as string[] }
    const fakeClient = makeFakeClientForCountTrackingFilters(3, spy)
    await countRecentRequests(fakeClient as any, 'requester-uuid')
    expect(spy.filters).toContain('pending')
  })

  it('filters by requester_id matching the caller', async () => {
    const spy = { filters: [] as string[] }
    const fakeClient = makeFakeClientForCountTrackingFilters(3, spy)
    await countRecentRequests(fakeClient as any, 'my-requester-id')
    expect(spy.filters).toContain('my-requester-id')
  })

  it('filters by created_at >= (now - 7 days) rolling window', async () => {
    const before = Date.now()
    const spy = { gteValue: '' }
    const fakeClient = makeFakeClientForCountTrackingGte(3, spy)
    await countRecentRequests(fakeClient as any, 'requester-uuid')
    const after = Date.now()

    // The gte filter should be an ISO string between (now - 7 days - 1s) and (now - 7 days + 1s)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const gteEpoch = new Date(spy.gteValue).getTime()
    expect(gteEpoch).toBeGreaterThanOrEqual(before - sevenDaysMs - 1000)
    expect(gteEpoch).toBeLessThanOrEqual(after - sevenDaysMs + 1000)
  })
})

// ─── isConnected ───────────────────────────────────────────────────────────

describe('isConnected (CONNECT-05, D-13)', () => {
  it('returns true when stub yields a connection row', async () => {
    const fakeClient = makeFakeClientForIsConnected({ id: 'conn-row-123' })
    const result = await isConnected(fakeClient as any, 'user-a', 'user-b')
    expect(result).toBe(true)
  })

  it('returns false when stub yields null (no connection)', async () => {
    const fakeClient = makeFakeClientForIsConnected(null)
    const result = await isConnected(fakeClient as any, 'user-a', 'user-b')
    expect(result).toBe(false)
  })

  it('queries the connections table', async () => {
    const spy = { table: '' }
    const fakeClient = makeFakeClientForIsConnectedWithSpy({ id: 'x' }, spy)
    await isConnected(fakeClient as any, 'user-a', 'user-b')
    expect(spy.table).toBe('connections')
  })

  it('filters on status=accepted', async () => {
    const spy = { filters: [] as string[] }
    const fakeClient = makeFakeClientForIsConnectedTrackingFilters({ id: 'x' }, spy)
    await isConnected(fakeClient as any, 'user-a', 'user-b')
    expect(spy.filters).toContain('accepted')
  })

  it('uses an either-direction .or() filter covering both a→b and b→a', async () => {
    const spy = { orArg: '' }
    const fakeClient = makeFakeClientForIsConnectedTrackingOr({ id: 'x' }, spy)
    await isConnected(fakeClient as any, 'user-a', 'user-b')
    // The .or() arg must cover both directions
    expect(spy.orArg).toContain('user-a')
    expect(spy.orArg).toContain('user-b')
    // Must reference both requester_id and addressee_id
    expect(spy.orArg).toContain('requester_id')
    expect(spy.orArg).toContain('addressee_id')
  })
})

// ─── Fake client builders ─────────────────────────────────────────────────

function makeFakeClientForCount(count: number | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => Promise.resolve({ count, error: null }),
  }
  return { from: () => chain }
}

function makeFakeClientForCountWithSpy(count: number, spy: { table: string }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => Promise.resolve({ count, error: null }),
  }
  return {
    from: (table: string) => {
      spy.table = table
      return chain
    },
  }
}

function makeFakeClientForCountTrackingFilters(count: number, spy: { filters: string[] }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (col: string, val: unknown) => {
    spy.filters.push(String(val))
    return chain
  }
  chain.gte = () => Promise.resolve({ count, error: null })
  return { from: () => chain }
}

function makeFakeClientForCountTrackingGte(count: number, spy: { gteValue: string }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.gte = (_col: string, val: string) => {
    spy.gteValue = val
    return Promise.resolve({ count, error: null })
  }
  return { from: () => chain }
}

function makeFakeClientForIsConnected(data: { id: string } | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    maybeSingle: () => Promise.resolve({ data, error: null }),
  }
  return { from: () => chain }
}

function makeFakeClientForIsConnectedWithSpy(data: { id: string } | null, spy: { table: string }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    maybeSingle: () => Promise.resolve({ data, error: null }),
  }
  return {
    from: (table: string) => {
      spy.table = table
      return chain
    },
  }
}

function makeFakeClientForIsConnectedTrackingFilters(data: { id: string } | null, spy: { filters: string[] }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (_col: string, val: unknown) => {
    spy.filters.push(String(val))
    return chain
  }
  chain.or = () => chain
  chain.maybeSingle = () => Promise.resolve({ data, error: null })
  return { from: () => chain }
}

function makeFakeClientForIsConnectedTrackingOr(data: { id: string } | null, spy: { orArg: string }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.or = (arg: string) => {
    spy.orArg = arg
    return chain
  }
  chain.maybeSingle = () => Promise.resolve({ data, error: null })
  return { from: () => chain }
}
