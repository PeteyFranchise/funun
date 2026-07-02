import { createServiceClient } from '@/lib/supabase/server'
import AuthLayout from '@/app/(auth)/layout'
import { ClaimButton } from '@/components/curators/ClaimButton'

// Public page — no auth required. /curators/claim is intentionally absent
// from middleware.ts's isProtected list, same convention as /approve and
// /join (D-15/D-08 elsewhere in this codebase). Force-dynamic because the
// claim-token lookup must happen per-request.
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
}

// ─── /curators/claim/[token] ─────────────────────────────────────────
// Curator claim entry point (PITCH-05). Server-verifies the token's
// validity (unclaimed, unexpired) before rendering the CTA — an
// invalid/expired/already-used token gets muted error copy with no CTA.
export default async function ClaimPage({ params }: Props) {
  const { token } = await params
  const service = createServiceClient()
  const now = new Date().toISOString()

  const { data: curator } = await service
    .from('curators')
    .select('id, claimed_by, claim_token_expires_at')
    .eq('claim_token', token)
    .maybeSingle()

  const valid =
    !!curator &&
    !curator.claimed_by &&
    (!curator.claim_token_expires_at || curator.claim_token_expires_at >= now)

  return (
    <AuthLayout>
      {valid ? (
        <div className="rounded-[18px] border border-white/10 bg-card p-6 text-center">
          <h1 className="text-lg font-extrabold text-white">Claim your curator profile</h1>
          <p className="mt-2 text-sm text-white/70">
            Take ownership of your directory listing — edit your genre focus, playlist
            details, and submission notes yourself, and see the pitches you&apos;ve
            received.
          </p>
          <div className="mt-6">
            <ClaimButton token={token}>Claim your profile</ClaimButton>
          </div>
        </div>
      ) : (
        <div className="rounded-[18px] border border-white/10 bg-card p-6 text-center">
          <p className="text-sm text-white/50">
            This link has expired or was already used. Contact Funūn if you believe this
            is a mistake.
          </p>
        </div>
      )}
    </AuthLayout>
  )
}
