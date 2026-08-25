import { requireStaffPage } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
import { loadRooms } from '@/lib/playbook/rooms'
import { buildGrantMatrix, readRoomGrants } from '@/lib/playbook/access-grants'
import { AccessEditorMatrix } from '@/components/playbook/AccessEditorMatrix'

// ─── Access editor page (31.2-07 Task 1, D-31.2-01) ────────────────────────
// Leadership-only RSC — self-guarded with requireStaffPage(['leadership'])
// before any data read (fail closed, D-02 discipline, mirrors every IT-room
// page's own inline guard). Loads the matrix directly via loadRooms +
// readRoomGrants + buildGrantMatrix — the exact same functions
// app/api/admin/playbook/rooms/route.ts's GET calls — rather than a
// self-HTTP fetch to its own route (T-33-07 precedent: an RSC never calls
// its own API surface over HTTP, it calls the shared lib functions
// directly). AccessEditorMatrix then PATCHes that same route per-cell.
export default async function PlaybookAccessPage() {
  await requireStaffPage(['leadership'])

  const service = createServiceClient()
  const rooms = await loadRooms(service)
  const grantRows = await readRoomGrants(service)
  const matrix = buildGrantMatrix(rooms, grantRows)

  return (
    <div className="mx-auto w-full max-w-[900px] px-[28px] py-[22px] pb-[60px]">
      <h1 className="text-[24px] font-extrabold tracking-[-.02em] text-[color:var(--ink)]">Access</h1>
      <p className="mt-3 max-w-[64ch] text-[15px] text-[color:var(--ink-2)]">
        Toggle which roles can read each Playbook room. Changes take effect immediately — no
        deploy needed. Leadership always has access to every room and is never shown as a
        column here.
      </p>
      <div className="mt-6">
        <AccessEditorMatrix initialMatrix={matrix} />
      </div>
    </div>
  )
}
