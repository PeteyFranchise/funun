'use client'
import Link from 'next/link'
import { useState } from 'react'
export type DoctrineDependencyCard = {
  id: string
  sourceTitle: string
  sourceRevision: number
  roomKey: string
  roomLabel: string
  dependencyKind: string
  targetKind: string
  targetLabel: string
  targetHref: string | null
  stale: boolean
}
export function DoctrineDependencyMap({
  initialItems,
  sources,
}: {
  initialItems: DoctrineDependencyCard[]
  sources: { id: string; title: string; revision: number; roomKey: string }[]
}) {
  const [items] = useState(initialItems)
  const [message, setMessage] = useState('')
  async function create(form: HTMLFormElement) {
    const data = new FormData(form)
    const source = sources.find((x) => x.id === data.get('sourceEntryId'))
    if (!source) return
    const response = await fetch('/api/admin/playbook/dependencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomKey: source.roomKey,
        sourceEntryId: source.id,
        sourceRevision: source.revision,
        dependencyKind: data.get('dependencyKind'),
        targetKind: data.get('targetKind'),
        targetId: data.get('targetId'),
        targetLabel: data.get('targetLabel'),
        targetHref: data.get('targetHref') || null,
      }),
    })
    const body = await response.json().catch(() => ({}))
    setMessage(
      response.ok
        ? 'Dependency registered. Refresh to update the map.'
        : (body.error ?? 'Could not register dependency')
    )
  }
  return (
    <div className="mt-6 space-y-5">
      <details className="rounded-xl border border-[color:var(--border)] p-4">
        <summary className="cursor-pointer font-bold">
          Register a downstream dependency
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void create(e.currentTarget)
          }}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <select
            name="sourceEntryId"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          >
            {sources.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title} · r{x.revision}
              </option>
            ))}
          </select>
          <select
            name="dependencyKind"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          >
            {[
              'required',
              'reference',
              'automation',
              'training',
              'policy_overlay',
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            name="targetKind"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          >
            {[
              'entry',
              'learning_path',
              'workflow_template',
              'simulation',
              'crm_surface',
              'workspace_surface',
              'integration',
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            name="targetId"
            required
            placeholder="Stable target ID"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          />
          <input
            name="targetLabel"
            required
            placeholder="Human-readable target"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          />
          <input
            name="targetHref"
            placeholder="Optional internal path"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          />
          <button className="w-fit rounded-lg bg-[color:var(--indigo)] px-4 py-2 font-bold text-white">
            Register dependency
          </button>
          {message && (
            <p className="text-sm text-[color:var(--ink-3)]">{message}</p>
          )}
        </form>
      </details>
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className={`rounded-xl border p-4 ${item.stale ? 'border-amber-400/40' : 'border-[color:var(--border)]'}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[220px] flex-1">
                <p className="text-xs uppercase text-[color:var(--ink-3)]">
                  {item.roomLabel}
                </p>
                <h2 className="font-bold">
                  {item.sourceTitle} · revision {item.sourceRevision}
                </h2>
              </div>
              <span aria-hidden>→</span>
              <div className="min-w-[220px] flex-1">
                <p className="text-xs uppercase text-[color:var(--ink-3)]">
                  {item.targetKind} · {item.dependencyKind}
                </p>
                {item.targetHref ? (
                  <Link
                    href={item.targetHref}
                    className="font-bold text-[color:var(--indigo)]"
                  >
                    {item.targetLabel}
                  </Link>
                ) : (
                  <p className="font-bold">{item.targetLabel}</p>
                )}
              </div>
              {item.stale && (
                <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
                  Source changed
                </span>
              )}
            </div>
          </article>
        ))}
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-[color:var(--border)] p-10 text-center text-sm text-[color:var(--ink-3)]">
            No registered dependencies yet.
          </p>
        )}
      </div>
    </div>
  )
}
