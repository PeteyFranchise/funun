import { GreenRoomFeed } from '@/components/green-room/GreenRoomFeed'

export const dynamic = 'force-dynamic'

export default function GreenRoomPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(217,70,239,.16),transparent_34%),#07070c]">
      <GreenRoomFeed />
    </main>
  )
}

