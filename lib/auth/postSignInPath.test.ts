import { postSignInPath, STAFF_HOME, DEFAULT_HOME } from '@/lib/auth/postSignInPath'

const staff = (staff_role: string) => ({ app_metadata: { staff_role } })
const artist = { app_metadata: {} }

describe('postSignInPath — role-aware post-sign-in routing (25-11)', () => {
  it('routes each staff role to the admin surface when no next is given', () => {
    expect(postSignInPath({ user: staff('leadership') })).toBe(STAFF_HOME)
    expect(postSignInPath({ user: staff('ae') })).toBe(STAFF_HOME)
    expect(postSignInPath({ user: staff('bd') })).toBe(STAFF_HOME)
  })

  it('routes the legacy is_admin=true owner (leadership fallback) to the admin surface', () => {
    expect(postSignInPath({ user: { app_metadata: { is_admin: true } } })).toBe(STAFF_HOME)
  })

  it('routes non-staff (and a null user) to the default vault home', () => {
    expect(postSignInPath({ user: artist })).toBe(DEFAULT_HOME)
    expect(postSignInPath({ user: { app_metadata: { staff_role: 'nope' } } })).toBe(DEFAULT_HOME)
    expect(postSignInPath({ user: null })).toBe(DEFAULT_HOME)
  })

  it('honours an explicit same-origin next deep link, even for staff', () => {
    expect(postSignInPath({ user: staff('leadership'), next: '/vault/abc' })).toBe('/vault/abc')
    expect(postSignInPath({ user: artist, next: '/settings' })).toBe('/settings')
  })

  it('ignores blank/whitespace next and falls back to the role default', () => {
    expect(postSignInPath({ user: staff('ae'), next: '' })).toBe(STAFF_HOME)
    expect(postSignInPath({ user: artist, next: '   ' })).toBe(DEFAULT_HOME)
    expect(postSignInPath({ user: artist, next: null })).toBe(DEFAULT_HOME)
  })

  it('rejects off-site next (open-redirect guard) and falls back to the role default', () => {
    expect(postSignInPath({ user: artist, next: 'https://evil.com' })).toBe(DEFAULT_HOME)
    expect(postSignInPath({ user: artist, next: '//evil.com' })).toBe(DEFAULT_HOME)
    expect(postSignInPath({ user: staff('leadership'), next: 'http://evil.com/x' })).toBe(STAFF_HOME)
    expect(postSignInPath({ user: artist, next: 'javascript:alert(1)' })).toBe(DEFAULT_HOME)
  })
})
