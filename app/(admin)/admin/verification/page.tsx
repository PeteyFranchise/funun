export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { loadMembersForVerification } from '@/lib/trust-safety/verification'
import { VerificationAdmin } from '@/components/admin/VerificationAdmin'

export default async function AdminVerificationPage() {
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
  const members = await loadMembersForVerification(service, null)

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Verification</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/55">
        Grant or revoke the verified badge. Manual admin authority only — there is no self-serve
        verification request. Every action is recorded in the verification audit log.
      </p>
      <VerificationAdmin initialMembers={members} />
    </div>
  )
}
