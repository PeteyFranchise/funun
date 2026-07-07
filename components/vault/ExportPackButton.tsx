'use client'

import { useState } from 'react'
import { ExportPackPanel } from '@/components/vault/ExportPackPanel'

// ─── ExportPackButton ────────────────────────────────────────────────────
// Thin client component: renders the topbar "Export pack" ghost button and
// manages the ExportPackPanel open/close state.
//
// Rendered in play/page.tsx as the rightmost topbar element alongside the
// readiness chip (D-10). When no master WAV exists across the project,
// the button is disabled with the no-master-gate tooltip (D-10, UI-SPEC).

export function ExportPackButton({
  projectId,
  hasMaster,
  artifactLabels,
}: {
  projectId: string
  /** True if at least one track in the project has a master WAV uploaded (D-10 gate). */
  hasMaster: boolean
  /** Labels for artifacts that currently exist — shown in the panel's included list (D-08). */
  artifactLabels: string[]
}) {
  const [open, setOpen] = useState(false)

  if (!hasMaster) {
    return (
      <span
        title="Upload a master WAV before generating an export pack."
        className="inline-flex cursor-not-allowed items-center gap-[9px] rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[15px] font-bold text-lavdim opacity-50"
        aria-disabled="true"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" />
          <rect x="9" y="9" width="6" height="6" />
        </svg>
        Export pack
      </span>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-[9px] rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[15px] font-bold text-white transition hover:opacity-90"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" />
          <rect x="9" y="9" width="6" height="6" />
        </svg>
        Export pack
      </button>
      <ExportPackPanel
        projectId={projectId}
        open={open}
        onClose={() => setOpen(false)}
        artifactLabels={artifactLabels}
      />
    </>
  )
}
