'use client'

import { useState, useRef } from 'react'

// ─── ExportPackPanel ─────────────────────────────────────────────────────
// Right-side slide-over panel (matching ToolSidePanel.tsx pattern) that lets
// the artist choose how to receive their Export Pack (D-10/D-11/D-12).
//
// Two delivery modes:
//   "Download ZIP now" — POSTs { mode: 'download' }, gets a 5-min signed URL,
//   auto-navigates the browser to it (triggers a direct download from Supabase).
//
//   "Get shareable link" — POSTs { mode: 'share' }, gets a 7-day signed URL,
//   displays a copyable readonly field + "This link expires in 7 days." helper.
//
// Only artifacts that exist for this project are shown in the included list
// (never a grayed "not included" row — D-08 hide-when-absent principle).

type PanelState = 'idle' | 'generating' | 'download-result' | 'link-result' | 'error'

export function ExportPackPanel({
  projectId,
  open,
  onClose,
  artifactLabels,
}: {
  /** The project whose pack to generate. */
  projectId: string
  /** Whether the panel is open. */
  open: boolean
  /** Called when the user dismisses the panel. */
  onClose: () => void
  /** Labels for artifacts that exist — only these are shown in the included list (D-08). */
  artifactLabels: string[]
}) {
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!open) return null

  const busy = panelState === 'generating'

  function resetToIdle() {
    setPanelState('idle')
    setSignedUrl(null)
    setCopied(false)
  }

  async function requestPack(mode: 'download' | 'share') {
    setPanelState('generating')
    setSignedUrl(null)

    try {
      const res = await fetch(`/api/vault/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const json = await res.json() as { data?: { url?: string | null }; error?: string }
      if (!res.ok || !json.data?.url) {
        setPanelState('error')
        return
      }

      setSignedUrl(json.data.url)
      if (mode === 'download') {
        // Auto-navigate — triggers the browser's native download from Supabase Storage
        window.location.href = json.data.url
        setPanelState('download-result')
      } else {
        setPanelState('link-result')
      }
    } catch {
      setPanelState('error')
    }
  }

  function copyLink() {
    if (!signedUrl) return
    navigator.clipboard.writeText(signedUrl).then(() => {
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop — click closes */}
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-hair bg-[#0a0a0f] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-hair p-5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-white">Export pack</h2>
            <p className="mt-1 text-[13.5px] text-lavdim">
              Everything a music supervisor or industry partner needs to place or pay for this song.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-[9px] border border-hairstrong bg-card2 p-[7px] text-lavdim transition hover:text-white"
            aria-label="Close panel"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Included artifacts list — only existing ones (D-08) */}
          <div className="mb-5">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Included</div>
            <ul className="space-y-2">
              {artifactLabels.map(label => (
                <li key={label} className="flex items-center gap-[9px] text-[13px] text-white">
                  {/* Emerald checkmark */}
                  <svg viewBox="0 0 16 16" className="h-4 w-4 flex-none text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8l4 4 6-7" />
                  </svg>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* State-specific content */}
          {panelState === 'idle' && (
            <div className="space-y-3">
              {/* Primary: Download ZIP now */}
              <button
                onClick={() => requestPack('download')}
                disabled={busy}
                className="w-full rounded-[10px] bg-grad px-5 py-3 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                Download ZIP now
              </button>
              {/* Secondary: Get shareable link */}
              <button
                onClick={() => requestPack('share')}
                disabled={busy}
                className="w-full rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                Get shareable link
              </button>
            </div>
          )}

          {panelState === 'generating' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[14px] text-lavdim">
                <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin text-lav" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
                </svg>
                Preparing your pack…
              </div>
              <button
                disabled
                className="w-full rounded-[10px] bg-grad px-5 py-3 text-[15px] font-bold text-white opacity-40"
              >
                Download ZIP now
              </button>
              <button
                disabled
                className="w-full rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[15px] font-bold text-white opacity-40"
              >
                Get shareable link
              </button>
            </div>
          )}

          {panelState === 'download-result' && (
            <div className="space-y-3">
              <div className="rounded-[10px] border border-emerald-400/30 bg-emerald-400/10 p-4 text-[13.5px] text-emerald-400">
                Your pack is downloading. If it didn&apos;t start,{' '}
                <a
                  href={signedUrl ?? '#'}
                  className="underline underline-offset-2"
                  download
                >
                  click here.
                </a>
              </div>
              <button
                onClick={resetToIdle}
                className="w-full rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[15px] font-bold text-white transition hover:opacity-90"
              >
                Done
              </button>
            </div>
          )}

          {panelState === 'link-result' && signedUrl && (
            <div className="space-y-3">
              <div className="rounded-[10px] border border-hair bg-card2 p-3">
                <input
                  readOnly
                  value={signedUrl}
                  className="w-full bg-transparent text-[13px] text-lavdim outline-none"
                  onFocus={e => e.target.select()}
                />
              </div>
              <button
                onClick={copyLink}
                className="w-full rounded-[10px] bg-grad px-5 py-3 text-[15px] font-bold text-white transition hover:opacity-90"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <p className="text-center text-[13px] text-lavdim">This link expires in 7 days.</p>
              <button
                onClick={resetToIdle}
                className="w-full rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[13px] font-bold text-lavdim transition hover:text-white"
              >
                Done
              </button>
            </div>
          )}

          {panelState === 'error' && (
            <div className="space-y-3">
              <p className="text-[13.5px] text-rose-400">
                Couldn&apos;t generate your export pack. Try again.
              </p>
              <button
                onClick={resetToIdle}
                className="w-full rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[15px] font-bold text-white transition hover:opacity-90"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
