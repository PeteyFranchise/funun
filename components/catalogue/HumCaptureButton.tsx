'use client'

import { useEffect, useRef, useState } from 'react'
import { extensionForMime, pickSupportedMimeType } from '@/lib/catalogue/hum-capture'
import type { WorkVersion } from '@/types/catalogue'

// ─── HumCaptureButton — the microphone (sketch 003-B's record circle) ──
//
// Three behaviours here are not optional, per T-37-54/T-37-55/T-37-58:
//
// 1. The microphone track is stopped on every exit path — a successful
//    take, a cancelled one, a getUserMedia/MediaRecorder error, and
//    unmount. A live mic indicator surviving any of those is both a
//    privacy failure and the kind of thing that ends trust in this
//    feature. `stopTracks()` is called from all four places below, and
//    the unmount effect's cleanup is the backstop for anything that
//    reaches this component being torn down mid-take.
// 2. When no candidate codec is supported at all, this component renders
//    NOTHING and tells the parent via `onUnsupported` — capture degrades
//    to the plain upload path (which has no browser-API dependency),
//    it never breaks. ComposerCard's own `supportsCapture` prop
//    (37-10) is fed by exactly this signal.
// 3. A denied microphone permission renders an inline error with a way
//    forward (upload instead), never a dead end — matching sketch 003's
//    honest-skip posture: guidance that cannot be escaped gets escaped
//    dishonestly.
//
// Presentational beyond the recorder itself — the parent decides what
// happens with the created WorkVersion (`onCaptured`); this component
// posts the take and hands the result back, nothing more.

export type HumCaptureButtonProps = {
  workId: string
  onCaptured: (version: WorkVersion) => void
  /**
   * Fired once, when this browser turns out to support no candidate codec
   * at all — the parent's cue to offer the upload path instead of a mic
   * that can never open (mirrors ComposerCard's supportsCapture degrade).
   */
  onUnsupported?: () => void
  /**
   * Injectable, the same seam as `pickSupportedMimeType()`'s own
   * predicate parameter (lib/catalogue/hum-capture.ts) — lets the test
   * suite drive the supported/unsupported branch with no MediaRecorder
   * global present (this repo runs Jest with testEnvironment: 'node', no
   * jsdom). A production caller never passes this; the browser's own
   * check is the default.
   */
  isTypeSupported?: (mime: string) => boolean
  /**
   * Test seam only, mirroring the predicate above: seeds the denied-
   * permission render so the suite can assert the inline error state
   * without a real getUserMedia rejection to drive it — there is no
   * jsdom here to fire one. A production caller never sets this; the
   * real denied state is reached only through startRecording()'s own
   * catch block below.
   */
  initialError?: string | null
}

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

export function HumCaptureButton({
  workId,
  onCaptured,
  onUnsupported,
  isTypeSupported,
  initialError = null,
}: HumCaptureButtonProps) {
  const mimeType = pickSupportedMimeType(isTypeSupported)
  const supported = mimeType !== null

  const [error, setError] = useState<string | null>(initialError)
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startedAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopTracks() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Unmount is one of the four required exit paths (T-37-54) — a take
  // left running when the parent unmounts this component (navigation,
  // the moment closing) must not leave the mic open.
  useEffect(() => {
    return () => {
      stopTimer()
      stopTracks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!supported) onUnsupported?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        void finishRecording(recorder.mimeType || mimeType || '')
      }

      recorder.start()
      startedAtRef.current = Date.now()
      setElapsedSeconds(0)
      setRecording(true)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000))
      }, 500)
    } catch {
      // Covers a denied permission, no input device, or any other
      // getUserMedia/MediaRecorder failure alike — the inline error is
      // the same regardless of which; the way forward (upload) is what
      // matters, not the diagnostic.
      setError('Microphone access was denied or unavailable — you can upload a file instead.')
      stopTracks()
    }
  }

  function stopRecording() {
    stopTimer()
    recorderRef.current?.stop()
    setRecording(false)
  }

  function cancelRecording() {
    stopTimer()
    // Discard whatever was captured — a cancelled take is exit path #2
    // (T-37-54): the mic must release exactly like a completed one.
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null
      recorderRef.current.onstop = null
      if (recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    }
    chunksRef.current = []
    stopTracks()
    setRecording(false)
    setElapsedSeconds(0)
  }

  async function finishRecording(recordedMimeType: string) {
    stopTracks()
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000)
    const blob = new Blob(chunksRef.current, { type: recordedMimeType })
    const ext = extensionForMime(recordedMimeType) ?? 'webm'

    const form = new FormData()
    form.append('file', blob, `hum.${ext}`)
    form.append('source', 'hum')
    form.append('duration', String(durationSeconds))

    setSaving(true)
    try {
      const res = await fetch(`/api/works/${workId}/versions`, { method: 'POST', body: form })
      const body = (await res.json().catch(() => ({}))) as { data?: WorkVersion; error?: string }
      if (!res.ok || !body.data) {
        // Exit path #3 (T-37-54) — an upload failure after the take is
        // already stopped still must not leave the mic open; it already
        // isn't, stopTracks() ran above regardless of outcome.
        setError(body.error ?? 'Could not save the recording — you can upload a file instead.')
        return
      }
      onCaptured(body.data)
    } catch {
      setError('Could not save the recording — you can upload a file instead.')
    } finally {
      setSaving(false)
      chunksRef.current = []
    }
  }

  // Capture degrades, it never breaks: nothing renders here, and the
  // parent was already told via onUnsupported above.
  if (!supported) return null

  if (error) {
    return (
      <div className="rounded-[10px] border border-hair bg-card2 px-[13px] py-[11px] text-center text-[12px]">
        <p className="text-lavdim">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-[8px]">
      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        disabled={saving}
        aria-label={recording ? 'Stop recording' : 'Record'}
        className="flex h-24 w-24 items-center justify-center rounded-full bg-grad text-[30px] text-white shadow-cta disabled:opacity-60"
      >
        ⏺
      </button>
      <p className="text-[11px] text-lavdim">
        {saving ? 'Saving…' : recording ? `recording · ${formatElapsed(elapsedSeconds)}` : 'tap to record · 0:00'}
      </p>
      {recording && (
        <button
          type="button"
          onClick={cancelRecording}
          className="border-0 bg-transparent p-0 text-[11px] text-lavdim underline hover:text-white"
        >
          Cancel
        </button>
      )}
    </div>
  )
}
