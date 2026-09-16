import { readFileSync } from 'fs'
import path from 'path'

// ─── Why this test exists ──────────────────────────────────────────────
// This route has no UI signal that would catch a regression. A shareable
// comments file that quietly gained a write, or that quietly started
// selecting a second table — the private pins table this route must never
// touch (E-03) — would look identical to a correct one from the outside:
// same status code, same-shaped body, same download prompt in a browser.
// There is no test database in this environment to observe the query
// against either. The only durable proof available is a test that fails
// the moment the source learns a capability it should not have: a write
// verb it did not have before, or a reference to the one table it must
// never reach (E-10, E-03).

const routeSource = readFileSync(
  path.join(
    process.cwd(),
    'app/api/works/[workId]/versions/[versionId]/comments/export/route.ts'
  ),
  'utf8'
)

// Forbidden/required tokens live here, once, so a reader does not have to
// re-derive them from the assertions below, and so the two doctrine-gate
// files (this one and writer-room-private-pins.test.ts) can be checked
// against each other for agreement rather than silently drifting apart.
const FORBIDDEN_SERVICE_CLIENT = 'createServiceClient'
// Copied, not re-derived, from writer-room-private-pins.test.ts's own
// forbidden-token constants — the two membership-widening RPC names that
// belong inside lib/catalogue/access.ts and nowhere else.
const FORBIDDEN_OWNER_WIDENER = 'is_work_owner'
const FORBIDDEN_TIER_WIDENER = 'work_member_tier'

const FORBIDDEN_ROW_INSERT = /\.insert\s*\(/
const FORBIDDEN_ROW_UPDATE = /\.update\s*\(/
const FORBIDDEN_ROW_UPSERT = /\.upsert\s*\(/
const FORBIDDEN_ROW_DELETE = /\.delete\s*\(/
const FORBIDDEN_STORED_PROCEDURE_CALL = /\.rpc\s*\(/
const FORBIDDEN_NOTIFICATION_CALL = 'createNotification'
const FORBIDDEN_BROADCAST_CALL = /broadcast\s*\(/

// E-03's boundary, checked at the narrowest scope this codebase has: one
// file. Plan 40-06 checks the same invariant from the other side and across
// both export routes at once — the duplication between that gate and this
// one is deliberate, because a single gate for a security invariant is a
// single point of failure.
const FORBIDDEN_PINS_TABLE_NAME = 'work_version_pins'
const FORBIDDEN_PIN_VIEW_TYPE_NAME = 'WorkVersionPinView'

describe("Writer's Room comments export route", () => {
  describe('Group one — the access gate', () => {
    it('checks contribution access via the shared decision function, not a hand-rolled one', () => {
      expect(routeSource).toContain('resolveWorkAccess')
      expect(routeSource).toContain("'contribute'")
      expect(routeSource).toContain('createApiClient')
      expect(routeSource).toContain('supabase.auth.getUser()')
    })

    it('never reaches for a service-role client or a membership-widened read', () => {
      expect(routeSource).not.toContain(FORBIDDEN_SERVICE_CLIENT)
      expect(routeSource).not.toContain(FORBIDDEN_OWNER_WIDENER)
      expect(routeSource).not.toContain(FORBIDDEN_TIER_WIDENER)
    })
  })

  describe('Group two — one take, one work', () => {
    it('filters every comment query on both the work id and the version id', () => {
      expect(routeSource).toContain(".eq('work_id', workId)")
      expect(routeSource).toContain(".eq('version_id', versionId)")
    })

    it('filters comments to roots with a null parent, explicitly, in the query itself', () => {
      expect(routeSource).toContain(".is('parent_comment_id', null)")
    })
  })

  // E-10: nothing is recorded when a take's comments are exported. No audit
  // table, no last-exported marker, no notification, no realtime emission.
  describe('Group three — the pure read (E-10)', () => {
    it('exports exactly one handler', () => {
      const matches = routeSource.match(/export async function/g) ?? []
      expect(matches).toHaveLength(1)
    })

    it('contains no row creation, modification, upsert or delete call', () => {
      expect(routeSource).not.toMatch(FORBIDDEN_ROW_INSERT)
      expect(routeSource).not.toMatch(FORBIDDEN_ROW_UPDATE)
      expect(routeSource).not.toMatch(FORBIDDEN_ROW_UPSERT)
      expect(routeSource).not.toMatch(FORBIDDEN_ROW_DELETE)
    })

    it('contains no stored-procedure call and no notification or realtime call', () => {
      expect(routeSource).not.toMatch(FORBIDDEN_STORED_PROCEDURE_CALL)
      expect(routeSource).not.toContain(FORBIDDEN_NOTIFICATION_CALL)
      expect(routeSource).not.toMatch(FORBIDDEN_BROADCAST_CALL)
    })
  })

  describe('Group four — the file contract', () => {
    it('sets an attachment disposition and the skipped-repositioning header', () => {
      expect(routeSource).toContain('attachment; filename=')
      expect(routeSource).toContain('X-Funun-Skipped-Reposition')
    })

    it('accepts all three named format ids, even though only two ship in the UI', () => {
      expect(routeSource).toContain("'csv'")
      expect(routeSource).toContain("'audacity'")
      expect(routeSource).toContain("'audition'")
    })

    it('dispatches to all three renderer functions, so removing one from the dispatch without removing it from the allowlist fails here', () => {
      expect(routeSource).toContain('renderAudacityLabels')
      expect(routeSource).toContain('renderMarkerCsv')
      expect(routeSource).toContain('renderAuditionMarkers')
    })
  })

  // E-03: a shareable comments file has no code path to a private pin.
  describe('Group five — the boundary this route shares with nothing (E-03)', () => {
    it('never references the pins table', () => {
      expect(routeSource).not.toContain(FORBIDDEN_PINS_TABLE_NAME)
    })

    it('never references the pin view type', () => {
      expect(routeSource).not.toContain(FORBIDDEN_PIN_VIEW_TYPE_NAME)
    })
  })
})
