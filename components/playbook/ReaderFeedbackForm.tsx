'use client'

import { useState } from 'react'

export function ReaderFeedbackForm({ entryId, roomKey, revision }: { entryId: string; roomKey: string; revision: number }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'question' | 'outdated' | 'suggestion' | 'missing_doctrine'>('question')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch('/api/admin/playbook/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomKey, entryId, revision, kind, body }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not send feedback')
      setBody(''); setMessage('Feedback sent to this room’s improvement queue.')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not send feedback') } finally { setBusy(false) }
  }

  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]"><summary className="cursor-pointer px-4 py-3 text-[13px] font-bold text-[color:var(--ink)]">Question or improvement?</summary><div className="border-t border-[color:var(--border)] p-4"><p className="text-[10.5px] leading-5 text-[color:var(--ink-3)]">This starts a tracked reader-feedback item. It does not edit approved doctrine.</p><div className="mt-3 grid gap-3 sm:grid-cols-[190px_1fr]"><select value={kind} onChange={event => setKind(event.target.value as typeof kind)} aria-label="Feedback kind" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px]"><option value="question">Ask a question</option><option value="outdated">Flag as outdated</option><option value="suggestion">Suggest an improvement</option><option value="missing_doctrine">Report missing guidance</option></select><textarea value={body} onChange={event => setBody(event.target.value)} maxLength={4000} rows={3} placeholder="Give the owner enough context to act…" className="resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px]" /></div><button type="button" disabled={busy || !body.trim()} onClick={submit} className="mt-3 rounded-lg px-4 py-2 text-[11px] font-extrabold text-white disabled:opacity-50" style={{ background: 'var(--grad)' }}>{busy ? 'Sending…' : 'Send feedback'}</button>{message && <p role="status" className="mt-2 text-[11px] text-[color:var(--ink-2)]">{message}</p>}</div></details>
}
