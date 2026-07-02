import AuthLayout from '@/app/(auth)/layout'

// Bare /curators/claim (no token) — reached when a curator-portal visitor
// isn't authenticated and has no claim link in hand. Genuine claim links
// always carry a token (/curators/claim/[token]); this page exists so the
// (curator-portal) layout's unauthenticated redirect has a real landing
// spot instead of a 404 (RESEARCH.md Pitfall 3 — never send curators to
// the artist /signin page).
export default function ClaimLandingPage() {
  return (
    <AuthLayout>
      <div className="rounded-[18px] border border-white/10 bg-card p-6 text-center">
        <h1 className="text-lg font-extrabold text-white">Curator sign-in</h1>
        <p className="mt-2 text-sm text-white/70">
          Curators sign in via the claim link sent in a Funūn pitch email. If you&apos;ve
          already claimed your profile, check your email for a magic sign-in link, or
          contact Funūn if you need a new one.
        </p>
      </div>
    </AuthLayout>
  )
}
