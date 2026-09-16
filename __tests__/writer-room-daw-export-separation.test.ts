import { readFileSync } from 'fs'
import path from 'path'

// ─── Why this test exists ──────────────────────────────────────────────
// E-02 lets an author export their own pins alongside the shareable
// comments export. E-03 is the entire containment for that decision: two
// routes, two tables, two classifiers, never one behind a flag or a type
// parameter. A single export route with a `mode` parameter, or a shared
// row-fetching helper the two routes both call, would look like good DRY
// engineering in a diff — a reviewer would likely approve it. It would also
// be the change that lets a private pin land in a shareable file, and
// nothing in the running application would look different until someone
// forwarded the wrong file to the wrong person. That silence is exactly
// what makes this a structural check rather than a behavioural one: there
// is no UI signal, no failed request, no visibly different response for a
// reviewer to notice. Plans 40-04 and 40-05 each ship a per-file version of
// this doctrine; this file is the version that holds both routes to ONE set
// of rules at once, so a refactor that reconciles them into a shared path
// cannot slip past two separate, independently-weakenable gates.
//
// E-10 says export stays a pure read: no audit row, no last-exported
// marker, no notification, no realtime emission, on either route, ever.
//
// Group zero exists because a source-assertion suite that loads the wrong
// path, or whose regex never matches, passes every negative assertion
// vacuously — a renamed or moved route file must fail loudly here, not
// silently satisfy everything below it.

const commentsExportSource = readFileSync(
  path.join(
    process.cwd(),
    'app/api/works/[workId]/versions/[versionId]/comments/export/route.ts'
  ),
  'utf8'
)
const pinsExportSource = readFileSync(
  path.join(
    process.cwd(),
    'app/api/works/[workId]/versions/[versionId]/pins/export/route.ts'
  ),
  'utf8'
)

const exportSources: Array<[string, string]> = [
  ['comments/export/route.ts', commentsExportSource],
  ['pins/export/route.ts', pinsExportSource],
]

// Forbidden/required tokens live here, once, reusing the constant NAMES
// already established in __tests__/writer-room-private-pins.test.ts and
// __tests__/writer-room-comments-export-api.test.ts / pin-export-api.test.ts
// rather than re-deriving them — so all four files read as one doctrine.
const FORBIDDEN_COMMENTS_TABLE_NAME = 'work_version_comments'
const FORBIDDEN_COMMENT_VIEW_TYPE_NAME = 'WorkVersionCommentView'
const FORBIDDEN_PINS_TABLE_NAME = 'work_version_pins'
const FORBIDDEN_PIN_VIEW_TYPE_NAME = 'WorkVersionPinView'

