// ─── esign-invite.ts tests ─────────────────────────────────────────────
// Covers the Funūn-branded signature-invite email (ESIGN-18, P17-10):
// the rendered copy, the provider-free property, the explicit from/replyTo
// override, the never-throws contract, the unconfigured no-op, and the
// per-signer fan-out result array.

import {
  buildSignatureInviteEmail,
  sendSignatureInvite,
  sendSignatureInvites,
  type SignatureInviteInput,
} from './esign-invite'
import { sendEmail } from '@/lib/email'

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>

// ─── Fixtures ────────────────────────────────────────────────────────────

const baseInput: SignatureInviteInput = {
  songName: 'Neon Static',
  initiatorName: 'Maya Carter',
  signerName: 'Nikola Jokić',
  signerEmail: 'nikola@example.com',
  signerSplitPercentage: 40,
  token: 'a'.repeat(64),
  parties: [
    { name: 'Maya Carter', splitPercentage: 60 },
    { name: 'Nikola Jokić', splitPercentage: 40 },
  ],
}

const secondInput: SignatureInviteInput = {
  ...baseInput,
  signerName: 'Maya Carter',
  signerEmail: 'maya@example.com',
  signerSplitPercentage: 60,
  token: 'b'.repeat(64),
}

/**
 * Every host, path fragment, and brand mark belonging to a signing
 * provider Funūn integrates or has evaluated. Asserted against the
 * RENDERED subject/html/text — never against the source file — so a
 * header comment explaining what this module replaces can neither break
 * the gate nor falsely satisfy it.
 */
const PROVIDER_TOKENS = [
  'docuseal',
  'docuseal.co',
  'docuseal.com',
  'sign.docuseal',
  '/submissions/',
  '/d/',
  'docusign',
  'dropbox sign',
  'dropboxsign',
  'hellosign',
  'signwell',
  'adobe sign',
  'echosign',
]

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
  process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
  process.env.RESEND_API_KEY = 'test-key'
  process.env.ESIGN_FROM_EMAIL = 'esign@funun.studio'
  mockSendEmail.mockResolvedValue({ ok: true })
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

// ─── buildSignatureInviteEmail ───────────────────────────────────────────

describe('buildSignatureInviteEmail', () => {
  it('returns a subject, html, and text body', () => {
    const email = buildSignatureInviteEmail(baseInput)
    expect(typeof email.subject).toBe('string')
    expect(email.subject.length).toBeGreaterThan(0)
    expect(email.html.length).toBeGreaterThan(0)
    expect(email.text.length).toBeGreaterThan(0)
  })

  it('names the song in the subject and both bodies', () => {
    const { subject, html, text } = buildSignatureInviteEmail(baseInput)
    expect(subject).toContain('Neon Static')
    expect(html).toContain('Neon Static')
    expect(text).toContain('Neon Static')
  })

  it('names the initiator who sent the sheet', () => {
    const { html, text } = buildSignatureInviteEmail(baseInput)
    expect(html).toContain('Maya Carter')
    expect(text).toContain('Maya Carter')
  })

  it("states the signer's own share", () => {
    const { html, text } = buildSignatureInviteEmail(baseInput)
    expect(html).toContain('40%')
    expect(text).toContain('40%')
  })

  it('lists the other parties on the sheet with their shares', () => {
    const { html, text } = buildSignatureInviteEmail(baseInput)
    for (const body of [html, text]) {
      expect(body).toContain('Maya Carter')
      expect(body).toContain('60%')
      expect(body).toContain('Nikola Jokić')
    }
  })

  it("carries only the recipient's own token — never another signer's (T-17-32)", () => {
    const { html, text } = buildSignatureInviteEmail(baseInput)
    expect(html).toContain(baseInput.token)
    expect(text).toContain(baseInput.token)
    expect(html).not.toContain(secondInput.token)
    expect(text).not.toContain(secondInput.token)
  })

  it("builds the only action link from NEXT_PUBLIC_APP_URL as Funūn's own approve page", () => {
    const { html, text } = buildSignatureInviteEmail(baseInput)
    const approveUrl = `https://funun.studio/approve/${baseInput.token}`
    expect(html).toContain(`href="${approveUrl}"`)
    expect(text).toContain(approveUrl)
  })

  it('contains exactly one href, so there is a single trust signal to check (T-17-31)', () => {
    const { html } = buildSignatureInviteEmail(baseInput)
    const hrefs = html.match(/href="[^"]*"/g) ?? []
    expect(hrefs).toHaveLength(1)
    expect(hrefs[0]).toBe(`href="https://funun.studio/approve/${baseInput.token}"`)
  })

  it('renders no absolute URL other than the Funūn approve link', () => {
    const { html, text } = buildSignatureInviteEmail(baseInput)
    for (const body of [html, text]) {
      const urls = body.match(/https?:\/\/[^\s"'<>)]+/g) ?? []
      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) {
        expect(url.startsWith('https://funun.studio/approve/')).toBe(true)
      }
    }
  })

  it('states plainly that signing happens inside Funūn and needs no account', () => {
    const { html, text } = buildSignatureInviteEmail(baseInput)
    for (const body of [html, text]) {
      expect(body).toContain('Funūn')
      expect(body.toLowerCase()).toContain('no account')
    }
  })

  it('renders no image belonging to any third party (no <img> at all)', () => {
    const { html } = buildSignatureInviteEmail(baseInput)
    expect(html.toLowerCase()).not.toContain('<img')
  })

  it('renders no provider host, path, or brand mark anywhere in the output', () => {
    const rendered = [
      buildSignatureInviteEmail(baseInput),
      buildSignatureInviteEmail(secondInput),
      buildSignatureInviteEmail({ ...baseInput, initiatorName: null }),
    ]
    for (const { subject, html, text } of rendered) {
      const haystack = `${subject}\n${html}\n${text}`.toLowerCase()
      for (const token of PROVIDER_TOKENS) {
        expect(haystack).not.toContain(token)
      }
    }
  })

  it('degrades gracefully when the initiator name is absent', () => {
    const { subject, html, text } = buildSignatureInviteEmail({
      ...baseInput,
      initiatorName: null,
    })
    expect(subject).toContain('Neon Static')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('null')
    expect(text).not.toContain('undefined')
  })

  it('tolerates a missing NEXT_PUBLIC_APP_URL without emitting "undefined" into the link', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const { html, text } = buildSignatureInviteEmail(baseInput)
    expect(html).not.toContain('undefined')
    expect(text).not.toContain('undefined')
    expect(html).toContain(`/approve/${baseInput.token}`)
  })
})

