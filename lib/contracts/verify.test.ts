import { decideVerification } from '@/lib/contracts/verify'

// M-03 regression suite. The bug: a malformed / unparseable / all-pending model
// response produced status 'verified' with "Looks complete and consistent." on a
// legal document that was never actually assessed. decideVerification is
// fail-closed — 'verified' is reachable ONLY from a real, fully-assessed,
// at-least-one-pass, no-fail response. Everything else is 'unverified'.

const KEYS = ['splits_total', 'parties_present', 'signatures_present', 'terms_match'] as const

function checksAll(state: 'pass' | 'fail' | 'pending') {
  return Object.fromEntries(KEYS.map(k => [k, { state, detail: 'x' }]))
}

describe('decideVerification — fail-closed', () => {
  it('null (unparseable / truncated response) → unverified, never verified', () => {
    const r = decideVerification(null)
    expect(r.status).toBe('unverified')
    expect(r.checks.every(c => c.state === 'pending')).toBe(true)
    expect(r.summary).not.toMatch(/complete and consistent/i)
  })

  it('empty object (no checks key) → unverified', () => {
    expect(decideVerification({}).status).toBe('unverified')
  })

  it('checks present but empty → unverified', () => {
    expect(decideVerification({ checks: {} }).status).toBe('unverified')
  })

  it('a required check missing → unverified (not silently passed)', () => {
    const checks = checksAll('pass')
    delete (checks as Record<string, unknown>).terms_match
    expect(decideVerification({ checks }).status).toBe('unverified')
  })

  it('an unknown state on any check → unverified', () => {
    const checks = { ...checksAll('pass'), splits_total: { state: 'maybe' } }
    expect(decideVerification({ checks }).status).toBe('unverified')
  })

  it('all four pending (the model punted on everything) → unverified', () => {
    expect(decideVerification({ checks: checksAll('pending') }).status).toBe('unverified')
  })

  it('does not surface a hallucinated summary when unverified', () => {
    const r = decideVerification({ checks: checksAll('pending'), summary: 'Looks complete and consistent.' })
    expect(r.status).toBe('unverified')
    expect(r.summary).toMatch(/could not verify/i)
  })
})

describe('decideVerification — genuine verdicts', () => {
  it('all four pass → verified', () => {
    expect(decideVerification({ checks: checksAll('pass') }).status).toBe('verified')
  })

  it('three pass + one legitimate pending (N/A) → verified (no regression)', () => {
    const checks = { ...checksAll('pass'), splits_total: { state: 'pending', detail: 'N/A for this doc type' } }
    expect(decideVerification({ checks }).status).toBe('verified')
  })

  it('any explicit fail → failed', () => {
    const checks = { ...checksAll('pass'), signatures_present: { state: 'fail', detail: 'unsigned' } }
    expect(decideVerification({ checks }).status).toBe('failed')
  })

  it('a fail wins even when another check is missing (real problem detected)', () => {
    const checks: Record<string, unknown> = { parties_present: { state: 'fail' } }
    expect(decideVerification({ checks }).status).toBe('failed')
  })

  it('uses the model summary when the verdict is verified', () => {
    const r = decideVerification({ checks: checksAll('pass'), summary: 'All parties and splits check out.' })
    expect(r.summary).toBe('All parties and splits check out.')
  })
})
