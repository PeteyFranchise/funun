import type { ActivityKind } from '@/types'

export type ActivityView = {
  id: string
  kind: ActivityKind
  body: string
  createdAt: string
}

export type ActivityState = { items: ActivityView[] }

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const KIND: Record<ActivityKind, { stroke: string; path: React.ReactNode }> = {
  placement: { stroke: '#34D399', path: <path d="M20 6 9 17l-5-5" /> },
  release: { stroke: '#818CF8', path: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></> },
  readiness: { stroke: '#F4C77B', path: <path d="M12 2v4m0 0a6 6 0 0 1 6 6c0 4-3 5-3 8H9c0-3-3-4-3-8a6 6 0 0 1 6-6Z" /> },
  other: { stroke: '#C7CBF7', path: <circle cx="12" cy="12" r="9" /> },
}

export function ActivityFeed({ state }: { state: ActivityState }) {
  return (
    <section className="rounded-[18px] border border-hair bg-card p-7">
      <h2 className="mb-[18px] text-[20px] font-extrabold tracking-[-.01em] text-white">Activity</h2>
      {state.items.length === 0 ? (
        <p className="text-[14px] text-lavdim">No activity yet.</p>
      ) : (
        state.items.map(a => {
          const k = KIND[a.kind] ?? KIND.other
          return (
            <div key={a.id} className="flex gap-4 border-b border-hair py-4 first:pt-0 last:border-none last:pb-0">
              <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] border border-hairstrong bg-card2">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={k.stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  {k.path}
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] leading-[1.5] text-lav">{a.body}</div>
                <div className="mt-[5px] text-[13px] text-lavdim">{timeAgo(a.createdAt)}</div>
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
