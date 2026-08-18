export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { CrateRequestsFeed } from '@/components/admin/CrateRequestsFeed'

// ─── /admin/crate-requests — the Crate Requests demand inbox (R10) ────────
// Explicit per-page staff check (project convention — the layout redirect
// is not the sole authority; lib/admin/gate.ts). Data itself is fetched
// client-side by CrateRequestsFeed from GET /api/admin/crate-requests
// (own-book-scoped for AE/BD, unscoped for leadership — T-31-25), so this
// page owns gating + chrome only, never a second, parallel data read.
//
// Absorbs the read-only Lead Engine (app/(admin)/admin/lead-engine) per
// R10 — that route now redirects here rather than rendering a second feed.

export default async function CrateRequestsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  // CR-01 hardening: 'it' is read-only Playbook-IT-room staff and must not
  // reach the Crate Requests demand inbox — excluded alongside no-role.
  if (!role || role === 'it') redirect('/')

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-[21px] font-medium text-[color:var(--ink)]">Crate Requests</h1>
      <p className="mb-4 mt-1 max-w-2xl text-[12.5px] text-[color:var(--ink-3)]">
        What your clients are doing in The Crate — briefs, repeat searches, and Selects activity, and who did it.
        Your earliest signal of which client is actively looking for music.
      </p>
      <CrateRequestsFeed />
    </div>
  )
}
