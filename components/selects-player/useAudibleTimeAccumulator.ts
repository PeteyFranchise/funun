'use client'

// ─── useAudibleTimeAccumulator — wraps the pure delta math against a real <audio> element (R13) ─
// The hook from 31.2-RESEARCH Pattern 4, attached to SelectsPlayer.tsx's
// existing `<audio ref={audioRef}>` element (plan 05 wires it there — this
// file only defines the hook). Imports Task 1's pure delta math from
// audible-accumulator.ts; never re-derives the guard logic. NEVER a
// setInterval/Date.now() wall-clock timer as the time source (Pitfall 1) —
// the heartbeat interval here only FLUSHES already-accumulated pending
// seconds, it never itself accumulates time.
//
// Not unit-tested directly — jsdom cannot drive real <audio> timing
// (31.2-RESEARCH Validation Architecture, manual-only row). Its
// correctness rests entirely on audible-accumulator.test.ts's pure-math
// coverage; this hook is a thin, untested-by-design DOM-event wrapper
// around that already-proven logic.

import { useEffect, useRef } from 'react'
import { accountForTick } from './audible-accumulator'

export type AudibleFlushEvent = 'heartbeat' | 'pause' | 'ended' | 'unload'

const HEARTBEAT_INTERVAL_MS = 10_000

export function useAudibleTimeAccumulator(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  onFlush: (deltaSeconds: number, event: AudibleFlushEvent) => void
) {
  const lastTimeRef = useRef<number | null>(null)
  const pendingRef = useRef(0)
  const onFlushRef = useRef(onFlush)
  onFlushRef.current = onFlush

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    function onTimeUpdate() {
      if (!el) return
      const t = el.currentTime
      pendingRef.current += accountForTick(lastTimeRef.current, t, el.seeking)
      lastTimeRef.current = t
    }

    function onSeeking() {
      // Break the contiguity chain — the next timeupdate after a seek
      // starts a fresh anchor rather than counting the jump as a delta.
      lastTimeRef.current = null
    }

    function flush(event: AudibleFlushEvent) {
      if (pendingRef.current > 0) {
        onFlushRef.current(pendingRef.current, event)
        pendingRef.current = 0
      }
    }

    function onPause() {
      flush('pause')
    }

    function onEnded() {
      flush('ended')
    }

    function onBeforeUnload() {
      // sendBeacon-ready: the caller's onFlush is responsible for using
      // navigator.sendBeacon (rather than fetch) for the 'unload' event so
      // the flush survives page teardown.
      flush('unload')
    }

    const heartbeat = setInterval(() => flush('heartbeat'), HEARTBEAT_INTERVAL_MS)

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('seeking', onSeeking)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      clearInterval(heartbeat)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('seeking', onSeeking)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [audioRef])
}
