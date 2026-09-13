import { readFileSync } from 'fs'
import path from 'path'

// ─── Why this test exists ──────────────────────────────────────────────
// D-11 says a pin never speaks to the room: no realtime event, no
// notification, no visible tell of any kind when somebody drops one. That
// constraint has no UI signal to catch a regression against — a pin that
// silently gained a broadcast call would look, to a human reviewer glancing
// at the room, identical to one that stayed silent. The only durable proof
// is a test that fails the moment the code learns a new capability: an
// import, a call, a literal channel name, or a sixth registration on the
// presence channel that a pin event could ride.

const collectionRouteSource = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/versions/[versionId]/pins/route.ts'),
  'utf8'
)
const deleteRouteSource = readFileSync(
  path.join(
    process.cwd(),
    'app/api/works/[workId]/versions/[versionId]/pins/[pinId]/route.ts'
  ),
  'utf8'
)
const presenceSource = readFileSync(
  path.join(process.cwd(), 'components/catalogue/WriterRoomPresence.tsx'),
  'utf8'
)

const pinSources: Array<[string, string]> = [
  ['pins/route.ts', collectionRouteSource],
  ['pins/[pinId]/route.ts', deleteRouteSource],
]

// Forbidden tokens live here, once, rather than inline in an assertion --
// so a third pin file added later is a one-line addition to `pinSources`
// above, not a new copy of these patterns.
const FORBIDDEN_BROADCAST_CALL = /broadcast\s*\(/
const FORBIDDEN_CHANNEL_SEND_CALL = /channel\.send\s*\(/
const FORBIDDEN_PRESENCE_COMPONENT = 'WriterRoomPresence'
const FORBIDDEN_NOTIFICATION_CALL = 'createNotification'
const FORBIDDEN_ROOM_CHANNEL_LITERAL = 'writers-room:'
const FORBIDDEN_SERVICE_CLIENT = 'createServiceClient'
const FORBIDDEN_OWNER_WIDENER = 'is_work_owner'
const FORBIDDEN_TIER_WIDENER = 'work_member_tier'

describe('a pin never speaks to the room (D-11 doctrine gate)', () => {
  describe('Group one — silence', () => {
    it.each(pinSources)('%s carries no realtime call, presence import, or notification call', (_name, source) => {
      expect(source).not.toMatch(FORBIDDEN_BROADCAST_CALL)
      expect(source).not.toMatch(FORBIDDEN_CHANNEL_SEND_CALL)
      expect(source).not.toContain(FORBIDDEN_PRESENCE_COMPONENT)
      expect(source).not.toContain(FORBIDDEN_NOTIFICATION_CALL)
      expect(source).not.toContain(FORBIDDEN_ROOM_CHANNEL_LITERAL)
    })
  })

  describe('Group two — the presence channel is untouched', () => {
    it('registers exactly five broadcast events, none of them pin-shaped', () => {
      const registrations = presenceSource.match(/channel\.on\('broadcast',/g) ?? []
      expect(registrations).toHaveLength(5)

      const eventNames = [
        ...presenceSource.matchAll(/channel\.on\('broadcast',\s*\{\s*event:\s*'([^']+)'/g),
      ].map(match => match[1])
      expect(eventNames).toHaveLength(5)
      eventNames.forEach(eventName => {
        expect(eventName.toLowerCase()).not.toContain('pin')
      })
    })
  })

  describe('Group three — the access model', () => {
    it('the collection route gates on contribute-tier room access', () => {
      expect(collectionRouteSource).toContain('resolveWorkAccess')
      expect(collectionRouteSource).toContain("'contribute'")
    })

    it.each(pinSources)('%s never reaches for a service-role client or a membership-widened read', (_name, source) => {
      expect(source).not.toContain(FORBIDDEN_SERVICE_CLIENT)
      expect(source).not.toContain(FORBIDDEN_OWNER_WIDENER)
      expect(source).not.toContain(FORBIDDEN_TIER_WIDENER)
    })
  })
})
