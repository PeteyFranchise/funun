import { GreenRoomHub } from '@/components/green-room/GreenRoomHub'
import { normalizeGreenRoomView } from '@/lib/green-room/views'

export const dynamic = 'force-dynamic'

export default async function GreenRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const params = await searchParams

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(217,70,239,.16),transparent_34%),#07070c]">
      <GreenRoomHub initialView={normalizeGreenRoomView(params.view)} />
    </main>
  )
}
