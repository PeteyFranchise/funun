'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { QuickIdeaCapture } from '@/components/ideas/QuickIdeaCapture'
import { writerRoomIdFromPath } from '@/lib/ideas/global-capture'

export function GlobalQuickCaptureDock({ onClose }: { onClose: () => void }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const currentWorkId = writerRoomIdFromPath(pathname)
  const [captureKey, setCaptureKey] = useState(0)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [saved, setSaved] = useState<{ ideaId: string; recordingId: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState('')
  const reportBusy = useCallback((busy: boolean) => setCaptureBusy(busy), [])

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || captureBusy) return
      onClose()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [captureBusy, onClose])

  function close() {
    if (!captureBusy) onClose()
  }

  async function addToRoom() {
    if (!saved || !currentWorkId) return
    setSending(true)
    setError('')
    const response = await fetch(`/api/ideas/${saved.ideaId}/recordings/${saved.recordingId}/add-to-work`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workId: currentWorkId }),
    })
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      setError(body?.error ?? 'Could not add this take to the Writer’s Room.')
      setSending(false)
      return
    }
    setAdded(true)
    setSending(false)
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="global-capture-title" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
      <div className="w-full max-w-xl rounded-t-[28px] border border-white/10 bg-card p-5 shadow-2xl sm:rounded-[28px] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[.22em] text-lav">Quick Capture</div>
            <h2 id="global-capture-title" className="mt-2 text-2xl font-black">Catch the sound.</h2>
            <p className="mt-1 text-sm text-white/45">It saves to your private Ideas first.</p>
          </div>
          <button type="button" onClick={close} disabled={captureBusy} aria-label="Close Quick Capture" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/45 hover:text-white disabled:opacity-25">×</button>
        </div>

        {!saved ? (
          <div className="mt-5">
            <QuickIdeaCapture
              key={captureKey}
              compact
              autoStart
              onBusyChange={reportBusy}
              onSaved={(ideaId, recordingId) => setSaved({ ideaId, recordingId })}
            />
            <p className="mt-3 text-center text-[11px] text-white/30">Pause, mark a moment, or stop. Everything else can wait.</p>
          </div>
        ) : (
          <div className="mt-7 rounded-2xl border border-lav/25 bg-lav/5 p-5">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-lav/20 text-lav">✓</span><div><div className="font-bold">Saved to Ideas</div><div className="text-xs text-white/45">The original capture is safe.</div></div></div>
            {added ? <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-sm text-white/65">Also added to this Writer’s Room.</p> : null}
            {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={onClose} className="rounded-xl bg-white px-4 py-3 font-bold text-black">Done</button>
              <button type="button" onClick={() => { setSaved(null); setAdded(false); setError(''); setCaptureKey(value => value + 1) }} className="rounded-xl border border-white/15 px-4 py-3 font-bold">Record another</button>
              <button type="button" onClick={() => { router.push(`/ideas?idea=${saved.ideaId}`); onClose() }} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/70">Open idea</button>
              {currentWorkId && !added ? <button type="button" onClick={() => void addToRoom()} disabled={sending} className="rounded-xl border border-lav/40 bg-lav/10 px-4 py-3 text-sm font-bold text-lav disabled:opacity-50">{sending ? 'Adding…' : 'Add to this Writer’s Room'}</button> : null}
            </div>
            {currentWorkId ? <p className="mt-4 text-xs text-white/35">Adding the take records provenance only. It does not set rights, splits, or approvals.</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
