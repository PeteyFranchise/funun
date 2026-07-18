export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { PlacementAdmin, type PlacementRecord } from '@/components/admin/PlacementAdmin'

export default async function AdminGreenRoomPlacementsPage() {
  // T-05-02 convention: explicit per-page admin check — the layout redirect
  // alone is not relied upon as the authority decision (see lib/admin/gate.ts).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { data: placements } = await service
    .from('green_room_placements')
    .select('*')
    .order('status', { ascending: true })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Green Room Placements</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/55">
        Curated featured, sponsored, partner, program, and opportunity cards. These are
        editorially labeled placements — not self-serve ads. A placement can only go live
        once its destination is confirmed public.
      </p>
      <PlacementAdmin initialPlacements={(placements ?? []) as PlacementRecord[]} />
    </div>
  )
}
