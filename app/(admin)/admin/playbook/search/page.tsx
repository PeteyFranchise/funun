import { ALL_STAFF_ROLES } from '@/lib/admin/gate'
import { requireStaffPage } from '@/lib/admin/gate'
import { PlaybookSearch } from '@/components/playbook/PlaybookSearch'

export default async function PlaybookSearchPage() {
  await requireStaffPage(ALL_STAFF_ROLES)
  return <main className="mx-auto w-full max-w-[1000px] px-6 py-[30px] pb-[60px] lg:px-9"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">The Playbook</p><h1 className="mt-1 text-2xl font-extrabold tracking-[-.02em] text-[color:var(--ink)]">Knowledge Finder</h1><p className="mt-2 text-[13px] leading-6 text-[color:var(--ink-3)]">Search every published room you can access and jump directly to the relevant section.</p><PlaybookSearch /></main>
}
