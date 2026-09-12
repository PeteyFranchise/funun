import { z } from 'zod'

export const AUTH_DIAGNOSTIC_EVENT_CODES = [
  'sign_in_failed',
  'signup_failed',
  'invitation_claim_failed',
  'recovery_request_failed',
  'recovery_verify_failed',
  'password_update_failed',
  'signout_failed',
  'account_switch_signout_failed',
  'callback_client_failed',
  'callback_exchange_failed',
] as const

export const AUTH_DIAGNOSTIC_SURFACES = [
  'signin',
  'signup',
  'forgot_password',
  'update_password',
  'auth_callback',
  'account_menu',
] as const

export const AUTH_DIAGNOSTIC_STAGES = [
  'credentials',
  'invitation_claim',
  'recovery_request',
  'recovery_verification',
  'password_change',
  'session_cleanup',
  'callback_initialization',
  'code_exchange',
] as const

export const AuthDiagnosticSchema = z
  .object({
    correlationId: z.string().regex(/^AUTH-[A-F0-9]{12}$/),
    eventCode: z.enum(AUTH_DIAGNOSTIC_EVENT_CODES),
    surface: z.enum(AUTH_DIAGNOSTIC_SURFACES),
    workspaceIntent: z.enum(['personal', 'team']).nullable(),
    runtime: z.enum(['browser', 'server']),
  })
  .strict()

export type AuthDiagnosticEvent = z.infer<typeof AuthDiagnosticSchema>
export type AuthDiagnosticEventCode = AuthDiagnosticEvent['eventCode']

export const AUTH_DIAGNOSTIC_STAGE: Record<
  AuthDiagnosticEventCode,
  (typeof AUTH_DIAGNOSTIC_STAGES)[number]
> = {
  sign_in_failed: 'credentials',
  signup_failed: 'credentials',
  invitation_claim_failed: 'invitation_claim',
  recovery_request_failed: 'recovery_request',
  recovery_verify_failed: 'recovery_verification',
  password_update_failed: 'password_change',
  signout_failed: 'session_cleanup',
  account_switch_signout_failed: 'session_cleanup',
  callback_client_failed: 'callback_initialization',
  callback_exchange_failed: 'code_exchange',
}

export function createAuthCorrelationId(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  return `AUTH-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export function authCopyWithReference(copy: string, correlationId: string): string {
  return `${copy} Reference: ${correlationId}.`
}

export function validAuthCorrelationId(value: string | null): string | null {
  return value && /^AUTH-[A-F0-9]{12}$/.test(value) ? value : null
}
