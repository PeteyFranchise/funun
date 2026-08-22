import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { ADMIN_THEME_COOKIE, readAdminTheme } from '@/lib/admin/theme'
import { ADMIN_CONSOLE_CSS } from '@/components/admin/console-theme'
import { AdminNav } from '@/components/nav/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  // Widened (Phase 25, D-01): any staff role is admitted here — every
  // leadership-only page under /admin/* still carries its own inline
  // leadership self-guard (verified 25-06 Task 3), so this layout gate is
  // deliberately NOT the sole authority (Pitfall 3).
  const role = getStaffRole(user)
  if (!role) redirect('/')

  // 25-08: dark is the Team Console default; the cookie is read server-side so
  // `data-theme` is correct on the very first paint (no flash) — same
  // discipline as the buyer portal layout's readBuyerTheme.
  const cookieStore = await cookies()
  const theme = readAdminTheme(cookieStore.get(ADMIN_THEME_COOKIE)?.value)

  return (
    <div className="fncon" data-theme={theme}>
      <style>{ADMIN_CONSOLE_CSS}</style>
      <div className="flex min-h-screen bg-[color:var(--ground)] text-[color:var(--ink)]">
        {/* Icon + collapse sidebar (components/nav/AdminNav) — the room list,
            collapse-to-icon-rail, theme toggle, and sign-out all live inside
            that client component; this server layout only resolves the
            authoritative role + first-paint theme and hands them down. */}
        <AdminNav role={role} theme={theme} />
        <div className="flex min-h-screen flex-1 flex-col bg-[color:var(--ground)]">{children}</div>
      </div>
    </div>
  )
}
