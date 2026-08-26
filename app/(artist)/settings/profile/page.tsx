import { PublicProfileSections } from '@/components/profile/PublicProfileSections'
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm'

export const dynamic = 'force-dynamic'

// The "Public profile" tab. Privacy sits here rather than on its own tab
// because it governs exactly what this group publishes — but it stays its
// own form writing to its own endpoint (see PrivacySettingsForm.tsx).
export default function PublicProfileSettingsPage() {
  return (
    <div className="space-y-12">
      <PublicProfileSections />
      <PrivacySettingsForm />
    </div>
  )
}
