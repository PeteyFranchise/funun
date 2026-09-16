'use client'

import { useState } from 'react'
import { skippedRepositionNote } from '@/lib/catalogue/take-export'

// Audition is deliberately absent from this list. Its serializer
// (lib/catalogue/take-export-audition.ts) is written, tested and
// byte-pinned, but the option here waits on plan 40-08's byte-for-byte
// verification against a real Audition export. Once that verification
// lands, plan 40-09 adds a third entry to this array — that one line is
// the entire UI change.
const FORMAT_OPTIONS = [
  { id: 'audacity', label: 'Audacity' },
  { id: 'csv', label: 'Spreadsheet (CSV)' },
] as const

type FormatId = (typeof FORMAT_OPTIONS)[number]['id']

type TakeMarkerExportProps = {
  workId: string
  versionId: string
  className?: string
}

type ControlState = {
  open: boolean
  pending: boolean
  message: string | null
  isError: boolean
}

const IDLE_CONTROL_STATE: ControlState = { open: false, pending: false, message: null, isError: false }

function genericFailureMessage(kind: 'comments' | 'pins'): string {
  return `Could not export ${kind}. Please try again.`
}

// The house blob-download idiom (see WorkspaceActivityExplorer's
// exportCurrentResults), sourced from a fetch response rather than
// locally-built text. The filename is read from the header the server
// already sanitised (E-06) rather than rebuilt here.
async function saveDownload(response: Response, fallbackName: string) {
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match ? match[1] : fallbackName
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Two controls, two handlers, two literal URLs — per E-03, a shared
 * `runExport(kind)` helper is exactly the merge this component must not
 * make. Neither handler predicts a refusal from the comment list; the
 * server is the only authority on E-01, E-09 and E-11, and this component
 * does not take the comment list as a prop for exactly that reason.
 */
export function TakeMarkerExport({ workId, versionId, className }: TakeMarkerExportProps) {
  const [comments, setComments] = useState<ControlState>(IDLE_CONTROL_STATE)
  const [pins, setPins] = useState<ControlState>(IDLE_CONTROL_STATE)

  async function exportComments(format: FormatId) {
    setComments({ open: false, pending: true, message: null, isError: false })
    try {
      const response = await fetch(
        `/api/works/${workId}/versions/${versionId}/comments/export?format=${format}`,
        { cache: 'no-store' }
      )
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { message?: string }
        setComments(current => ({ ...current, message: body.message || genericFailureMessage('comments'), isError: true }))
        return
      }
      if (!response.ok) {
        setComments(current => ({ ...current, message: genericFailureMessage('comments'), isError: true }))
        return
      }
      await saveDownload(response, 'comments.csv')
      const skippedRaw = response.headers.get('X-Funun-Skipped-Reposition')
      const skipped = skippedRaw ? Number.parseInt(skippedRaw, 10) : 0
      const note = skippedRepositionNote(Number.isFinite(skipped) ? skipped : 0)
      setComments(current => ({ ...current, message: note, isError: false }))
    } catch {
      setComments(current => ({ ...current, message: genericFailureMessage('comments'), isError: true }))
    } finally {
      setComments(current => ({ ...current, pending: false }))
    }
  }

  async function exportPins(format: FormatId) {
    setPins({ open: false, pending: true, message: null, isError: false })
    try {
      const response = await fetch(
        `/api/works/${workId}/versions/${versionId}/pins/export?format=${format}`,
        { cache: 'no-store' }
      )
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { message?: string }
        setPins(current => ({ ...current, message: body.message || genericFailureMessage('pins'), isError: true }))
        return
      }
      if (!response.ok) {
        setPins(current => ({ ...current, message: genericFailureMessage('pins'), isError: true }))
        return
      }
      await saveDownload(response, 'my-pins.csv')
      setPins(current => ({ ...current, message: null, isError: false }))
    } catch {
      setPins(current => ({ ...current, message: genericFailureMessage('pins'), isError: true }))
    } finally {
      setPins(current => ({ ...current, pending: false }))
    }
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-3 ${className ?? ''}`}>
      <span className="relative inline-flex items-center gap-2">
        <button
          type="button"
          aria-label="Export this take's comments as a DAW marker file"
          disabled={comments.pending}
          onClick={() => setComments(current => ({ ...current, open: !current.open, message: null }))}
          className="inline-flex min-h-[44px] items-center text-[10px] text-lavdim hover:text-white disabled:opacity-40 sm:min-h-0"
        >
          Export comments
        </button>
        {comments.open && (
          <span className="flex items-center gap-1.5 rounded-full border border-hairstrong bg-card2 px-2 py-1 text-[9px]">
            {FORMAT_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                disabled={comments.pending}
                onClick={() => void exportComments(option.id)}
                className="text-lavdim hover:text-white disabled:opacity-40"
              >
                {option.label}
              </button>
            ))}
          </span>
        )}
        {comments.message && (
          <span role={comments.isError ? 'alert' : 'status'} className={`text-[10px] ${comments.isError ? 'text-red-300' : 'text-lavdim'}`}>
            {comments.message}
          </span>
        )}
      </span>
      <span className="relative inline-flex items-center gap-2">
        <button
          type="button"
          aria-label="Export your own pins on this take as a DAW marker file"
          disabled={pins.pending}
          onClick={() => setPins(current => ({ ...current, open: !current.open, message: null }))}
          className="inline-flex min-h-[44px] items-center text-[10px] text-lavdim hover:text-white disabled:opacity-40 sm:min-h-0"
        >
          Export my pins
        </button>
        {pins.open && (
          <span className="flex items-center gap-1.5 rounded-full border border-hairstrong bg-card2 px-2 py-1 text-[9px]">
            {FORMAT_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                disabled={pins.pending}
                onClick={() => void exportPins(option.id)}
                className="text-lavdim hover:text-white disabled:opacity-40"
              >
                {option.label}
              </button>
            ))}
          </span>
        )}
        {pins.message && (
          <span role={pins.isError ? 'alert' : 'status'} className={`text-[10px] ${pins.isError ? 'text-red-300' : 'text-lavdim'}`}>
            {pins.message}
          </span>
        )}
      </span>
    </span>
  )
}
