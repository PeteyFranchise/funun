'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

// ─── Vendor Health re-check button (260826-2qm) ─────────────────────────
// Minimal client component: calls router.refresh() inside a transition.
// Because the page is force-dynamic, a refresh re-runs the Server
// Component and therefore re-runs every probe — no client-side fetching,
// no duplicate probe logic, and no credential ever moves toward the
// browser. The GET /api/admin/vendor-health route (Task 3) exists for
// programmatic and curl-based checks and is deliberately NOT what this
// button calls.

export function VendorHealthRecheck() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className="flex-none rounded-[8px] border border-[color:var(--border)] px-[10px] py-[5px] text-[11px] font-bold text-[color:var(--ink-2)] transition hover:border-[color:var(--indigo)] hover:text-[color:var(--ink)] disabled:opacity-50"
    >
      {isPending ? 'Re-checking…' : 'Re-check'}
    </button>
  )
}
