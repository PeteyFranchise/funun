import { readFileSync } from 'fs'
import path from 'path'
import { shouldNotifyForGreenRoomFeedEvent } from '@/lib/green-room/realtime'

const feed = readFileSync(path.join(process.cwd(), 'components/green-room/GreenRoomFeed.tsx'), 'utf8')
const realtime = readFileSync(path.join(process.cwd(), 'lib/green-room/realtime.ts'), 'utf8')

describe('Green Room realtime helper', () => {
  it('filters unpublished rows and opportunity-tab events', () => {
    expect(shouldNotifyForGreenRoomFeedEvent('for_you', { new: { status: 'draft', post_type: 'general_update' } })).toBe(false)
    expect(shouldNotifyForGreenRoomFeedEvent('for_you', { new: { status: 'published', post_type: 'general_update' } })).toBe(true)
    expect(shouldNotifyForGreenRoomFeedEvent('opportunities', { new: { status: 'published', post_type: 'general_update' } })).toBe(false)
    expect(shouldNotifyForGreenRoomFeedEvent('opportunities', { new: { status: 'published', post_type: 'opportunity_need' } })).toBe(true)
  })

  it('subscribes to feed table changes and always removes the channel', () => {
    expect(realtime).toContain("table: 'green_room_posts'")
    expect(realtime).toContain('supabase.removeChannel(channel)')
  })

  it('uses a user-controlled new activity pill instead of auto-inserting cards', () => {
    expect(feed).toContain('pendingActivityCount')
    expect(feed).toContain('Show latest')
    expect(feed).toContain('setPendingActivityCount(0)')
    expect(feed).toContain('/api/green-room/feed?tab=')
  })
})

