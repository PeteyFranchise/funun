import {
  AUTH_DIAGNOSTIC_STAGE,
  AuthDiagnosticSchema,
  authCopyWithReference,
  validAuthCorrelationId,
} from '@/lib/auth/diagnostics'

const validEvent = {
  correlationId: 'AUTH-A1B2C3D4E5F6',
  eventCode: 'sign_in_failed' as const,
  surface: 'signin' as const,
  workspaceIntent: 'personal' as const,
  runtime: 'browser' as const,
}

describe('privacy-safe auth diagnostics', () => {
  it('accepts the allowlisted event shape and maps its lifecycle stage', () => {
    expect(AuthDiagnosticSchema.parse(validEvent)).toEqual(validEvent)
    expect(AUTH_DIAGNOSTIC_STAGE.sign_in_failed).toBe('credentials')
    expect(AUTH_DIAGNOSTIC_STAGE.callback_exchange_failed).toBe('code_exchange')
  })

  it.each(['email', 'userId', 'ip', 'userAgent', 'message', 'providerError', 'token'])(
    'rejects forbidden extra field %s',
    field => {
      expect(AuthDiagnosticSchema.safeParse({ ...validEvent, [field]: 'secret' }).success).toBe(false)
    }
  )

  it('accepts only non-identifying correlation IDs', () => {
    expect(validAuthCorrelationId('AUTH-A1B2C3D4E5F6')).toBe('AUTH-A1B2C3D4E5F6')
    expect(validAuthCorrelationId('auth-a1b2c3d4e5f6')).toBeNull()
    expect(validAuthCorrelationId('someone@example.com')).toBeNull()
  })

  it('adds the safe reference to public copy', () => {
    expect(authCopyWithReference('Try again.', validEvent.correlationId)).toBe(
      'Try again. Reference: AUTH-A1B2C3D4E5F6.'
    )
  })
})
