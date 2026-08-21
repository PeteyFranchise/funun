// Audit #5/#10 — the job handler registry (watermark_preview + vault_export).

const mockRender = jest.fn()
jest.mock('@/lib/watermark/stream-preview', () => ({
  renderPreviewIfAbsent: (...a: unknown[]) => mockRender(...a),
}))

const mockLoadPlan = jest.fn()
const mockAssemble = jest.fn()
jest.mock('@/lib/vault/export-assemble', () => ({
  loadExportPlan: (...a: unknown[]) => mockLoadPlan(...a),
  assembleAndUploadPack: (...a: unknown[]) => mockAssemble(...a),
  MAX_PACK_BYTES: 200 * 1024 * 1024,
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({}),
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

describe('JOB_HANDLERS.vault_export', () => {
  const okPlan = { manifest: { hasMaster: true }, totalBytes: 10 * 1024 * 1024 }

  it('assembles and returns the pack path + mode', async () => {
    mockLoadPlan.mockResolvedValue(okPlan)
    mockAssemble.mockResolvedValue(undefined)
    const res = await JOB_HANDLERS.vault_export({ projectId: 'p1', userId: 'u1', mode: 'share' })
    expect(mockLoadPlan).toHaveBeenCalledWith(expect.anything(), { projectId: 'p1', userId: 'u1' })
    expect(mockAssemble).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ packPath: 'u1/p1/export-pack.zip' })
    )
    expect(res).toEqual({ path: 'u1/p1/export-pack.zip', mode: 'share' })
  })

  it('defaults mode to download', async () => {
    mockLoadPlan.mockResolvedValue(okPlan)
    mockAssemble.mockResolvedValue(undefined)
    const res = await JOB_HANDLERS.vault_export({ projectId: 'p1', userId: 'u1' })
    expect(res).toEqual({ path: 'u1/p1/export-pack.zip', mode: 'download' })
  })

  it('throws when projectId/userId are missing', async () => {
    await expect(JOB_HANDLERS.vault_export({ projectId: 'p1' })).rejects.toThrow('projectId/userId')
    expect(mockLoadPlan).not.toHaveBeenCalled()
  })

  it('throws when the project is not found/owned (so nothing assembles)', async () => {
    mockLoadPlan.mockResolvedValue(null)
    await expect(JOB_HANDLERS.vault_export({ projectId: 'p1', userId: 'u1' })).rejects.toThrow('not found')
    expect(mockAssemble).not.toHaveBeenCalled()
  })

  it('throws when there is no master audio', async () => {
    mockLoadPlan.mockResolvedValue({ manifest: { hasMaster: false }, totalBytes: 1 })
    await expect(JOB_HANDLERS.vault_export({ projectId: 'p1', userId: 'u1' })).rejects.toThrow('no master')
    expect(mockAssemble).not.toHaveBeenCalled()
  })

  it('throws when the pack exceeds the max even for the worker', async () => {
    mockLoadPlan.mockResolvedValue({ manifest: { hasMaster: true }, totalBytes: 300 * 1024 * 1024 })
    await expect(JOB_HANDLERS.vault_export({ projectId: 'p1', userId: 'u1' })).rejects.toThrow('too large')
    expect(mockAssemble).not.toHaveBeenCalled()
  })
})
