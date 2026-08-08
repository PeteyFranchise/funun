import Link from 'next/link'

// ─── InvitedSpotlightCard ────────────────────────────────────────────────
// Non-dismissible spotlight card shown at the top of the artist dashboard
// while a pending admin_invited sync_library grant exists and the artist
// has not yet added a song (26-CONTEXT.md decision #3: "not dismissible —
// persists until acted on"; 26-UI-SPEC.md Screen B). Server component — no
// client state, no dismiss affordance. Visibility is resolved entirely by
// the caller (app/(artist)/dashboard/page.tsx) from a server-side
// capability_grants + sync_listings read; this component only renders the
// locked copy (26-UI-SPEC.md Per-Surface Copywriting #1).
export function InvitedSpotlightCard() {
  return (
    <section className="rounded-card border border-hairstrong bg-card2 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="gtext inline-block text-[11px] font-semibold uppercase tracking-[.14em]">
            Invitation
          </span>
          <h2 className="mt-2 text-[18px] font-semibold text-white">
            You&apos;re invited to the Sync Library
          </h2>
          <p className="mt-1 max-w-xl text-[14px] text-lav">
            Funūn wants to represent your music for sync licensing. Add songs from your
            Sound Vault and start earning when supervisors license your work.
          </p>
        </div>
        <Link
          href="/vault"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-grad px-5 py-2.5 text-sm font-semibold text-white shadow-cta transition hover:opacity-90"
        >
          Review invitation
        </Link>
      </div>
    </section>
  )
}
