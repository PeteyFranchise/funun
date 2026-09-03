'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { extensionForMime, pickSupportedMimeType } from '@/lib/catalogue/hum-capture'
import { uploadWorkVersion } from '@/lib/catalogue/version-upload-client'
import {
  encodeWav,
  clipOverlapsRange,
  clipTimelineWindow,
  formatRecorderTime,
  renderRoughMix,
  sessionDurationMs,
  waveformPeaks,
  type RecordingClip,
} from '@/lib/catalogue/record-over-beat'
import type { WorkVersion } from '@/types/catalogue'

type Props = {
  workId: string
  baseVersionId: string
  baseDisplay: string
  baseDescription: string
  playbackUrl: string
  onSaved: (version: WorkVersion) => void
  onClose: () => void
}

type ClipUploadIntent = { clipId: string; path: string; token: string; contentType: string }
type RecoveredSession = {
  id: string
  status: 'draft' | 'saved'
  beatGain: number
  vocalGain: number
  timingOffsetMs: number
  base: { id: string; label: string | null; source: string; playbackUrl: string | null; durationSeconds: number | null }
  clips: {
    id: string; playbackUrl: string; startMs: number; durationMs: number; position: number
    trimStartMs: number; trimEndMs: number; muted: boolean; removed: boolean
  }[]
}

function randomId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' ? body.error : fallback
}

