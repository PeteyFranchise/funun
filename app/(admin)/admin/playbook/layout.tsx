import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRoles, type StaffRole } from '@/lib/admin/gate'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { Rail2 } from '@/components/playbook/Rail2'

// Pure-CSS container reflow (Phase 33, 33-05, UI-SPEC "Responsive collapse")
// — below 1000px, Rail 2 stacks above the content column instead of sitting
// beside it. No JS toggle, matching the phase's "URL-driven, no client
// state" principle. Scoped to this layout only (does not touch the shared
// ADMIN_CONSOLE_CSS token block). Rail 2's own internal sub-list treatment
// at this breakpoint is Rail2.tsx's responsibility, not this layout's — it
// is out of this plan's file set (created in 33-04).
const PLAYBOOK_SHELL_CSS = `
.pb-shell{display:flex;width:100%;}
@media (max-width:1000px){
  .pb-shell{flex-direction:column;}
}
`

// Nested /admin/playbook layout (Phase 33, D-05/D-06, PLAYBOOK-03) — renders
// Rail 2 (the Playbook's own secondary sidebar of rooms) beside {children},
// inside the parent admin layout's existing `.fncon` wrapper. That parent
// already injects ADMIN_CONSOLE_CSS and resolves `data-theme` for the whole
// Team Console — this layout adds no new theme provider and no new
// `data-theme` logic, it only extends the shell one level deeper.
//
// Layouts do not share request state with their parent Server Component, so
// the session/role is resolved again here, mirroring
// app/(admin)/layout.tsx's own createServerClient + getUser idiom exactly
// (the parent layout comment notes this same pattern).
//
// DB-driven (31.2-07 Task 2, D-31.2-01/03): rooms + per-room visibility are
// computed here from loadRooms() + the DB grant set (replacing the
// hardcoded canSeeItRoom boolean) — D-31.2-03's "mixed reading" rule:
// leadership sees every room; every other role sees a room if it is
// NOT sensitive (transparency-by-default across teams) OR the caller holds
// a role the room is explicitly granted to (canAccessRoom, same predicate
// requireRoomAccess/requireRoomAccessPage use). This is RENDER-TIME
// VISIBILITY ONLY — it decides which rooms Rail 2 shows for this request.
// It is NOT the access authority: each of the 5 IT-room pages carries its
// own inline requireRoomAccessPage('it-team') self-guard (D-02) before
// touching any observability doc/health data, and the access editor page
// carries its own requireStaffPage(['leadership']) guard. A mis-scoped or
// bypassed Rail 2 render can never grant access on its own.
export default async function PlaybookLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // The parent admin layout already redirects unauthenticated/non-staff
  // users before this layout ever renders (app/(admin)/layout.tsx's own
  // gate) — no redirect needed here, only the render-time role read for
  // Rail 2's per-room visibility decision.
  const roles = user ? getStaffRoles(user) : []

  const service = createServiceClient()
  const rooms = await loadRooms(service)
  const grantRows = await readRoomGrants(service)
  const grantedRolesByRoom = new Map<string, StaffRole[]>()
  for (const row of grantRows) {
    const list = grantedRolesByRoom.get(row.room_id) ?? []
    list.push(row.role as StaffRole)
    grantedRolesByRoom.set(row.room_id, list)
  }

  const visibleRooms = rooms.filter(
    room => !room.sensitive || canAccessRoom(roles, grantedRolesByRoom.get(room.id) ?? [])
  )

  return (
    <>
      <style>{PLAYBOOK_SHELL_CSS}</style>
      <div className="pb-shell">
        <Rail2 rooms={visibleRooms} isLeadership={roles.includes('leadership')} />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </>
  )
}
