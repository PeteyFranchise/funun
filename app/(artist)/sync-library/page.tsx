export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdmittedSyncListing, loadSyncLibraryHub, type SyncLibraryHubListing } from '@/lib/sync-library/hub-access'
import { SyncLibraryCoachMark } from '@/components/sync-library/SyncLibraryCoachMark'
import type { SyncListingStatus } from '@/types'

// ─── Sync Library hub (26-UI-SPEC.md Screen E, 26-CONTEXT.md) ────────────
// Appears ONLY once the artist has ≥1 admitted song — progressive
// disclosure, earned by getting a first song in. T-26-31: the layout hides
// the nav item, but this page re-checks hasAdmittedSyncListing itself and
// redirects — nav-hiding is never the authority.
//
// Anchored on "In progress" (decision #5, owner 2026-08-07): the workspace
// framing leads the page; Admitted songs + Your agreement sit below as
// reference.

// Static status chips, mirroring components/vault/TrackList.tsx's
// SYNC_CHIP_STATIC exactly (26-UI-SPEC.md Status Chip Semantics) so status
// language is identical wherever a song's sync-library state appears.
// Duplicated locally (not imported) — TrackList.tsx is out of this plan's
// file scope; kept byte-for-byte in sync with its class/label values.
const STATUS_CHIP: Partial<Record<SyncListingStatus, { label: string; badge: string; dot: string }>> = {
  applied: {
    label: 'Submitted',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  invited: {
    label: 'Invited',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  pending_admit: {
    label: 'In review',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  rejected: {
    label: 'Not accepted',
    badge: 'border-rose-400/20 bg-rose-400/5 text-rose-300/80',
    dot: 'bg-rose-400/70',
  },
  withdrawn: {
    label: 'Withdrawn',
    badge: 'border-white/10 bg-white/5 text-lavdim',
    dot: 'bg-white/30',
  },
  removed: {
    label: 'Removed',
    badge: 'border-white/10 bg-white/5 text-lavdim',
    dot: 'bg-white/30',
  },
}

function InProgressRow({ listing }: { listing: SyncLibraryHubListing }) {
  const isInteractiveSign = listing.status === 'agreement_pending'
  const chip = STATUS_CHIP[listing.status]

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{listing.trackTitle}</p>
        <Link
          href={`/vault/${listing.projectId}`}
          className="mt-0.5 block truncate text-xs text-white/40 transition hover:text-white/70"
        >
          {listing.projectTitle}
        </Link>
        {listing.status === 'rejected' && listing.rejectionReason && (
          <p className="mt-1 max-w-xs truncate text-[11px] text-rose-300/60" title={listing.rejectionReason}>
            {listing.rejectionReason}
          </p>
        )}
      </div>

      {isInteractiveSign ? (
        <Link
          href="/sync-library/agreement"
          className="shrink-0 rounded-md bg-grad px-2.5 py-1 text-xs font-semibold text-white shadow-cta transition hover:opacity-90"
        >
          Continue signing
        </Link>
      ) : chip ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${chip.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
          {chip.label}
        </span>
      ) : null}
    </li>
  )
}

function AdmittedRow({ listing }: { listing: SyncLibraryHubListing }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{listing.trackTitle}</p>
        <Link
          href={`/vault/${listing.projectId}`}
          className="mt-0.5 block truncate text-xs text-white/40 transition hover:text-white/70"
        >
          {listing.projectTitle}
        </Link>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
        {listing.admittedAt && (
          <span className="text-[11px] text-white/40">
            Admitted {new Date(listing.admittedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </li>
  )
}

export default async function SyncLibraryHubPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/signin')

  const service = createServiceClient()

  // T-26-31 — re-check independently; nav-hiding alone is never the authority.
  const hasAccess = await hasAdmittedSyncListing(service, user.id)
  if (!hasAccess) redirect('/dashboard')

  const hub = await loadSyncLibraryHub(service, user.id)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sync Library</h1>
          <p className="mt-1 text-sm text-white/50">Songs Funūn is representing for sync licensing.</p>
        </div>
        <Link
          href="/vault"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          Submit another song
        </Link>
      </header>

      {/* "In progress" — the primary anchor (decision #5): pending-admit /
          mid-flow songs lead the page. */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">In progress</h2>
        {hub.inProgress.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">
            Nothing in progress right now — every submitted song has been decided.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {hub.inProgress.map(listing => (
              <InProgressRow key={listing.id} listing={listing} />
            ))}
          </ul>
        )}
      </section>

      {/* "Admitted songs" — reference, sits below the workspace anchor. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Admitted songs</h2>
        {hub.admitted.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">No songs admitted yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {hub.admitted.map(listing => (
              <AdmittedRow key={listing.id} listing={listing} />
            ))}
          </ul>
        )}
      </section>

      {/* "Your agreement" — signed date + the file link, mirrors
          DocumentCard.tsx's file_url -> View PDF idiom. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Your agreement</h2>
        {hub.agreement ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-white">
              Signed {new Date(hub.agreement.signedAt).toLocaleDateString()}
            </p>
            <p className="mt-0.5 text-xs text-white/40">Agreement version {hub.agreement.version}</p>
            {hub.agreement.fileUrl && (
              <a
                href={hub.agreement.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-300 underline hover:text-indigo-200"
              >
                View agreement PDF
              </a>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/40">No signed agreement on file.</p>
        )}
      </section>

      <SyncLibraryCoachMark userId={user.id} />
    </div>
  )
}
