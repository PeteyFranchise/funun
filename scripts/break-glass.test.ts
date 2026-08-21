// ─── Break-glass CLI tests ─────────────────────────────────────────────────
// No live DB: pure arg-parsing/payload logic is tested directly; the
// grant-artist-invite / create-staff flows are tested against a hand-rolled
// fake Supabase client (mirrors __tests__/dm-request.test.ts's convention —
// a plain object exposing chainable stubs, not a real client).
//
// @/lib/staff/createStaffAccount is jest.mock()'d (never jest.requireActual)
// so its real implementation — which imports @/lib/supabase/server and
// therefore next/headers — is never loaded here.

jest.mock('@/lib/staff/createStaffAccount', () => {
  class DuplicateStaffAccountError extends Error {}
  return {
    createStaffAccount: jest.fn(),
    DuplicateStaffAccountError,
  }
})

import {
  assertEnv,
  buildGrantInvitePayload,
  MissingEnvError,
  normalizeEmail,
  parseArgs,
  resolveStaffRole,
  runCreateStaff,
  runGrantArtistInvite,
} from './break-glass'
import { createStaffAccount, DuplicateStaffAccountError } from '@/lib/staff/createStaffAccount'

// ─── normalizeEmail ─────────────────────────────────────────────────────

describe('normalizeEmail', () => {
  it('trims and lowercases a valid email', () => {
    expect(normalizeEmail('  Pete@Funun.Studio  ')).toBe('pete@funun.studio')
  })

  it('returns empty string for an invalid or empty input', () => {
    expect(normalizeEmail('not-an-email')).toBe('')
    expect(normalizeEmail('')).toBe('')
    expect(normalizeEmail('   ')).toBe('')
  })
})

// ─── resolveStaffRole ───────────────────────────────────────────────────

describe('resolveStaffRole', () => {
  it('defaults to leadership when no role is given', () => {
    expect(resolveStaffRole(undefined)).toBe('leadership')
  })

  it('accepts every valid staff role', () => {
    expect(resolveStaffRole('leadership')).toBe('leadership')
    expect(resolveStaffRole('ae')).toBe('ae')
    expect(resolveStaffRole('bd')).toBe('bd')
  })

  it('rejects an invalid role', () => {
    expect(resolveStaffRole('owner')).toBeNull()
    expect(resolveStaffRole('')).toBeNull()
  })
})

// ─── parseArgs ──────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('returns help for no args', () => {
    expect(parseArgs([])).toEqual({ command: 'help' })
    expect(parseArgs(['help'])).toEqual({ command: 'help' })
    expect(parseArgs(['--help'])).toEqual({ command: 'help' })
  })

  it('parses grant-artist-invite with a valid email', () => {
    expect(parseArgs(['grant-artist-invite', 'Artist@Example.com'])).toEqual({
      command: 'grant-artist-invite',
      email: 'artist@example.com',
    })
  })

  it('errors on grant-artist-invite with a missing or invalid email', () => {
    expect(parseArgs(['grant-artist-invite'])).toMatchObject({ command: 'error' })
    expect(parseArgs(['grant-artist-invite', 'nope'])).toMatchObject({ command: 'error' })
  })

  it('parses create-staff with the default role', () => {
    expect(parseArgs(['create-staff', 'staff@example.com'])).toEqual({
      command: 'create-staff',
      email: 'staff@example.com',
      role: 'leadership',
    })
  })

  it('parses create-staff with an explicit valid role', () => {
    expect(parseArgs(['create-staff', 'staff@example.com', 'bd'])).toEqual({
      command: 'create-staff',
      email: 'staff@example.com',
      role: 'bd',
    })
  })

  it('errors on create-staff with an invalid role', () => {
    expect(parseArgs(['create-staff', 'staff@example.com', 'ceo'])).toMatchObject({ command: 'error' })
  })

  it('errors on an unknown command', () => {
    expect(parseArgs(['nuke-everything'])).toMatchObject({ command: 'error' })
  })
})

// ─── buildGrantInvitePayload ────────────────────────────────────────────

describe('buildGrantInvitePayload', () => {
  it('builds a pending owner_seed payload with no token/expiry', () => {
    expect(buildGrantInvitePayload('artist@example.com')).toEqual({
      email: 'artist@example.com',
      status: 'pending',
      source: 'owner_seed',
      invite_token: null,
      token_expires_at: null,
    })
  })
})

// ─── assertEnv ──────────────────────────────────────────────────────────

