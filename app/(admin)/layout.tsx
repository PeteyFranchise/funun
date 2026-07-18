import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  return (
    <div className="flex min-h-screen bg-ink text-white">
      {/* Admin sidebar — lightweight, no ArtistNav reuse */}
      <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-white/10 p-4 pt-6">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
          Admin
        </p>
        <Link
          href="/checklist"
          className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Checklist Items
        </Link>
        <Link
          href="/tips"
          className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Tips
        </Link>
        <Link
          href="/admin/curators"
          className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Curators
        </Link>
        <Link
          href="/admin/members"
          className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Industry Members
        </Link>
        <Link
          href="/admin/green-room-placements"
          className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Green Room Placements
        </Link>
        <Link
          href="/admin/reports"
          className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Reports
        </Link>
        <Link
          href="/admin/verification"
          className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Verification
        </Link>
      </nav>
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
