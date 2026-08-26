import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'
import { DEMO_PROFILE } from '@/lib/profile/demo-profile'
import { SettingsFormProvider } from '@/components/settings/SettingsFormProvider'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// ── Shared chrome for all three settings tabs ───────────────────────────
// The profile fetch and the form provider both live HERE rather than in the
// pages, and that placement is the whole design: App Router partial
// rendering does not unmount a shared layout when navigating between its
// child segments, so the provider's React state survives
// /settings ↔ /settings/profile ↔ /settings/payouts. An edit typed on one
// tab is still in the field when the artist comes back to it.
//
// Accepted cost: /settings/payouts now also triggers this read even though
// it uses none of it. One indexed select is the price of the tab bar
// rendering on the payouts route at all.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  let profile: UserProfile | null = null

  if (DEMO) {
    profile = DEMO_PROFILE
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      // Ownership is established above via the session-bound client's
      // auth.getUser(); the actual read runs on the service-role client
      // (bypasses RLS + migration 040's column grants entirely) filtered
      // by the verified user.id, never client input — mirrors the
      // project's "admin routes independently re-verify is_admin
      // server-side" pattern, applied here to self-service ownership (D-19).
      const service = createServiceClient()
      const { data } = await service
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      profile = (data as UserProfile | null) ?? null
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-sm text-white/50">Manage your legal and artist profile and links.</p>

      {/* The tab bar is INSIDE the provider, not a sibling of it: switching
          tabs saves the tab being left first, so the bar needs to read the
          form state. It still renders in the no-profile branch below, where
          there is nothing to save and it navigates plainly. */}
      {profile ? (
        <SettingsFormProvider profile={profile}>
          <SettingsTabs />
          <div className="mt-8">{children}</div>
        </SettingsFormProvider>
      ) : (
        <>
          <SettingsTabs />
          <div className="mt-8">
            <p className="text-sm text-white/50">
              We couldn't load your profile. Try signing out and back in.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
