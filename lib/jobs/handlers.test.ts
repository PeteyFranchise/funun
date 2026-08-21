// Audit #5 — the watermark_preview job handler.

const mockRender = jest.fn()
jest.mock('@/lib/watermark/stream-preview', () => ({
  renderPreviewIfAbsent: (...a: unknown[]) => mockRender(...a),
}))

import { JOB_HANDLERS } from '@/lib/jobs/handlers'

beforeEach(() => jest.clearAllMocks())

describe('JOB_HANDLERS.watermark_preview', () => {
  it('renders the track and returns status + path', async () => {
    mockRender.mockResolvedValue({ status: 'ready', path: 't1/preview.wav' })
    const res = await JOB_HANDLERS.watermark_preview({ trackId: 't1' })
    expect(mockRender).toHaveBeenCalledWith('t1')
    expect(res).toEqual({ status: 'ready', path: 't1/preview.wav' })
  })

  it('passes a failed render through as a completed (non-retried) result', async () => {
    // no master audio → renderPreviewIfAbsent returns 'failed' (does not throw),
    // so the job completes rather than retrying a permanently un-renderable track
    mockRender.mockResolvedValue({ status: 'failed', path: null })
    const res = await JOB_HANDLERS.watermark_preview({ trackId: 't1' })
    expect(res).toEqual({ status: 'failed', path: null })
  })

  it('throws when trackId is missing so the job fails/retries', async () => {
    await expect(JOB_HANDLERS.watermark_preview({})).rejects.toThrow('trackId')
    expect(mockRender).not.toHaveBeenCalled()
  })
})
