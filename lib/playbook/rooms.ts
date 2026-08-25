import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  requireStaff,
  requireStaffPage,
  type RequireStaffPageResult,
} from '@/lib/admin/gate'
import { getStaffRoles, type StaffRole } from '@/lib/admin/staff-role'
import { createServiceClient } from '@/lib/supabase/server'

// ─── lib/playbook/rooms.ts (31.2-03 Task 1, D-31.2-01/03) ─────────────────
// Generalizes Phase 33's hardcoded `requireStaffPage(['leadership','it'])`
// room gates into a DB-backed, additive access layer. Composes (never
// replaces) lib/admin/gate.ts's base staff gate — requireRoomAccess and
// requireRoomAccessPage each call requireStaff/requireStaffPage FIRST to
// establish the caller is staff at all, then layer the room-scoped check
// on top. Leadership always passes WITHOUT a DB read (structural, never
// row-data — Pitfall 5, migration 130's CHECK constraint enforces this at
// the data layer too).

// ─── Types ──────────────────────────────────────────────────────────────

export type PlaybookRoom = {
  id: string
  key: string
  label: string
  sort_order: number
  sensitive: boolean
  coming_soon: boolean
}

type RequireRoomAccessResult = Awaited<ReturnType<typeof requireStaff>>

// ─── Pure predicate (unit-tested surface) ──────────────────────────────────

// Leadership short-circuits true regardless of the grant set (structural,
// never row-data). Every other role passes only if ANY held role is in the
// room's granted-role set (multi-role: any-held-role-passes).
export function canAccessRoom(
  roles: readonly StaffRole[],
  grantedRoles: readonly StaffRole[]
): boolean {
  if (roles.includes('leadership')) return true
  return roles.some(role => grantedRoles.includes(role))
}

// ─── loadRooms — single live source Rail2/layout render from ─────────────

export async function loadRooms(service: SupabaseClient): Promise<PlaybookRoom[]> {
  const { data, error } = await service
    .from('playbook_rooms')
    .select('id, key, label, sort_order, sensitive, coming_soon')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to load playbook rooms: ${error.message}`)
  return (data ?? []) as PlaybookRoom[]
}

// ─── Shared grant lookup ────────────────────────────────────────────────

async function loadGrantedRolesForRoom(
  service: SupabaseClient,
  roomKey: string
): Promise<StaffRole[] | null> {
  const { data: room } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', roomKey)
    .maybeSingle()
  if (!room) return null

  const { data: grants } = await service
    .from('playbook_room_role_grants')
    .select('role')
    .eq('room_id', (room as { id: string }).id)

  return ((grants ?? []) as { role: string }[]).map(g => g.role as StaffRole)
}

// ─── requireRoomAccess — API-route context ────────────────────────────────
// Additive gate composed ON TOP OF requireStaff — never replaces it. Every
// Playbook room/sub-group/entry route must call this independently (nav
// hide is UX only, never the authority — Pitfall 6).
export async function requireRoomAccess(roomKey: string): Promise<RequireRoomAccessResult> {
  const auth = await requireStaff()
  if ('error' in auth) return auth
  if (auth.staffRole === 'leadership') return auth // structural, no DB read (Pitfall 5)

  const service = createServiceClient()
  const grantedRoles = await loadGrantedRolesForRoom(service, roomKey)
  if (!grantedRoles) return { error: 'Forbidden', status: 403 }

  const roles = getStaffRoles(auth.user)
  if (!canAccessRoom(roles, grantedRoles)) return { error: 'Forbidden', status: 403 }

  return auth
}

// ─── requireRoomAccessPage — Server Component page context ───────────────
// Mirrors requireRoomAccess but redirects (page context) instead of
// returning an {error,status} shape (RESEARCH Pitfall 2 — requireStaffPage's
// own precedent). redirect() throws internally and never returns, so a
// caller that gets a value back always has authorized access.
export async function requireRoomAccessPage(roomKey: string): Promise<RequireStaffPageResult> {
  const auth = await requireStaffPage()
  if (auth.staffRole === 'leadership') return auth // structural, no DB read (Pitfall 5)

  const service = createServiceClient()
  const grantedRoles = await loadGrantedRolesForRoom(service, roomKey)
  if (!grantedRoles) redirect('/admin/playbook')

  const roles = getStaffRoles(auth.user)
  if (!canAccessRoom(roles, grantedRoles)) redirect('/admin/playbook')

  return auth
}
