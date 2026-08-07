export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getStaffRole } from '@/lib/admin/gate'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { CuratorAdmin } from '@/components/admin/CuratorAdmin'
import type { Curator } from '@/types'

export default async function AdminCuratorsPage() {
  // T-05-02 convention: explicit per-page admin check — layout redirect alone
  // is not relied upon as the authority decision (see lib/admin/gate.ts).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  if (getStaffRole(user) !== 'leadership') redirect('/')

  const service = createServiceClient()
  const { data: curators } = await service
    .from('curators')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Curators</h1>
      <CuratorAdmin initialCurators={(curators ?? []) as Curator[]} />
    </div>
  )
}
