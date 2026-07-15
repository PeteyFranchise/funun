import type { SupabaseClient } from '@supabase/supabase-js'
import type { GreenRoomTab } from '@/lib/green-room/feed'

type FeedRealtimePayload = {
  new?: {
    status?: string
    post_type?: string
  }
  old?: {
    status?: string
    post_type?: string
  }
}

export function shouldNotifyForGreenRoomFeedEvent(tab: GreenRoomTab, payload: FeedRealtimePayload): boolean {
  const row = payload.new ?? payload.old
  if (!row) return false
  if (row.status && row.status !== 'published') return false
  if (tab === 'opportunities') return row.post_type === 'opportunity_need'
  return true
}

export function subscribeToGreenRoomFeedUpdates(
  supabase: SupabaseClient,
  tab: GreenRoomTab,
  onNewActivity: () => void
) {
  const channel = supabase
    .channel(`green-room-feed-${tab}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'green_room_posts' },
      payload => {
        if (shouldNotifyForGreenRoomFeedEvent(tab, payload as FeedRealtimePayload)) {
          onNewActivity()
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

