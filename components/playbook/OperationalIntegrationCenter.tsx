'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  OPERATIONAL_ENTITY_TYPES,
  type OperationalEntityType,
} from '@/lib/playbook/operational-v1'

export type OperationalRun = {
  id: string
  title: string
  roomKey: string
  status: string
}
export type OperationalLink = {
  id: string
  workflowRunId: string
  entityType: string
  entityId: string
  label: string
  href: string
  linkedAt: string
}

export function OperationalIntegrationCenter({
  runs,
  initialLinks,
  initialEntity,
}: {
  runs: OperationalRun[]
  initialLinks: OperationalLink[]
  initialEntity?: { type: OperationalEntityType; id: string }
}) {
  const [links, setLinks] = useState(initialLinks)
  const [message, setMessage] = useState('')

  async function connect(form: HTMLFormElement) {
    const data = new FormData(form)
    const run = runs.find((item) => item.id === data.get('workflowRunId'))
    if (!run) return
    const response = await fetch('/api/admin/playbook/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomKey: run.roomKey,
        workflowRunId: run.id,
        entityType: data.get('entityType'),
        entityId: data.get('entityId'),
      }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok)
      return setMessage(body.error ?? 'Could not connect this record')
    setLinks((current) => [
      {
        id: body.data.linkId,
        workflowRunId: run.id,
        entityType: String(data.get('entityType')),
        entityId: body.data.entityId,
        label: body.data.label,
        href: body.data.href,
        linkedAt: new Date().toISOString(),
      },
      ...current.filter((item) => item.id !== body.data.linkId),
    ])
    setMessage(
      'Connected to the authoritative record. Its original permissions still apply.'
    )
  }

  return (
    <div className="mt-6 space-y-5">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void connect(event.currentTarget)
        }}
        className="grid gap-3 rounded-xl border border-[color:var(--border)] p-4 md:grid-cols-2"
      >
        <label className="text-sm text-[color:var(--ink-3)]">
          Workflow run
          <select
            name="workflowRunId"
            required
            className="mt-1 block w-full rounded-lg bg-[color:var(--panel-2)] p-3 text-[color:var(--ink)]"
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.title} · {run.status}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[color:var(--ink-3)]">
          Record type
          <select
            name="entityType"
            defaultValue={initialEntity?.type}
            className="mt-1 block w-full rounded-lg bg-[color:var(--panel-2)] p-3 text-[color:var(--ink)]"
          >
            {OPERATIONAL_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[color:var(--ink-3)] md:col-span-2">
          Record ID
          <input
            name="entityId"
            required
            defaultValue={initialEntity?.id}
            placeholder="Paste the record UUID"
            className="mt-1 block w-full rounded-lg bg-[color:var(--panel-2)] p-3 text-[color:var(--ink)]"
          />
        </label>
        <button
          disabled={runs.length === 0}
          className="w-fit rounded-lg bg-[color:var(--indigo)] px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          Connect record
        </button>
      </form>
      {message && (
        <p aria-live="polite" className="text-sm text-[color:var(--ink-3)]">
          {message}
        </p>
      )}
      <section>
        <h2 className="font-bold">Connected work</h2>
        <div className="mt-3 space-y-2">
          {links.length === 0 && (
            <p className="text-sm text-[color:var(--ink-3)]">
              No operational records connected yet.
            </p>
          )}
          {links.map((link) => (
            <article
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--border)] p-4"
            >
              <div>
                <p className="text-xs uppercase text-[color:var(--ink-3)]">
                  {link.entityType.replaceAll('_', ' ')}
                </p>
                <p className="font-bold">{link.label}</p>
              </div>
              <Link
                href={link.href}
                className="text-sm font-bold text-[color:var(--indigo)]"
              >
                Open source record →
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
