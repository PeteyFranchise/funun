import {
  decideWorkAccess,
  resolveWorkAccess,
  createWorkAccessDeps,
  type WorkAccessFactGetters,
} from '@/lib/catalogue/access'

// No Supabase import anywhere in this file — every fact-getter below is a
// plain injected fake. `decideWorkAccess` is pure and `resolveWorkAccess`
// is exercised entirely through fakes, proving neither needs a database.

describe('lib/catalogue/access — decideWorkAccess (pure)', () => {
  it('refuses with 401 when there is no signed-in user', () => {
    const result = decideWorkAccess({
      userId: null,
      isOwner: false,
      tier: null,
      requiredTier: 'contribute',
    })
    expect(result).toEqual({ granted: false, status: 401, reason: expect.any(String) })
  })

  it('grants the administer tier and isOwner=true to the work owner, with no membership row required', () => {
    const result = decideWorkAccess({
      userId: 'u-owner',
      isOwner: true,
      tier: null,
      requiredTier: 'contribute',
    })
    expect(result).toEqual({ granted: true, tier: 'administer', isOwner: true })
  })

  it('grants the contribute tier and isOwner=false to a contribute-tier member', () => {
    const result = decideWorkAccess({
      userId: 'u-collab',
      isOwner: false,
      tier: 'contribute',
      requiredTier: 'contribute',
    })
    expect(result).toEqual({ granted: true, tier: 'contribute', isOwner: false })
  })

  it('refuses with 404 (never 403) for a signed-in user with no ownership and no membership row', () => {
    const result = decideWorkAccess({
      userId: 'u-stranger',
      isOwner: false,
      tier: null,
      requiredTier: 'contribute',
    })
    expect(result).toEqual({ granted: false, status: 404, reason: expect.any(String) })
  })

  it('refuses a contribute-tier member with 403 when the route requires administer', () => {
    const result = decideWorkAccess({
      userId: 'u-collab',
      isOwner: false,
      tier: 'contribute',
      requiredTier: 'administer',
    })
    expect(result).toEqual({ granted: false, status: 403, reason: expect.any(String) })
  })

  it('grants an administer-tier member requiring administer', () => {
    const result = decideWorkAccess({
      userId: 'u-admin',
      isOwner: false,
      tier: 'administer',
      requiredTier: 'administer',
    })
    expect(result).toEqual({ granted: true, tier: 'administer', isOwner: false })
  })

  it('grants the owner when the route requires administer', () => {
    const result = decideWorkAccess({
      userId: 'u-owner',
      isOwner: true,
      tier: null,
      requiredTier: 'administer',
    })
    expect(result).toEqual({ granted: true, tier: 'administer', isOwner: true })
  })
})

describe('lib/catalogue/access — resolveWorkAccess (thin I/O wrapper, injected fakes)', () => {
  function fakeDeps(isOwner: boolean, tier: 'contribute' | 'administer' | null): WorkAccessFactGetters {
    return {
      getIsOwner: jest.fn(async () => isOwner),
      getTier: jest.fn(async () => tier),
    }
  }

  it('calls both fact-getters and delegates unchanged to decideWorkAccess — 401 branch', async () => {
    const deps = fakeDeps(false, null)
    const result = await resolveWorkAccess(deps, 'work-1', null, 'contribute')
    expect(result).toEqual({ granted: false, status: 401, reason: expect.any(String) })
    expect(deps.getIsOwner).toHaveBeenCalledWith('work-1', null)
    expect(deps.getTier).toHaveBeenCalledWith('work-1', null)
  })

  it('owner branch', async () => {
    const deps = fakeDeps(true, null)
    const result = await resolveWorkAccess(deps, 'work-1', 'u-owner', 'administer')
    expect(result).toEqual({ granted: true, tier: 'administer', isOwner: true })
  })

  it('contribute-tier member branch', async () => {
    const deps = fakeDeps(false, 'contribute')
    const result = await resolveWorkAccess(deps, 'work-1', 'u-collab', 'contribute')
    expect(result).toEqual({ granted: true, tier: 'contribute', isOwner: false })
  })

  it('non-member 404 branch', async () => {
    const deps = fakeDeps(false, null)
    const result = await resolveWorkAccess(deps, 'work-1', 'u-stranger', 'contribute')
    expect(result).toEqual({ granted: false, status: 404, reason: expect.any(String) })
  })

  it('insufficient-tier 403 branch', async () => {
    const deps = fakeDeps(false, 'contribute')
    const result = await resolveWorkAccess(deps, 'work-1', 'u-collab', 'administer')
    expect(result).toEqual({ granted: false, status: 403, reason: expect.any(String) })
  })
})

describe('lib/catalogue/access — createWorkAccessDeps (factory, fake rpc client)', () => {
  it('getIsOwner returns true only when the RPC reports true with no error', async () => {
    const client = { rpc: jest.fn(async () => ({ data: true, error: null })) } as unknown as Parameters<typeof createWorkAccessDeps>[0]
    const deps = createWorkAccessDeps(client)
    await expect(deps.getIsOwner('work-1', 'u-1')).resolves.toBe(true)
  })

  it('getIsOwner returns false when the RPC errors', async () => {
    const client = { rpc: jest.fn(async () => ({ data: true, error: new Error('boom') })) } as unknown as Parameters<typeof createWorkAccessDeps>[0]
    const deps = createWorkAccessDeps(client)
    await expect(deps.getIsOwner('work-1', 'u-1')).resolves.toBe(false)
  })

  it('getIsOwner short-circuits to false with no RPC call when userId is null', async () => {
    const rpc = jest.fn()
    const client = { rpc } as unknown as Parameters<typeof createWorkAccessDeps>[0]
    const deps = createWorkAccessDeps(client)
    await expect(deps.getIsOwner('work-1', null)).resolves.toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('getTier returns the tier the RPC reports when it is a recognized value', async () => {
    const client = { rpc: jest.fn(async () => ({ data: 'administer', error: null })) } as unknown as Parameters<typeof createWorkAccessDeps>[0]
    const deps = createWorkAccessDeps(client)
    await expect(deps.getTier('work-1', 'u-1')).resolves.toBe('administer')
  })

  it('getTier returns null for an unrecognized tier string, an error, or a null user', async () => {
    const badValue = { rpc: jest.fn(async () => ({ data: 'owner', error: null })) } as unknown as Parameters<typeof createWorkAccessDeps>[0]
    await expect(createWorkAccessDeps(badValue).getTier('work-1', 'u-1')).resolves.toBeNull()

    const errored = { rpc: jest.fn(async () => ({ data: 'contribute', error: new Error('boom') })) } as unknown as Parameters<typeof createWorkAccessDeps>[0]
    await expect(createWorkAccessDeps(errored).getTier('work-1', 'u-1')).resolves.toBeNull()

    const rpc = jest.fn()
    const noUser = { rpc } as unknown as Parameters<typeof createWorkAccessDeps>[0]
    await expect(createWorkAccessDeps(noUser).getTier('work-1', null)).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
})
