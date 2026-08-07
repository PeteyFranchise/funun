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
  const fununStaffInsert = jest.fn(async () => overrides.fununStaffInsertResult ?? { error: null })

  const from = jest.fn((table: string) => {
    if (table === 'funun_staff') return { insert: fununStaffInsert }
    // subscriptions / user_profiles phantom-row cleanup
    return { delete: jest.fn(() => ({ eq: deleteEq })) }
  })

  return {
    auth: { admin: { createUser, generateLink } },
    from,
    createUser,
    generateLink,
    fununStaffInsert,
    deleteEq,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('createStaffAccount', () => {
  it('sets app_metadata.staff_role atomically inside createUser (never a post-insert update)', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await createStaffAccount({
      email: 'ae@funun.studio',
      displayName: 'AE Person',
      staffRole: 'ae',
      invitedBy: ADMIN_ID,
    })

    expect(service.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ae@funun.studio',
        app_metadata: { staff_role: 'ae' },
      })
    )
  })

  it('inserts a funun_staff row and sends the invite email on success', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const result = await createStaffAccount({
      email: 'bd@funun.studio',
      displayName: 'BD Person',
      staffRole: 'bd',
      invitedBy: ADMIN_ID,
    })

    expect(service.fununStaffInsert).toHaveBeenCalledWith({
      user_id: USER_ID,
      staff_role: 'bd',
      display_name: 'BD Person',
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
      staffRole: 'leadership',
    })

    expect(result.emailSent).toBe(false)
  })

  it('cleans up the phantom user_profiles/subscriptions rows handle_new_user creates (no staff branch)', async () => {
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await createStaffAccount({
      email: 'ae2@funun.studio',
      displayName: 'AE Two',
      staffRole: 'ae',
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
      createStaffAccount({ email: 'dupe@funun.studio', displayName: 'Dupe', staffRole: 'ae' })
    ).rejects.toBeInstanceOf(DuplicateStaffAccountError)
  })

  it('throws DuplicateStaffAccountError when createUser reports status 422', async () => {
    const service = buildService({
      createUserResult: { data: null, error: { status: 422, message: 'exists' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'dupe2@funun.studio', displayName: 'Dupe2', staffRole: 'bd' })
    ).rejects.toBeInstanceOf(DuplicateStaffAccountError)
  })

  it('throws a generic Error (not DuplicateStaffAccountError) for other createUser failures', async () => {
    const service = buildService({
      createUserResult: { data: null, error: { code: 'internal_error', message: 'outage' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'outage@funun.studio', displayName: 'Outage', staffRole: 'ae' })
    ).rejects.toThrow('Failed to create staff account')
    await expect(
      createStaffAccount({ email: 'outage@funun.studio', displayName: 'Outage', staffRole: 'ae' })
    ).rejects.not.toBeInstanceOf(DuplicateStaffAccountError)
  })

  it('throws when the funun_staff insert fails (no silent success)', async () => {
    const service = buildService({ fununStaffInsertResult: { error: { message: 'insert failed' } } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'fail@funun.studio', displayName: 'Fail', staffRole: 'ae' })
    ).rejects.toThrow('Failed to create staff account: insert failed')
  })

  it('throws when generateLink fails after a successful funun_staff insert', async () => {
    const service = buildService({
      generateLinkResult: { data: null, error: { message: 'link failed' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await expect(
      createStaffAccount({ email: 'linkfail@funun.studio', displayName: 'LinkFail', staffRole: 'ae' })
    ).rejects.toThrow('Failed to create staff account')
  })
})
