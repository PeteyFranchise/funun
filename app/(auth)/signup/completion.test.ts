import { signupCompletionState } from './completion'

describe('signupCompletionState', () => {
  it('continues into Funūn when Supabase created an active session', () => {
    expect(signupCompletionState({ access_token: 'session-token' })).toBe('active-session')
  })

  it('asks for email confirmation only when signup returned no session', () => {
    expect(signupCompletionState(null)).toBe('confirmation-required')
  })
})