export function RecordOverBeatStudio({
  workId,
  baseVersionId,
  baseDisplay,
  baseDescription,
  playbackUrl,
  onSaved,
  onClose,
}: Props) {
  const mimeType = pickSupportedMimeType()
  const [backing, setBacking] = useState<AudioBuffer | null>(null)
  const [clips, setClips] = useState<RecordingClip[]>([])
  const [positionMs, setPositionMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [recording, setRecording] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [beatGain, setBeatGain] = useState(0.85)
  const [vocalGain, setVocalGain] = useState(1)
  const [timingOffsetMs, setTimingOffsetMs] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveStage, setSaveStage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<'loading' | 'saved' | 'saving' | 'offline'>('loading')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'draft' | 'saved'>('draft')
  const [activeBaseVersionId, setActiveBaseVersionId] = useState(baseVersionId)
  const [activeBaseLabel, setActiveBaseLabel] = useState(baseDisplay)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [soloClipId, setSoloClipId] = useState<string | null>(null)
  const [rangeStartMs, setRangeStartMs] = useState(0)
  const [rangeEndMs, setRangeEndMs] = useState(0)
  const [editHistory, setEditHistory] = useState<RecordingClip[][]>([])

  const contextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const clipStartMsRef = useRef(0)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const gainsRef = useRef<{ beat?: GainNode; vocals: GainNode[] }>({ vocals: [] })
  const playbackStartedAtRef = useRef(0)
  const playbackOffsetRef = useRef(0)
  const positionRef = useRef(0)
  const animationRef = useRef<number | null>(null)
  const clipsRef = useRef<RecordingClip[]>([])
  const sessionPromiseRef = useRef<Promise<string> | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const sessionStatusRef = useRef<'draft' | 'saved'>('draft')
  const nextClipPositionRef = useRef(0)
  const lastSyncedSettingsRef = useRef('')
  const recordEndMsRef = useRef<number | null>(null)
  const replacementClipIdsRef = useRef<string[]>([])

  const backingDurationMs = Math.round((backing?.duration ?? 0) * 1000)
  const durationMs = sessionDurationMs(backingDurationMs, clips.filter(clip => !clip.removed), timingOffsetMs)

  useEffect(() => { positionRef.current = positionMs }, [positionMs])
  useEffect(() => { clipsRef.current = clips }, [clips])
  useEffect(() => { if (gainsRef.current.beat) gainsRef.current.beat.gain.value = beatGain }, [beatGain])
  useEffect(() => { gainsRef.current.vocals.forEach(gain => { gain.gain.value = vocalGain }) }, [vocalGain])

  useEffect(() => {
    let cancelled = false
    async function decode(url: string, context: AudioContext) {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Could not load recording audio.')
      return context.decodeAudioData(await response.arrayBuffer())
    }
    async function loadBacking() {
      try {
        const context = new AudioContext()
        contextRef.current = context
        const sessionResponse = await fetch(`/api/works/${workId}/recording-sessions?versionId=${encodeURIComponent(baseVersionId)}`, { cache: 'no-store' })
        const recovered = sessionResponse.ok
          ? ((await sessionResponse.json()) as { data?: RecoveredSession | null }).data ?? null
          : null
        const backingUrl = recovered?.base.playbackUrl ?? playbackUrl
        const decoded = await decode(backingUrl, context)
        const recoveredClips = recovered
          ? await Promise.all(recovered.clips.map(async clip => {
              const response = await fetch(clip.playbackUrl)
              if (!response.ok) throw new Error('Could not restore a vocal section.')
              const blob = await response.blob()
              const buffer = await context.decodeAudioData(await blob.arrayBuffer())
              return {
                id: clip.id, serverId: clip.id, position: clip.position, blob,
                url: URL.createObjectURL(blob), buffer, startMs: clip.startMs, durationMs: clip.durationMs,
                trimStartMs: clip.trimStartMs, trimEndMs: clip.trimEndMs,
                muted: clip.muted, removed: clip.removed,
              }
            }))
          : []
        if (!cancelled) {
          setBacking(decoded)
          if (recovered) {
            setSessionId(recovered.id)
            sessionIdRef.current = recovered.id
            setSessionStatus(recovered.status)
            sessionStatusRef.current = recovered.status
            setActiveBaseVersionId(recovered.base.id)
            setActiveBaseLabel(recovered.base.label?.trim() || 'backing take')
            setBeatGain(recovered.beatGain)
            setVocalGain(recovered.vocalGain)
            setTimingOffsetMs(recovered.timingOffsetMs)
            lastSyncedSettingsRef.current = `${recovered.beatGain}:${recovered.vocalGain}:${recovered.timingOffsetMs}`
            setClips(recoveredClips)
            const audible = recoveredClips.filter(clip => !clip.removed)
            const initialEnd = Math.min(decoded.duration * 1000, audible[0] ? clipTimelineWindow(audible[0]).timelineEndMs : 15000)
            setRangeEndMs(Math.max(1000, initialEnd))
            nextClipPositionRef.current = recovered.clips.reduce((maximum, clip) => Math.max(maximum, clip.position + 1), 0)
          } else {
            setRangeEndMs(Math.min(15000, Math.round(decoded.duration * 1000)))
          }
          setSyncState('saved')
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the backing take.')
          setSyncState('offline')
        }
      }
    }
    void loadBacking()
    return () => {
      cancelled = true
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      sourcesRef.current.forEach(source => { try { source.stop() } catch {} })
      streamRef.current?.getTracks().forEach(track => track.stop())
      clipsRef.current.forEach(clip => URL.revokeObjectURL(clip.url))
      void contextRef.current?.close()
    }
  }, [baseVersionId, playbackUrl, workId])

  useEffect(() => {
    if (!sessionId) return
    const signature = `${beatGain}:${vocalGain}:${timingOffsetMs}`
    if (signature === lastSyncedSettingsRef.current) return
    const timer = setTimeout(async () => {
      setSyncState('saving')
      const response = await fetch(`/api/works/${workId}/recording-sessions/${sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settings', beatGain, vocalGain, timingOffsetMs }),
      }).catch(() => null)
      if (response?.ok) {
        lastSyncedSettingsRef.current = signature
        setSessionStatus('draft')
        sessionStatusRef.current = 'draft'
        setSyncState('saved')
      } else {
        setSyncState('offline')
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [beatGain, sessionId, timingOffsetMs, vocalGain, workId])

  function stopSources() {
    sourcesRef.current.forEach(source => { try { source.stop() } catch {} })
    sourcesRef.current = []
    gainsRef.current = { vocals: [] }
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    setPlaying(false)
  }

  function closeStudio() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.ondataavailable = null
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    stopSources()
    onClose()
  }

  function animatePosition() {
    const context = contextRef.current
    if (!context) return
    const next = Math.max(
      playbackOffsetRef.current,
      playbackOffsetRef.current + (context.currentTime - playbackStartedAtRef.current) * 1000
    )
    if (recordEndMsRef.current !== null && next >= recordEndMsRef.current && recorderRef.current?.state === 'recording') {
      setPositionMs(recordEndMsRef.current)
      positionRef.current = recordEndMsRef.current
      recorderRef.current.stop()
      recordEndMsRef.current = null
      setRecording(false)
      return
    }
    if (next >= durationMs) {
      setPositionMs(durationMs)
      positionRef.current = durationMs
      stopSources()
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      return
    }
    setPositionMs(next)
    positionRef.current = next
    animationRef.current = requestAnimationFrame(animatePosition)
  }

  async function playFrom(startMs = positionRef.current) {
    const context = contextRef.current
    if (!context || !backing) return
    stopSources()
    await context.resume()
    const start = startMs >= durationMs ? 0 : Math.max(0, startMs)
    const when = context.currentTime + 0.04
    const created: AudioBufferSourceNode[] = []

    if (start < backingDurationMs) {
      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = backing
      gain.gain.value = beatGain
      source.connect(gain).connect(context.destination)
      source.start(when, start / 1000)
      created.push(source)
      gainsRef.current.beat = gain
    }

    const vocalGains: GainNode[] = []
    for (const clip of clipsRef.current) {
      if (clip.removed || clip.muted || (soloClipId && clip.id !== soloClipId)) continue
      const window = clipTimelineWindow(clip, timingOffsetMs)
      const clipStart = window.timelineStartMs
      const sourceOffsetMs = window.sourceOffsetMs
      const clipEnd = window.timelineEndMs
      if (clipEnd <= start) continue
      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = clip.buffer
      gain.gain.value = vocalGain
      source.connect(gain).connect(context.destination)
      if (clipStart >= start) source.start(when + (clipStart - start) / 1000, sourceOffsetMs / 1000, window.playableDurationMs / 1000)
      else source.start(when, (sourceOffsetMs + start - clipStart) / 1000, (clipEnd - start) / 1000)
      created.push(source)
      vocalGains.push(gain)
    }
    sourcesRef.current = created
    gainsRef.current.vocals = vocalGains
    playbackOffsetRef.current = start
    playbackStartedAtRef.current = when
    setPositionMs(start)
    positionRef.current = start
    setPlaying(true)
    animationRef.current = requestAnimationFrame(animatePosition)
  }

  async function ensureMicrophone(): Promise<MediaStream> {
    if (streamRef.current?.active) return streamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    streamRef.current = stream
    return stream
  }

  async function beginPunch() {
    if (!mimeType || !backing || recording || countdown !== null) return
    setError(null)
    try {
      const stream = await ensureMicrophone()
      if (!playing) {
        for (let number = 3; number >= 1; number -= 1) {
          setCountdown(number)
          await new Promise(resolve => setTimeout(resolve, 650))
        }
        setCountdown(null)
      }
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data) }
      recorder.onstop = () => { void finishPunch(recorder.mimeType || mimeType) }
      if (!playing) await playFrom(positionRef.current)
      clipStartMsRef.current = positionRef.current
      recorder.start(250)
      setRecording(true)
    } catch {
      setCountdown(null)
      setError('Microphone access was denied or unavailable. Check browser permissions and try again.')
    }
  }

  function stopPunch() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setRecording(false)
  }

  async function finishPunch(recordedMime: string) {
    const blob = new Blob(chunksRef.current, { type: recordedMime })
    chunksRef.current = []
    if (blob.size <= 0) {
      setError('No vocal audio was captured. Check your microphone and try that section again.')
      return
    }
    try {
      const context = contextRef.current
      if (!context) throw new Error('Audio is not ready.')
      const buffer = await context.decodeAudioData(await blob.arrayBuffer())
      const duration = Math.max(1, Math.round(buffer.duration * 1000))
      const clip: RecordingClip = {
        id: randomId(), blob, url: URL.createObjectURL(blob), buffer,
        startMs: Math.round(clipStartMsRef.current), durationMs: duration,
        position: nextClipPositionRef.current++,
        trimStartMs: 0, trimEndMs: 0, muted: false, removed: false,
      }
      setClips(current => [...current, clip])
      setSelectedClipId(clip.id)
      setSyncState('saving')
      try {
        const durableSessionId = await ensureSessionForWrite()
        const serverId = await persistClip(durableSessionId, clip, clip.position ?? 0)
        setClips(current => current.map(item => item.id === clip.id ? { ...item, serverId } : item))
        if (replacementClipIdsRef.current.length > 0) {
          const replacedIds = replacementClipIdsRef.current
          replacementClipIdsRef.current = []
          for (const id of replacedIds) await persistClipEdit(id, { muted: true })
          setClips(current => current.map(item => replacedIds.includes(item.id) ? { ...item, muted: true } : item))
        }
        setSyncState('saved')
      } catch {
        setSyncState('offline')
        setError('This vocal is safe on this device but has not synced yet. Keep this window open and tap Retry sync.')
      }
    } catch {
      setError('That vocal section could not be decoded. Please record it again.')
    }
  }

  async function ensureSessionForWrite(): Promise<string> {
    if (sessionPromiseRef.current) return sessionPromiseRef.current
    const pending = (async () => {
      const currentSessionId = sessionIdRef.current
      if (currentSessionId) {
        if (sessionStatusRef.current === 'saved') {
          const response = await fetch(`/api/works/${workId}/recording-sessions/${currentSessionId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reopen' }),
          })
          if (!response.ok) throw new Error(await errorMessage(response, 'Could not reopen the vocal session.'))
          setSessionStatus('draft')
          sessionStatusRef.current = 'draft'
        }
        return currentSessionId
      }
      const response = await fetch(`/api/works/${workId}/recording-sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersionId: activeBaseVersionId }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, 'Could not create the recording session.'))
      const id = ((await response.json()) as { data: { id: string } }).data.id
      setSessionId(id)
      sessionIdRef.current = id
      setSessionStatus('draft')
      sessionStatusRef.current = 'draft'
      return id
    })()
    sessionPromiseRef.current = pending
    try {
      return await pending
    } finally {
      sessionPromiseRef.current = null
    }
  }

  function seek(nextMs: number) {
    stopSources()
    const next = Math.max(0, Math.min(durationMs, nextMs))
    setPositionMs(next)
    positionRef.current = next
  }

  function rememberEdit() {
    setEditHistory(current => [...current.slice(-9), clipsRef.current.map(clip => ({ ...clip }))])
  }

  async function persistClipEdit(id: string, patch: { removed?: boolean; muted?: boolean; startMs?: number; trimStartMs?: number; trimEndMs?: number }) {
    const clip = clipsRef.current.find(item => item.id === id)
    if (!clip?.serverId) return
    const durableSessionId = await ensureSessionForWrite()
    const response = await fetch(`/api/works/${workId}/recording-sessions/${durableSessionId}/clips/${clip.serverId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'Could not save that vocal edit.'))
  }

  async function editClip(id: string, patch: Partial<Pick<RecordingClip, 'startMs' | 'trimStartMs' | 'trimEndMs' | 'muted' | 'removed'>>, remember = true) {
    if (remember) rememberEdit()
    stopSources()
    setClips(current => current.map(clip => clip.id === id ? { ...clip, ...patch } : clip))
    setSyncState('saving')
    try {
      await persistClipEdit(id, patch)
      setSyncState('saved')
    } catch (cause) {
      setSyncState('offline')
      setError(cause instanceof Error ? cause.message : 'That vocal edit is waiting to sync.')
    }
  }

  function updateClipLocal(id: string, patch: Partial<Pick<RecordingClip, 'startMs' | 'trimStartMs' | 'trimEndMs'>>) {
    stopSources()
    setClips(current => current.map(clip => clip.id === id ? { ...clip, ...patch } : clip))
    setSyncState('saving')
  }

  async function commitClipShape(id: string) {
    const clip = clipsRef.current.find(item => item.id === id)
    if (!clip) return
    try {
      await persistClipEdit(id, {
        startMs: Math.round(clip.startMs),
        trimStartMs: Math.round(clip.trimStartMs ?? 0),
        trimEndMs: Math.round(clip.trimEndMs ?? 0),
      })
      setSyncState(clip.serverId ? 'saved' : 'offline')
    } catch (cause) {
      setSyncState('offline')
      setError(cause instanceof Error ? cause.message : 'That vocal edit is waiting to sync.')
    }
  }

  function removeClip(id: string) {
    void editClip(id, { removed: true })
    if (selectedClipId === id) setSelectedClipId(null)
    if (soloClipId === id) setSoloClipId(null)
  }

  async function undoEdit() {
    const prior = editHistory[editHistory.length - 1]
    if (!prior) return
    const current = clipsRef.current
    setEditHistory(history => history.slice(0, -1))
    setClips(prior)
    setSyncState('saving')
    try {
      for (const clip of current) {
        const old = prior.find(item => item.id === clip.id)
        if (!old) await persistClipEdit(clip.id, { removed: true })
      }
      for (const clip of prior) {
        await persistClipEdit(clip.id, {
          removed: Boolean(clip.removed), muted: Boolean(clip.muted), startMs: clip.startMs,
          trimStartMs: clip.trimStartMs ?? 0, trimEndMs: clip.trimEndMs ?? 0,
        })
      }
      setSyncState('saved')
    } catch {
      setSyncState('offline')
      setError('Undo is visible here but still waiting to sync.')
    }
  }

  async function rerecordRange() {
    if (rangeEndMs - rangeStartMs < 250) {
      setError('Select at least a quarter-second to re-record.')
      return
    }
    rememberEdit()
    replacementClipIdsRef.current = clipsRef.current
      .filter(clip => !clip.removed && !clip.muted && clipOverlapsRange(clip, rangeStartMs, rangeEndMs, timingOffsetMs))
      .map(clip => clip.id)
    recordEndMsRef.current = rangeEndMs
    seek(rangeStartMs)
    await beginPunch()
  }

  async function startNewPunch() {
    recordEndMsRef.current = null
    replacementClipIdsRef.current = []
    await beginPunch()
  }

  async function persistClip(sessionId: string, clip: RecordingClip, position: number): Promise<string> {
    const ext = extensionForMime(clip.blob.type) ?? 'webm'
    const intentResponse = await fetch(`/api/works/${workId}/recording-sessions/${sessionId}/clips/upload-intent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: `vocal-${position + 1}.${ext}`, mimeType: clip.blob.type, size: clip.blob.size }),
    })
    if (!intentResponse.ok) throw new Error(await errorMessage(intentResponse, 'Could not prepare a vocal clip.'))
    const intent = ((await intentResponse.json()) as { data: ClipUploadIntent }).data
    const canonicalBlob = clip.blob.type === intent.contentType ? clip.blob : new Blob([clip.blob], { type: intent.contentType })
    const { error: uploadError } = await createClient().storage.from('track-audio').uploadToSignedUrl(intent.path, intent.token, canonicalBlob, {
      contentType: intent.contentType, upsert: false,
    })
    if (uploadError) throw new Error(`Vocal upload failed: ${uploadError.message}`)
    const completeResponse = await fetch(`/api/works/${workId}/recording-sessions/${sessionId}/clips/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId: intent.clipId, path: intent.path, startMs: Math.round(clip.startMs), durationMs: clip.durationMs, position }),
    })
    if (!completeResponse.ok) throw new Error(await errorMessage(completeResponse, 'Could not retain a vocal clip.'))
    const complete = (await completeResponse.json()) as { data?: { id?: string } }
    return complete.data?.id ?? intent.clipId
  }

  async function retrySync() {
    setSyncState('saving')
    setError(null)
    try {
      const durableSessionId = await ensureSessionForWrite()
      const unsynced = clipsRef.current.filter(clip => !clip.serverId)
      for (const clip of unsynced) {
        const serverId = await persistClip(durableSessionId, clip, clip.position ?? 0)
        setClips(current => current.map(item => item.id === clip.id ? { ...item, serverId } : item))
      }
      if (replacementClipIdsRef.current.length > 0) {
        const replacedIds = replacementClipIdsRef.current
        for (const id of replacedIds) await persistClipEdit(id, { muted: true })
        setClips(current => current.map(item => replacedIds.includes(item.id) ? { ...item, muted: true } : item))
        replacementClipIdsRef.current = []
      }
      setSyncState('saved')
    } catch (cause) {
      setSyncState('offline')
      setError(cause instanceof Error ? cause.message : 'The recording is still waiting to sync.')
    }
  }

  async function saveRoughTake() {
    if (!backing || !clips.some(clip => !clip.removed && !clip.muted) || saving || recording) return
    setSaving(true)
    setError(null)
    stopSources()
    try {
      setSaveStage('Mixing your take…')
      const rendered = await renderRoughMix({ backing, clips, beatGain, vocalGain, timingOffsetMs })
      const mix = encodeWav(rendered)

      setSaveStage('Keeping the raw vocal clips…')
      const durableSessionId = await ensureSessionForWrite()
      for (let index = 0; index < clips.length; index += 1) {
        const clip = clips[index]!
        if (clip.serverId) continue
        const serverId = await persistClip(durableSessionId, clip, clip.position ?? index)
        setClips(current => current.map(item => item.id === clip.id ? { ...item, serverId } : item))
      }

      setSaveStage('Saving the rough take…')
      const version = await uploadWorkVersion({
        workId,
        file: mix,
        fileName: 'rough-vocal-take.wav',
        source: 'recording',
        durationSeconds: rendered.duration,
        label: sessionStatus === 'saved' ? 'Rough vocal revision' : `Rough vocal over ${activeBaseLabel}`,
      })
      const finishResponse = await fetch(`/api/works/${workId}/recording-sessions/${durableSessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderedVersionId: version.id, beatGain, vocalGain, timingOffsetMs }),
      })
      if (!finishResponse.ok) throw new Error(await errorMessage(finishResponse, 'The take saved, but its editing session could not be linked.'))
      setSessionStatus('saved')
      sessionStatusRef.current = 'saved'
      setSyncState('saved')
      onSaved(version)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this rough take.')
    } finally {
      setSaving(false)
      setSaveStage('')
    }
  }

  const activeClips = useMemo(() => clips.filter(clip => !clip.removed).sort((a, b) => a.startMs - b.startMs), [clips])
  const removedClips = useMemo(() => clips.filter(clip => clip.removed), [clips])
  const selectedClip = clips.find(clip => clip.id === selectedClipId) ?? null
  const beatPeaks = useMemo(() => backing ? waveformPeaks(backing, 64) : [], [backing])
  const timelineDurationMs = Math.max(durationMs, 1)
  const selectionLeft = (Math.min(rangeStartMs, timelineDurationMs) / timelineDurationMs) * 100
  const selectionWidth = (Math.max(0, Math.min(rangeEndMs, timelineDurationMs) - Math.min(rangeStartMs, timelineDurationMs)) / timelineDurationMs) * 100
  const selectedWindow = selectedClip ? clipTimelineWindow(selectedClip, timingOffsetMs) : null
  const audibleClips = activeClips.filter(clip => !clip.muted)

  return (
    <div className="w-full max-w-[760px] rounded-[14px] border border-hairstrong bg-card p-4 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brandindigo">Record over this beat</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">{baseDisplay} · {baseDescription}</h2>
          <p className="mt-1 text-[11px] leading-5 text-lavdim">Use headphones for a cleaner take. Tap record on and off to punch sections into one vocal lane.</p>
        </div>
        <button type="button" disabled={saving || syncState === 'saving' || syncState === 'offline'} onClick={closeStudio} aria-label="Close recorder" className="text-[15px] text-lavdim hover:text-white disabled:opacity-40">✕</button>
      </div>

      <div className="relative mt-5 rounded-[11px] border border-hair bg-card2 p-3">
        {countdown !== null && <div className="absolute inset-0 z-10 grid place-items-center rounded-[11px] bg-ink/80 text-[64px] font-bold text-white">{countdown}</div>}
        <div className="flex items-center gap-3">
          <button type="button" disabled={!backing || recording} onClick={() => playing ? stopSources() : void playFrom()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairstrong text-[13px] text-white disabled:opacity-40">{playing ? 'Ⅱ' : '▶'}</button>
          <button type="button" disabled={!backing || !mimeType || saving || (!recording && syncState !== 'saved') || countdown !== null} onClick={recording ? stopPunch : () => void startNewPunch()} className={`h-10 rounded-full px-4 text-[11px] font-semibold text-white shadow-cta disabled:opacity-40 ${recording ? 'bg-red-500' : 'bg-grad'}`}>{recording ? '■ Stop section' : '● Record'}</button>
          <button type="button" disabled={!backing || !mimeType || saving || recording || countdown !== null || syncState !== 'saved' || rangeEndMs - rangeStartMs < 250} onClick={() => void rerecordRange()} className="h-10 rounded-full border border-brandfuchsia/50 px-4 text-[11px] font-semibold text-white hover:bg-brandfuchsia/15 disabled:opacity-40">↺ Re-record selection</button>
          <button type="button" disabled={editHistory.length === 0 || recording || syncState === 'saving'} onClick={() => void undoEdit()} className="text-[10px] font-semibold text-lavdim hover:text-white disabled:opacity-35">Undo</button>
          <span className="ml-auto font-mono text-[13px] text-white">{formatRecorderTime(positionMs)} <span className="text-lavdim">/ {formatRecorderTime(durationMs)}</span></span>
        </div>

        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-[46px_1fr] items-center gap-2">
            <span className="text-[9px] font-semibold uppercase text-lavdim">Beat</span>
            <div className="relative flex h-12 items-center gap-px overflow-hidden rounded-[7px] bg-ink/50 px-2">
              {beatPeaks.map((peak, index) => <span key={index} className="min-w-px flex-1 rounded-full bg-brandindigo/60" style={{ height: `${Math.max(7, peak * 100)}%` }} />)}
              <span className="pointer-events-none absolute inset-y-0 border-x border-white/70 bg-white/10" style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }} />
              <span className="pointer-events-none absolute inset-y-0 w-px bg-white/80" style={{ left: `${(Math.min(positionMs, timelineDurationMs) / timelineDurationMs) * 100}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-[46px_1fr] items-center gap-2">
            <span className="text-[9px] font-semibold uppercase text-lavdim">Vocal</span>
            <div className="relative h-14 overflow-hidden rounded-[7px] border border-hair bg-ink/50">
              <span className="pointer-events-none absolute inset-y-0 z-10 border-x border-white/70 bg-white/10" style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }} />
              {activeClips.map((clip, index) => {
                const window = clipTimelineWindow(clip, timingOffsetMs)
                const left = (Math.max(0, window.timelineStartMs) / timelineDurationMs) * 100
                const width = Math.max(1.5, (window.playableDurationMs / timelineDurationMs) * 100)
                const peaks = waveformPeaks(clip.buffer, 20)
                const selected = selectedClipId === clip.id
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => setSelectedClipId(clip.id)}
                    title={`Select vocal ${index + 1}`}
                    className={`absolute inset-y-1 flex items-center gap-px overflow-hidden rounded-[5px] border px-1 transition ${selected ? 'z-20 border-white bg-brandfuchsia/45' : 'border-brandfuchsia/50 bg-brandfuchsia/25 hover:bg-brandfuchsia/35'} ${clip.muted ? 'opacity-35' : ''} ${soloClipId === clip.id ? 'ring-1 ring-amber-300' : ''}`}
                    style={{ left: `${left}%`, width: `${Math.min(width, Math.max(1.5, 100 - left))}%` }}
                  >
                    {peaks.map((peak, peakIndex) => <span key={peakIndex} className="min-w-px flex-1 rounded-full bg-white/80" style={{ height: `${Math.max(8, peak * 100)}%` }} />)}
                    <span className="absolute bottom-0.5 left-1 text-[7px] font-semibold text-white">{index + 1}{clip.muted ? ' · muted' : ''}</span>
                  </button>
                )
              })}
              <span className="pointer-events-none absolute inset-y-0 z-30 w-px bg-white/80" style={{ left: `${(Math.min(positionMs, timelineDurationMs) / timelineDurationMs) * 100}%` }} />
              {activeClips.length === 0 && <span className="absolute inset-0 grid place-items-center text-[9px] text-lavdim">Your punch-ins will appear here</span>}
            </div>
          </div>
          <div className="relative ml-[54px] h-5">
            <input type="range" min={0} max={timelineDurationMs} step={50} value={Math.min(positionMs, timelineDurationMs)} onChange={event => seek(Number(event.target.value))} aria-label="Recording timeline" className="absolute inset-x-0 top-0 w-full accent-indigo-400" />
          </div>
        </div>

        <div className="mt-3 rounded-[8px] border border-hair bg-ink/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-lavdim">Re-record range</p>
            <p className="font-mono text-[10px] text-white">{formatRecorderTime(rangeStartMs)} — {formatRecorderTime(rangeEndMs)}</p>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-[9px] text-lavdim">In<input type="range" min={0} max={timelineDurationMs} step={50} value={Math.min(rangeStartMs, timelineDurationMs)} onChange={event => setRangeStartMs(Math.min(Number(event.target.value), Math.max(0, rangeEndMs - 250)))} className="ml-2 w-[calc(100%-28px)] accent-indigo-400" /></label>
            <label className="text-[9px] text-lavdim">Out<input type="range" min={0} max={timelineDurationMs} step={50} value={Math.min(rangeEndMs, timelineDurationMs)} onChange={event => setRangeEndMs(Math.max(Number(event.target.value), Math.min(timelineDurationMs, rangeStartMs + 250)))} className="ml-2 w-[calc(100%-34px)] accent-fuchsia-400" /></label>
          </div>
          <p className="mt-1 text-[9px] leading-4 text-lavdim">Choose a section, then re-record it. The earlier performance stays in the session as a muted alternate.</p>
        </div>
      </div>

      {selectedClip && !selectedClip.removed && selectedWindow && (
        <div className="mt-4 rounded-[11px] border border-brandfuchsia/30 bg-card2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-brandfuchsia">Selected vocal</p>
              <p className="mt-1 text-[11px] text-white">{formatRecorderTime(selectedWindow.timelineStartMs)} — {formatRecorderTime(selectedWindow.timelineEndMs)} · {formatRecorderTime(selectedWindow.playableDurationMs)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void editClip(selectedClip.id, { startMs: Math.max(0, selectedClip.startMs - 100) })} className="rounded-md border border-hairstrong px-2 py-1 text-[9px] text-white hover:bg-white/5">−100 ms</button>
              <button type="button" onClick={() => void editClip(selectedClip.id, { startMs: selectedClip.startMs + 100 })} className="rounded-md border border-hairstrong px-2 py-1 text-[9px] text-white hover:bg-white/5">+100 ms</button>
              <button type="button" onClick={() => void editClip(selectedClip.id, { muted: !selectedClip.muted })} className="rounded-md border border-hairstrong px-2 py-1 text-[9px] text-white hover:bg-white/5">{selectedClip.muted ? 'Unmute' : 'Mute'}</button>
              <button type="button" onClick={() => { stopSources(); setSoloClipId(current => current === selectedClip.id ? null : selectedClip.id) }} className="rounded-md border border-hairstrong px-2 py-1 text-[9px] text-white hover:bg-white/5">{soloClipId === selectedClip.id ? 'Clear solo' : 'Solo'}</button>
              <button type="button" onClick={() => removeClip(selectedClip.id)} className="rounded-md border border-red-400/30 px-2 py-1 text-[9px] text-red-200 hover:bg-red-500/10">Remove</button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[9px] text-lavdim">Trim start <span className="float-right font-mono text-white">{selectedClip.trimStartMs ?? 0} ms</span><input type="range" min={0} max={Math.max(0, selectedClip.durationMs - (selectedClip.trimEndMs ?? 0) - 50)} step={10} value={selectedClip.trimStartMs ?? 0} onPointerDown={rememberEdit} onChange={event => updateClipLocal(selectedClip.id, { trimStartMs: Number(event.target.value) })} onPointerUp={() => void commitClipShape(selectedClip.id)} onBlur={() => void commitClipShape(selectedClip.id)} className="mt-2 w-full accent-fuchsia-400" /></label>
            <label className="text-[9px] text-lavdim">Trim end <span className="float-right font-mono text-white">{selectedClip.trimEndMs ?? 0} ms</span><input type="range" min={0} max={Math.max(0, selectedClip.durationMs - (selectedClip.trimStartMs ?? 0) - 50)} step={10} value={selectedClip.trimEndMs ?? 0} onPointerDown={rememberEdit} onChange={event => updateClipLocal(selectedClip.id, { trimEndMs: Number(event.target.value) })} onPointerUp={() => void commitClipShape(selectedClip.id)} onBlur={() => void commitClipShape(selectedClip.id)} className="mt-2 w-full accent-fuchsia-400" /></label>
          </div>
        </div>
      )}

      {removedClips.length > 0 && (
        <details className="mt-3 rounded-[9px] border border-hair bg-card2 px-3 py-2">
          <summary className="cursor-pointer text-[10px] text-lavdim">Removed vocals ({removedClips.length})</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {removedClips.map((clip, index) => <button key={clip.id} type="button" onClick={() => void editClip(clip.id, { removed: false })} className="rounded-md border border-hairstrong px-2 py-1 text-[9px] text-white hover:bg-white/5">Restore vocal {clip.position !== undefined ? clip.position + 1 : index + 1}</button>)}
          </div>
        </details>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-[10px] text-lavdim">Beat level <span className="float-right text-white">{Math.round(beatGain * 100)}%</span><input type="range" min={0} max={1.5} step={0.05} value={beatGain} onChange={event => { setBeatGain(Number(event.target.value)); if (sessionIdRef.current) setSyncState('saving') }} className="mt-2 w-full accent-indigo-400" /></label>
        <label className="text-[10px] text-lavdim">Vocal level <span className="float-right text-white">{Math.round(vocalGain * 100)}%</span><input type="range" min={0} max={1.5} step={0.05} value={vocalGain} onChange={event => { setVocalGain(Number(event.target.value)); if (sessionIdRef.current) setSyncState('saving') }} className="mt-2 w-full accent-fuchsia-400" /></label>
        <label className="text-[10px] text-lavdim">Vocal timing <span className="float-right text-white">{timingOffsetMs > 0 ? '+' : ''}{timingOffsetMs} ms</span><input type="range" min={-500} max={500} step={10} value={timingOffsetMs} onChange={event => { stopSources(); setTimingOffsetMs(Number(event.target.value)); if (sessionIdRef.current) setSyncState('saving') }} className="mt-2 w-full accent-fuchsia-400" /></label>
      </div>

      {!mimeType && <p className="mt-3 text-[11px] text-amber-200">This browser cannot record a supported audio format. You can still upload a take from the main room.</p>}
      {error && <p role="alert" className="mt-3 text-[11px] leading-5 text-red-300">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-4">
        <p className="text-[10px] text-lavdim">
          {syncState === 'loading' ? 'Loading session…' : syncState === 'saving' ? 'Saving…' : syncState === 'offline' ? 'Offline — vocal waiting to sync' : 'Saved'}
          {' · '}{activeClips.length} {activeClips.length === 1 ? 'section' : 'sections'}
          {syncState === 'offline' && <button type="button" onClick={() => void retrySync()} className="ml-2 font-semibold text-brandindigo hover:text-white">Retry sync</button>}
        </p>
        <div className="flex items-center gap-3">
          <button type="button" disabled={saving || syncState === 'saving' || syncState === 'offline'} onClick={closeStudio} className="text-[11px] text-lavdim hover:text-white disabled:opacity-40">{activeClips.length > 0 ? 'Save draft & leave' : 'Cancel'}</button>
          <button type="button" disabled={audibleClips.length === 0 || saving || recording || syncState !== 'saved'} onClick={() => void saveRoughTake()} className="rounded-[9px] bg-grad px-4 py-2 text-[11px] font-semibold text-white shadow-cta disabled:opacity-40">{saving ? saveStage : 'Save rough take'}</button>
        </div>
      </div>
    </div>
  )
}
