import { readFileSync } from 'fs'
import path from 'path'

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const memberNav = read('components/nav/ArtistNav.tsx')
const memberLayout = read('app/(artist)/layout.tsx')
const messagesControl = read('components/nav/MessagesIcon.tsx')
const messagesPage = read('app/(artist)/messages/page.tsx')

describe('global Messages inbox contract', () => {
  it('removes the duplicate sidebar destination and keeps the global header control', () => {
    expect(memberNav).not.toContain("href: '/messages', label: 'Messages'")
    expect(memberNav).not.toContain('MessagesNavIcon')
    expect(memberLayout).toContain('<MessagesIcon userId={user.id} />')
  })

  it('keeps the full inbox and direct-thread route stable', () => {
    expect(messagesPage).toContain('MessagesPageClient')
    expect(messagesControl).toContain('href="/messages"')
    expect(messagesControl).toContain('href={`/messages?thread=${thread.id}`}')
    expect(messagesControl).toContain('Open full inbox')
  })

  it('loads full thread data only after the member opens the drawer', () => {
    expect(messagesControl).toContain("fetch('/api/dm/threads', { cache: 'no-store' })")
    expect(messagesControl).toContain('if (!open) return')
    expect(messagesControl).toContain('void loadThreads()')
  })

  it('keeps unread count server-authoritative and refreshes through Realtime', () => {
    expect(messagesControl).toContain("fetch('/api/dm/threads?unread=true')")
    expect(messagesControl).toContain("event: 'INSERT'")
    expect(messagesControl).not.toContain('setUnreadCount(count => count + 1)')
  })

  it('provides accessible disclosure and dismissal controls', () => {
    expect(messagesControl).toContain('aria-expanded={open}')
    expect(messagesControl).toContain('aria-haspopup="dialog"')
    expect(messagesControl).toContain('aria-controls="global-messages-drawer"')
    expect(messagesControl).toContain('role="dialog"')
    expect(messagesControl).toContain("event.key === 'Escape'")
    expect(messagesControl).toContain("document.addEventListener('pointerdown'")
  })
})
