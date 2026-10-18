/** @jest-environment node */
import { readdirSync } from 'fs'
import path from 'path'
import { isProtectedPath } from './protectedRoutes'

const APP_DIR = path.join(process.cwd(), 'app')

/** Every page.tsx under `dir`, as a path of directory names relative to app/. */
function pageSegments(dir: string, trail: string[] = []): string[][] {
  const out: string[][] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...pageSegments(path.join(dir, entry.name), [...trail, entry.name]))
    } else if (entry.name === 'page.tsx') {
      out.push(trail)
    }
  }
  return out
}

/** Route groups like "(artist)" vanish from the URL; "[token]" becomes a sample value. */
function toUrl(segments: string[]): string {
  const parts = segments
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    .map((s) => (s.startsWith('[') && s.endsWith(']') ? 'sample' : s))
  return '/' + parts.join('/')
}

describe('isProtectedPath', () => {
  describe('artist routes require sign-in', () => {
    it.each([
      '/earnings',
      '/earnings/x',
      '/antenna',
      '/antenna/abc',
      '/benchmarks',
      '/coach',
      '/contracts',
      '/curators',
      '/deals',
      '/green-room',
      '/ideas',
      '/messages',
      '/network',
      '/opportunities',
      '/opportunities/new',
      '/opportunities/abc',
      '/sync-library',
      '/sync-library/agreement',
      '/tools/pitchplug',
    ])('%s is protected', (p) => {
      expect(isProtectedPath(p)).toBe(true)
    })
  })

  describe('previously protected paths keep their behavior', () => {
    it.each([
      '/vault',
      '/vault/new',
      '/dashboard',
      '/settings/profile',
      '/collaborators',
      '/split-sheets/1',
      '/launchpad',
      '/w',
      '/w/abc',
      '/admin',
      '/admin/x',
    ])('%s is protected', (p) => {
      expect(isProtectedPath(p)).toBe(true)
    })
  })

  describe('public pages stay reachable', () => {
    it.each([
      '/ideas/join/abc123',
      '/curators/claim',
      '/curators/claim/tok',
      '/approve/tok',
      '/join/tok',
      '/sync/access',
      '/sync/catalog',
      '/',
      '/signin',
      '/signup',
      '/forgot-password',
      '/update-password',
      '/u/someone',
      '/r/x',
      '/marketing-document',
      '/status',
      '/help',
      '/wx',
      '/toolsy',
      '/deals-archive',
      '/coaching',
    ])('%s is not protected', (p) => {
      expect(isProtectedPath(p)).toBe(false)
    })
  })

  describe('filesystem coverage', () => {
    it('protects every top-level directory under app/(artist)', () => {
      const dirs = readdirSync(path.join(APP_DIR, '(artist)'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
      expect(dirs.length).toBeGreaterThan(0)

      const unprotected = dirs.filter((name) => !isProtectedPath('/' + name))
      // A new artist route must be added to lib/auth/protectedRoutes.ts, or be
      // a deliberate public page listed there.
      expect(unprotected).toEqual([])
    })

    it('serves no page outside app/(artist) under a newly protected prefix, except legacy /admin and /w', () => {
      const outside = pageSegments(APP_DIR)
        .filter((segs) => segs[0] !== '(artist)')
        .map(toUrl)
      expect(outside.length).toBeGreaterThan(0)

      const protectedOutside = outside.filter(isProtectedPath).filter((url) => {
        const first = url.split('/')[1]
        return first !== 'admin' && first !== 'w'
      })
      expect(protectedOutside).toEqual([])
    })

    it('leaves every page under app/curators reachable, including the claim pages', () => {
      const claimPages = pageSegments(path.join(APP_DIR, 'curators'), ['curators']).map(toUrl)
      expect(claimPages).toEqual(expect.arrayContaining(['/curators/claim', '/curators/claim/sample']))
      for (const url of claimPages) {
        expect({ url, protected: isProtectedPath(url) }).toEqual({ url, protected: false })
      }
    })

    it('leaves the anonymous sign-in card page under app/(artist)/ideas/join reachable', () => {
      expect(isProtectedPath('/ideas/join/sample')).toBe(false)
      expect(isProtectedPath('/ideas')).toBe(true)
    })
  })
})
