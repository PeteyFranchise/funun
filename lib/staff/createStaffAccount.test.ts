import { createStaffAccount, DuplicateStaffAccountError } from './createStaffAccount'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ADMIN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

function buildService(overrides: {
  createUserResult?: { data: unknown; error: unknown }
  fununStaffInsertResult?: { error: unknown }
  generateLinkResult?: { data: unknown; error: unknown }
}) {
  const createUser = jest.fn(async () =>
    overrides.createUserResult ?? { data: { user: { id: USER_ID } }, error: null }
  )
  const generateLink = jest.fn(async () =>
    overrides.generateLinkResult ?? {
      data: { properties: { action_link: 'https://funun.studio/magic' } },
      error: null,
    }
  )

  const deleteEq = jest.fn(async () => ({ error: null }))
  const deleteUser = jest.fn(async () => ({ error: null }))
  // HIGH-3: compensation clears staff_role(s) before delete; default = success.
  const updateUserById = jest.fn(async () => ({ error: null }))
  const fununStaffInsert = jest.fn(async () => overrides.fununStaffInsertResult ?? { error: null })
  // account_provision_intents (migration 104): written before createUser() and
  // cleared after by createUserWithProvisionIntent.
  const intentInsert = jest.fn(async () => ({ error: null }))

  const from = jest.fn((table: string) => {
    // funun_staff supports both the insert and the compensation delete
    if (table === 'funun_staff') {
      return { insert: fununStaffInsert, delete: jest.fn(() => ({ eq: deleteEq })) }
    }
    if (table === 'account_provision_intents') {
      return { insert: intentInsert, delete: jest.fn(() => ({ eq: deleteEq })) }
    }
    // subscriptions / user_profiles phantom-row cleanup
    return { delete: jest.fn(() => ({ eq: deleteEq })) }
  })

  return {
    auth: { admin: { createUser, generateLink, deleteUser, updateUserById } },
    from,
    createUser,
    generateLink,
    deleteUser,
    updateUserById,
    fununStaffInsert,
    intentInsert,
    deleteEq,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('createStaffAccount', () => {
  it('sets app_metadata.staff_roles (+ primary staff_role) atomically inside createUser', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await createStaffAccount({
      email: 'ae@funun.studio',
      displayName: 'AE Person',
      staffRoles: ['ae'],
      invitedBy: ADMIN_ID,
    })

    expect(service.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ae@funun.studio',
        app_metadata: { staff_roles: ['ae'], staff_role: 'ae' },
      })
    )
  })

  it('writes the primary as staff_role AND the full set as staff_roles (multi-role)', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    // stored order [tms, leadership]; leadership is the higher-priority primary
    await createStaffAccount({
      email: 'multi@funun.studio',
      displayName: 'Multi Hat',
      staffRoles: ['tms', 'leadership'],
    })

    expect(service.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        app_metadata: { staff_roles: ['tms', 'leadership'], staff_role: 'leadership' },
      })
    )
    expect(service.fununStaffInsert).toHaveBeenCalledWith({
      user_id: USER_ID,
      staff_role: 'leadership',
      staff_roles: ['tms', 'leadership'],
      display_name: 'Multi Hat',
      phone: null,
    })
  })

  it('rejects an empty role set', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    await expect(
      createStaffAccount({ email: 'x@funun.studio', displayName: 'X', staffRoles: [] })
    ).rejects.toThrow(/at least one valid staff role/)
    expect(service.createUser).not.toHaveBeenCalled()
  })

  it('writes the phone number onto the funun_staff row when provided', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    await createStaffAccount({
      email: 'phone@funun.studio',
      displayName: 'Phoney',
      staffRoles: ['ae'],
      phone: '(313) 555-0000',
    })
    expect(service.fununStaffInsert).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '(313) 555-0000' })
    )
  })

  it('inserts a funun_staff row and sends the invite email on success', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const result = await createStaffAccount({
      email: 'bd@funun.studio',
      displayName: 'BD Person',
      staffRoles: ['bd'],
      invitedBy: ADMIN_ID,
    })

    expect(service.fununStaffInsert).toHaveBeenCalledWith({
      user_id: USER_ID,
      staff_role: 'bd',
      staff_roles: ['bd'],
      display_name: 'BD Person',
      phone: null,
    })
    // migration 104: a single-use intent row (client-generated id + lower-cased
    // email) admits this staff signup past the artist gate.
    expect(service.intentInsert).toHaveBeenCalledWith({
      id: expect.any(String),
      email: 'bd@funun.studio',
    })
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bd@funun.studio' })
    )
    expect(result).toEqual({ userId: USER_ID, emailSent: true })
  })

  it('reflects sendEmail ok:false in emailSent', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(sendEmail as jest.Mock).mockResolvedValue({ ok: false, error: 'Email not configured' })

    const result = await createStaffAccount({
      email: 'leader@funun.studio',
      displayName: 'Leader',
      staffRoles: ['leadership'],
    })

    expect(result.emailSent).toBe(false)
  })

  it('cleans up the phantom user_profiles/subscriptions rows handle_new_user creates (no staff branch)', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await createStaffAccount({
      email: 'ae2@funun.studio',
      displayName: 'AE Two',
      staffRoles: ['ae'],
    })

    expect(service.from).toHaveBeenCalledWith('subscriptions')
    expect(service.from).toHaveBeenCalledWith('user_profiles')
  })

  it('throws DuplicateStaffAccountError when createUser reports email_exists', async () => {
    const service = buildService({
      createUserResult: { data: null, error: { code: 'email_exists', message: 'exists' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'dupe@funun.studio', displayName: 'Dupe', staffRoles: ['ae'] })
    ).rejects.toBeInstanceOf(DuplicateStaffAccountError)
  })

  it('throws DuplicateStaffAccountError when createUser reports status 422', async () => {
    const service = buildService({
      createUserResult: { data: null, error: { status: 422, message: 'exists' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'dupe2@funun.studio', displayName: 'Dupe2', staffRoles: ['bd'] })
    ).rejects.toBeInstanceOf(DuplicateStaffAccountError)
  })

  it('throws a generic Error (not DuplicateStaffAccountError) for other createUser failures', async () => {
    const service = buildService({
      createUserResult: { data: null, error: { code: 'internal_error', message: 'outage' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'outage@funun.studio', displayName: 'Outage', staffRoles: ['ae'] })
    ).rejects.toThrow('Failed to create staff account')
    await expect(
      createStaffAccount({ email: 'outage@funun.studio', displayName: 'Outage', staffRoles: ['ae'] })
    ).rejects.not.toBeInstanceOf(DuplicateStaffAccountError)
  })

  it('throws when the funun_staff insert fails (no silent success)', async () => {
    const service = buildService({ fununStaffInsertResult: { error: { message: 'insert failed' } } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'fail@funun.studio', displayName: 'Fail', staffRoles: ['ae'] })
    ).rejects.toThrow(/Failed to create staff account.*insert failed/)
  })

  it('compensates by deleting the auth user when a post-create step fails — no ghost staff account (review finding #3)', async () => {
    const service = buildService({ fununStaffInsertResult: { error: { message: 'insert failed' } } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'ghost@funun.studio', displayName: 'Ghost', staffRoles: ['leadership'] })
    ).rejects.toThrow(/Failed to create staff account/)

    // the just-created auth user must be rolled back so no principal carrying
    // app_metadata.staff_roles survives without a directory row
    expect(service.deleteUser).toHaveBeenCalledWith(USER_ID)
  })

  it('throws when generateLink fails after a successful funun_staff insert', async () => {
    const service = buildService({
      generateLinkResult: { data: null, error: { message: 'link failed' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'linkfail@funun.studio', displayName: 'LinkFail', staffRoles: ['ae'] })
    ).rejects.toThrow('Failed to create staff account')
  })
})
