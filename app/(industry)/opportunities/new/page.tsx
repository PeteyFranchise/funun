import Link from 'next/link'
import { OpportunityForm } from '@/components/antenna/OpportunityForm'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default function NewOpportunityPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/opportunities" className="text-sm text-white/50 transition hover:text-white">
        ← Opportunities
      </Link>
      <header className="mt-4 border-b border-white/10 pb-6">
        <h1 className="text-2xl font-semibold text-white">Post an opportunity</h1>
        <p className="mt-1 text-sm text-white/50">
          Describe what you&rsquo;re looking for. The Antenna scores it against every artist&rsquo;s
          vault and surfaces it to the strongest fits automatically.
        </p>
      </header>

      {DEMO && (
        <p className="mt-6 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          Demo mode — posting is disabled. The form is here to preview the flow.
        </p>
      )}

      <div className="mt-6">
        <OpportunityForm demo={DEMO} />
      </div>
    </div>
  )
}
