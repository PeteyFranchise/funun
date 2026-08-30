import { resolveHandle, type HandleResolverClient } from './resolve'

function mockClient(
  impl: (fn: string, args: { p_handle: string }) => Promise<{ data: unknown; error: unknown }>
): HandleResolverClient {
  return { rpc: jest.fn(impl) } as unknown as HandleResolverClient
}

describe('resolveHandle', () => {
  it('resolves an exact-case live handle to kind: current', async () => {
    const client = mockClient(async () => ({
      data: [{ profile_id: 'p1', current_handle: 'maya-reyes', redirected: false }],
      error: null,
    }))
    const result = await resolveHandle(client, 'maya-reyes')
    expect(result).toEqual({ kind: 'current', profileId: 'p1', handle: 'maya-reyes' })
  })

  it('resolves a live handle in different casing to kind: current, with the STORED casing (not the URL casing)', async () => {
    const client = mockClient(async () => ({
      data: [{ profile_id: 'p1', current_handle: 'maya-reyes', redirected: false }],
      error: null,
    }))
    const result = await resolveHandle(client, 'MAYA-REYES')
    expect(result).toEqual({ kind: 'current', profileId: 'p1', handle: 'maya-reyes' })
    expect((result as { handle: string }).handle).not.toBe('MAYA-REYES')
  })

  it('resolves a retired handle to kind: redirect, carrying the owner\'s CURRENT handle', async () => {
    const client = mockClient(async () => ({
      data: [{ profile_id: 'p1', current_handle: 'maya-r', redirected: true }],
      error: null,
    }))
    const result = await resolveHandle(client, 'maya-reyes-old')
    expect(result).toEqual({ kind: 'redirect', profileId: 'p1', handle: 'maya-r' })
  })

  it('resolves an unmatched handle to kind: none', async () => {
    const client = mockClient(async () => ({ data: [], error: null }))
    const result = await resolveHandle(client, 'nobody-here')
    expect(result).toEqual({ kind: 'none' })
  })

  it('returns kind: none for an empty segment and never calls the RPC', async () => {
    const rpc = jest.fn()
    const client = { rpc } as unknown as HandleResolverClient
    const result = await resolveHandle(client, '')
    expect(result).toEqual({ kind: 'none' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns kind: none for a whitespace-only segment and never calls the RPC', async () => {
    const rpc = jest.fn()
    const client = { rpc } as unknown as HandleResolverClient
    const result = await resolveHandle(client, '   ')
    expect(result).toEqual({ kind: 'none' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns kind: none for a segment longer than 64 characters and never calls the RPC', async () => {
    const rpc = jest.fn()
    const client = { rpc } as unknown as HandleResolverClient
    const result = await resolveHandle(client, 'a'.repeat(65))
    expect(result).toEqual({ kind: 'none' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps an RPC error to kind: none rather than throwing', async () => {
    const client = mockClient(async () => ({ data: null, error: { message: 'boom' } }))
    await expect(resolveHandle(client, 'maya-reyes')).resolves.toEqual({ kind: 'none' })
  })

  it('maps an empty array result to kind: none', async () => {
    const client = mockClient(async () => ({ data: [], error: null }))
    const result = await resolveHandle(client, 'maya-reyes')
    expect(result).toEqual({ kind: 'none' })
  })

  it('invokes the RPC exactly once per call, with the trimmed segment as p_handle', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ profile_id: 'p1', current_handle: 'maya-reyes', redirected: false }],
      error: null,
    })
    const client = { rpc } as unknown as HandleResolverClient
    await resolveHandle(client, '  maya-reyes  ')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('resolve_profile_by_handle', { p_handle: 'maya-reyes' })
  })
})
