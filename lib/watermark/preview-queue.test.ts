// Audit #5 — queuePreviewRender: idempotent enqueue + pre-Pro inline after() drain.

const mockEnqueue = jest.fn()
const mockProcess = jest.fn()
const mockAfter = jest.fn()

jest.mock('@/lib/jobs/queue', () => ({ enqueueJob: (...a: unknown[]) => mockEnqueue(...a) }))
jest.mock('@/lib/jobs/run', () => ({ processPendingJobs: (...a: unknown[]) => mockProcess(...a) }))
jest.mock('next/server', () => ({ after: (...a: unknown[]) => mockAfter(...a) }))

import { queuePreviewRender } from '@/lib/watermark/preview-queue'

beforeEach(() => {
  jest.clearAllMocks()
  mockEnqueue.mockResolvedValue({ id: 'j1' })
})

describe('queuePreviewRender', () => {
  it('enqueues one idempotent per-track watermark job', async () => {
    await queuePreviewRender('t1')
    expect(mockEnqueue).toHaveBeenCalledWith({
      type: 'watermark_preview',
      dedupKey: 'watermark_preview:t1',
      payload: { trackId: 't1' },
    })
  })

  it('registers an inline after() drain scoped to watermark_preview', async () => {
    await queuePreviewRender('t1')
    expect(mockAfter).toHaveBeenCalledTimes(1)
    // running the registered callback drains only watermark jobs, one at a time
    const cb = mockAfter.mock.calls[0][0] as () => unknown
    await cb()
    expect(mockProcess).toHaveBeenCalledWith({ type: 'watermark_preview', max: 1 })
  })

  it('still enqueues (and does not reject) when after() is unavailable', async () => {
    mockAfter.mockImplementation(() => {
      throw new Error('after() called outside a request scope')
    })
    await expect(queuePreviewRender('t1')).resolves.toBeUndefined()
    expect(mockEnqueue).toHaveBeenCalled()
  })
})
