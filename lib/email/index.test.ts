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

// ─── Suppression lookup (GH #190) ──────────────────────────────────────────
// sendEmail consults public.email_suppressions before every send. The Supabase
// service client is mocked as from(table).select('email').in('email', list)
// resolving a per-test configurable { data, error }.
let suppressionResult: { data: { email: string }[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
}
const inMock = jest.fn(async () => suppressionResult)
const selectMock = jest.fn(() => ({ in: inMock }))
const fromMock = jest.fn(() => ({ select: selectMock }))
const createServiceClientMock = jest.fn(() => ({ from: fromMock }))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => createServiceClientMock(),
}))

const captureExceptionMock = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

const ENV_BACKUP = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  suppressionResult = { data: [], error: null }
  createServiceClientMock.mockImplementation(() => ({ from: fromMock }))
  process.env ={ ...ENV_BACKUP, RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'hello@funun.studio' }
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

describe('sendEmail suppression (GH #190)', () => {
  const base = { subject: 'Subject', html: '<p>hi</p>' }

  it('does not call Resend for a suppressed single recipient', async () => {
    suppressionResult = { data: [{ email: 'bounced@example.com' }], error: null }

    const result = await sendEmail({ ...base, to: 'bounced@example.com' })

    expect(result).toEqual({
      ok: false,
      error: 'Recipient suppressed',
      suppressed: ['bounced@example.com'],
    })
    expect(sendMock).not.toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith('email_suppressions')
  })

  it('matches case- and whitespace-insensitively and strips Name <addr> forms', async () => {
    suppressionResult = { data: [{ email: 'bounced@example.com' }], error: null }

    const padded = await sendEmail({ ...base, to: ' Bounced@Example.com ' })
    expect(padded.error).toBe('Recipient suppressed')
    expect(inMock).toHaveBeenLastCalledWith('email', ['bounced@example.com'])

    const named = await sendEmail({ ...base, to: 'Some One <Bounced@Example.com>' })
    expect(named.error).toBe('Recipient suppressed')
    expect(inMock).toHaveBeenLastCalledWith('email', ['bounced@example.com'])
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends to the unsuppressed recipients of a mixed list and reports the skipped ones', async () => {
    suppressionResult = { data: [{ email: 'bounced@example.com' }], error: null }

    const result = await sendEmail({ ...base, to: ['bounced@example.com', 'ok@example.com'] })

    expect(result).toEqual({ ok: true, suppressed: ['bounced@example.com'] })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['ok@example.com'] }),
      undefined
    )
  })

  it('fails open and reports to Sentry when the lookup returns an error', async () => {
    suppressionResult = {
      data: null,
      error: { message: 'relation "public.email_suppressions" does not exist' },
    }

    const result = await sendEmail({ ...base, to: 'artist@example.com' })

    expect(result).toEqual({ ok: true })
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'artist@example.com' }),
      undefined
    )
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    expect(captureExceptionMock).toHaveBeenCalledWith(expect.anything(), {
      tags: { feature: 'email', operation: 'suppression-lookup' },
    })
  })

  it('fails open when createServiceClient throws', async () => {
    createServiceClientMock.mockImplementation(() => {
      throw new Error('supabaseUrl is required.')
    })

    const result = await sendEmail({ ...base, to: 'artist@example.com' })

    expect(result).toEqual({ ok: true })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
  })

  it('never touches the database when email is not configured', async () => {
    process.env.RESEND_API_KEY = ''

    const result = await sendEmail({ ...base, to: 'artist@example.com' })

    expect(result).toEqual({ ok: false, error: 'Email not configured' })
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })
})
