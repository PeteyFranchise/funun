import { createUserWithProvisionIntent } from './provisionIntent'
import type { SupabaseClient } from '@supabase/supabase-js'

// Unit test for the single-use, attempt-bound intent lifecycle that admits
// admin-provisioned accounts past migration 104's artist invite gate:
// generate an id -> insert {id,email} -> createUser with that id in
// user_metadata.provision_intent + a normalized email -> clear by that id.

type BuildOpts = {
  intentInsertResult?: { error: unknown }
  createUserResult?: { data: unknown; error: unknown }
  createUserThrows?: Error
}

type InsertRow = { id: string; email: string }
type CreateUserArgs = { email: string; user_metadata: Record<string, unknown> }

function buildService(opts: BuildOpts = {}) {
  const calls: string[] = []
  const intentInsert = jest.fn(async (_row: InsertRow) => {
    calls.push('intent.insert')
    return opts.intentInsertResult ?? { error: null }
  })
  const intentDeleteEq = jest.fn(async (_col: string, _val: string): Promise<{ error: unknown }> => {
    calls.push('intent.delete')
    return { error: null }
  })
  const intentDelete = jest.fn(() => ({ eq: intentDeleteEq }))
  const createUser = jest.fn(async (_attrs: CreateUserArgs) => {
    calls.push('createUser')
    if (opts.createUserThrows) throw opts.createUserThrows
    return opts.createUserResult ?? { data: { user: { id: 'u1' } }, error: null }
  })
  const from = jest.fn((table: string) => {
    if (table === 'account_provision_intents') return { insert: intentInsert, delete: intentDelete }
    return {}
  })
  const service = { from, auth: { admin: { createUser } } } as unknown as SupabaseClient
  return { service, calls, intentInsert, intentDelete, intentDeleteEq, createUser }
}

describe('createUserWithProvisionIntent', () => {
  it('inserts {id,email} before createUser, threads that id into user_metadata.provision_intent + normalizes the createUser email, then clears by that id', async () => {
    const h = buildService()

    const result = await createUserWithProvisionIntent(h.service, {
      email: '  Buyer@Example.COM ',
      email_confirm: true,
      app_metadata: { role: 'buyer' },
    })

    expect(result).toEqual({ data: { user: { id: 'u1' } }, error: null })

    const insertArg = h.intentInsert.mock.calls[0][0]
    expect(insertArg).toEqual({ id: expect.any(String), email: 'buyer@example.com' })

    // MEDIUM-1: createUser gets the SAME normalized email the intent row stores,
    // and the SAME id in user_metadata.provision_intent (the capability token).
    const createUserArg = h.createUser.mock.calls[0][0]
    expect(createUserArg.email).toBe('buyer@example.com')
    expect(createUserArg.user_metadata.provision_intent).toBe(insertArg.id)

    // cleanup targets that exact id (never email — could hit a concurrent row).
    expect(h.intentDeleteEq).toHaveBeenCalledWith('id', insertArg.id)
    expect(h.calls).toEqual(['intent.insert', 'createUser', 'intent.delete'])
  })

  it('merges provision_intent into any user_metadata the caller passed (does not clobber it)', async () => {
    const h = buildService()

    await createUserWithProvisionIntent(h.service, {
      email: 'x@y.com',
      user_metadata: { display_name: 'X', role_badges: ['a'] },
    })

    const createUserArg = h.createUser.mock.calls[0][0]
    expect(createUserArg.user_metadata).toEqual({
      display_name: 'X',
      role_badges: ['a'],
      provision_intent: expect.any(String),
    })
  })

  it('throws (without calling createUser) if the intent insert fails — never proceed into a confusing gate rejection', async () => {
    const h = buildService({ intentInsertResult: { error: { message: 'revoked' } } })

    await expect(
      createUserWithProvisionIntent(h.service, { email: 'x@y.com' })
    ).rejects.toThrow(/provisioning intent.*revoked/i)
    expect(h.createUser).not.toHaveBeenCalled()
  })

  it('clears the intent (by id) even when createUser throws (finally)', async () => {
    const h = buildService({ createUserThrows: new Error('boom') })

    await expect(
      createUserWithProvisionIntent(h.service, { email: 'x@y.com' })
    ).rejects.toThrow('boom')
    const insertArg = h.intentInsert.mock.calls[0][0]
    expect(h.intentDeleteEq).toHaveBeenCalledWith('id', insertArg.id)
    expect(h.calls).toEqual(['intent.insert', 'createUser', 'intent.delete'])
  })

  it('returns the createUser error result unchanged (a createUser error is not thrown here) and still cleans up', async () => {
    const h = buildService({ createUserResult: { data: null, error: { code: 'email_exists' } } })

    const result = await createUserWithProvisionIntent(h.service, { email: 'dupe@y.com' })

    expect(result).toEqual({ data: null, error: { code: 'email_exists' } })
    expect(h.intentDeleteEq).toHaveBeenCalledWith('id', expect.any(String))
  })

  it('best-effort cleanup: a THROWN delete error does not fail a created account', async () => {
    const h = buildService()
    h.intentDeleteEq.mockRejectedValueOnce(new Error('delete failed'))

    const result = await createUserWithProvisionIntent(h.service, { email: 'x@y.com' })

    expect(result).toEqual({ data: { user: { id: 'u1' } }, error: null })
  })

  it('best-effort cleanup: a RESOLVED { error } from the delete does not fail a created account', async () => {
    const h = buildService()
    h.intentDeleteEq.mockResolvedValueOnce({ error: { message: 'cleanup db error' } })

    const result = await createUserWithProvisionIntent(h.service, { email: 'x@y.com' })

    expect(result).toEqual({ data: { user: { id: 'u1' } }, error: null })
  })
})
