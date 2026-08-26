import {
  VENDOR_PROBE_TIMEOUT_MS,
  classifyCredential,
  verdictFromHttpStatus,
  isEmailShaped,
  safeSenderDisplay,
  checkSenderAddress,
  summarizeVendorHealth,
  type VendorProbeResult,
} from './vendor-health'

// ─── Task 1 — pure verdict core (260826-2qm) ───────────────────────────────
// Every assertion here is network-free: this file covers only the pure
// classification/shape logic. Task 2 extends this same test file with the
// networked probe layer and the load-bearing sentinel no-leak test.

describe('VENDOR_PROBE_TIMEOUT_MS', () => {
  it('is 5000ms — larger than the 2000ms Supabase check budget', () => {
    expect(VENDOR_PROBE_TIMEOUT_MS).toBe(5000)
  })
})

describe('classifyCredential', () => {
  it('resolves missing for undefined', () => {
    expect(classifyCredential(undefined)).toBe('missing')
  })

  it('resolves missing for whitespace-only', () => {
    expect(classifyCredential('   ')).toBe('missing')
  })

  it.each([
    'placeholder',
    'your_key_here',
    'your-key-here',
    'changeme',
    'change_me',
    'TODO',
    'example-key',
    'dummy',
    'xxxx1234',
    '<insert key>',
  ])('resolves placeholder for %s', (value) => {
    expect(classifyCredential(value)).toBe('placeholder')
  })

  it('resolves present for an ordinary non-empty value', () => {
    expect(classifyCredential('sk_live_abc123def456')).toBe('present')
  })
})

describe('verdictFromHttpStatus', () => {
  it.each([200, 204])('resolves ok for %d', (status) => {
    expect(verdictFromHttpStatus(status)).toBe('ok')
  })

  it.each([401, 403, 400, 500])('resolves failed for %d', (status) => {
    expect(verdictFromHttpStatus(status)).toBe('failed')
  })
})

describe('isEmailShaped', () => {
  it('accepts a plain address', () => {
    expect(isEmailShaped('no-reply@auth.funun.studio')).toBe(true)
  })

  it('rejects a key-shaped value', () => {
    expect(isEmailShaped('re_abc123def456')).toBe(false)
  })

  it('rejects a value with no domain dot', () => {
    expect(isEmailShaped('not-an-address')).toBe(false)
  })

  it('rejects a value containing whitespace', () => {
    expect(isEmailShaped('no reply@funun.studio')).toBe(false)
  })
})

describe('safeSenderDisplay', () => {
  it('returns null for undefined', () => {
    expect(safeSenderDisplay(undefined)).toBeNull()
  })

  it('returns null for a key-shaped value even though the module never sees this used elsewhere', () => {
    expect(safeSenderDisplay('re_abc123def456')).toBeNull()
  })

  it('returns null for a non-email-shaped value', () => {
    expect(safeSenderDisplay('not-an-address')).toBeNull()
  })

  it('returns the trimmed address for a passing value', () => {
    expect(safeSenderDisplay('  no-reply@auth.funun.studio  ')).toBe('no-reply@auth.funun.studio')
  })
})

describe('checkSenderAddress', () => {
  it('resolves not-configured for undefined', () => {
    const result = checkSenderAddress(undefined, 'RESEND_FROM_EMAIL', 'Resend sender')
    expect(result.state).toBe('not-configured')
    expect(result.envVar).toBe('RESEND_FROM_EMAIL')
  })

  it('resolves failed for a key-shaped value, naming the problem, with no leak', () => {
    const sentinel = 're_SENTINEL_9f8e7d6c5b4a'
    const result = checkSenderAddress(sentinel, 'RESEND_FROM_EMAIL', 'Resend sender')
    expect(result.state).toBe('failed')
    expect(result.detail.toLowerCase()).toContain('api key')
    // Sentinel enforcement: the distinctive suffix must not survive into
    // the serialized result, proven by assertion rather than inspection.
    expect(JSON.stringify(result)).not.toContain('SENTINEL_9f8e7d6c5b4a')
  })

  it('resolves failed for a non-email-shaped value', () => {
    const result = checkSenderAddress('not-an-address', 'RESEND_FROM_EMAIL', 'Resend sender')
    expect(result.state).toBe('failed')
  })

  it('resolves ok with the address as detail for a passing value', () => {
    const result = checkSenderAddress(
      'no-reply@auth.funun.studio',
      'RESEND_FROM_EMAIL',
      'Resend sender'
    )
    expect(result.state).toBe('ok')
    expect(result.detail).toBe('no-reply@auth.funun.studio')
  })
})

describe('summarizeVendorHealth', () => {
  function row(state: VendorProbeResult['state']): VendorProbeResult {
    return { id: 'x', label: 'X', envVar: 'X_KEY', state, detail: '', durationMs: 0 }
  }

  it('counts ok/failed/notConfigured', () => {
    const summary = summarizeVendorHealth([row('ok'), row('ok'), row('failed'), row('not-configured')])
    expect(summary.ok).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.notConfigured).toBe(1)
  })

  it('allOk is true only when zero rows are failed', () => {
    expect(summarizeVendorHealth([row('ok'), row('not-configured')]).allOk).toBe(true)
    expect(summarizeVendorHealth([row('ok'), row('failed')]).allOk).toBe(false)
  })

  it('not-configured rows never flip allOk false', () => {
    expect(summarizeVendorHealth([row('not-configured'), row('not-configured')]).allOk).toBe(true)
  })
})
