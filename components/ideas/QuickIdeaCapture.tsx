'use client'

import { useEffect, useRef, useState } from 'react'
import { extensionForMime, pickSupportedMimeType } from '@/lib/catalogue/hum-capture'
import { uploadIdeaRecording } from '@/lib/ideas/upload-client'
import { newestPendingCapture, removePendingCapture, savePendingCapture, type PendingIdeaCapture } from '@/lib/ideas/pending-capture'

type Marker = { timestampMs: number; label?: string | null }

function elapsed(seconds: number): string {
  const value = Math.max(0, Math.round(seconds))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

async function createIdea(): Promise<string> {
  const localTitle = `Voice idea · ${new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date())}`
  const response = await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: localTitle }) })
  const body = (await response.json().catch(() => null)) as { data?: { id?: string }; error?: string } | null
  if (!response.ok || !body?.data?.id) throw new Error(body?.error ?? 'Could not create the idea.')
  return body.data.id
}

export function QuickIdeaCapture({
  ideaId = null,
  parentRecordingId = null,
  compact = false,
  autoStart = false,
  onBusyChange,
  onSaved,
}: {
  ideaId?: string | null
  parentRecordingId?: string | null
  compact?: boolean
  autoStart?: boolean
  onBusyChange?: (busy: boolean) => void
  onSaved: (ideaId: string, recordingId: string) => void
}) {
  const mimeType = typeof MediaRecorder === 'undefined' ? null : pickSupportedMimeType()
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'paused' | 'saving' | 'saved'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState<PendingIdeaCapture | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const mountedRef = useRef(true)
  const autoStartedRef = useRef(false)
  const downloadUrlRef = useRef<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const markersRef = useRef<Marker[]>([])
  const startedRef = useRef(0)
  const pausedMsRef = useRef(0)
  const pausedAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }
  function stopTracks() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }
  function currentMs() {
    const activePause = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0
    return Math.max(0, Date.now() - startedRef.current - pausedMsRef.current - activePause)
  }

  useEffect(() => {
    mountedRef.current = true
    if (!ideaId) newestPendingCapture().then(setPending).catch(() => undefined)
    return () => {
      mountedRef.current = false
      stopTimer()
      stopTracks()
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    onBusyChange?.(status === 'requesting' || status === 'recording' || status === 'paused' || status === 'saving')
  }, [onBusyChange, status])

  useEffect(() => {
    if (!autoStart || !mimeType || autoStartedRef.current) return
    autoStartedRef.current = true
    void start()
    // Opening the global dock is the user gesture that authorizes this
    // single automatic start. Never retry the microphone from an effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, mimeType])

  async function persist(capture: PendingIdeaCapture) {
    setStatus('saving')
    setError('')
    setPending(capture)
    let protectedLocally = false
    try {
      try {
        await savePendingCapture(capture)
        protectedLocally = true
      } catch {
        // Some private-browser modes disable IndexedDB. Keep the in-memory
        // retry alive and continue the upload instead of blocking capture.
      }
      const targetIdeaId = capture.ideaId ?? await createIdea()
      if (!capture.ideaId) {
        const linkedCapture = { ...capture, ideaId: targetIdeaId }
        if (protectedLocally) await savePendingCapture(linkedCapture).catch(() => undefined)
        setPending(linkedCapture)
      }
      const recording = await uploadIdeaRecording({
        ideaId: targetIdeaId, file: capture.blob, fileName: capture.fileName,
        durationSeconds: capture.durationSeconds, markers: capture.markers,
        parentRecordingId, kind: capture.fileName.startsWith('import') ? 'import' : 'voice',
      })
      if (protectedLocally) await removePendingCapture(capture.id).catch(() => undefined)
      setPending(null)
      setStatus('saved')
      onSaved(targetIdeaId, recording.id)
    } catch (cause) {
      setStatus('idle')
      setError(`${cause instanceof Error ? cause.message : 'Could not save the recording.'} ${protectedLocally ? 'Your take is protected on this device' : 'Your take is still available here'}—tap retry when you’re connected.`)
    }
  }

  async function start() {
    setError('')
    if (!mimeType) {
      inputRef.current?.click()
      return
    }
    try {
      setStatus('requesting')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []
      setMarkers([])
      markersRef.current = []
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const actualType = recorder.mimeType || mimeType
        const blob = new Blob(chunksRef.current, { type: actualType })
        stopTracks()
        if (!blob.size) {
          setStatus('idle')
          setError('No audio was captured. Check your microphone or import a file instead.')
          return
        }
        if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
        const localUrl = URL.createObjectURL(blob)
        downloadUrlRef.current = localUrl
        setDownloadUrl(localUrl)
        const ext = extensionForMime(actualType) ?? 'webm'
        void persist({
          id: crypto.randomUUID(), ideaId, blob, fileName: `voice-idea.${ext}`,
          durationSeconds: Math.round(currentMs() / 1000), markers: markersRef.current,
          savedAt: new Date().toISOString(),
        })
      }
      recorder.start(250)
      startedRef.current = Date.now()
      pausedMsRef.current = 0
      pausedAtRef.current = 0
      setSeconds(0)
      setStatus('recording')
      timerRef.current = setInterval(() => setSeconds(Math.round(currentMs() / 1000)), 500)
    } catch {
      stopTracks()
      setError('Microphone access is unavailable. You can import an audio file instead.')
    }
  }

  function stop() {
    stopTimer()
    if (pausedAtRef.current) pausedMsRef.current += Date.now() - pausedAtRef.current
    pausedAtRef.current = 0
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    setStatus('saving')
  }

  function togglePause() {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      recorder.pause()
      pausedAtRef.current = Date.now()
      setStatus('paused')
    } else if (recorder.state === 'paused') {
      recorder.resume()
      pausedMsRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = 0
      setStatus('recording')
    }
  }

  async function importFile(file: File | null) {
    if (!file) return
    await persist({
      id: crypto.randomUUID(), ideaId, blob: file, fileName: `import-${file.name}`,
      durationSeconds: null, markers: [], savedAt: new Date().toISOString(),
    })
    if (inputRef.current) inputRef.current.value = ''
  }

  const active = status === 'recording' || status === 'paused'
  return (
    <section className={compact ? 'rounded-2xl border border-white/10 bg-black/20 p-4' : 'rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,.18),rgba(20,20,27,.92)_55%)] p-6 sm:p-8'}>
      {!compact && <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[.24em] text-lav">Ideas</p><h1 className="mt-2 text-3xl font-black">Catch it before it disappears.</h1><p className="mt-2 text-sm text-white/50">No title. No setup. Just record.</p></div>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={active ? stop : start} disabled={status === 'requesting' || status === 'saving'} className={`${compact ? 'h-14 w-14 text-xl' : 'h-20 w-20 text-3xl'} grid shrink-0 place-items-center rounded-full bg-grad shadow-cta disabled:opacity-50`} aria-label={active ? 'Stop and save' : 'Record an idea'}>
          {active ? '■' : '●'}
        </button>
        <div className="min-w-[150px]">
          <div className="font-bold">{status === 'requesting' ? 'Opening microphone…' : status === 'recording' ? `Recording · ${elapsed(seconds)}` : status === 'paused' ? `Paused · ${elapsed(seconds)}` : status === 'saving' ? 'Saving your idea…' : status === 'saved' ? 'Idea saved' : ideaId ? 'Add another take' : 'Record an idea'}</div>
          <div className="mt-1 text-xs text-white/45">{active ? 'Stop whenever you have enough.' : 'Your raw capture is enough.'}</div>
        </div>
        {active && <button type="button" onClick={togglePause} className="rounded-full border border-white/15 px-4 py-2 text-sm">{status === 'paused' ? 'Resume' : 'Pause'}</button>}
        {active && <button type="button" onClick={() => { const next = [...markersRef.current, { timestampMs: currentMs() }]; markersRef.current = next; setMarkers(next) }} className="rounded-full border border-white/15 px-4 py-2 text-sm">Mark this moment</button>}
        {!active && status !== 'requesting' && status !== 'saving' && <button type="button" onClick={() => inputRef.current?.click()} className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70">Import audio</button>}
        {downloadUrl && <a href={downloadUrl} download="funun-idea.webm" className="text-xs text-white/50 underline">Keep a local copy</a>}
      </div>
      {markers.length > 0 && active && <p className="mt-3 text-xs text-lav">{markers.length} moment{markers.length === 1 ? '' : 's'} marked</p>}
      {pending && !active && status !== 'saving' && <button type="button" onClick={() => void persist(pending)} className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-black">Retry protected take</button>}
      {error && <p className="mt-4 text-sm text-amber-200">{error}</p>}
      <input ref={inputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.webm" className="hidden" onChange={event => void importFile(event.target.files?.[0] ?? null)} />
    </section>
  )
}
