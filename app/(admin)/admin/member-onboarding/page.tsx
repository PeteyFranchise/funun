export const dynamic = 'force-dynamic'

import { requireStaffPage } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
import { PROFILE_ROLE_LABELS, type ProfileRole } from '@/types'
import {
  MEMBER_ONBOARDING_STAFF_ROLES,
  type MemberGamePlanRun,
  type MemberGamePlanTemplate,
} from '@/lib/member-onboarding/game-plan'
import { MemberOnboardingCRM, type OnboardingMember } from '@/components/admin/MemberOnboardingCRM'

function roleLabel(role: ProfileRole): string {
  return role.kind === 'preset' ? PROFILE_ROLE_LABELS[role.slug] : role.label
}

export default async function MemberOnboardingPage() {
  await requireStaffPage([...MEMBER_ONBOARDING_STAFF_ROLES])
  const service = createServiceClient()

  const [{ data: profiles, error: profilesError }, { data: templates, error: templatesError }, { data: runs, error: runsError }, authUsers] = await Promise.all([
    service.from('user_profiles').select('id, artist_name, roles, created_at').order('created_at', { ascending: false }).limit(500),
    service.from('member_game_plan_templates').select('*').eq('active', true).order('created_at'),
    service.from('member_game_plan_runs').select('*').order('created_at', { ascending: false }).limit(500),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (profilesError) throw new Error(`Failed to load Member Accounts: ${profilesError.message}`)
  if (templatesError) throw new Error(`Failed to load game-plan templates: ${templatesError.message}`)
  if (runsError) throw new Error(`Failed to load onboarding call history: ${runsError.message}`)

  const authById = new Map((authUsers.data.users ?? []).map(user => [user.id, user]))
  const members: OnboardingMember[] = (profiles ?? []).map(profile => {
    const user = authById.get(profile.id)
    const roles = Array.isArray(profile.roles) ? profile.roles as ProfileRole[] : []
    return {
      id: profile.id,
      label: profile.artist_name?.trim() || user?.email || 'Member',
      email: user?.email || 'No email available',
      roleLabels: roles.map(roleLabel),
    }
  })

  return (
    <main className="flex-1 px-6 py-[30px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">Member CRM</p>
      <h1 className="mt-1 text-2xl font-bold text-[color:var(--ink)]">Member Onboarding</h1>
      <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">Start a reusable game plan, guide the call, and preserve the completed checklist in the Member’s call log.</p>
      <MemberOnboardingCRM
        members={members}
        templates={(templates ?? []) as MemberGamePlanTemplate[]}
        initialRuns={(runs ?? []) as MemberGamePlanRun[]}
      />
    </main>
  )
}
