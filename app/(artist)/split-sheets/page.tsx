import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SplitSheetBuilder } from '@/components/split-sheets/SplitSheetBuilder'

// Force dynamic rendering — user auth state must be read per request
export const dynamic = 'force-dynamic'

// Industry split sheet entry point (D-20).
// No subscription gate — any authenticated user can create a split sheet
// (RESEARCH Open Question 2 recommendation). Industry users have no vault
// projects, so SplitSheetBuilder receives no `projects` prop and the sheet
// is always standalone (vault_project_id = null, D-18).
export default async function IndustrySplitSheetsPage() {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/signin')

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 border-b border-white/10 pb-6">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
          Part of{' '}
          <Link href="/contracts" className="text-lav underline-offset-2 hover:underline">
            Contract Locker
          </Link>
        </p>
        <h1 className="text-[22px] font-extrabold text-white">Create Split Sheet</h1>
        <p className="mt-1 text-sm text-white/50">
          Set up split percentages for your collaborators — everyone receives an
          email approval link once you send.
        </p>
      </header>

      <SplitSheetBuilder />
    </div>
  )
}
