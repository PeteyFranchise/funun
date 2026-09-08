'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PlaybookMediaUploader({ rooms }: { rooms: { key: string; label: string }[] }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function upload(form: HTMLFormElement) {
    const data = new FormData(form)
    const file = data.get('file')
    if (!(file instanceof File) || file.size === 0) return setMessage('Choose an MP4 or WebM video.')
    setBusy(true); setMessage('Preparing private upload…')
    const intent = await fetch('/api/admin/playbook/media/upload-intent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomKey: data.get('roomKey'), title: data.get('title'), caption: data.get('caption') || null, transcript: data.get('transcript') || null, mimeType: file.type, sizeBytes: file.size }) })
    const payload = await intent.json().catch(() => ({}))
    if (!intent.ok) { setBusy(false); return setMessage(payload.error ?? 'Could not prepare upload') }
    const stored = await createClient().storage.from('playbook-media').uploadToSignedUrl(payload.data.path, payload.data.token, file, { contentType: payload.data.contentType, upsert: false })
    if (stored.error) { setBusy(false); return setMessage(stored.error.message || 'Private upload failed. Please try again.') }
    const complete = await fetch(`/api/admin/playbook/media/${payload.data.assetId}/complete`, { method: 'POST' })
    const completed = await complete.json().catch(() => ({})); setBusy(false)
    setMessage(complete.ok ? `Ready. Add this secure URL to a video block: ${completed.data.streamUrl}` : completed.error ?? 'Could not finish upload')
  }

  return <form onSubmit={event => { event.preventDefault(); void upload(event.currentTarget) }} className="mt-5 grid gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
    <div className="grid gap-3 md:grid-cols-2"><select name="roomKey" required className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3 text-sm">{rooms.map(room => <option key={room.key} value={room.key}>{room.label}</option>)}</select><input name="title" required maxLength={180} placeholder="Video title" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3 text-sm" /></div>
    <input name="caption" maxLength={1000} placeholder="Caption or learning context" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3 text-sm" />
    <textarea name="transcript" maxLength={50000} placeholder="Transcript (recommended for accessibility and search)" rows={4} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3 text-sm" />
    <input name="file" type="file" accept="video/mp4,video/webm" required className="text-sm" />
    <button disabled={busy} className="w-fit rounded-lg bg-[color:var(--indigo)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Uploading…' : 'Upload private video'}</button>{message && <p className="break-all text-xs text-[color:var(--ink-3)]" aria-live="polite">{message}</p>}
  </form>
}
