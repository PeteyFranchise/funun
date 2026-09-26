import { AuthBanner } from './AuthBanner'

// Middleware generates a fresh CSP nonce for every request. Authentication
// pages must therefore be rendered per request so Next can copy that nonce to
// its framework scripts. If this route group is statically prerendered, the
// browser rejects the un-nonced hydration scripts and the sign-in form (a
// client component behind Suspense) never appears.
export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      {/* globals.css paints the body flat #0a0a0f — without this glow the
          card floats on nothing, the same as the bench. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-50 blur-[90px]"
        style={{
          background:
            'radial-gradient(48% 40% at 30% 14%,rgba(129,140,248,.30),transparent 62%), radial-gradient(46% 40% at 76% 10%,rgba(217,70,239,.24),transparent 62%)',
        }}
      />
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-card border border-hair bg-[rgba(14,13,30,.86)] shadow-[0_40px_90px_-30px_rgba(0,0,0,.95)] backdrop-blur-[16px]">
        <AuthBanner />
        <div className="px-6 pb-[26px] pt-9">{children}</div>
      </div>
    </div>
  )
}
