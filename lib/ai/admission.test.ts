import { aiAdmissionError, claimAiUsage, finishAiUsage } from './admission'

const CLAIM_ID = '11111111-1111-4111-8111-111111111111'

function request(idempotencyKey?: string) {
  return new Request('http://localhost/api/ai', {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })
}

describe('paid AI admission', () => {
  it('claims with a caller-provided UUID idempotency key', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { allowed: true, claimId: CLAIM_ID },
      error: null,
    })

    const result = await claimAiUsage({ rpc } as never, request(CLAIM_ID), {
      operation: 'test',
      units: 2,
    })

    expect(result).toEqual({ allowed: true, claimId: CLAIM_ID })
    expect(rpc).toHaveBeenCalledWith(
      'claim_ai_usage',
      expect.objectContaining({ p_idempotency_key: CLAIM_ID, p_units: 2 })
    )
  })

  it('fails closed when the admission RPC is unavailable', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(
      claimAiUsage({ rpc } as never, request(), { operation: 'test', units: 1 })
    ).resolves.toEqual({ allowed: false, reason: 'unavailable' })
  })

  it('maps duplicate and capacity denials to non-success responses', () => {
    expect(aiAdmissionError({ allowed: false, reason: 'duplicate' }).status).toBe(409)
    expect(aiAdmissionError({ allowed: false, reason: 'daily_limit' }).status).toBe(429)
    expect(aiAdmissionError({ allowed: false, reason: 'concurrency' }).status).toBe(429)
    expect(aiAdmissionError({ allowed: false, reason: 'global_limit' }).status).toBe(503)
  })

  it('releases the concurrency lease without refunding the durable usage claim', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null })
    await finishAiUsage({ rpc } as never, CLAIM_ID, true)
    expect(rpc).toHaveBeenCalledWith('finish_ai_usage', {
      p_claim_id: CLAIM_ID,
      p_succeeded: true,
    })
  })
})
