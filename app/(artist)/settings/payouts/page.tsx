import { PayoutsOnboarding } from '@/components/settings/PayoutsOnboarding'

export const dynamic = 'force-dynamic'

// The "Payouts" tab. The container and the page heading come from
// app/(artist)/settings/layout.tsx now that all three tabs share them.
export default function PayoutsSettingsPage() {
  return (
    <div>
      <p className="text-sm text-white/50">
        Connect a Stripe account so Funūn can pay your net from sync deals directly to your bank.
      </p>

      <div className="mt-8">
        <PayoutsOnboarding />
      </div>
    </div>
  )
}
