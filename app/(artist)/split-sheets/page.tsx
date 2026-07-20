import Link from 'next/link'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SplitSheetBuilder } from '@/components/split-sheets/SplitSheetBuilder'
import { composeLegalNameFromProfile } from '@/lib/split-sheets/agreement'
import type { MyProfilePrefill } from '@/components/split-sheets/SplitSheetBuilder'

// Force dynamic rendering — user auth state must be read per request
export const dynamic = 'force-dynamic'

// Industry split sheet entry point (D-20).
// No subscription gate — any authenticated user can create a split sheet
// (RESEARCH Open Question 2 recommendation). Industry users have no vault
// projects, so SplitSheetBuilder receives no `projects` prop and the sheet
// is always standalone (vault_project_id = null, D-18).
export default async function IndustrySplitSheetsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/signin')

  // ── "Use my info" prefill source (decision 3a, first link in the
  // auto-populate chain: signer is a Funūn user → artist_profiles).
  // pro/publisher/administrator/legal_* are PRIVATE columns (migration
  // 040) — read via the service client after the session-bound
  // auth.getUser() above already established ownership, mirroring
  // app/(artist)/settings/page.tsx's exact pattern. Best-effort: a
  // missing profile row just means no prefill, never a page error.
  const service = createServiceClient()
  const { data: myProfileRow } = await service
    .from('artist_profiles')
    .select('artist_name, pro, publisher, administrator, legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix')
    .eq('id', user.id)
    .maybeSingle()

  const myProfile: MyProfilePrefill | null = myProfileRow
    ? {
        legalName: composeLegalNameFromProfile(myProfileRow),
        artistName: myProfileRow.artist_name ?? '',
        pro: myProfileRow.pro ?? '',
        publishingDesignee: myProfileRow.publisher ?? '',
        administrator: myProfileRow.administrator ?? '',
      }
    : null

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

      <SplitSheetBuilder myProfile={myProfile} />
    </div>
  )
}
