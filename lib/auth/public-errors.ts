export type AuthOperation =
  | 'sign-in'
  | 'sign-up'
  | 'password-recovery'
  | 'password-update'

type AuthErrorLike = {
  status?: unknown
  code?: unknown
}

const RATE_LIMIT_CODES = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit',
])

function isRateLimited(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as AuthErrorLike
  return candidate.status === 429 || (
    typeof candidate.code === 'string' && RATE_LIMIT_CODES.has(candidate.code)
  )
}

/**
 * Maps Supabase Auth failures to stable public copy. Provider messages can
 * expose account state and backend configuration, so UI code must never render
 * `error.message` directly.
 */
export function publicAuthError(operation: AuthOperation, error: unknown): string {
  if (isRateLimited(error)) {
    return operation === 'password-recovery'
      ? 'Too many reset requests. Wait a few minutes, then try again.'
      : 'Too many attempts. Wait a few minutes, then try again.'
  }

  switch (operation) {
    case 'sign-in':
      return 'We couldn\'t sign you in. Check your email and password and try again.'
    case 'sign-up':
      return 'We couldn\'t create your account. Check your information and try again.'
    case 'password-recovery':
      return 'We couldn\'t send a reset link right now. Please try again.'
    case 'password-update':
      return 'We couldn\'t update your password. Please try again.'
  }
}

export function callbackErrorMessage(value: string | null): string | null {
  switch (value) {
    case 'auth':
      return 'That sign-in link is invalid or has expired. Request a new link and try again.'
    case 'invite-claim':
      return 'Your invitation could not be completed. Ask the sender for a new invite and try again.'
    case 'signout':
      return 'We could not finish signing out. Sign in below to replace the current session.'
    case 'switch-signout':
      return 'We could not clear the previous account. Signing in below will replace that session.'
    default:
      return null
  }
}
