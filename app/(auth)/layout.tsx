import Link from 'next/link'

// Middleware generates a fresh CSP nonce for every request. Authentication
// pages must therefore be rendered per request so Next can copy that nonce to
// its framework scripts. If this route group is statically prerendered, the
// browser rejects the un-nonced hydration scripts and the sign-in form (a
// client component behind Suspense) never appears.
export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            Funūn
          </Link>
          <p className="mt-1 text-sm text-white/50">The operating system for your music career.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
