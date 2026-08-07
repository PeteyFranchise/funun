import { PayoutsOnboarding } from '@/components/settings/PayoutsOnboarding'

export const dynamic = 'force-dynamic'

export default function PayoutsSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-white">Payouts</h1>
      <p className="mt-1 text-sm text-white/50">
        Connect a Stripe account so Funūn can pay your net from sync deals directly to your bank.
      </p>

      <div className="mt-8">
        <PayoutsOnboarding />
      </div>
    </div>
  )
}
