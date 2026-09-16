import { readFileSync } from 'fs'
import path from 'path'

// ─── Why this test exists ──────────────────────────────────────────────
// This route hands a private, author-only mark to a file that can be
// forwarded anywhere. Nothing in the interface would show that the author
// filter had been dropped, or that the route had started emitting
// something. There is no jsdom in this repo and no database in the test
// environment, so a source assertion is the only durable signal available.
// The test is the only thing standing between a quiet regression here and
// another author's pins landing in a downloaded file.

const routeSource = readFileSync(
  path.join(
    process.cwd(),
    'app/api/works/[workId]/versions/[versionId]/pins/export/route.ts'
  ),
  'utf8'
)

// Forbidden tokens live here, once, reused verbatim from
// __tests__/writer-room-private-pins.test.ts (D-11's doctrine gate) rather
// than re-derived, so the export route joins that set instead of getting
// its own weaker version of it.
const FORBIDDEN_BROADCAST_CALL = /broadcast\s*\(/
const FORBIDDEN_CHANNEL_SEND_CALL = /channel\.send\s*\(/
const FORBIDDEN_PRESENCE_COMPONENT = 'WriterRoomPresence'
const FORBIDDEN_NOTIFICATION_CALL = 'createNotification'
const FORBIDDEN_ROOM_CHANNEL_LITERAL = 'writers-room:'
const FORBIDDEN_SERVICE_CLIENT = 'createServiceClient'
const FORBIDDEN_OWNER_WIDENER = 'is_work_owner'
const FORBIDDEN_TIER_WIDENER = 'work_member_tier'

// E-03's structural boundary: the names this route must never reference,
// checked from this side. Plan 40-04 checks the identical invariant from
// the comments export's side, and plan 40-06 checks both at once.
const FORBIDDEN_COMMENTS_TABLE = 'work_version_comments'
const FORBIDDEN_COMMENT_VIEW_TYPE = 'WorkVersionCommentView'

// The skipped-count header belongs to the comments export alone (E-09). A
// pin has no repositioning concept, and importing this header here would be
// the first step toward inventing one.
const FORBIDDEN_SKIPPED_COUNT_HEADER = 'X-Funun-Skipped-Reposition'

describe('the private pin export never becomes a shared query (E-02, E-03, E-10, D-11)', () => {
  describe('Group one — authorship', () => {
    it('filters on an explicit author_user_id equality against the caller', () => {
      expect(routeSource).toMatch(/\.eq\('author_user_id',\s*user\.id\)/)
    })

    it('scopes the same query to the work id and the version id', () => {
      expect(routeSource).toMatch(/\.eq\('work_id',\s*workId\)/)
      expect(routeSource).toMatch(/\.eq\('version_id',\s*versionId\)/)
    })

    it('gates on contribute-tier room access, not on authorship alone', () => {
      expect(routeSource).toContain('resolveWorkAccess')
      expect(routeSource).toContain("'contribute'")
    })

    it('never reaches for an owner-check helper or a membership-tier helper', () => {
      expect(routeSource).not.toContain(FORBIDDEN_OWNER_WIDENER)
      expect(routeSource).not.toContain(FORBIDDEN_TIER_WIDENER)
    })
  })

  describe('Group two — silence, per D-11', () => {
    it('carries no realtime broadcast or channel send call', () => {
      expect(routeSource).not.toMatch(FORBIDDEN_BROADCAST_CALL)
      expect(routeSource).not.toMatch(FORBIDDEN_CHANNEL_SEND_CALL)
    })

    it('references no presence component and no notification call', () => {
      expect(routeSource).not.toContain(FORBIDDEN_PRESENCE_COMPONENT)
      expect(routeSource).not.toContain(FORBIDDEN_NOTIFICATION_CALL)
    })

    it('contains no room channel literal', () => {
      expect(routeSource).not.toContain(FORBIDDEN_ROOM_CHANNEL_LITERAL)
    })
  })

  describe('Group three — the pure read, per E-10', () => {
    it('exports exactly one handler', () => {
      const matches = routeSource.match(/export async function/g) ?? []
      expect(matches).toHaveLength(1)
      expect(routeSource).toContain('export async function GET')
    })

    it('contains no row creation, modification, upsert, delete, or stored-procedure call', () => {
      expect(routeSource).not.toMatch(/\.insert\(/)
      expect(routeSource).not.toMatch(/\.update\(/)
      expect(routeSource).not.toMatch(/\.upsert\(/)
      expect(routeSource).not.toMatch(/\.delete\(/)
      expect(routeSource).not.toMatch(/\.rpc\(/)
    })

    it('never creates a service-role client', () => {
      expect(routeSource).not.toContain(FORBIDDEN_SERVICE_CLIENT)
    })
  })

  describe('Group four — the separation, per E-03', () => {
    it('never references the comments table', () => {
      expect(routeSource).not.toContain(FORBIDDEN_COMMENTS_TABLE)
    })

    it('never references the comment view type', () => {
      expect(routeSource).not.toContain(FORBIDDEN_COMMENT_VIEW_TYPE)
    })
  })

  describe('Group five — the file contract, per E-06 and E-13', () => {
    it('serves an attachment, never an inline response', () => {
      expect(routeSource).toContain('attachment; filename=')
    })

    it('names the file with the my-pins kind', () => {
      expect(routeSource).toContain("'my-pins'")
    })

    it('offers all three DAW formats, matching the comments export', () => {
      expect(routeSource).toContain("'csv'")
      expect(routeSource).toContain("'audacity'")
      expect(routeSource).toContain("'audition'")
    })

    it('dispatches to all three renderers', () => {
      expect(routeSource).toContain('renderMarkerCsv')
      expect(routeSource).toContain('renderAudacityLabels')
      expect(routeSource).toContain('renderAuditionMarkers')
    })

    it('never imports the comments export\'s skipped-count header', () => {
      expect(routeSource).not.toContain(FORBIDDEN_SKIPPED_COUNT_HEADER)
    })
  })

  describe('Group six — refusal, not a fake success', () => {
    it('refuses an empty export with 409, never 200', () => {
      expect(routeSource).toContain('classifyPinExport')
      expect(routeSource).toContain('status: 409')
    })
  })
})
