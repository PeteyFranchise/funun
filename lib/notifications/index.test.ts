import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { createNotification } from './index'

jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))

function client(options: { duplicate?: boolean; admissionError?: boolean } = {}) {
  const insert = jest.fn(async () => ({ error: null }))
  const rpc = jest.fn(async () => ({
    data: options.duplicate ?? false,
    error: options.admissionError ? { message: 'database detail' } : null,
  }))
  return {
    client: { rpc, from: jest.fn(() => ({ insert })) } as unknown as SupabaseClient,
    rpc,
    insert,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('createNotification coalescing', () => {
  const notification = {
    userId: 'recipient-1',
    type: 'new_dm',
    title: 'New message',
    body: 'A collaborator sent a message.',
    actorId: 'actor-1',
    email: 'member@example.com',
    sendEmailCopy: true,
  }

  it('claims atomic notification admission before email and insert', async () => {
    const fake = client()
    await expect(createNotification(fake.client, notification)).resolves.toEqual({
      ok: true,
      error: undefined,
    })
    expect(fake.rpc).toHaveBeenCalledWith('check_rate_limit', expect.objectContaining({
      p_key: expect.stringMatching(/^notification:[0-9a-f]{64}$/),
      p_window_seconds: 60,
      p_max: 1,
    }))
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(fake.insert).toHaveBeenCalledTimes(1)
  })

  it('suppresses an exact duplicate before either delivery path', async () => {
    const fake = client({ duplicate: true })
    await expect(createNotification(fake.client, notification)).resolves.toEqual({ ok: true })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(fake.insert).not.toHaveBeenCalled()
  })

  it('fails closed without leaking a database error', async () => {
    const fake = client({ admissionError: true })
    await expect(createNotification(fake.client, notification)).resolves.toEqual({
      ok: false,
      error: 'Notification admission unavailable',
    })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(fake.insert).not.toHaveBeenCalled()
  })
})
