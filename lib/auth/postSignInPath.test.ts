import { postSignInPath, BUYER_HOME, STAFF_HOME, DEFAULT_HOME } from '@/lib/auth/postSignInPath'

const staff = (staff_role: string) => ({ app_metadata: { staff_role } })
const artist = { app_metadata: {} }
const buyer = { app_metadata: { role: 'buyer' } }

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

  it('routes a buyer to /sync/catalog when no next is given (23-05)', () => {
    expect(postSignInPath({ user: buyer })).toBe(BUYER_HOME)
    expect(postSignInPath({ user: buyer, next: undefined })).toBe(BUYER_HOME)
    expect(postSignInPath({ user: buyer, next: null })).toBe(BUYER_HOME)
  })

  it('still routes staff and artists correctly alongside the buyer branch (23-05)', () => {
    expect(postSignInPath({ user: staff('leadership') })).toBe(STAFF_HOME)
    expect(postSignInPath({ user: artist })).toBe(DEFAULT_HOME)
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

  it('rejects a crafted off-site next for a buyer and falls back to /sync/catalog (23-05)', () => {
    expect(postSignInPath({ user: buyer, next: '//evil.com' })).toBe(BUYER_HOME)
    expect(postSignInPath({ user: buyer, next: 'https://evil.com' })).toBe(BUYER_HOME)
  })

  it('honours an explicit same-origin next deep link for a buyer too', () => {
    expect(postSignInPath({ user: buyer, next: '/update-password' })).toBe('/update-password')
  })

  it('rejects backslash + control-char normalization tricks (review finding #1)', () => {
    // browsers normalize '/\host' and '/%5Chost' (decoded to '/\host') to '//host' → off-site
    expect(postSignInPath({ user: artist, next: '/\\evil.com' })).toBe(DEFAULT_HOME)
    expect(postSignInPath({ user: staff('leadership'), next: '/\\evil.com' })).toBe(STAFF_HOME)
    expect(postSignInPath({ user: artist, next: '/\\/evil.com' })).toBe(DEFAULT_HOME)
    expect(postSignInPath({ user: artist, next: '\\/\\/evil.com' })).toBe(DEFAULT_HOME)
    // embedded tab/newline the WHATWG parser strips, then it resolves off-origin
    expect(postSignInPath({ user: artist, next: '/\t//evil.com' })).toBe(DEFAULT_HOME)
    expect(postSignInPath({ user: artist, next: '/\n//evil.com' })).toBe(DEFAULT_HOME)
    // a legit deep link with query + hash is preserved
    expect(postSignInPath({ user: artist, next: '/vault/abc?x=1#y' })).toBe('/vault/abc?x=1#y')
  })
})
