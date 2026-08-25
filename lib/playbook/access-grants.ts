import type { SupabaseClient } from '@supabase/supabase-js'
import { ALL_STAFF_ROLES, isStaffRole, type StaffRole } from '@/lib/admin/staff-role'
import { logStaffAction } from '@/lib/staff/audit'
import type { PlaybookRoom } from './rooms'

// ─── lib/playbook/access-grants.ts (31.2-03 Task 2, D-31.2-01) ────────────
// Read/write module for the room×role access-editor matrix that backs
// requireRoomAccess (rooms.ts). 'leadership' is structurally excluded —
// never inserted, never rendered as a matrix column — mirrors migration
// 130's `role <> 'leadership'` CHECK constraint at the code layer
// (Pitfall 5: last-admin protection is structural, not a runtime check).
// Every grant change writes exactly one staff_audit_log entry via
// logStaffAction (D-31.2-01 audit guardrail).

// ─── Types ──────────────────────────────────────────────────────────────

// Every StaffRole except 'leadership' — the only roles the access-editor
// matrix may ever grant/render a column for.
export type GrantableRole = Exclude<StaffRole, 'leadership'>

export const GRANTABLE_ROLES: GrantableRole[] = ALL_STAFF_ROLES.filter(
  (role): role is GrantableRole => role !== 'leadership'
)

export type RoomGrantRow = { room_id: string; role: string }

export type RoomGrantMatrixEntry = {
  room: PlaybookRoom
  grants: Record<GrantableRole, boolean>
}

export type RoomGrantMatrix = RoomGrantMatrixEntry[]

// ─── Pure predicate + matrix builder (unit-tested surface) ────────────────

// Rejects 'leadership' and any non-StaffRole value up front — the guard the
// write path (setRoomGrant/removeRoomGrant) and the PATCH route both call
// BEFORE touching the DB, so a leadership target is refused structurally,
// never stored-then-cleaned-up.
export function isGrantableRole(role: unknown): role is GrantableRole {
  return isStaffRole(role) && role !== 'leadership'
}

// Folds rooms + raw grant rows into the room×role boolean matrix the access
// editor renders. NEVER emits a leadership column — GRANTABLE_ROLES already
// excludes it, so there is no leadership key to accidentally toggle/persist
// (Pitfall 5).
export function buildGrantMatrix(
  rooms: readonly PlaybookRoom[],
  grantRows: readonly RoomGrantRow[]
): RoomGrantMatrix {
  const grantedSet = new Set(grantRows.map(row => `${row.room_id}:${row.role}`))

  return rooms.map(room => {
    const grants = {} as Record<GrantableRole, boolean>
    for (const role of GRANTABLE_ROLES) {
      grants[role] = grantedSet.has(`${room.id}:${role}`)
    }
    return { room, grants }
  })
}

// ─── readRoomGrants — all grant rows ───────────────────────────────────────

export async function readRoomGrants(service: SupabaseClient): Promise<RoomGrantRow[]> {
  const { data, error } = await service.from('playbook_room_role_grants').select('room_id, role')
  if (error) throw new Error(`Failed to load playbook room grants: ${error.message}`)
  return (data ?? []) as RoomGrantRow[]
}

// ─── setRoomGrant / removeRoomGrant — the audited write path ──────────────

type GrantWriteArgs = { roomId: string; role: string; actorId: string }
type GrantWriteResult = { ok: boolean; error?: string }

export async function setRoomGrant(
  service: SupabaseClient,
  args: GrantWriteArgs
): Promise<GrantWriteResult> {
  if (!isGrantableRole(args.role)) {
    return { ok: false, error: 'Role is not grantable' }
  }

  const { error } = await service
    .from('playbook_room_role_grants')
    .upsert(
      { room_id: args.roomId, role: args.role, created_by: args.actorId },
      { onConflict: 'room_id,role' }
    )
  if (error) return { ok: false, error: error.message }

  // Unconditional — mirrors D-04's "log even idempotent actions" discipline.
  await logStaffAction(service, {
    actorId: args.actorId,
    action: 'grant_playbook_room_role',
    targetType: 'playbook_room_role_grants',
    targetId: args.roomId,
    changes: { room_id: args.roomId, role: args.role },
  })

  return { ok: true }
}

export async function removeRoomGrant(
  service: SupabaseClient,
  args: GrantWriteArgs
): Promise<GrantWriteResult> {
  if (!isGrantableRole(args.role)) {
    return { ok: false, error: 'Role is not grantable' }
  }

  const { error } = await service
    .from('playbook_room_role_grants')
    .delete()
    .eq('room_id', args.roomId)
    .eq('role', args.role)
  if (error) return { ok: false, error: error.message }

  await logStaffAction(service, {
    actorId: args.actorId,
    action: 'revoke_playbook_room_role',
    targetType: 'playbook_room_role_grants',
    targetId: args.roomId,
    changes: { room_id: args.roomId, role: args.role },
  })

  return { ok: true }
}
