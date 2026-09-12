import type { SupabaseClient } from '@supabase/supabase-js'
import { recordAuthDiagnosticEvent } from '@/lib/auth/diagnostic-store'

describe('auth diagnostic storage', () => {
  it('inserts one sanitized event without granting the request path deletion work', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null })
    const from = jest.fn().mockReturnValue({ insert })
    const service = { from } as unknown as SupabaseClient

    await expect(recordAuthDiagnosticEvent(service, {
      correlationId: 'AUTH-A1B2C3D4E5F6',
      eventCode: 'sign_in_failed',
      surface: 'signin',
      workspaceIntent: 'personal',
      runtime: 'browser',
    })).resolves.toBe(true)

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('auth_diagnostic_events')
    expect(insert).toHaveBeenCalledWith({
      correlation_id: 'AUTH-A1B2C3D4E5F6',
      event_code: 'sign_in_failed',
      stage: 'credentials',
      surface: 'signin',
      workspace_intent: 'personal',
      runtime: 'browser',
    })
  })
})
