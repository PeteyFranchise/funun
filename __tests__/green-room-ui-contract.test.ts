import { readFileSync } from 'fs'
import path from 'path'

const nav = readFileSync(path.join(process.cwd(), 'components/nav/ArtistNav.tsx'), 'utf8')
const page = readFileSync(path.join(process.cwd(), 'app/(artist)/green-room/page.tsx'), 'utf8')
const legacyNetworkPage = readFileSync(path.join(process.cwd(), 'app/(artist)/network/page.tsx'), 'utf8')
const hub = readFileSync(path.join(process.cwd(), 'components/green-room/GreenRoomHub.tsx'), 'utf8')
const feed = readFileSync(path.join(process.cwd(), 'components/green-room/GreenRoomFeed.tsx'), 'utf8')
const people = readFileSync(path.join(process.cwd(), 'components/green-room/PeopleSearch.tsx'), 'utf8')
const composer = readFileSync(path.join(process.cwd(), 'components/green-room/GreenRoomComposer.tsx'), 'utf8')
const card = readFileSync(path.join(process.cwd(), 'components/green-room/FeedCard.tsx'), 'utf8')

describe('Green Room UI contract', () => {
  it('adds The Green Room to the left nav at the canonical route', () => {
    expect(nav).toContain("href: '/green-room'")
    expect(nav).toContain("label: 'The Green Room'")
    expect(nav).toContain('GreenRoomIcon')
    expect(nav).toContain("alsoMatches: ['/network']")
    expect(nav).not.toContain("label: 'Network', match: '/network'")
  })

  it('creates the canonical /green-room page shell', () => {
    expect(page).toContain('GreenRoomHub')
    expect(page).toContain('normalizeGreenRoomView')
    expect(page).toContain("export const dynamic = 'force-dynamic'")
  })

  it('organizes social work into three URL-addressable spaces and preserves the legacy route', () => {
    expect(hub).toContain("label: 'The Room'")
    expect(hub).toContain("label: 'Find People'")
    expect(hub).toContain("label: 'My Network'")
    expect(hub).toContain('/green-room?view=')
    expect(hub).toContain('<PeopleSearch fullWidth />')
    expect(hub).toContain('<NetworkTab embedded />')
    expect(legacyNetworkPage).toContain("redirect('/green-room?view=network')")
  })

  it('loads discovery and network modules only when their views render', () => {
    expect(hub).toContain("dynamic(")
    expect(hub).toContain("import('@/components/green-room/PeopleSearch')")
    expect(hub).toContain("import('@/components/network/NetworkTab')")
    expect(feed).not.toContain("from '@/components/green-room/PeopleSearch'")
  })

  it('lets member discovery create relationships managed by My Network', () => {
    expect(people).toContain("fetch('/api/connections'")
    expect(people).toContain('Request sent')
  })

  it('uses one feed endpoint across all tab modes', () => {
    expect(feed).toContain("'for_you'")
    expect(feed).toContain("'following'")
    expect(feed).toContain("'discover'")
    expect(feed).toContain("'opportunities'")
    expect(feed).toContain('/api/green-room/feed?tab=')
  })

  it('wires composer and cards to the planned backend endpoints', () => {
    expect(composer).toContain('/api/green-room/posts')
    expect(card).toContain('/comments')
    expect(card).toContain('/reactions')
    expect(card).toContain('/reposts')
  })

  it('uses the sidebar for actionable member guidance instead of internal monetization copy', () => {
    expect(feed).toContain('Put something in the room')
    expect(feed).toContain('Looking for a vocalist for…')
    expect(feed).toContain('Start a post')
    expect(feed).toContain('GREEN_ROOM_COMPOSER_BODY_ID')
    expect(composer).toContain("GREEN_ROOM_COMPOSER_ID = 'green-room-composer'")
    expect(composer).toContain("GREEN_ROOM_COMPOSER_BODY_ID = 'green-room-composer-body'")
    expect(feed).not.toContain('Monetization runway')
    expect(feed).not.toContain('self-serve ad buying')
  })
})
