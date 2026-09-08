export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { ALL_STAFF_ROLES, getStaffRoles, requireStaffPage } from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { resolveGovernanceRooms } from '@/lib/playbook/governance'
import { assessPublicationManifest, PLAYBOOK_PUBLICATION_MANIFEST, PUBLICATION_ENTRY_SELECT, PUBLICATION_UAT_CHECKS } from '@/lib/playbook/publication-manifest'
import { loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { PublicationReadinessQueue } from '@/components/playbook/PublicationReadinessQueue'
import { PublicationActivationGate } from '@/components/playbook/PublicationActivationGate'
import { DOCTRINE_PILOT_KEY, isDoctrinePackageUnlocked, isMissingPlaybookActivationSchema } from '@/lib/playbook/activation'

type LeadRow = { room_id: string }

export default async function PlaybookPublicationPage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES)
  const roles = getStaffRoles(auth.user)
  const leadership = roles.includes('leadership')
  const service = createServiceClient()
  const [rooms, grants, leadResult] = await Promise.all([
    loadRooms(service),
    readRoomGrants(service),
    leadership
      ? Promise.resolve({ data: [] as LeadRow[], error: null })
      : service.from('playbook_room_leads').select('room_id').eq('user_id', auth.user.id),
  ])
  if (leadResult.error) throw new Error(`Failed to load Playbook publication scope: ${leadResult.error.message}`)
  const leadRoomIds = ((leadResult.data ?? []) as LeadRow[]).map(row => row.room_id)
  const governanceRooms = resolveGovernanceRooms({ roles, rooms, grants, leadRoomIds })
  if (governanceRooms.length === 0) redirect('/admin/playbook')
  const roomIds = governanceRooms.map(room => room.id)

  const [subgroupResult, entryResult, gamePlanResult, readingSchemaResult] = await Promise.all([
    service.from('playbook_sub_groups').select('id, room_id, key').in('room_id', roomIds),
    service
      .from('playbook_entries')
      .select(PUBLICATION_ENTRY_SELECT)
      .in('room_id', roomIds),
    service.from('member_game_plan_templates').select('key').eq('active', true),
    service.from('playbook_reading_assignments').select('id').limit(1),
  ])
  if (subgroupResult.error) throw new Error(`Failed to load Playbook publication subgroups: ${subgroupResult.error.message}`)
  if (gamePlanResult.error) throw new Error(`Failed to load connected Gameplans: ${gamePlanResult.error.message}`)
  const documentSchemaReady = !entryResult.error
  const readingSchemaReady = !readingSchemaResult.error
  if (entryResult.error && !isMissingPlaybookActivationSchema(entryResult.error)) throw new Error(`Failed to load Playbook publication metadata: ${entryResult.error.message}`)
  if (readingSchemaResult.error && !isMissingPlaybookActivationSchema(readingSchemaResult.error)) throw new Error(`Failed to verify Playbook reading operations: ${readingSchemaResult.error.message}`)

  if (!documentSchemaReady || !readingSchemaReady) {
    return (
      <main className="mx-auto w-full max-w-[1180px] px-6 py-[30px] pb-[60px] lg:px-9">
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">Playbook publication</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-[-.02em] text-[color:var(--ink)]">Doctrine Readiness</h1>
        <PublicationActivationGate documentSchemaReady={documentSchemaReady} readingSchemaReady={readingSchemaReady} />
      </main>
    )
  }

  const items = assessPublicationManifest({
    rooms,
    subgroups: (subgroupResult.data ?? []) as Array<{ id: string; room_id: string; key: string }>,
    entries: (entryResult.data ?? []) as Array<{ id: string; room_id: string; title: string; slug: string | null; status: string; source_path: string | null; source_hash: string | null; draft_source_hash: string | null }>,
    leadRoomIds,
    leadership,
    gamePlanKeys: (gamePlanResult.data ?? []).map(row => row.key as string),
  })
  const pilotManifest = PLAYBOOK_PUBLICATION_MANIFEST.find(item => item.key === DOCTRINE_PILOT_KEY)
  const pilotRoom = rooms.find(room => room.key === pilotManifest?.roomKey)
  let packageUnlocked = false
  if (pilotManifest && pilotRoom) {
    const { data: pilotEntries, error: pilotError } = await service
      .from('playbook_entries')
      .select('title, status, source_path')
      .eq('room_id', pilotRoom.id)
    if (pilotError) throw new Error(`Failed to verify the A&R doctrine pilot: ${pilotError.message}`)
    packageUnlocked = isDoctrinePackageUnlocked({
      pilot: pilotManifest,
      entries: (pilotEntries ?? []) as Array<{ title: string; status: string; source_path: string | null }>,
    })
  }

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 py-[30px] pb-[60px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">Playbook publication</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-[-.02em] text-[color:var(--ink)]">Doctrine Readiness</h1>
      <p className="mt-2 max-w-[76ch] text-[13px] leading-6 text-[color:var(--ink-3)]">
        A metadata-only preflight for the approved doctrine package. This queue never bulk-publishes: every source still enters its room as a reviewable draft and follows the ordinary approval workflow.
      </p>
      <PublicationReadinessQueue items={items} uatChecks={[...PUBLICATION_UAT_CHECKS]} packageUnlocked={packageUnlocked} />
    </main>
  )
}
