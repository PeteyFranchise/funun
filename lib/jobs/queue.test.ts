// Audit #5/#10 — durable job-queue helpers over the service client.

const mockInsert = jest.fn()
const mockSelect = jest.fn()
const mockUpdate = jest.fn()
const mockEq = jest.fn()
const mockIn = jest.fn()
const mockSingle = jest.fn()
const mockMaybeSingle = jest.fn()
const mockRpc = jest.fn()

// A chainable query-builder stand-in: chain methods return the builder, terminal
// methods resolve to configured values, and a `then` makes bare update().eq()
// chains awaitable.
function makeBuilder() {
  const builder: Record<string, unknown> = {}
  builder.insert = (...a: unknown[]) => { mockInsert(...a); return builder }
  builder.select = (...a: unknown[]) => { mockSelect(...a); return builder }
  builder.update = (...a: unknown[]) => { mockUpdate(...a); return builder }
  builder.eq = (...a: unknown[]) => { mockEq(...a); return builder }
  builder.in = (...a: unknown[]) => { mockIn(...a); return builder }
  builder.single = (...a: unknown[]) => mockSingle(...a)
  builder.maybeSingle = (...a: unknown[]) => mockMaybeSingle(...a)
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ error: null })
  return builder
}

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => makeBuilder(),
    rpc: (...a: unknown[]) => mockRpc(...a),
  }),
}))

import { enqueueJob, claimNextJob, completeJob, failJob, getJob } from './queue'

beforeEach(() => jest.clearAllMocks())

// ─── enqueueJob ───────────────────────────────────────────────────────────
describe('enqueueJob', () => {
  it('inserts type/payload/dedup_key and returns the new id', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'j1' }, error: null })
    const res = await enqueueJob({ type: 'vault_export', payload: { a: 1 }, dedupKey: 'k1' })
    expect(res).toEqual({ id: 'j1' })
    expect(mockInsert).toHaveBeenCalledWith({ type: 'vault_export', payload: { a: 1 }, dedup_key: 'k1' })
  })

  it('defaults payload to {} and dedup_key to null', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'j2' }, error: null })
    await enqueueJob({ type: 'watermark_preview' })
    expect(mockInsert).toHaveBeenCalledWith({ type: 'watermark_preview', payload: {}, dedup_key: null })
  })

  it('on a unique-violation with a dedupKey, returns the existing active job', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: '23505' } })
    mockMaybeSingle.mockResolvedValue({ data: { id: 'existing' } })
    const res = await enqueueJob({ type: 'watermark_preview', dedupKey: 'dup' })
    expect(res).toEqual({ id: 'existing' })
    // looked up by dedup_key, scoped to active statuses
    expect(mockEq).toHaveBeenCalledWith('dedup_key', 'dup')
    expect(mockIn).toHaveBeenCalledWith('status', ['pending', 'processing'])
  })

  it('returns null on a unique-violation when no active job is found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: '23505' } })
    mockMaybeSingle.mockResolvedValue({ data: null })
    expect(await enqueueJob({ type: 'x', dedupKey: 'dup' })).toBeNull()
  })

  it('returns null on a non-conflict insert error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: '42P01' } })
    expect(await enqueueJob({ type: 'x' })).toBeNull()
  })
})

// ─── claimNextJob ─────────────────────────────────────────────────────────
describe('claimNextJob', () => {
  it('unwraps the first row of the RPC set', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'j1', type: 'vault_export' }], error: null })
    const job = await claimNextJob()
    expect(job).toEqual({ id: 'j1', type: 'vault_export' })
    expect(mockRpc).toHaveBeenCalledWith('claim_next_job', { p_type: null })
  })

  it('passes p_type through when given', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await claimNextJob('watermark_preview')
    expect(mockRpc).toHaveBeenCalledWith('claim_next_job', { p_type: 'watermark_preview' })
  })

  it('returns null when the queue is empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    expect(await claimNextJob()).toBeNull()
  })

  it('returns null on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await claimNextJob()).toBeNull()
  })
})

// ─── completeJob ──────────────────────────────────────────────────────────
describe('completeJob', () => {
  it('marks completed with the result and stamps finished_at', async () => {
    await completeJob('j1', { url: 'https://x' })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', result: { url: 'https://x' } })
    )
    expect(mockUpdate.mock.calls[0][0]).toHaveProperty('finished_at')
    expect(mockEq).toHaveBeenCalledWith('id', 'j1')
  })
})

// ─── failJob ──────────────────────────────────────────────────────────────
describe('failJob', () => {
  it('re-queues (pending) while under max_attempts', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { attempts: 1, max_attempts: 3 } })
    await failJob('j1', 'transient')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', started_at: null, result: { error: 'transient' } })
    )
  })

  it('marks failed once attempts reach max_attempts', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { attempts: 3, max_attempts: 3 } })
    await failJob('j1', 'permanent')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', result: { error: 'permanent' } })
    )
  })
})

// ─── getJob ───────────────────────────────────────────────────────────────
describe('getJob', () => {
  it('returns the row', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'j1', status: 'completed' } })
    expect(await getJob('j1')).toEqual({ id: 'j1', status: 'completed' })
  })

  it('returns null when absent', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    expect(await getJob('nope')).toBeNull()
  })
})
