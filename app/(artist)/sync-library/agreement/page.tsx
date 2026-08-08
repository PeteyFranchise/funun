import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { mintOrGetBlanketAgreement } from '@/lib/sync-library/mint-agreement'
import { getCurrentBlanketAgreement, BLANKET_AGREEMENT_SIGNED_HEADING, BLANKET_AGREEMENT_SIGNED_BODY } from '@/lib/sync-library/agreement'
import { BlanketAgreementSigningEmbed } from '@/components/sync-library/BlanketAgreementSigningEmbed'

// Force dynamic rendering — user auth state + the artist's own agreement
// row must be read per request.
export const dynamic = 'force-dynamic'

// ─── /sync-library/agreement — blanket-agreement signing page ──────────
// 26-07-PLAN Task 2, 26-UI-SPEC.md Screen D. Reached from a Vault song's
// "Sign agreement" / "Continue signing" chip (self-apply) or the future
// invite flow. Deliberately NOT gated on ≥1 admitted listing — this page
// is reachable pre-admission (it is NOT the Sync Library hub, which IS
// gated that way per 26-CONTEXT.md's progressive-disclosure decision).
//
// get-or-create is idempotent server-side (mintOrGetBlanketAgreement,
// sign-once per artist): an already-signed artist sees the completion
// state directly, never a second embed/mint.
export default async function SyncLibraryAgreementPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/signin')

  const result = await mintOrGetBlanketAgreement(user.id, user.email ?? null)
  const title = getCurrentBlanketAgreement().title

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/vault" className="text-sm text-white/50 transition hover:text-white">
        ← Back to Sound Vault
      </Link>

      <header className="mt-6 border-b border-white/10 pb-6">
        <h1 className="text-[22px] font-semibold text-white">Sign your Sync Library agreement</h1>
      </header>

      <div className="mt-6">
        {!('data' in result.body) ? (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4">
            <p className="text-sm text-rose-300">{result.body.error}</p>
            <Link href="/vault" className="mt-3 inline-block text-sm text-white/50 underline hover:text-white">
              Back to the Sound Vault
            </Link>
          </div>
        ) : result.body.data.status === 'signed' ? (
          <div className="w-full rounded-[18px] border border-emerald-400/30 bg-emerald-400/10 px-6 py-4 text-center">
            <p className="font-semibold text-emerald-400">{BLANKET_AGREEMENT_SIGNED_HEADING}</p>
            <p className="mt-1 text-sm text-white/50">{BLANKET_AGREEMENT_SIGNED_BODY}</p>
            <Link
              href="/vault"
              className="mt-4 inline-block rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              Back to the Sound Vault
            </Link>
          </div>
        ) : result.body.data.embed ? (
          <BlanketAgreementSigningEmbed
            slug={result.body.data.embed.slug}
            src={result.body.data.embed.src}
            title={title}
            signerEmail={user.email ?? undefined}
          />
        ) : (
          <p className="text-sm text-white/50">
            Preparing your agreement — refresh in a moment.
          </p>
        )}
      </div>
    </div>
  )
}
