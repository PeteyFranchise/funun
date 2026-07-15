import { readFileSync } from 'fs'
import path from 'path'

const nav = readFileSync(path.join(process.cwd(), 'components/nav/ArtistNav.tsx'), 'utf8')
const page = readFileSync(path.join(process.cwd(), 'app/(artist)/green-room/page.tsx'), 'utf8')
const feed = readFileSync(path.join(process.cwd(), 'components/green-room/GreenRoomFeed.tsx'), 'utf8')
const composer = readFileSync(path.join(process.cwd(), 'components/green-room/GreenRoomComposer.tsx'), 'utf8')
const card = readFileSync(path.join(process.cwd(), 'components/green-room/FeedCard.tsx'), 'utf8')

describe('Green Room UI contract', () => {
  it('adds The Green Room to the left nav at the canonical route', () => {
    expect(nav).toContain("href: '/green-room'")
    expect(nav).toContain("label: 'The Green Room'")
    expect(nav).toContain('GreenRoomIcon')
  })

  it('creates the canonical /green-room page shell', () => {
    expect(page).toContain('GreenRoomFeed')
    expect(page).toContain("export const dynamic = 'force-dynamic'")
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
})

