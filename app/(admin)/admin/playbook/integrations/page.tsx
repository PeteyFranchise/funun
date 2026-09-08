export const dynamic = 'force-dynamic'

import { FeatureGateNotice } from '@/components/playbook/FeatureGateNotice'
import {
  OperationalIntegrationCenter,
  type OperationalLink,
  type OperationalRun,
} from '@/components/playbook/OperationalIntegrationCenter'
import {
  ALL_STAFF_ROLES,
  getStaffRoles,
  requireStaffPage,
} from '@/lib/admin/gate'
import { loadAvailablePlaybookFeatures } from '@/lib/playbook/feature-access'
import { resolveOperationalEntity } from '@/lib/playbook/operational-links'
import {
  isOperationalV1SchemaMissing,
  OPERATIONAL_ENTITY_TYPES,
  type OperationalEntityType,
} from '@/lib/playbook/operational-v1'
import { createServiceClient } from '@/lib/supabase/server'

function initialEntity(
  searchParams: Record<string, string | string[] | undefined>
) {
  const type =
    typeof searchParams.entityType === 'string' ? searchParams.entityType : ''
  const id =
    typeof searchParams.entityId === 'string' ? searchParams.entityId : ''
  return (OPERATIONAL_ENTITY_TYPES as readonly string[]).includes(type) && id
    ? { type: type as OperationalEntityType, id }
    : undefined
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const auth = await requireStaffPage(ALL_STAFF_ROLES)
  const roles = getStaffRoles(auth.user)
  const service = createServiceClient()
  const feature = await loadAvailablePlaybookFeatures(service, auth.user.id)
  if (!feature.keys.has('operational_integrations'))
    return (
      <main className="mx-auto w-full max-w-[1000px] px-6 py-[30px] lg:px-9">
        <h1 className="text-2xl font-extrabold">CRM & Workspace Integration</h1>
        <FeatureGateNotice
          schemaReady={feature.schemaReady}
          label="Operational integrations"
        />
      </main>
    )
  const { data: runRows, error: runError } = await service
    .from('playbook_workflow_runs')
    .select(
      'id,status,owner_id,started_by,playbook_workflow_templates!inner(title,playbook_rooms!inner(key))'
    )
    .in('status', ['active', 'completed'])
    .order('started_at', { ascending: false })
    .limit(200)
  if (runError)
    throw new Error(`Failed to load workflow runs: ${runError.message}`)
  const visibleRuns = (runRows ?? []).filter(
    (run) =>
      roles.includes('leadership') ||
      run.owner_id === auth.user.id ||
      run.started_by === auth.user.id
  )
  const runIds = visibleRuns.map((run) => run.id)
  const { data: linkRows, error: linkError } = runIds.length
    ? await service
        .from('playbook_operational_links')
        .select(
          'id,workflow_run_id,entity_type,entity_id,entity_label,entity_href,linked_at'
        )
        .in('workflow_run_id', runIds)
        .is('unlinked_at', null)
        .order('linked_at', { ascending: false })
    : { data: [], error: null }
  if (linkError && !isOperationalV1SchemaMissing(linkError))
    throw new Error(`Failed to load operational links: ${linkError.message}`)
  const runs: OperationalRun[] = visibleRuns.map((row) => {
    const nested = row as unknown as {
      id: string
      status: string
      playbook_workflow_templates: {
        title: string
        playbook_rooms: { key: string }
      }
    }
    return {
      id: nested.id,
      status: nested.status,
      title: nested.playbook_workflow_templates.title,
      roomKey: nested.playbook_workflow_templates.playbook_rooms.key,
    }
  })
  const checkedLinks = await Promise.all(
    (linkRows ?? []).map(async (row) => {
      const entityType = row.entity_type as OperationalEntityType
      if (!(OPERATIONAL_ENTITY_TYPES as readonly string[]).includes(entityType)) return null
      const entity = await resolveOperationalEntity(service, {
        entityType,
        entityId: row.entity_id,
        userId: auth.user.id,
        roles,
      })
      if (!entity) return null
      return {
        id: row.id,
        workflowRunId: row.workflow_run_id,
        entityType,
        entityId: entity.id,
        label: entity.label,
        href: entity.href,
        linkedAt: row.linked_at,
      }
    })
  )
  const links = checkedLinks.filter((link) => link !== null) as OperationalLink[]
  return (
    <main className="mx-auto w-full max-w-[1050px] px-6 py-[30px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">
        The Playbook · Release 31
      </p>
      <h1 className="mt-1 text-2xl font-extrabold">
        CRM & Workspace Integration
      </h1>
      <p className="mt-2 text-sm text-[color:var(--ink-3)]">
        Connect runnable doctrine to the real record it supports. Funūn stores a
        reference, not a duplicate, and the source system remains the authority.
      </p>
      <OperationalIntegrationCenter
        runs={runs}
        initialLinks={links}
        initialEntity={initialEntity(await searchParams)}
      />
    </main>
  )
}