const FORBIDDEN_ROW_INSERT = /\.insert\s*\(/
const FORBIDDEN_ROW_UPDATE = /\.update\s*\(/
const FORBIDDEN_ROW_UPSERT = /\.upsert\s*\(/
const FORBIDDEN_ROW_DELETE = /\.delete\s*\(/
const FORBIDDEN_STORED_PROCEDURE_CALL = /\.rpc\s*\(/
const FORBIDDEN_NOTIFICATION_CALL = 'createNotification'
const FORBIDDEN_BROADCAST_CALL = /broadcast\s*\(/
const FORBIDDEN_CHANNEL_SEND_CALL = /channel\.send\s*\(/

const FORBIDDEN_SERVICE_CLIENT = 'createServiceClient'
const FORBIDDEN_OWNER_WIDENER = 'is_work_owner'
const FORBIDDEN_TIER_WIDENER = 'work_member_tier'

// The pure modules the two routes ARE permitted to share (E-13 requires the
// same three formats on both controls; the research is explicit that
// sharing the FORMAT RENDERERS is fine and intended). Sharing a DATA-FETCH
// path is what E-03 forbids — this file encodes exactly that distinction,
// not a blanket no-sharing rule.
const PERMITTED_SHARED_MODULES = [
  '@/lib/catalogue/take-export',
  '@/lib/catalogue/take-export-formats',
  '@/lib/catalogue/take-export-audition',
]

describe("the DAW export separation gate — E-02's exposure, E-03's containment (D-40-06)", () => {
  // ─── Group zero — the gate is real ──────────────────────────────────
  describe('Group zero — the gate is real', () => {
    it.each(exportSources)('%s loaded a non-empty source and defines an exported handler', (_name, source) => {
      expect(source.length).toBeGreaterThan(0)
      expect(source).toContain('export async function')
    })
  })

  // ─── Group one — no crossover, checked in both directions ──────────
  // E-03: a shareable comments file has no code path to a private pin, and
  // a private pin export has no code path to a comment. A one-directional
  // check would let the pins route grow a comments query unnoticed.
  describe("Group one — no crossover (E-02's exposure, E-03's containment)", () => {
    it('the comments export never references the pins table or the pin view type', () => {
      expect(commentsExportSource).not.toContain(FORBIDDEN_PINS_TABLE_NAME)
      expect(commentsExportSource).not.toContain(FORBIDDEN_PIN_VIEW_TYPE_NAME)
    })

    it('the pins export never references the comments table or the comment view type', () => {
      expect(pinsExportSource).not.toContain(FORBIDDEN_COMMENTS_TABLE_NAME)
      expect(pinsExportSource).not.toContain(FORBIDDEN_COMMENT_VIEW_TYPE_NAME)
    })
  })

  // ─── Group two — no shared data path ────────────────────────────────
  // Sharing the pure renderers is fine and required (E-13). Sharing a
  // data-fetching path — an import of one route by the other, or an import
  // of anything else under the API route tree — is what E-03 forbids.
  describe('Group two — no shared data path (E-03)', () => {
    it('neither route imports the other', () => {
      expect(commentsExportSource).not.toContain('pins/export/route')
      expect(pinsExportSource).not.toContain('comments/export/route')
    })

    it('neither route imports any module under the API route tree', () => {
      expect(commentsExportSource).not.toMatch(/from\s+['"][^'"]*app\/api/)
      expect(pinsExportSource).not.toMatch(/from\s+['"][^'"]*app\/api/)
    })

    it.each(exportSources)('%s imports from the permitted pure export modules', (_name, source) => {
      const importsAtLeastOnePureModule = PERMITTED_SHARED_MODULES.some(mod => source.includes(mod))
      expect(importsAtLeastOnePureModule).toBe(true)
    })

    it('neither route carries a relative import that climbs out of its own directory', () => {
      expect(commentsExportSource).not.toMatch(/from\s+['"]\.\./)
      expect(pinsExportSource).not.toMatch(/from\s+['"]\.\./)
    })
  })

  // ─── Group three — no mode parameter ────────────────────────────────
  // A second query parameter is the shape a merge-behind-a-flag would take.
  // Catching it at one param is cheaper than enumerating every name it
  // might eventually take.
  describe('Group three — no mode parameter, one format param only', () => {
    it.each(exportSources)('%s reads searchParams.get( exactly once, for format', (_name, source) => {
      const matches = source.match(/searchParams\.get\(/g) ?? []
      expect(matches).toHaveLength(1)
      expect(source).toContain("searchParams.get('format')")
    })
  })

  // ─── Group four — the pure read, per E-10 ───────────────────────────
  describe('Group four — the pure read, per E-10', () => {
    it.each(exportSources)('%s exports exactly one async handler', (_name, source) => {
      const matches = source.match(/export async function/g) ?? []
      expect(matches).toHaveLength(1)
    })

    it.each(exportSources)('%s contains no row creation, modification, upsert, delete, or stored-procedure call', (_name, source) => {
      expect(source).not.toMatch(FORBIDDEN_ROW_INSERT)
      expect(source).not.toMatch(FORBIDDEN_ROW_UPDATE)
      expect(source).not.toMatch(FORBIDDEN_ROW_UPSERT)
      expect(source).not.toMatch(FORBIDDEN_ROW_DELETE)
      expect(source).not.toMatch(FORBIDDEN_STORED_PROCEDURE_CALL)
    })

    it.each(exportSources)('%s contains no notification-creating call, broadcast call, or channel send call', (_name, source) => {
      expect(source).not.toContain(FORBIDDEN_NOTIFICATION_CALL)
      expect(source).not.toMatch(FORBIDDEN_BROADCAST_CALL)
      expect(source).not.toMatch(FORBIDDEN_CHANNEL_SEND_CALL)
    })
  })

  // ─── Group five — no service-role escalation ────────────────────────
  describe('Group five — no service-role escalation', () => {
    it.each(exportSources)('%s never creates a service-role client or reaches for an owner-check or membership-tier helper', (_name, source) => {
      expect(source).not.toContain(FORBIDDEN_SERVICE_CLIENT)
      expect(source).not.toContain(FORBIDDEN_OWNER_WIDENER)
      expect(source).not.toContain(FORBIDDEN_TIER_WIDENER)
    })
  })

  // ─── Group six — the access gate is present in both ─────────────────
  // A positive assertion among negatives on purpose: this group fails if
  // the check is REMOVED, not only if something forbidden is added.
  //
  // `resolveWorkAccess` cannot structurally appear "exactly once" per
  // file — every valid caller both imports the name and calls it, which is
  // two occurrences of the identifier on two different lines (the same
  // structural fact plan 40-04's own SUMMARY documented for its per-file
  // gate). The single-occurrence requirement is therefore applied to the
  // `'contribute'` tier literal, which has exactly one legitimate call site
  // per route, while the access-gate function itself is checked with
  // `toContain` — which still fails the moment the call, or the import, is
  // removed.
  describe('Group six — the access gate is present in both', () => {
    it.each(exportSources)('%s calls resolveWorkAccess at the contribute tier, exactly once', (_name, source) => {
      expect(source).toContain('resolveWorkAccess')
      const tierMatches = source.match(/'contribute'/g) ?? []
      expect(tierMatches).toHaveLength(1)
    })
  })
})
