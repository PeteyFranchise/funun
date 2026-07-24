'use client'

// ─── Owner-side staged correction panel (19-SPEC.md D-08) ─────────────────
// Consumes the ?stagedFlag= deep-link from
// buildIdentityCorrectionFlagNotification (lib/social/notifications.ts) —
// the D-06 notification's guided-apply target. Shows the flagged field's
// current value + the claimed user's suggested value, then offers the
// correct, immutability-preserving next step:
//   - esign_pending: void-first — routes into the EXISTING void route
//     (app/api/split-sheets/[id]/void/route.ts), never a direct edit.
//   - executed: a GUIDED POINTER ONLY — start a new corrected split sheet.
//     No amendment/lineage/re-sign mechanism is built this phase (owner
//     decision 2026-07-24) — this panel must never grow one.
// Never writes another user's split_sheet_parties row, never touches the
// signed PDF/Certificate.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function StagedFlagPanel({
  sheetId,
  sheetStatus,
  fieldLabel,
  currentValue,
  suggestedValue,
}: {
  sheetId: string
  sheetStatus: string
  fieldLabel: string
  currentValue: string | null
  suggestedValue: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function voidEnvelope() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/split-sheets/${sheetId}/void`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not withdraw the signature request.')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-8 rounded-[14px] border border-money/30 bg-money/5 p-4">
      <p className="text-[13px] font-bold text-white">A collaborator flagged their {fieldLabel.toLowerCase()} as wrong</p>
      <p className="mt-2 text-[12.5px] text-lavdim">
        Current: <span className="text-lav">{currentValue || '—'}</span> · Suggested:{' '}
        <span className="font-semibold text-white">{suggestedValue}</span>
      </p>

      {sheetStatus === 'esign_pending' && (
        <div className="mt-3">
          <p className="text-[12.5px] text-lavdim">
            A signature request is out. Withdraw it first, then correct the identity above and re-send —
            the signed record is never edited directly.
          </p>
          <button
            type="button"
            onClick={voidEnvelope}
            disabled={busy}
            className="mt-2 rounded-[10px] bg-money px-4 py-2 text-[13px] font-bold text-[#1a1400] disabled:opacity-50"
          >
            {busy ? 'Withdrawing…' : 'Withdraw signature request'}
          </button>
          {error && <p className="mt-2 text-[12px] text-rose-400">{error}</p>}
        </div>
      )}

      {sheetStatus === 'executed' && (
        <div className="mt-3">
          <p className="text-[12.5px] text-lavdim">
            This sheet is fully executed — the signed record is permanent and is never edited or
            regenerated. To correct it, start a new split sheet with the right identity.
          </p>
          <Link
            href="/split-sheets/new"
            className="mt-2 inline-block rounded-[10px] bg-brandindigo px-4 py-2 text-[13px] font-bold text-white"
          >
            Start a corrected split sheet
          </Link>
        </div>
      )}
    </div>
  )
}
