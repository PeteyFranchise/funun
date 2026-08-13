import { scrubKnownSensitiveKeys, SENSITIVE_KEY_PATTERNS, REDACTION_PLACEHOLDER } from './scrub'

describe('scrubKnownSensitiveKeys', () => {
  it('deletes request.cookies, request.headers, and request.query_string when present', () => {
    const event = {
      request: {
        url: 'https://funun.studio/api/vault',
        cookies: 'sb-access-token=xyz; session=abc',
        headers: { Authorization: 'Bearer secret-jwt-value' },
        query_string: 'token=abc123',
      },
    }
    const scrubbed = scrubKnownSensitiveKeys(event)
    const request = scrubbed.request as Record<string, unknown>
    expect(request.cookies).toBeUndefined()
    expect(request.headers).toBeUndefined()
    expect(request.query_string).toBeUndefined()
    expect(request.url).toBe('https://funun.studio/api/vault')
  })

  it('redacts nested sensitive keys in event.extra without exposing the original value', () => {
    const event = {
      extra: {
        password: 'hunter2',
        userToken: 'jwt-abc.def.ghi',
        jwt: 'jwt-abc.def.ghi',
        authorization: 'Bearer top-secret',
        apiKey: 'sk_live_abcdef',
        supabaseServiceKey: 'service-role-secret',
        legalName: 'Jamie Rivera',
        signature: 'base64-sig-data',
        royaltyRate: '12.5%',
        contractText: 'This agreement...',
      },
    }
    const scrubbed = scrubKnownSensitiveKeys(event)
    const extra = scrubbed.extra as Record<string, unknown>
    expect(extra.password).toBe(REDACTION_PLACEHOLDER)
    expect(extra.userToken).toBe(REDACTION_PLACEHOLDER)
    expect(extra.jwt).toBe(REDACTION_PLACEHOLDER)
    expect(extra.authorization).toBe(REDACTION_PLACEHOLDER)
    expect(extra.apiKey).toBe(REDACTION_PLACEHOLDER)
    expect(extra.supabaseServiceKey).toBe(REDACTION_PLACEHOLDER)
    expect(extra.legalName).toBe(REDACTION_PLACEHOLDER)
    expect(extra.signature).toBe(REDACTION_PLACEHOLDER)
    expect(extra.royaltyRate).toBe(REDACTION_PLACEHOLDER)
    expect(extra.contractText).toBe(REDACTION_PLACEHOLDER)

    const serialized = JSON.stringify(scrubbed)
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('jwt-abc.def.ghi')
    expect(serialized).not.toContain('Bearer top-secret')
    expect(serialized).not.toContain('sk_live_abcdef')
    expect(serialized).not.toContain('service-role-secret')
    expect(serialized).not.toContain('Jamie Rivera')
    expect(serialized).not.toContain('base64-sig-data')
    expect(serialized).not.toContain('This agreement...')
  })

  it('redacts nested sensitive keys inside event.contexts', () => {
    const event = {
      contexts: {
        collaborator: {
          legal_name: 'Priya Sharma',
          contract_id: 'ctr_9182',
        },
      },
    }
    const scrubbed = scrubKnownSensitiveKeys(event)
    const contexts = scrubbed.contexts as Record<string, unknown>
    const collaborator = contexts.collaborator as Record<string, unknown>
    expect(collaborator.legal_name).toBe(REDACTION_PLACEHOLDER)
    expect(collaborator.contract_id).toBe(REDACTION_PLACEHOLDER)
    expect(JSON.stringify(scrubbed)).not.toContain('Priya Sharma')
  })

  it('redacts a non-ASCII sensitive value regardless of encoding (Funūn legal name)', () => {
    const event = {
      extra: {
        legal_name: 'Funūn Holdings Ltd.',
      },
    }
    const scrubbed = scrubKnownSensitiveKeys(event)
    const extra = scrubbed.extra as Record<string, unknown>
    expect(extra.legal_name).toBe(REDACTION_PLACEHOLDER)
    expect(JSON.stringify(scrubbed)).not.toContain('Funūn Holdings Ltd.')
  })

  it('matches a sensitive key spelled with accented/normalized characters', () => {
    const event = {
      extra: {
        // Combining-diaeresis "ū" (NFD form) instead of the precomposed
        // character — the key match must still fire the "royalty" pattern
        // regardless of the surrounding non-ASCII characters.
        'royalty_fūn': '$1,200',
      },
    }
    const scrubbed = scrubKnownSensitiveKeys(event)
    const extra = scrubbed.extra as Record<string, unknown>
    const values = Object.values(extra)
    expect(values).toContain(REDACTION_PLACEHOLDER)
    expect(JSON.stringify(scrubbed)).not.toContain('$1,200')
  })

  it('returns an empty object for null, undefined, or an empty object without throwing', () => {
    expect(() => scrubKnownSensitiveKeys(null)).not.toThrow()
    expect(() => scrubKnownSensitiveKeys(undefined)).not.toThrow()
    expect(() => scrubKnownSensitiveKeys({})).not.toThrow()
    expect(scrubKnownSensitiveKeys(null)).toEqual({})
    expect(scrubKnownSensitiveKeys(undefined)).toEqual({})
    expect(scrubKnownSensitiveKeys({})).toEqual({})
  })

  it('preserves non-sensitive keys unchanged', () => {
    const event = {
      extra: {
        route: '/api/vault',
        status: 200,
      },
    }
    const scrubbed = scrubKnownSensitiveKeys(event)
    const extra = scrubbed.extra as Record<string, unknown>
    expect(extra.route).toBe('/api/vault')
    expect(extra.status).toBe(200)
  })

  it('exports a non-empty list of sensitive-key patterns', () => {
    expect(Array.isArray(SENSITIVE_KEY_PATTERNS)).toBe(true)
    expect(SENSITIVE_KEY_PATTERNS.length).toBeGreaterThan(0)
  })
})