// ─── sendSignatureInvite ─────────────────────────────────────────────────

describe('sendSignatureInvite', () => {
  it('sends through the lib/email wrapper with the rendered subject/html/text', async () => {
    const built = buildSignatureInviteEmail(baseInput)
    await sendSignatureInvite(baseInput)

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const args = mockSendEmail.mock.calls[0][0]
    expect(args.to).toBe('nikola@example.com')
    expect(args.subject).toBe(built.subject)
    expect(args.html).toBe(built.html)
    expect(args.text).toBe(built.text)
  })

  it('overrides from with ESIGN_FROM_EMAIL and points replyTo at that same real mailbox', async () => {
    await sendSignatureInvite(baseInput)
    const args = mockSendEmail.mock.calls[0][0]
    expect(args.from).toBe('esign@funun.studio')
    expect(args.replyTo).toBe('esign@funun.studio')
    expect(args.replyTo).toBe(args.from)
  })

  it('always passes an explicit from key so the wrapper never falls back to the generic sender (T-17-34)', async () => {
    await sendSignatureInvite(baseInput)
    expect('from' in mockSendEmail.mock.calls[0][0]).toBe(true)
  })

  it('returns a structured ok result naming the signer', async () => {
    const result = await sendSignatureInvite(baseInput)
    expect(result).toEqual({ email: 'nikola@example.com', ok: true })
  })

  it('no-ops with a structured not-configured result when ESIGN_FROM_EMAIL is unset', async () => {
    delete process.env.ESIGN_FROM_EMAIL
    const result = await sendSignatureInvite(baseInput)
    expect(result.ok).toBe(false)
    expect(result.notConfigured).toBe(true)
    expect(result.email).toBe('nikola@example.com')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('no-ops with a structured not-configured result when the Resend key is unset', async () => {
    delete process.env.RESEND_API_KEY
    mockSendEmail.mockResolvedValue({ ok: false, error: 'Email not configured' })
    const result = await sendSignatureInvite(baseInput)
    expect(result.ok).toBe(false)
    expect(result.notConfigured).toBe(true)
  })

  it('returns a failure result rather than throwing when the wrapper reports an error', async () => {
    mockSendEmail.mockResolvedValue({ ok: false, error: 'Recipient rejected' })
    const result = await sendSignatureInvite(baseInput)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Recipient rejected')
    expect(result.notConfigured).toBeUndefined()
  })

  it('never throws when the wrapper itself rejects, so one bad address cannot abort a spent mint (T-17-33)', async () => {
    mockSendEmail.mockRejectedValue(new Error('network down'))
    await expect(sendSignatureInvite(baseInput)).resolves.toEqual({
      email: 'nikola@example.com',
      ok: false,
      error: 'network down',
    })
  })

  it('returns a failure result for a signer with no email address rather than sending', async () => {
    const result = await sendSignatureInvite({ ...baseInput, signerEmail: '  ' })
    expect(result.ok).toBe(false)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

// ─── sendSignatureInvites ────────────────────────────────────────────────

describe('sendSignatureInvites', () => {
  it('fans out one send per signer', async () => {
    await sendSignatureInvites([baseInput, secondInput])
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail.mock.calls.map(c => c[0].to)).toEqual([
      'nikola@example.com',
      'maya@example.com',
    ])
  })

  it('returns a per-signer result array so the caller can report partial delivery', async () => {
    mockSendEmail
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'Bounced' })

    const results = await sendSignatureInvites([baseInput, secondInput])
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ email: 'nikola@example.com', ok: true })
    expect(results[1]).toEqual({ email: 'maya@example.com', ok: false, error: 'Bounced' })
  })

  it('does not let one signer failure stop the remaining signers', async () => {
    mockSendEmail
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true })

    const results = await sendSignatureInvites([baseInput, secondInput])
    expect(results[0].ok).toBe(false)
    expect(results[1].ok).toBe(true)
  })

  it('returns an empty array for no signers', async () => {
    await expect(sendSignatureInvites([])).resolves.toEqual([])
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
