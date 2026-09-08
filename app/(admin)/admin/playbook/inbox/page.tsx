export const dynamic = 'force-dynamic'
import { FeatureGateNotice } from '@/components/playbook/FeatureGateNotice'
import {
  PlaybookInbox,
  type PlaybookInboxCard,
} from '@/components/playbook/PlaybookInbox'
import { SlaRuleForm } from '@/components/playbook/SlaRuleForm'
import {
  ALL_STAFF_ROLES,
  getStaffRoles,
  requireStaffPage,
  type StaffRole,
} from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import {
  assignmentAppliesToUser,
  latestAcknowledgedRevision,
  type ReadingAcknowledgement,
  type ReadingAssignment,
} from '@/lib/playbook/assignments'
import { staffTargetApplies } from '@/lib/playbook/enablement'
import { loadAvailablePlaybookFeatures } from '@/lib/playbook/feature-access'
import {
  resolveSlaDueAt,
  sortInbox,
  type SlaRule,
} from '@/lib/playbook/operational-v1'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
export default async function PlaybookInboxPage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES)
  const roles = getStaffRoles(auth.user)
  const service = createServiceClient()
  const feature = await loadAvailablePlaybookFeatures(service, auth.user.id)
  if (!feature.keys.has('sla_inbox'))
    return (
      <main className="mx-auto w-full max-w-[1000px] px-6 py-[30px] lg:px-9">
        <h1 className="text-2xl font-extrabold">Playbook Inbox & SLA Center</h1>
        <FeatureGateNotice
          schemaReady={feature.schemaReady}
          label="Playbook Inbox"
        />
      </main>
    )
  const [rooms, grants] = await Promise.all([
    loadRooms(service),
    readRoomGrants(service),
  ])
  const byRoom = new Map<string, StaffRole[]>()
  for (const g of grants)
    byRoom.set(g.room_id, [
      ...(byRoom.get(g.room_id) ?? []),
      g.role as StaffRole,
    ])
  const accessible = rooms.filter((r) =>
    canAccessRoom(roles, byRoom.get(r.id) ?? [])
  )
  const roomIds = accessible.map((r) => r.id)
  const entries = roomIds.length
    ? await service
        .from('playbook_entries')
        .select('id,room_id,title,slug')
        .in('room_id', roomIds)
        .eq('status', 'published')
    : { data: [], error: null }
  if (entries.error) throw new Error(`Failed to load inbox doctrine: ${entries.error.message}`)
  const entryById = new Map(
    (entries.data ?? []).map((x) => [x.id as string, x])
  )
  const roomById = new Map(accessible.map((x) => [x.id, x]))
  const entryIds = [...entryById.keys()]
  const reading = entryIds.length
    ? await service
        .from('playbook_reading_assignments')
        .select(
          'id,entry_id,target_kind,target_user_id,target_role,required_revision,required,due_at,assigned_by,created_at,revoked_at'
        )
        .in('entry_id', entryIds)
        .is('revoked_at', null)
    : { data: [], error: null }
  if (reading.error) throw new Error(`Failed to load reading work: ${reading.error.message}`)
  const readingRows = ((reading.data ?? []) as ReadingAssignment[]).filter(
    (x) => assignmentAppliesToUser(x, auth.user.id, roles)
  )
  const acknowledgements = readingRows.length
    ? await service
        .from('playbook_reading_acknowledgements')
        .select('assignment_id,user_id,revision_number,acknowledged_at')
        .in(
          'assignment_id',
          readingRows.map((x) => x.id)
        )
        .eq('user_id', auth.user.id)
    : { data: [], error: null }
  if (acknowledgements.error)
    throw new Error(`Failed to load reading progress: ${acknowledgements.error.message}`)
  const items: PlaybookInboxCard[] = []
  for (const row of readingRows) {
    const entry = entryById.get(row.entry_id)
    const room = entry ? roomById.get(entry.room_id as string) : null
    if (!entry || !room) continue
    items.push({
      id: row.id,
      kind: 'reading',
      title: String(entry.title),
      context: `Required reading · ${room.label}`,
      href: `/admin/playbook/${room.key}/${entry.slug}`,
      dueAt: row.due_at,
      complete:
        (latestAcknowledgedRevision(
          (acknowledgements.data ?? []) as ReadingAcknowledgement[],
          row.id,
          auth.user.id
        ) ?? 0) >= row.required_revision,
      severity: null,
      roomId: room.id,
      openedAt: (row as ReadingAssignment & { created_at: string }).created_at,
    })
  }
  const paths = roomIds.length
    ? await service
        .from('playbook_learning_paths')
        .select('id,room_id,title')
        .in('room_id', roomIds)
        .eq('status', 'published')
    : { data: [], error: null }
  if (paths.error) throw new Error(`Failed to load learning paths: ${paths.error.message}`)
  const pathIds = (paths.data ?? []).map((x) => x.id as string)
  const learning = pathIds.length
    ? await service
        .from('playbook_learning_assignments')
        .select(
          'id,path_id,target_kind,target_user_id,target_role,due_at,assigned_at'
        )
        .in('path_id', pathIds)
        .is('revoked_at', null)
    : { data: [], error: null }
  if (learning.error) throw new Error(`Failed to load learning work: ${learning.error.message}`)
  const { data: learningSteps, error: learningStepsError } = pathIds.length
    ? await service
        .from('playbook_learning_path_steps')
        .select('id,path_id')
        .in('path_id', pathIds)
    : { data: [], error: null }
  if (learningStepsError)
    throw new Error(`Failed to load learning steps: ${learningStepsError.message}`)
  const learningStepIds = (learningSteps ?? []).map((step) => step.id)
  const { data: learningCompletions, error: learningCompletionsError } = learningStepIds.length
    ? await service
        .from('playbook_learning_step_completions')
        .select('step_id')
        .in('step_id', learningStepIds)
        .eq('user_id', auth.user.id)
    : { data: [], error: null }
  if (learningCompletionsError)
    throw new Error(`Failed to load learning progress: ${learningCompletionsError.message}`)
  const completedStepIds = new Set((learningCompletions ?? []).map((row) => row.step_id))
  for (const row of learning.data ?? []) {
    if (!staffTargetApplies(row, auth.user.id, roles)) continue
    const path = (paths.data ?? []).find((x) => x.id === row.path_id)
    if (path)
      items.push({
        id: row.id as string,
        kind: 'learning',
        title: String(path.title),
        context: 'Assigned learning path',
        href: '/admin/playbook/learning-paths',
        dueAt: row.due_at as string | null,
        complete:
          (learningSteps ?? []).some((step) => step.path_id === row.path_id) &&
          (learningSteps ?? [])
            .filter((step) => step.path_id === row.path_id)
            .every((step) => completedStepIds.has(step.id)),
        severity: null,
        roomId: path.room_id as string,
        openedAt: row.assigned_at as string,
      })
  }
  const workflowTemplates = roomIds.length
    ? await service.from('playbook_workflow_templates').select('id,room_id').in('room_id', roomIds)
    : { data: [], error: null }
  if (workflowTemplates.error)
    throw new Error(`Failed to load workflow scope: ${workflowTemplates.error.message}`)
  const workflowTemplateIds = (workflowTemplates.data ?? []).map((row) => row.id)
  const workflowRoomByTemplate = new Map((workflowTemplates.data ?? []).map((row) => [row.id, row.room_id]))
  const simulationScenarios = roomIds.length
    ? await service
        .from('playbook_simulation_scenarios')
        .select('id,room_id')
        .in('room_id', roomIds)
        .eq('status', 'published')
    : { data: [], error: null }
  if (simulationScenarios.error)
    throw new Error(`Failed to load simulation scope: ${simulationScenarios.error.message}`)
  const simulationScenarioIds = (simulationScenarios.data ?? []).map((row) => row.id)
  const simulationRoomByScenario = new Map((simulationScenarios.data ?? []).map((row) => [row.id, row.room_id]))
  const [feedback, workflows, exceptions, incidents, simulations] = await Promise.all([
      roomIds.length ? service
        .from('playbook_reader_feedback')
        .select('id,room_id,body,status,created_at')
        .eq('assigned_to', auth.user.id)
        .in('status', ['open', 'triaged'])
        .in('room_id', roomIds) : Promise.resolve({ data: [], error: null }),
      workflowTemplateIds.length ? service
        .from('playbook_workflow_runs')
        .select('id,template_id,context_label,status,started_at')
        .eq('owner_id', auth.user.id)
        .eq('status', 'active')
        .in('template_id', workflowTemplateIds) : Promise.resolve({ data: [], error: null }),
      roomIds.length ? service
        .from('playbook_exceptions')
        .select('id,room_id,title,status,requested_at,expires_at')
        .eq('requested_by', auth.user.id)
        .in('status', ['requested', 'approved'])
        .in('room_id', roomIds) : Promise.resolve({ data: [], error: null }),
      roomIds.length ? service
        .from('playbook_incidents')
        .select('id,room_id,title,severity,status,started_at,postmortem_due_at')
        .eq('commander_id', auth.user.id)
        .in('status', ['active', 'monitoring', 'resolved'])
        .in('room_id', roomIds) : Promise.resolve({ data: [], error: null }),
      simulationScenarioIds.length ? service
        .from('playbook_simulation_assignments')
        .select(
          'id,scenario_id,target_kind,target_user_id,target_role,due_at,assigned_at'
        )
        .is('revoked_at', null)
        .in('scenario_id', simulationScenarioIds) : Promise.resolve({ data: [], error: null }),
    ])
  const sourceError = feedback.error || workflows.error || exceptions.error || incidents.error || simulations.error
  if (sourceError) throw new Error(`Failed to load Playbook inbox: ${sourceError.message}`)
  for (const x of feedback.data ?? [])
    items.push({
      id: x.id as string,
      kind: 'feedback',
      title: 'Reader feedback awaiting action',
      context: String(x.body).slice(0, 160),
      href: '/admin/playbook/feedback',
      dueAt: null,
      complete: false,
      severity: null,
      roomId: x.room_id as string,
      openedAt: x.created_at as string,
    })
  for (const x of workflows.data ?? [])
    items.push({
      id: x.id as string,
      kind: 'workflow',
      title: String(x.context_label),
      context: 'Active doctrine workflow',
      href: '/admin/playbook/workflows',
      dueAt: null,
      complete: false,
      severity: null,
      roomId: workflowRoomByTemplate.get(x.template_id as string) ?? null,
      openedAt: x.started_at as string,
    })
  for (const x of exceptions.data ?? [])
    items.push({
      id: x.id as string,
      kind: 'exception',
      title: String(x.title),
      context: `Exception ${x.status}`,
      href: '/admin/playbook/exceptions',
      dueAt: x.expires_at as string | null,
      complete: false,
      severity: null,
      roomId: x.room_id as string,
      openedAt: x.requested_at as string,
    })
  for (const x of incidents.data ?? [])
    items.push({
      id: x.id as string,
      kind: 'incident',
      title: String(x.title),
      context: `Level ${x.severity} incident · ${x.status}`,
      href: '/admin/playbook/incidents',
      dueAt: x.postmortem_due_at as string | null,
      complete: false,
      severity: Number(x.severity),
      roomId: x.room_id as string,
      openedAt: x.started_at as string,
    })
  for (const x of simulations.data ?? []) {
    if (
      staffTargetApplies(
        {
          target_kind: x.target_kind,
          target_user_id: x.target_user_id,
          target_role: x.target_role,
        },
        auth.user.id,
        roles
      )
    )
      items.push({
        id: x.id as string,
        kind: 'simulation',
        title: 'Assigned training simulation',
        context: 'Practice and human review required',
        href: '/admin/playbook/simulations',
        dueAt: x.due_at as string | null,
        complete: false,
        severity: null,
        roomId: simulationRoomByScenario.get(x.scenario_id as string) ?? null,
        openedAt: x.assigned_at as string,
      })
  }
  const { data: slaRows, error: slaError } = await service
    .from('playbook_sla_rules')
    .select('work_kind,room_id,severity,resolve_minutes')
    .eq('active', true)
  if (slaError)
    throw new Error(`Failed to load Playbook SLAs: ${slaError.message}`)
  const slaRules: SlaRule[] = (slaRows ?? []).map((row) => ({
    workKind: row.work_kind,
    roomId: row.room_id,
    severity: row.severity,
    resolveMinutes: row.resolve_minutes,
  }))
  const sorted = sortInbox(
    items.map((item) => ({ ...item, dueAt: resolveSlaDueAt(item, slaRules) })),
    new Date()
  )
  return (
    <main className="mx-auto w-full max-w-[1000px] px-6 py-[30px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">
        The Playbook · Release 28
      </p>
      <h1 className="mt-1 text-2xl font-extrabold">Inbox & SLA Center</h1>
      <p className="mt-2 text-sm text-[color:var(--ink-3)]">
        One view of the work that needs your attention. SLA signals describe
        service expectations—they do not score personal worth.
      </p>
      {roles.includes('leadership') && (
        <SlaRuleForm
          rooms={accessible.map((r) => ({ id: r.id, label: r.label }))}
        />
      )}
      <PlaybookInbox items={sorted} />
    </main>
  )
}
