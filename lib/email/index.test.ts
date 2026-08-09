import { sendEmail } from './index'

// ─── sendEmail (27-CODEX-REVIEW.md follow-up #2 MEDIUM — idempotencyKey
// passthrough) ─────────────────────────────────────────────────────────────
// Covers: the optional idempotencyKey is forwarded to the Resend SDK as its
// second (options) argument, exactly as the SDK's `send(payload, options?)`
// signature expects; omitting it (every pre-existing caller) leaves the SDK
// call at its original one-argument shape (no `{idempotencyKey: undefined}`
// object accidentally sent over the wire); the no-op-when-unconfigured gate
// is unaffected by whether a key is supplied.

const sendMock = jest.fn(async () => ({ data: { id: 'email-1' }, error: null }))

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}))

const ENV_BACKUP = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ENV_BACKUP, RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'hello@funun.studio' }
})

afterAll(() => {
  process.env = ENV_BACKUP
})

describe('sendEmail', () => {
  it('forwards idempotencyKey as the Resend SDK options argument when provided', async () => {
    const result = await sendEmail({
      to: 'artist@example.com',
      subject: 'Subject',
      html: '<p>hi</p>',
      idempotencyKey: 'artist-reopen-waitlist-1-2026-08-09',
    })

    expect(result.ok).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'artist@example.com', subject: 'Subject' }),
      { idempotencyKey: 'artist-reopen-waitlist-1-2026-08-09' }
    )
  })

  it('calls the SDK with undefined options when no idempotencyKey is provided (pre-existing callers unaffected)', async () => {
    await sendEmail({ to: 'artist@example.com', subject: 'Subject', html: '<p>hi</p>' })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'artist@example.com' }), undefined)
  })

  it('two calls with the SAME idempotencyKey both reach the SDK with an identical key (retry-safe passthrough)', async () => {
    const key = 'artist-convert-waitlist-2-token-abc'
    await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>h</p>', idempotencyKey: key })
    await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>h</p>', idempotencyKey: key })

    expect(sendMock).toHaveBeenNthCalledWith(1, expect.anything(), { idempotencyKey: key })
    expect(sendMock).toHaveBeenNthCalledWith(2, expect.anything(), { idempotencyKey: key })
  })

  it('still no-ops (ok:false) when unconfigured, regardless of idempotencyKey', async () => {
    process.env.RESEND_API_KEY = ''
    const result = await sendEmail({
      to: 'artist@example.com',
      subject: 'Subject',
      html: '<p>hi</p>',
      idempotencyKey: 'some-key',
    })

    expect(result).toEqual({ ok: false, error: 'Email not configured' })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
