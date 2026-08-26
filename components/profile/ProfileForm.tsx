'use client'

// ── /profile-preview composition wrapper ────────────────────────────────
// This component now exists for exactly one consumer: app/profile-preview/
// page.tsx, the dev-gated route that renders the WHOLE artist Settings
// experience on one page, against a fabricated profile, with no sign-in.
//
// The real app does not render this. It composes these same three pieces
// across three tab routes under app/(artist)/settings/, with the provider
// mounted in the layout so state survives a tab switch. This wrapper is the
// one place they all appear at once.
//
// Its `{ profile }` signature is load-bearing for that preview page — do not
// change it without editing app/profile-preview/page.tsx, whose dev-only
// guards are text-locked by __tests__/profile-preview-route.test.ts.

import type { UserProfile } from '@/types'
import { SettingsFormProvider } from '@/components/settings/SettingsFormProvider'
import { RightsContractsSections } from '@/components/profile/RightsContractsSections'
import { PublicProfileSections } from '@/components/profile/PublicProfileSections'
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm'

type ProfileFormProps = {
  profile: UserProfile
}

export function ProfileForm({ profile }: ProfileFormProps) {
  return (
    <SettingsFormProvider profile={profile}>
      <div className="space-y-12">
        <RightsContractsSections />
        <PublicProfileSections />
        <PrivacySettingsForm />
      </div>
    </SettingsFormProvider>
  )
}
