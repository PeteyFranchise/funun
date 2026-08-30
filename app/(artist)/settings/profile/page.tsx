import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { DEMO_PROFILE } from '@/lib/profile/demo-profile'
import { PublicProfileSections } from '@/components/profile/PublicProfileSections'
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm'
import { HandleSettingsForm } from '@/components/profile/HandleSettingsForm'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// The "Public profile" tab. Privacy sits here rather than on its own tab
// because it governs exactly what this group publishes — but it stays its
// own form writing to its own endpoint (see PrivacySettingsForm.tsx). Handle
// follows the identical shape: its own read here, its own form, its own
// endpoint (see HandleSettingsForm.tsx) — deliberately not read off the
// SettingsFormProvider context, mirroring how Privacy is handled on this
// same page.
export default async function PublicProfileSettingsPage() {
  let currentHandle: string | null = null

  if (DEMO) {
    currentHandle = DEMO_PROFILE.handle
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      // Ownership established via the session-bound client's auth.getUser()
      // above; the read itself runs on the service-role client, same pattern
      // as app/(artist)/settings/layout.tsx's profile fetch (D-19).
      const service = createServiceClient()
      const { data } = await service
        .from('user_profiles')
        .select('handle')
        .eq('id', user.id)
        .maybeSingle()
      currentHandle = (data?.handle as string | null | undefined) ?? null
    }
  }

  return (
    <div className="space-y-12">
      <PublicProfileSections />
      <HandleSettingsForm currentHandle={currentHandle} />
      <PrivacySettingsForm />
    </div>
  )
}
