import type { SupabaseClient } from '@supabase/supabase-js'
import { featureIsAvailable, isOperationalV1SchemaMissing } from '@/lib/playbook/operational-v1'

export async function loadAvailablePlaybookFeatures(service: SupabaseClient, userId: string, now = new Date()): Promise<{ keys: Set<string>; schemaReady: boolean }> {
  const controls = await service.from('playbook_feature_controls').select('feature_key, enabled, emergency_disabled')
  if (controls.error) {
    if (isOperationalV1SchemaMissing(controls.error)) return { keys: new Set(), schemaReady: false }
    throw new Error(`Failed to load Playbook feature controls: ${controls.error.message}`)
  }
  const memberships = await service.from('playbook_beta_cohort_members').select('cohort_id, expires_at').eq('user_id', userId).is('revoked_at', null)
  if (memberships.error) throw new Error(`Failed to load Playbook beta access: ${memberships.error.message}`)
  const cohortIds = (memberships.data ?? []).filter(row => !row.expires_at || Date.parse(row.expires_at) > now.getTime()).map(row => row.cohort_id)
  if (cohortIds.length === 0) return { keys: new Set(), schemaReady: true }
  const [cohorts, grants] = await Promise.all([
    service.from('playbook_beta_cohorts').select('id').in('id', cohortIds).eq('status','active'),
    service.from('playbook_feature_cohort_grants').select('feature_key, cohort_id').in('cohort_id', cohortIds).is('revoked_at', null),
  ])
  if (cohorts.error || grants.error) throw new Error(`Failed to evaluate Playbook beta access: ${cohorts.error?.message ?? grants.error?.message}`)
  const activeCohorts = new Set((cohorts.data ?? []).map(row => row.id))
  const granted = new Map<string, Array<{ active: boolean; memberActive: boolean; expiresAt: string | null }>>()
  for (const grant of grants.data ?? []) {
    if (!activeCohorts.has(grant.cohort_id)) continue
    granted.set(grant.feature_key, [...(granted.get(grant.feature_key) ?? []), { active: true, memberActive: true, expiresAt: null }])
  }
  const keys = new Set<string>()
  for (const control of controls.data ?? []) if (featureIsAvailable({ enabled: control.enabled, emergencyDisabled: control.emergency_disabled }, granted.get(control.feature_key) ?? [], now)) keys.add(control.feature_key)
  return { keys, schemaReady: true }
}

export async function playbookFeatureAvailable(service: SupabaseClient, userId: string, key: string): Promise<boolean> {
  return (await loadAvailablePlaybookFeatures(service, userId)).keys.has(key)
}
