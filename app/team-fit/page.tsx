import { TeamFitQuestionnaire } from '@/components/team-tier/TeamFitQuestionnaire'

// ─── /team-fit — public Team-tier qualification questionnaire ────────────
// Quick task 261004-ttq. No auth check: `/team-fit` is outside every prefix
// in middleware.ts's isProtected list, so a visitor with NO Funūn account
// reaches this page directly. Do not add a session gate here.
//
// This page ships as a complete, directly-linkable surface on its own —
// wiring an actual marketing-site CTA to it is a separate follow-up (the
// live Team CTA already reads "Request an invite" and links straight to
// /signup during invite-only beta; there is no "Talk to us" click to
// intercept today).

export default function TeamFitPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-50 blur-[90px]"
        style={{
          background:
            'radial-gradient(48% 40% at 30% 14%,rgba(129,140,248,.30),transparent 62%), radial-gradient(46% 40% at 76% 10%,rgba(217,70,239,.24),transparent 62%)',
        }}
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-card border border-hair bg-[rgba(10,10,12,.86)] shadow-[0_40px_90px_-30px_rgba(0,0,0,.95)] backdrop-blur-[16px]">
        <div className="px-6 pb-[26px] pt-9 sm:px-9">
          <h1 className="text-[21px] font-bold leading-[1.2] tracking-[-.022em] text-white">
            See if Team fits.
          </h1>
          <p className="mt-[5px] text-[13px] leading-[1.55] text-[color:#8b8b97]">
            Three quick questions — no account needed.
          </p>
          <div className="mt-6">
            <TeamFitQuestionnaire />
          </div>
        </div>
      </div>
    </div>
  )
}