describe('assertEnv', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('throws MissingEnvError when both vars are absent', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => assertEnv()).toThrow(MissingEnvError)
  })

  it('throws naming only the missing var, never a value', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => assertEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('does not throw when both vars are present', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    expect(() => assertEnv()).not.toThrow()
  })
})

// ─── fake Supabase client builder ───────────────────────────────────────
// A minimal thenable query-builder stand-in: every chain method returns the
// same builder, and awaiting the builder at any point in the chain resolves
// to the canned result — mirrors how the real supabase-js builder works
// (PromiseLike, not a plain object you must call .then() on manually).

function makeBuilder(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  const chain = ['select', 'ilike', 'order', 'limit', 'eq', 'insert', 'update']
  for (const method of chain) {
    builder[method] = jest.fn(() => builder)
  }
  builder.maybeSingle = jest.fn(async () => result)
  builder.then = (onFulfilled: (v: typeof result) => unknown) => Promise.resolve(result).then(onFulfilled)
  return builder
}

// ─── runGrantArtistInvite ───────────────────────────────────────────────

describe('runGrantArtistInvite', () => {
  const EMAIL = 'artist@example.com'

  it('inserts a new pending owner_seed row when none exists', async () => {
    const lookupBuilder = makeBuilder({ data: [], error: null })
    const insertBuilder = makeBuilder({ data: { id: 'new-id' }, error: null })
    const from = jest.fn().mockReturnValueOnce(lookupBuilder).mockReturnValueOnce(insertBuilder)
    const service = { from } as any

    await runGrantArtistInvite(service, EMAIL)

    expect(from).toHaveBeenNthCalledWith(1, 'artist_invites')
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      email: EMAIL,
      status: 'pending',
      source: 'owner_seed',
      invite_token: null,
      token_expires_at: null,
    })
  })

  it('is a no-op when a pending row already exists', async () => {
    const lookupBuilder = makeBuilder({ data: [{ id: 'existing-id', status: 'pending' }], error: null })
    const from = jest.fn().mockReturnValueOnce(lookupBuilder)
    const service = { from } as any

    await runGrantArtistInvite(service, EMAIL)

    expect(from).toHaveBeenCalledTimes(1)
  })

  it('reactivates an existing non-pending row instead of duplicating it', async () => {
    const lookupBuilder = makeBuilder({ data: [{ id: 'existing-id', status: 'expired' }], error: null })
    const updateBuilder = makeBuilder({ data: null, error: null })
    const from = jest.fn().mockReturnValueOnce(lookupBuilder).mockReturnValueOnce(updateBuilder)
    const service = { from } as any

    await runGrantArtistInvite(service, EMAIL)

    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', source: 'owner_seed' })
    )
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'existing-id')
  })

  it('throws when the lookup errors', async () => {
    const lookupBuilder = makeBuilder({ data: null, error: { message: 'db down' } })
    const service = { from: jest.fn().mockReturnValue(lookupBuilder) } as any

    await expect(runGrantArtistInvite(service, EMAIL)).rejects.toThrow(/db down/)
  })
})

// ─── runCreateStaff ─────────────────────────────────────────────────────

describe('runCreateStaff', () => {
  const EMAIL = 'staff@example.com'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates the account and mints a fresh sign-in link', async () => {
    ;(createStaffAccount as jest.Mock).mockResolvedValue({ userId: 'user-1', emailSent: true })
    const generateLink = jest.fn(async () => ({
      data: { properties: { action_link: 'https://funun.studio/magic-link' } },
      error: null,
    }))
    const service = { auth: { admin: { generateLink } } } as any

    await runCreateStaff(service, EMAIL, 'ae')

    expect(createStaffAccount).toHaveBeenCalledWith({ email: EMAIL, displayName: EMAIL, staffRoles: ['ae'] })
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: EMAIL })
  })

  it('does not throw when an account for the email already exists', async () => {
    ;(createStaffAccount as jest.Mock).mockRejectedValue(new DuplicateStaffAccountError('already invited'))
    const service = { auth: { admin: { generateLink: jest.fn() } } } as any

    await expect(runCreateStaff(service, EMAIL, 'leadership')).resolves.toBeUndefined()
    expect(service.auth.admin.generateLink).not.toHaveBeenCalled()
  })

  it('propagates any other error', async () => {
    ;(createStaffAccount as jest.Mock).mockRejectedValue(new Error('service role key rejected'))
    const service = { auth: { admin: { generateLink: jest.fn() } } } as any

    await expect(runCreateStaff(service, EMAIL, 'leadership')).rejects.toThrow(/service role key rejected/)
  })
})
