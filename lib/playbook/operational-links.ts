import type { SupabaseClient } from '@supabase/supabase-js'
import type { StaffRole } from '@/lib/admin/staff-role'
import {
  operationalEntityHref,
  type OperationalEntityType,
} from '@/lib/playbook/operational-v1'

export type ResolvedOperationalEntity = {
  id: string
  label: string
  href: string
}

function canWorkAssignedOrg(
  roles: readonly StaffRole[],
  userId: string,
  aeUserId: string | null
): boolean {
  return roles.includes('leadership') || aeUserId === userId
}

async function resolveOrg(
  service: SupabaseClient,
  orgId: string,
  userId: string,
  roles: readonly StaffRole[]
): Promise<ResolvedOperationalEntity | null> {
  const { data } = await service
    .from('buyer_orgs')
    .select('id,name,ae_user_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!data || !canWorkAssignedOrg(roles, userId, data.ae_user_id)) return null
  return {
    id: data.id,
    label: data.name,
    href: operationalEntityHref('client_partner', data.id),
  }
}

/**
 * Resolves labels and destinations on the server and re-checks the source
 * record's own authorization. Clients never get to manufacture a trusted
 * record label or use a Playbook link to widen source-system access.
 */
export async function resolveOperationalEntity(
  service: SupabaseClient,
  input: {
    entityType: OperationalEntityType
    entityId: string
    userId: string
    roles: readonly StaffRole[]
  }
): Promise<ResolvedOperationalEntity | null> {
  const { entityType, entityId, userId, roles } = input

  if (entityType === 'member_onboarding') {
    const { data } = await service
      .from('member_game_plan_runs')
      .select('id,member_label,facilitator_id')
      .eq('id', entityId)
      .maybeSingle()
    if (
      !data ||
      (!roles.includes('leadership') && data.facilitator_id !== userId)
    )
      return null
    return {
      id: data.id,
      label: `${data.member_label} onboarding`,
      href: operationalEntityHref(entityType, data.id),
    }
  }

  if (entityType === 'client_partner')
    return resolveOrg(service, entityId, userId, roles)

  if (entityType === 'deal') {
    const { data } = await service
      .from('license_requests')
      .select('id,buyer_org_id,stage')
      .eq('id', entityId)
      .maybeSingle()
    if (!data) return null
    const org = await resolveOrg(service, data.buyer_org_id, userId, roles)
    if (!org) return null
    return {
      id: data.id,
      label: `${org.label} deal · ${String(data.stage).replaceAll('_', ' ')}`,
      href: operationalEntityHref(entityType, data.id),
    }
  }

  if (entityType === 'buyer_brief') {
    const { data } = await service
      .from('buyer_briefs')
      .select('id,buyer_org_id,title')
      .eq('id', entityId)
      .maybeSingle()
    if (!data) return null
    const org = await resolveOrg(service, data.buyer_org_id, userId, roles)
    if (!org) return null
    return {
      id: data.id,
      label: data.title?.trim() || `${org.label} brief`,
      href: operationalEntityHref(entityType, data.id),
    }
  }

  if (entityType === 'call_log') {
    const { data } = await service
      .from('client_relationship_log')
      .select('id,buyer_org_id,kind')
      .eq('id', entityId)
      .maybeSingle()
    if (!data) return null
    const org = await resolveOrg(service, data.buyer_org_id, userId, roles)
    if (!org) return null
    return {
      id: data.id,
      label: `${org.label} · ${data.kind}`,
      href: operationalEntityHref(entityType, data.id),
    }
  }

  if (entityType === 'release') {
    const { data } = await service
      .from('vault_projects')
      .select('id,title,user_id')
      .eq('id', entityId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return null
    return {
      id: data.id,
      label: data.title,
      href: operationalEntityHref(entityType, data.id),
    }
  }

  const { data: membership } = await service
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', entityId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (!membership) return null
  const { data: workspace } = await service
    .from('workspaces')
    .select('id,name')
    .eq('id', entityId)
    .maybeSingle()
  return workspace
    ? {
        id: workspace.id,
        label: workspace.name,
        href: operationalEntityHref(entityType, workspace.id),
      }
    : null
}
