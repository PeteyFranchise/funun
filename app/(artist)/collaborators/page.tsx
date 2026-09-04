import { createServerClient } from '@/lib/supabase/server'
import { CollaboratorRoster } from '@/components/collaborators/CollaboratorRoster'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { Topbar } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ tab?: string }>
}

export default async function CollaboratorsPage({ searchParams }: PageProps) {
  const { tab } = await searchParams
  const initialTab = tab === 'credits' ? 'credits' : 'roster'

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // My Roster: collaborators this user has added (Phase 1 behavior)
  const { data } = await supabase
    .from('collaborators')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .is('archived_at', null)
    .order('name', { ascending: true })

  const collaborators = (data ?? []) as CollaboratorProfile[]

  // Resolve the Funūn handle for each claimed collaborator so member cards can
  // link to that member's profile. RLS-scoped read — members whose handle isn't
  // visible to this user simply won't get a profile link (graceful).
  const claimedIds = Array.from(
    new Set(collaborators.map(c => c.claimed_by).filter((v): v is string => Boolean(v)))
  )
  let memberHandles: Record<string, string> = {}
  if (claimedIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, handle')
      .in('id', claimedIds)
    memberHandles = Object.fromEntries(
      (profiles ?? [])
        .filter((p): p is { id: string; handle: string } => Boolean(p.handle))
        .map(p => [p.id, p.handle])
    )
  }

  // Latest invite per collaborator — drives each card's "Invited …" status and
  // the Resend affordance. RLS "Inviting user manages invites" (migration 018)
  // authorizes reading one's own invites; ordered newest-first so the first
  // row seen per collaborator is the latest.
  const inviteStatus: Record<string, { sentAt: string; status: string }> = {}
  const { data: inviteRows } = await supabase
    .from('collaborator_invites')
    .select('collaborator_id, sent_at, status')
    .eq('inviting_user_id', user?.id ?? '')
    .order('sent_at', { ascending: false })
  for (const row of inviteRows ?? []) {
    if (row.collaborator_id && row.sent_at && !inviteStatus[row.collaborator_id]) {
      inviteStatus[row.collaborator_id] = { sentAt: row.sent_at, status: row.status }
    }
  }

  // My Credits: collaborator rows where this user is the claimed party.
  // Cross-user read authorized by "Claimed users see own credits" RLS policy
  // (migration 026) — no service role client needed.
  const { data: creditsData } = await supabase
    .from('collaborators')
    .select(
      `id, name, pro, ipi, claimed_by, user_id,
      split_sheet_parties!inner (
        id, split_percentage, role,
        split_sheets (
          song_name, vault_project_id
        )
      )`
    )
    .eq('claimed_by', user?.id ?? '')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(20)

  // `!inner` is intentional: claimed collaborator rows are identity links,
  // not credits by themselves. A row enters My Credits only when it has an
  // actual split-sheet party visible to the signed-in Member.
  const credits = (creditsData ?? []) as unknown as CollaboratorProfile[]

  return (
    <>
      <Topbar
        title="Collaborators"
        subtitle="Your roster — add once, auto-fill everywhere."
      />
      <div className="px-9 py-8">
        <CollaboratorRoster
          collaborators={collaborators}
          credits={credits}
          initialTab={initialTab}
          memberHandles={memberHandles}
          inviteStatus={inviteStatus}
        />
      </div>
    </>
  )
}
