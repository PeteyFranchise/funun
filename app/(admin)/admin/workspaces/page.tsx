export const dynamic = 'force-dynamic'

import { WorkspaceRolloutConsole } from '@/components/admin/WorkspaceRolloutConsole'
import { requireStaffPage } from '@/lib/admin/gate'
import { profileDisplayTitle } from '@/lib/profile/display-name'
import { createServiceClient } from '@/lib/supabase/server'
import { readWorkspaceAccessState } from '@/lib/workspaces/access-kill-switch'
import {
  isWorkspaceCohortRequired,
  WORKSPACE_COHORT_PILOT_ENABLED_VAR,
} from '@/lib/workspaces/cohort'

export default async function WorkspaceOperationsPage() {
  await requireStaffPage(['leadership'])
  const service = createServiceClient()

  const [accessState, cohortResult, profileResult, billingResult] = await Promise.all([
    readWorkspaceAccessState(service),
    service
      .from('workspace_cohorts')
      .select('id, account_user_id, enabled, starts_at, ends_at, created_at')
      .eq('stage', 'pilot')
      .order('created_at', { ascending: false }),
    service
      .from('user_profiles')
      .select('id, artist_name, handle')
      .order('artist_name', { ascending: true })
      .limit(1000),
    service.from('workspace_subscriptions').select('status'),
  ])

  if (cohortResult.error) throw new Error('Failed to load the workspace pilot cohort')
  if (profileResult.error) throw new Error('Failed to load Member choices')

  const profiles = new Map((profileResult.data ?? []).map(profile => [profile.id, profile]))
  const labelFor = (id: string) => {
    const profile = profiles.get(id)
    return profile
      ? profileDisplayTitle({ artistName: profile.artist_name, handle: profile.handle }) || 'Member'
      : 'Member account'
  }

  const billingCounts: Record<string, number> = {
    beta_active: 0,
    active: 0,
    past_due: 0,
    paused: 0,
    canceled: 0,
  }
  if (billingResult.error) {
    billingCounts.awaiting_migration_221 = 0
  } else {
    for (const row of billingResult.data ?? []) {
      const status = typeof row.status === 'string' ? row.status : 'unknown'
      billingCounts[status] = (billingCounts[status] ?? 0) + 1
    }
  }

  return (
    <main className="flex-1 px-6 py-[30px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">Leadership · Beta operations</p>
      <h1 className="mt-1 text-2xl font-bold text-[color:var(--ink)]">Workspace Rollout</h1>
      <p className="mt-1 max-w-3xl text-[13px] leading-5 text-[color:var(--ink-3)]">
        One operational view for the existing pilot cohort, the single database emergency stop,
        and workspace billing posture. This console does not alter Member plans.
      </p>
      <WorkspaceRolloutConsole
        accessState={accessState}
        cohortRequired={isWorkspaceCohortRequired()}
        pilotDeclared={process.env[WORKSPACE_COHORT_PILOT_ENABLED_VAR] === 'true'}
        cohort={(cohortResult.data ?? []).map(row => {
          const profile = profiles.get(row.account_user_id)
          return {
            id: row.id,
            accountUserId: row.account_user_id,
            label: labelFor(row.account_user_id),
            handle: profile?.handle ?? null,
            enabled: row.enabled,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
          }
        })}
        accounts={(profileResult.data ?? []).map(profile => ({
          id: profile.id,
          label: `${labelFor(profile.id)}${profile.handle ? ` · @${profile.handle}` : ''}`,
        }))}
        billingCounts={billingCounts}
      />
    </main>
  )
}
