export const dynamic = 'force-dynamic'
import {
  ActivationConsole,
  type FeatureControlCard,
} from '@/components/playbook/ActivationConsole'
import { requireStaffPage } from '@/lib/admin/gate'
import { isOperationalV1SchemaMissing } from '@/lib/playbook/operational-v1'
import { createServiceClient } from '@/lib/supabase/server'
export default async function ActivationPage() {
  await requireStaffPage(['leadership'])
  const service = createServiceClient()
  const [features, cohorts, staff, memberships, grants] = await Promise.all([
    service
      .from('playbook_feature_controls')
      .select('feature_key,label,enabled,emergency_disabled,disabled_reason')
      .order('label'),
    service
      .from('playbook_beta_cohorts')
      .select('id,label')
      .eq('status', 'active')
      .order('label'),
    service
      .from('funun_staff')
      .select('user_id,display_name')
      .order('display_name'),
    service
      .from('playbook_beta_cohort_members')
      .select('cohort_id,user_id')
      .is('revoked_at', null),
    service
      .from('playbook_feature_cohort_grants')
      .select('cohort_id,feature_key')
      .is('revoked_at', null),
  ])
  const schemaReady = !features.error
  if (features.error && !isOperationalV1SchemaMissing(features.error))
    throw new Error(`Failed to load feature controls: ${features.error.message}`)
  if (schemaReady && (cohorts.error || staff.error || memberships.error || grants.error))
    throw new Error(
      `Failed to load activation data: ${cohorts.error?.message ?? staff.error?.message ?? memberships.error?.message ?? grants.error?.message}`
    )
  const cards: FeatureControlCard[] = (features.data ?? []).map((row) => ({
    key: String(row.feature_key),
    label: String(row.label),
    enabled: Boolean(row.enabled),
    emergencyDisabled: Boolean(row.emergency_disabled),
    reason: row.disabled_reason as string | null,
  }))
  const staffRows = (staff.data ?? []).map((x) => ({
    id: x.user_id as string,
    label: String(x.display_name || 'Team Member'),
  }))
  const cohortRows = (cohorts.data ?? []).map((x) => ({
    id: x.id as string,
    label: String(x.label),
  }))
  return (
    <main className="mx-auto w-full max-w-[1100px] px-6 py-[30px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">
        The Playbook · Release 27
      </p>
      <h1 className="mt-1 text-2xl font-extrabold">Controlled Activation</h1>
      <p className="mt-2 text-sm text-[color:var(--ink-3)]">
        Explicit cohorts, deliberate capability grants, and an emergency stop.
        There is no invisible percentage rollout.
      </p>
      <ActivationConsole
        schemaReady={schemaReady}
        initialFeatures={cards}
        cohorts={cohortRows}
        staff={staffRows}
        memberships={(memberships.data ?? []).map((x) => ({
          cohortId: x.cohort_id as string,
          userId: x.user_id as string,
        }))}
        grants={(grants.data ?? []).map((x) => ({
          cohortId: x.cohort_id as string,
          featureKey: String(x.feature_key),
        }))}
      />
    </main>
  )
}
