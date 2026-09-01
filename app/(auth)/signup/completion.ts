export type SignupCompletionState = 'active-session' | 'confirmation-required'

/**
 * Supabase returns a session immediately when email confirmation is disabled.
 * A successful signup with no session is the only state in which asking the
 * person to check their inbox is truthful.
 */
export function signupCompletionState(session: object | null): SignupCompletionState {
  return session ? 'active-session' : 'confirmation-required'
}
