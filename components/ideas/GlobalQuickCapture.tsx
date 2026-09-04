'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { isEditableCaptureTarget, shouldOpenCaptureShortcut } from '@/lib/ideas/global-capture'

const GlobalCaptureDock = dynamic(
  () => import('@/components/ideas/GlobalQuickCaptureDock').then(module => module.GlobalQuickCaptureDock),
  { ssr: false }
)

type GlobalCaptureContextValue = { enabled: boolean; openCapture: () => void }
const GlobalCaptureContext = createContext<GlobalCaptureContextValue | null>(null)

export function GlobalCaptureHeaderButton() {
  const capture = useContext(GlobalCaptureContext)
  if (!capture?.enabled) return null
  return (
    <button
      type="button"
      onClick={capture.openCapture}
      title="Quick Capture (⌘/Ctrl + Shift + U)"
      className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/75 transition hover:border-lav/40 hover:bg-lav/10 hover:text-white sm:flex"
    >
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-brandfuchsia shadow-[0_0_12px_rgba(217,70,239,.7)]" />
      Capture
    </button>
  )
}

export function GlobalQuickCaptureProvider({
  children,
  enabled,
}: {
  children: ReactNode
  enabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const openCapture = useCallback(() => setOpen(true), [])

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldOpenCaptureShortcut({
        key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey, repeat: event.repeat,
        defaultPrevented: event.defaultPrevented,
        editableTarget: isEditableCaptureTarget(event.target),
      })) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  return (
    <GlobalCaptureContext.Provider value={{ enabled, openCapture }}>
      {children}
      {enabled && !open ? (
        <button
          type="button"
          onClick={openCapture}
          aria-label="Quick Capture"
          className="fixed bottom-5 right-5 z-50 grid h-16 w-16 place-items-center rounded-full bg-grad text-2xl text-white shadow-cta sm:hidden"
        >
          ●
        </button>
      ) : null}
      {enabled && open ? <GlobalCaptureDock onClose={() => setOpen(false)} /> : null}
    </GlobalCaptureContext.Provider>
  )
}
