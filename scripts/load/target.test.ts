// ─── scripts/load/target.test.ts — production-target guard (R7 / D-11) ───
// Phase 32 plan 09. target.js is the single most safety-critical file in
// this plan: its failure mode is a 500-VU load test against live
// production. These tests exist to make that failure mode LOUD — they
// assert the guard refuses production by construction, and they enumerate
// the bypass attempts that a hand-rolled hostname parser is historically
// vulnerable to.
//
// target.js is dependency-free CommonJS (it must load unchanged inside
// k6's goja VM), so it is require()d here rather than imported. Running
// these tests needs no k6 install and touches no network.

const guard = require('./target.js') as {
  resolveTarget: () => string
  isProductionHostname: (h: unknown) => boolean
  isIpLiteral: (h: unknown) => boolean
  isLoopbackOrPrivateIp: (h: unknown) => boolean
  extractHostname: (u: unknown) => string
  TARGET_ENV_VAR: string
  PRODUCTION_HOSTNAMES: string[]
  ALLOWED_SCHEMES: string[]
}

const { TARGET_ENV_VAR } = guard

/** Runs resolveTarget() with K6_TARGET_URL set to `value`, then restores env. */
function withTarget<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env[TARGET_ENV_VAR]
  if (value === undefined) delete process.env[TARGET_ENV_VAR]
  else process.env[TARGET_ENV_VAR] = value
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env[TARGET_ENV_VAR]
    else process.env[TARGET_ENV_VAR] = previous
  }
}

/** Asserts the guard REFUSES `url` — the only acceptable outcome is a throw. */
function expectRefused(url: string): void {
  withTarget(url, () => {
    expect(() => guard.resolveTarget()).toThrow()
  })
}

/** Asserts the guard ACCEPTS `url` and returns it (trailing slashes trimmed). */
function expectAccepted(url: string, expected?: string): void {
  withTarget(url, () => {
    expect(guard.resolveTarget()).toBe(expected ?? url)
  })
}

describe('production targets are refused by construction (D-11)', () => {
  // The plain cases. If any of these ever pass, the harness can be pointed
  // at production and the whole plan's safety property is gone.
  const productionUrls = [
    'https://funun.studio',
    'https://funun.studio/',
    'https://www.funun.studio',
    'https://app.funun.studio',
    'http://funun.studio',
    'https://funun.studio/sync/catalog',
    'https://funun.studio:443',
    'https://funun.studio?utm=1',
  ]

  it.each(productionUrls)('refuses %s', (url) => {
    expectRefused(url)
  })

  it('names the hostname and says "PRODUCTION" in the refusal', () => {
    withTarget('https://www.funun.studio', () => {
      expect(() => guard.resolveTarget()).toThrow(/PRODUCTION/)
      expect(() => guard.resolveTarget()).toThrow(/www\.funun\.studio/)
    })
  })
})

