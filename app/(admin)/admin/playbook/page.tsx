import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { hasStaffRole } from '@/lib/admin/gate'

// The Playbook index (Phase 33, 33-05, PLAYBOOK-03, CONTEXT.md "Claude's
// Discretion" URL structure) — sends authorized staff (leadership/it)
// straight to the IT room's opening page, the Monitoring Dashboard (D-06's
// "active, enterable" room). Every other staff role sees a minimal
// "coming soon" landing here: Rail 2 already shows them just the five
// inert ghost rooms (D-05/D-06), so for non-authorized staff The Playbook
// is entirely "coming soon" in v1 -- no client state, no data fetch beyond
// the role read.
export default async function PlaybookIndexPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // hasStaffRole, not getStaffRole: 'it' is LAST in ROLE_PRIORITY, so an IT
  // staffer who also holds any other role has that other role as their primary
  // and would never reach the IT dashboard. Same Pass 6 H-3 mismatch as the
  // sync-library page — the IT routes accept them, this page did not.
  if (user && hasStaffRole(user, ['leadership', 'it'])) {
    redirect('/admin/playbook/it/dashboard')
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-[28px] py-[22px] pb-[60px]">
      <h1 className="text-[24px] font-extrabold tracking-[-.02em] text-[color:var(--ink)]">
        The Playbook
      </h1>
      <p className="mt-3 max-w-[64ch] text-[15px] text-[color:var(--ink-2)]">
        Coming soon. The Playbook is Fun&#363;n&apos;s company-wide wiki --
        SOPs, topics, and plays. The IT Team room is live for IT and
        leadership; every other room is on the way.
      </p>
    </div>
  )
}
