'use client'
import { useState } from 'react'
export function SlaRuleForm({
  rooms,
}: {
  rooms: { id: string; label: string }[]
}) {
  const [message, setMessage] = useState('')
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form)
    const response = await fetch('/api/admin/playbook/sla-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workKind: data.get('workKind'),
        roomId: data.get('roomId') || null,
        severity: data.get('severity') ? Number(data.get('severity')) : null,
        acknowledgeMinutes: Number(data.get('acknowledgeMinutes')),
        resolveMinutes: Number(data.get('resolveMinutes')),
      }),
    })
    const body = await response.json().catch(() => ({}))
    setMessage(
      response.ok
        ? 'SLA rule saved.'
        : (body.error ?? 'Could not save SLA rule')
    )
  }
  return (
    <details className="mt-6 rounded-xl border border-[color:var(--border)] p-4">
      <summary className="cursor-pointer font-bold">
        Leadership: configure an SLA
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit(event.currentTarget)
        }}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <select
          name="workKind"
          className="rounded-lg bg-[color:var(--panel-2)] p-3"
        >
          {[
            'reading',
            'learning',
            'feedback',
            'workflow',
            'exception',
            'incident',
            'simulation',
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          name="roomId"
          className="rounded-lg bg-[color:var(--panel-2)] p-3"
        >
          <option value="">All rooms</option>
          {rooms.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <select
          name="severity"
          className="rounded-lg bg-[color:var(--panel-2)] p-3"
        >
          <option value="">Any severity</option>
          {[1, 2, 3, 4].map((x) => (
            <option key={x} value={x}>
              Level {x}
            </option>
          ))}
        </select>
        <input
          name="acknowledgeMinutes"
          type="number"
          min="1"
          defaultValue="240"
          aria-label="Acknowledgement SLA in minutes"
          className="rounded-lg bg-[color:var(--panel-2)] p-3"
        />
        <input
          name="resolveMinutes"
          type="number"
          min="1"
          defaultValue="1440"
          aria-label="Resolution SLA in minutes"
          className="rounded-lg bg-[color:var(--panel-2)] p-3"
        />
        <button className="w-fit rounded-lg bg-[color:var(--indigo)] px-4 py-2 font-bold text-white">
          Save SLA
        </button>
        {message && (
          <p className="text-sm text-[color:var(--ink-3)]">{message}</p>
        )}
      </form>
    </details>
  )
}
