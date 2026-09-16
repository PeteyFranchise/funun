import { readFileSync } from 'fs'
import path from 'path'

// ─── Why this test exists ──────────────────────────────────────────────
// There is no jsdom in this repo, so a component test cannot click a
// button, observe a fetch branch, or read rendered text out of a DOM tree.
// A source assertion is the strongest durable signal available for a
// client component in this environment: it cannot prove the two controls
// look right on a phone, but it can prove they stayed structurally
// separate (E-03), that the two formats offered are still exactly two
// (E-13, pending plan 40-09), and that the mount into the player did not
// grow a third way to notify the room (T-40-35).

const componentSource = readFileSync(
  path.join(process.cwd(), 'components/catalogue/TakeMarkerExport.tsx'),
  'utf8'
)
const playerSource = readFileSync(
  path.join(process.cwd(), 'components/catalogue/TimedTrackPlayer.tsx'),
  'utf8'
)

describe('the take marker export controls never converge into one handler (E-03, E-09, E-11, E-13)', () => {
  describe('the component source', () => {
    it('contains both literal export paths, each exactly once', () => {
      expect(componentSource.match(/comments\/export/g) ?? []).toHaveLength(1)
      expect(componentSource.match(/pins\/export/g) ?? []).toHaveLength(1)
    })

    // The cheapest structural proof that the two controls did not converge
    // onto one shared `runExport(kind)` helper: two handlers, two fetch
    // call sites, not one helper called twice.
    it('has exactly two fetch( call sites — one per handler, no shared helper', () => {
      const callSites = componentSource.match(/fetch\(/g) ?? []
      expect(callSites).toHaveLength(2)
    })

    // Asserting the count rather than the absence of a particular format id
    // means E-12's fallback — removing the Audition entry if plan 40-08's
    // human byte-level check comes back negative — is a one-line revert of
    // this number, not a rewrite of this test.
    it('offers exactly three format options', () => {
      const optionEntries = componentSource.match(/id: '/g) ?? []
      expect(optionEntries).toHaveLength(3)
    })

    it('imports the skipped-count sentence from the pure export module, not a re-typed wording', () => {
      expect(componentSource).toContain('skippedRepositionNote')
      expect(componentSource).toMatch(/from '@\/lib\/catalogue\/take-export'/)
    })

    // A refusal is a 409 JSON body, never a 200 file. A static anchor with
    // a download attribute pointing at either export route would save that
    // JSON as a file the moment the route ever refused.
    it('contains no static anchor whose href is an export path', () => {
      expect(componentSource).not.toMatch(/href=\{?`?\/api\/works\/[^}]*\/(comments|pins)\/export/)
    })

    it('gives each control an aria-label naming what it exports', () => {
      expect(componentSource).toMatch(/aria-label="Export this take's comments/)
      expect(componentSource).toMatch(/aria-label="Export your own pins/)
    })

    it('uses role="status" for the success note and role="alert" for a refusal or failure', () => {
      expect(componentSource).toContain("role={comments.isError ? 'alert' : 'status'}")
      expect(componentSource).toContain("role={pins.isError ? 'alert' : 'status'}")
    })
  })

  describe("the player's source", () => {
    it('renders the new component exactly once', () => {
      const mountSites = playerSource.match(/<TakeMarkerExport\b/g) ?? []
      expect(mountSites).toHaveLength(1)
    })

    it('imports the new component exactly once', () => {
      const importSites = playerSource.match(/import \{ TakeMarkerExport \}/g) ?? []
      expect(importSites).toHaveLength(1)
    })

    // Restating Phase 39's pinned number here (D-11's doctrine gate pins
    // it too) so a reader of this file sees the constraint without
    // cross-referencing. Export is a pure read (E-10); nothing in this
    // plan is allowed to add a fourth call site.
    const EXPECTED_ON_COMMENT_CHANGED_CALLS = 3

    it('still calls onCommentChanged( exactly three times — export tells the room nothing', () => {
      const callSites = playerSource.match(/onCommentChanged\(/g) ?? []
      expect(callSites).toHaveLength(EXPECTED_ON_COMMENT_CHANGED_CALLS)
    })
  })
})
