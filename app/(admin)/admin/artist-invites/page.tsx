export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { ArtistInvitesAdmin } from '@/components/admin/ArtistInvitesAdmin'
import type { WaitlistRow } from '@/components/admin/ArtistInvitesAdmin'

const WAITLIST_COLUMNS =
  'id, email, name, note, unsubscribed_at, notified_reopen_at, converted_to_invite_at, created_at'

export default async function AdminArtistInvitesPage() {
  // Any-staff gate (D-06) — individual invite management is open to every
  // Team Member, unlike team-members' leadership-only page. This per-page
  // check is not the sole authority (the layout gate also runs) but is
  // still explicit, matching the project convention (Pitfall 3).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  // CR-01 hardening: 'it' is read-only Playbook-IT-room staff and must not
  // reach the artist-invites pipeline — excluded alongside the no-role case.
  if (!role || role === 'it') redirect('/')

  const service = createServiceClient()
  const { data: waitlist } = await service
    .from('artist_waitlist')
    .select(WAITLIST_COLUMNS)
    .order('created_at', { ascending: false })

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-[color:var(--ink)]">Artist Invites</h1>
      <ArtistInvitesAdmin
        initialWaitlist={(waitlist ?? []) as WaitlistRow[]}
        isLeadership={role === 'leadership'}
      />
    </div>
  )
}
