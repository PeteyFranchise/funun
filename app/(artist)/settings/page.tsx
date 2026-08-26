import { RightsContractsSections } from '@/components/profile/RightsContractsSections'

export const dynamic = 'force-dynamic'

// The "Rights & contracts" tab. The heading, container, tab bar, profile
// fetch, and form provider all live in app/(artist)/settings/layout.tsx —
// this page is only the field group.
export default function SettingsPage() {
  return <RightsContractsSections />
}
