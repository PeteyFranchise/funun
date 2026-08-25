'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── TodaysPlayBanner (D-31.2-11) ──────────────────────────────────────────
// Always-visible-while-active banner at the top of My Client Partners: each
// client_targeted assignment shows the AE's OWN matching count (server-
// computed by app/(admin)/admin/client-partners/page.tsx via
// matchingClientCount, never fabricated client-side) plus a deep-link into
// the existing 31.1 filtered list (buildAssignmentDeepLink, plan 06); each
// general_task shows its directive content (no posting action — deferred,
// D-31.2-10). Every row reflects its own done/not-done state (no snooze —
// research open-Q2 default). Data + string-action props only (Pitfall 1,
// T-31.1-rsc-func-prop) — the RSC page computes matchingCount/deepLink/done
// server-side; this component only renders + POSTs the plan-06 mark-done
// route.

export type TodaysPlayBannerAssignment = {
  id: string
  kind: 'client_targeted' | 'general_task'
  title: string
  note: string | null
  healthBand: string | null
  pipelineStageKey: string | null
  linkUrl: string | null
  attachmentUrl: string | null
  content: unknown | null
  /** Own-book match count — client_targeted only, null for general_task. */
  matchingCount: number | null
  /** Deep-link into the 31.1 My Client Partners filter — client_targeted only. */
  deepLink: string | null
  /** The CALLING AE's own completion state for this assignment. */
  done: boolean
}

export type TodaysPlayBannerData = {
  playId: string
  title: string
  note: string | null
  assignments: TodaysPlayBannerAssignment[]
} | null

function contentText(content: unknown): string | null {
  if (typeof content === 'string' && content.trim()) return content
  return null
}

export function TodaysPlayBanner({ data }: { data: TodaysPlayBannerData }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Always visible while a play is active — no dismiss/snooze (research
  // open-Q2 default). No active play means nothing renders at all.
  if (!data) return null

  async function markDone(assignmentId: string) {
    setPendingId(assignmentId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/plays/${data!.playId}/assignments/${assignmentId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Couldn't mark this done.")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't mark this done.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div
      className="mb-5 rounded-2xl border p-4"
      style={{ borderColor: 'var(--indigo)', background: 'color-mix(in srgb, var(--indigo) 6%, var(--panel))' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[.05em]"
          style={{ color: 'var(--indigo)', background: 'color-mix(in srgb, var(--indigo) 16%, transparent)' }}
        >
          Today&apos;s play
        </span>
        <h3 className="text-[14.5px] font-bold text-[color:var(--ink)]">{data.title}</h3>
      </div>
      {data.note && <p className="mt-1 text-[12.5px] text-[color:var(--ink-3)]">{data.note}</p>}

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--rose-fg)' }}>
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {data.assignments.map(a => (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-3.5 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold" style={{ color: a.done ? 'var(--ink-3)' : 'var(--ink)' }}>
                  {a.title}
                </span>
                {a.kind === 'client_targeted' && a.matchingCount !== null && (
                  <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10.5px] text-[color:var(--ink-3)]">
                    {a.matchingCount} in your book
                  </span>
                )}
              </div>
              {a.note && <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">{a.note}</p>}
              {a.kind === 'general_task' && contentText(a.content) && (
                <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">{contentText(a.content)}</p>
              )}
              {a.kind === 'general_task' && a.linkUrl && (
                <a
                  href={a.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-[12px] text-[color:var(--indigo)] underline"
                >
                  {a.linkUrl}
                </a>
              )}
              {a.kind === 'general_task' && a.attachmentUrl && (
                <a
                  href={a.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-[12px] text-[color:var(--indigo)] underline"
                >
                  Attachment
                </a>
              )}
            </div>

            {a.kind === 'client_targeted' && a.deepLink && (
              <Link
                href={a.deepLink}
                className="shrink-0 rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)]"
              >
                View clients
              </Link>
            )}

            <button
              type="button"
              onClick={() => markDone(a.id)}
              disabled={a.done || pendingId === a.id}
              className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: a.done ? 'var(--green-fg)' : 'var(--grad)' }}
            >
              {a.done ? '✓ Done' : pendingId === a.id ? 'Marking…' : 'Mark done'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
