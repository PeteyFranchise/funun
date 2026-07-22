import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { fetchSplitSheetsForUser } from '@/lib/split-sheets/list'
import { SplitSheetList, type SplitSheetListItem } from '@/components/split-sheets/SplitSheetList'

// Force dynamic rendering — user auth state must be read per request
export const dynamic = 'force-dynamic'

// The living-draft list surface (HOME-01) — closes two 18-CONTEXT
// findings: /split-sheets was orphaned (no nav entry reached it), and a
// saved draft was write-only (no list, no detail page, no edit mode).
// Creation moved to /split-sheets/new (Task 2). No subscription/capability
// gate — split sheets are open to industry accounts too (D-20).
export default async function SplitSheetsListPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/signin')

  const rows = await fetchSplitSheetsForUser(supabase, user.id)
  const sheets: SplitSheetListItem[] = rows.map(r => ({
    id: r.id,
    song_name: r.song_name,
    status: r.status as SplitSheetListItem['status'],
    created_at: r.created_at,
    parties: (r.split_sheet_parties ?? []).map(p => ({
      id: p.id,
      name: p.name,
      approval_status: p.approval_status,
    })),
  }))

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 border-b border-white/10 pb-6">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
          Part of{' '}
          <Link href="/contracts" className="text-lav underline-offset-2 hover:underline">
            Contract Locker
          </Link>
        </p>
        <h1 className="text-[22px] font-extrabold text-white">Split Sheets</h1>
        <p className="mt-1 text-sm text-white/50">
          Every split sheet you&rsquo;ve started, sent, or signed — song by song.
        </p>
      </header>

      <SplitSheetList sheets={sheets} />
    </div>
  )
}
