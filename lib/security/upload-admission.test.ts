import { claimUploadAdmission, parseAdmittedFormData } from './upload-admission'

const CLAIM_ID = '11111111-1111-4111-8111-111111111111'

function request(length?: number) {
  return {
    headers: new Headers(length ? { 'content-length': String(length) } : undefined),
    formData: jest.fn().mockResolvedValue(new FormData()),
  } as unknown as Request
}

describe('multipart upload admission', () => {
  it('rejects a missing length before database admission or body parsing', async () => {
    const rpc = jest.fn()
    const req = request()
    const result = await parseAdmittedFormData({ rpc } as never, req, {
      operation: 'test',
      maxBodyBytes: 100,
      dailyCountLimit: 2,
      dailyByteLimit: 200,
    })
    expect(result).toEqual({ ok: false, status: 411, error: expect.any(String) })
    expect(rpc).not.toHaveBeenCalled()
    expect(req.formData).not.toHaveBeenCalled()
  })

  it('rejects an oversized body before parsing', async () => {
    const rpc = jest.fn()
    const req = request(101)
    const result = await claimUploadAdmission({ rpc } as never, req, {
      operation: 'test',
      maxBodyBytes: 100,
      dailyCountLimit: 2,
      dailyByteLimit: 200,
    })
    expect(result).toEqual({ allowed: false, status: 413, error: expect.any(String) })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('releases the concurrency lease after parsing', async () => {
    const rpc = jest.fn((name: string) =>
      Promise.resolve(
        name === 'claim_upload_admission'
          ? { data: { allowed: true, claimId: CLAIM_ID }, error: null }
          : { data: true, error: null }
      )
    )
    const req = request(80)
    const result = await parseAdmittedFormData({ rpc } as never, req, {
      operation: 'test',
      maxBodyBytes: 100,
      dailyCountLimit: 2,
      dailyByteLimit: 200,
    })
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenLastCalledWith('finish_upload_admission', { p_claim_id: CLAIM_ID })
  })
})
