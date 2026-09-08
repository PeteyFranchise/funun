export const dynamic = 'force-dynamic'
import { FeatureGateNotice } from '@/components/playbook/FeatureGateNotice'
import {
  SimulationCenter,
  type SimulationCard,
  type SimulationReviewCard,
} from '@/components/playbook/SimulationCenter'
import {
  ALL_STAFF_ROLES,
  getStaffRoles,
  requireStaffPage,
  type StaffRole,
} from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { isRoomLead } from '@/lib/playbook/entries'
import { loadAvailablePlaybookFeatures } from '@/lib/playbook/feature-access'
import {
  certificationIsCurrent,
  parseSimulationScenario,
  targetRoleApplies,
} from '@/lib/playbook/operational-v1'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
export default async function SimulationsPage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES)
  const roles = getStaffRoles(auth.user)
  const service = createServiceClient()
  const feature = await loadAvailablePlaybookFeatures(service, auth.user.id)
  if (!feature.keys.has('simulations'))
    return (
      <main className="mx-auto w-full max-w-[1000px] px-6 py-[30px] lg:px-9">
        <h1 className="text-2xl font-extrabold">
          Training Simulations & Certification
        </h1>
        <FeatureGateNotice
          schemaReady={feature.schemaReady}
          label="Training Simulations"
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
  const roomById = new Map(accessible.map((r) => [r.id, r]))
  const scenarios = accessible.length
    ? await service
        .from('playbook_simulation_scenarios')
        .select('id,room_id,source_entry_id,title,description,scenario')
        .in(
          'room_id',
          accessible.map((r) => r.id)
        )
        .eq('status', 'published')
    : { data: [], error: null }
  const scenarioById = new Map(
    (scenarios.data ?? []).map((x) => [x.id as string, x])
  )
  const assignments = scenarioById.size
    ? await service
        .from('playbook_simulation_assignments')
        .select('id,scenario_id,target_kind,target_user_id,target_role,due_at')
        .in('scenario_id', [...scenarioById.keys()])
        .is('revoked_at', null)
    : { data: [], error: null }
  const mine = (assignments.data ?? []).filter((x) =>
    targetRoleApplies(
      {
        targetKind: x.target_kind,
        targetUserId: x.target_user_id,
        targetRole: x.target_role,
      },
      auth.user.id,
      roles
    )
  )
  const attempts = mine.length
    ? await service
        .from('playbook_simulation_attempts')
        .select('id,assignment_id,status')
        .in(
          'assignment_id',
          mine.map((x) => x.id)
        )
        .eq('user_id', auth.user.id)
        .order('submitted_at', { ascending: false })
    : { data: [], error: null }
  const certificates = (attempts.data ?? []).length
    ? await service
        .from('playbook_certifications')
        .select('attempt_id,expires_at,revoked_at')
        .in(
          'attempt_id',
          (attempts.data ?? []).map((x) => x.id)
        )
    : { data: [], error: null }
  const cards: SimulationCard[] = mine.flatMap((a) => {
    const s = scenarioById.get(a.scenario_id as string)
    const room = s ? roomById.get(s.room_id as string) : null
    const attempt = (attempts.data ?? []).find((x) => x.assignment_id === a.id)
    const certificate = (certificates.data ?? []).find(
      (x) => x.attempt_id === attempt?.id
    )
    const prompts = s ? parseSimulationScenario(s.scenario) : null
    return s && room && prompts
      ? [
          {
            assignmentId: a.id as string,
            scenarioId: s.id as string,
            title: String(s.title),
            description: String(s.description),
            roomKey: room.key,
            roomLabel: room.label,
            prompts,
            dueAt: a.due_at as string | null,
            attemptStatus: attempt ? String(attempt.status) : null,
            certificateExpiresAt:
              certificate &&
              certificationIsCurrent(
                {
                  revokedAt: certificate.revoked_at,
                  expiresAt: certificate.expires_at,
                },
                new Date()
              )
                ? certificate.expires_at
                : null,
          },
        ]
      : []
  })
  const leadRoomIds = new Set(
    (
      await Promise.all(
        accessible.map(
          async (r) =>
            [
              r.id,
              roles.includes('leadership') ||
                (await isRoomLead(service, r.id, auth.user.id)),
            ] as const
        )
      )
    )
      .filter((x) => x[1])
      .map((x) => x[0])
  )
  const entries = leadRoomIds.size
    ? await service
        .from('playbook_entries')
        .select('id,room_id,title')
        .in('room_id', [...leadRoomIds])
        .eq('status', 'published')
    : { data: [], error: null }
  const pending = scenarioById.size
    ? await service
        .from('playbook_simulation_attempts')
        .select('id,scenario_id,responses,submitted_at')
        .in('scenario_id', [...scenarioById.keys()])
        .eq('status', 'submitted')
        .order('submitted_at')
    : { data: [], error: null }
  const reviews: SimulationReviewCard[] = (pending.data ?? []).flatMap((a) => {
    const s = scenarioById.get(a.scenario_id as string)
    const room = s ? roomById.get(s.room_id as string) : null
    return s && room && leadRoomIds.has(room.id)
      ? [
          {
            attemptId: a.id as string,
            title: String(s.title),
            roomKey: room.key,
            responses: (Array.isArray(a.responses) ? a.responses : []) as {
              promptId: string
              response: string
            }[],
            submittedAt: String(a.submitted_at),
          },
        ]
      : []
  })
  return (
    <main className="mx-auto w-full max-w-[1050px] px-6 py-[30px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">
        The Playbook · Release 30
      </p>
      <h1 className="mt-1 text-2xl font-extrabold">
        Training Simulations & Certification
      </h1>
      <p className="mt-2 text-sm text-[color:var(--ink-3)]">
        Practice realistic decisions. Certification requires a disclosed human
        review and can expire or be remediated.
      </p>
      <SimulationCenter
        initialAssignments={cards}
        reviews={reviews}
        roles={ALL_STAFF_ROLES}
        sources={(entries.data ?? []).map((x) => ({
          id: x.id as string,
          title: String(x.title),
          roomKey: roomById.get(x.room_id as string)!.key,
        }))}
      />
    </main>
  )
}