describe('bypass attempts against the production check', () => {
  // ── case variation ──────────────────────────────────────────────────
  it.each([
    'https://FUNUN.STUDIO',
    'https://WWW.Funun.Studio',
    'HTTPS://funun.studio',
    'HtTpS://ApP.FuNuN.sTuDiO',
  ])('refuses case variation %s', (url) => {
    expectRefused(url)
  })

  // ── trailing dot (absolute-FQDN form) ───────────────────────────────
  // `funun.studio.` is the SAME host to DNS and to every HTTP client. A
  // naive `=== 'funun.studio'` / `endsWith('.funun.studio')` check misses
  // it entirely — this was a real bypass in the first draft of target.js.
  it.each([
    'https://funun.studio.',
    'https://funun.studio./',
    'https://www.funun.studio.',
    'https://funun.studio../',
    'https://FUNUN.STUDIO.',
    'https://funun.studio.:443',
  ])('refuses trailing-dot FQDN form %s', (url) => {
    expectRefused(url)
  })

  // ── userinfo confusion ──────────────────────────────────────────────
  // The host is what follows the LAST '@'. Anything that puts the real
  // production host after an '@' must still be caught.
  it.each([
    'https://staging.example.com@funun.studio',
    'https://user:pass@funun.studio',
    'https://a@b@funun.studio',
    'https://preview.vercel.app@www.funun.studio/',
  ])('refuses userinfo-disguised production host %s', (url) => {
    expectRefused(url)
  })

  // Conversely, production appearing IN the userinfo does not make a
  // non-production host production — the real host is what matters.
  it('treats funun.studio-in-userinfo as the non-production real host', () => {
    expect(guard.extractHostname('https://funun.studio@staging.vercel.app')).toBe(
      'staging.vercel.app'
    )
  })

  // ── path / query / fragment bait ────────────────────────────────────
  // The authority ends at the first / ? or #, so these are production.
  it.each([
    'https://funun.studio/@evil.example',
    'https://funun.studio#@evil.example',
    'https://funun.studio?next=@evil.example',
  ])('refuses %s (authority ends before / ? #)', (url) => {
    expectRefused(url)
  })

  // ── suffix / prefix lookalikes are NOT production ───────────────────
  // These are genuinely different hosts. Refusing them would be a false
  // positive; the anchored-dot suffix check must not over-match.
  it.each([
    'https://funun.studio.evil.example',
    'https://funun.studio.attacker.test',
    'https://notfunun.studio',
    'https://myfunun.studio',
  ])('does not treat lookalike %s as production', (url) => {
    expect(guard.isProductionHostname(guard.extractHostname(url))).toBe(false)
  })

  // ── no scheme / unusable scheme → fail closed ───────────────────────
  it.each([
    'funun.studio',
    'www.funun.studio',
    '//funun.studio',
    'funun.studio/sync/catalog',
    'file:///etc/hosts',
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'ftp://funun.studio',
    'ws://funun.studio',
    '',
    '   ',
    'not a url at all',
  ])('refuses unparseable-or-unusable target %s', (url) => {
    expectRefused(url)
  })

  // The cases above are all ALSO caught by another branch (production
  // host, or an unparseable authority), so they do not actually prove the
  // scheme allowlist exists — a mutation that deleted the allowlist left
  // every one of them passing. These are the discriminating cases: a
  // non-http(s) scheme on a host that is otherwise perfectly acceptable.
  // Only the scheme check can refuse these.
  it.each([
    'ftp://staging.vercel.app',
    'ws://preview.vercel.app',
    'wss://funun-git-phase32.vercel.app',
    'gopher://staging.example.test',
    'chrome-extension://preview.vercel.app',
  ])('refuses non-http(s) scheme %s on an otherwise-valid host', (url) => {
    expectRefused(url)
  })

  it('extractHostname yields nothing for a non-http(s) scheme', () => {
    expect(guard.extractHostname('ftp://staging.vercel.app')).toBe('')
    expect(guard.extractHostname('ws://staging.vercel.app')).toBe('')
    expect(guard.extractHostname('https://staging.vercel.app')).toBe('staging.vercel.app')
  })

  it('refuses when the env var is unset entirely', () => {
    withTarget(undefined, () => {
      expect(() => guard.resolveTarget()).toThrow(new RegExp(TARGET_ENV_VAR))
    })
  })

  // ── IP literals ─────────────────────────────────────────────────────
  // An IP literal has no hostname to compare, so isProductionHostname()
  // structurally cannot protect us. Public IP literals are refused.
  it.each([
    'http://203.0.113.10',
    'https://198.51.100.7:3000',
    'http://8.8.8.8',
    'https://[2001:db8::1]',
    'https://[2606:4700:4700::1111]:443',
  ])('refuses public IP literal %s', (url) => {
    expectRefused(url)
  })

  // Loopback / RFC1918 remain usable for a local or LAN staging box.
  it.each([
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'http://10.0.0.5:3000',
    'http://192.168.1.50:3000',
    'http://172.16.4.4:3000',
  ])('allows loopback/private target %s', (url) => {
    expectAccepted(url)
  })

  it('rejects a malformed octet as a non-private IP literal', () => {
    // 999.1.1.1 matches the literal SHAPE but is not a valid private
    // address, so it must not slip through the private-range allowance.
    expectRefused('http://999.1.1.1')
  })

  // ── whitespace / delimiter smuggling ────────────────────────────────
  it.each(['https://funun\\.studio', 'https://fun un.studio', 'https://\tfunun.studio'])(
    'refuses delimiter-smuggled host %s',
    (url) => {
      expectRefused(url)
    }
  )

  it('refuses an unterminated IPv6 bracket', () => {
    expectRefused('https://[2001:db8::1')
  })

  it('refuses an empty authority', () => {
    expectRefused('https://')
    expectRefused('https:///path')
    expectRefused('https://@')
  })
})

describe('legitimate non-production targets are accepted', () => {
  it.each([
    'https://funun-git-phase32-funun.vercel.app',
    'https://funun-abc123.vercel.app',
    'https://staging.example.test',
    'http://localhost:3000',
  ])('accepts %s', (url) => {
    expectAccepted(url)
  })

  it('trims trailing slashes so callers can concatenate paths safely', () => {
    expectAccepted('https://preview.vercel.app/', 'https://preview.vercel.app')
    expectAccepted('https://preview.vercel.app///', 'https://preview.vercel.app')
  })

  it('preserves the raw URL (including port) on success', () => {
    expectAccepted('http://localhost:3000', 'http://localhost:3000')
  })
})

describe('guard internals', () => {
  it('normalizes host case and trailing dots in extractHostname', () => {
    expect(guard.extractHostname('HTTPS://WWW.FUNUN.STUDIO./x')).toBe('www.funun.studio')
  })

  it('strips the port but keeps IPv6 brackets', () => {
    expect(guard.extractHostname('https://[::1]:8080/x')).toBe('[::1]')
    expect(guard.extractHostname('https://staging.vercel.app:8443/x')).toBe('staging.vercel.app')
  })

  it('isProductionHostname normalizes its own input', () => {
    expect(guard.isProductionHostname('FUNUN.STUDIO.')).toBe(true)
    expect(guard.isProductionHostname('  www.funun.studio.  ')).toBe(true)
    expect(guard.isProductionHostname('funun.studio.evil.example')).toBe(false)
    expect(guard.isProductionHostname('')).toBe(false)
    expect(guard.isProductionHostname(null)).toBe(false)
    expect(guard.isProductionHostname(undefined)).toBe(false)
  })

  it('only permits http and https schemes', () => {
    expect(guard.ALLOWED_SCHEMES).toEqual(['http', 'https'])
  })

  it('lists funun.studio as the production domain', () => {
    expect(guard.PRODUCTION_HOSTNAMES).toContain('funun.studio')
  })
})
