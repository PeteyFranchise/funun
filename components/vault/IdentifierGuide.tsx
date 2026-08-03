'use client'

// ─── IdentifierGuide ──────────────────────────────────────────────────
// Presentational component rendering entries from IDENTIFIER_GUIDE
// (lib/metadata/identifier-guide.ts), in two modes:
//   • IdentifierInfoButton — a compact inline popover keyed to one
//     identifier id, for use next to a field in Metadata Studio.
//   • IdentifierGuideCard  — a full card (explainer + assignment
//     guidance + generate/import affordance) for the identifiers
//     reference page.
// Neither mode ever recommends which PRO/society/distributor to choose —
// that copy constraint lives in the guide content itself, not here.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIdentifierEntry, type IdentifierGuideEntry } from '@/lib/metadata/identifier-guide'

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

// ─── Compact inline popover ────────────────────────────────────────────
export function IdentifierInfoButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const entry = getIdentifierEntry(id)
  if (!entry) return null

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`What is ${entry.label}?`}
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] font-semibold leading-none text-white/50 transition hover:border-white/40 hover:text-white/80"
      >
        i
      </button>
      {open && (
        <>
          {/* Click-away layer */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-72 rounded-xl border border-hair bg-card p-3 text-xs shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-white">{entry.label}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/30">
                  {entry.ddexLevel}-level identifier
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 text-white/40 transition hover:text-white/80"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 leading-relaxed text-white/60">{entry.identifies}</p>
            <dl className="mt-2 space-y-1 leading-relaxed text-white/50">
              <div>
                <dt className="inline text-white/30">Issued by: </dt>
                <dd className="inline">{entry.issuedBy}</dd>
              </div>
              <div>
                <dt className="inline text-white/30">How to get one: </dt>
                <dd className="inline">{entry.howToGet}</dd>
              </div>
              <div>
                <dt className="inline text-white/30">Unlocks: </dt>
                <dd className="inline">{entry.unlocks}</dd>
              </div>
            </dl>
            <a
              href={entry.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-medium text-indigo-300 transition hover:text-indigo-200"
            >
              {hostnameOf(entry.officialUrl)} ↗
            </a>
          </div>
        </>
      )}
    </span>
  )
}

// ─── Full card ──────────────────────────────────────────────────────────
// Assignment-guidance affordance slot: the caller renders whatever action
// is appropriate (Generate button, "add prefix in settings" link, or
// nothing at all for centrally-allocated schemes) — this component never
// decides eligibility, it only lays out the explainer + guidance text and
// leaves a slot for the action.
export function IdentifierGuideCard({
  entry,
  currentValue,
  provenance,
  actionSlot,
}: {
  entry: IdentifierGuideEntry
  /** The artist's current value for this identifier on this project/profile, if any. */
  currentValue?: string | null
  /** How the current value was obtained, if known. */
  provenance?: 'generated' | 'imported' | 'manual' | null
  /** Generate control / settings link / nothing — decided by the caller's eligibility check. */
  actionSlot?: React.ReactNode
}) {
  const present = Boolean(currentValue)
  const provenanceLabel =
    provenance === 'generated'
      ? 'Generated in Funūn'
      : provenance === 'imported'
        ? 'Imported'
        : provenance === 'manual'
          ? 'Entered manually'
          : null

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">{entry.label}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                present ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/40'
              }`}
            >
              {present ? 'Present' : 'Missing'}
            </span>
          </div>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-white/50">{entry.identifies}</p>
        </div>
        <a
          href={entry.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
        >
          {hostnameOf(entry.officialUrl)} ↗
        </a>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-1.5 text-xs leading-relaxed text-white/50 sm:grid-cols-2">
        <div>
          <dt className="inline text-white/30">Issued by: </dt>
          <dd className="inline">{entry.issuedBy}</dd>
        </div>
        <div>
          <dt className="inline text-white/30">Unlocks: </dt>
          <dd className="inline">{entry.unlocks}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline text-white/30">How to get one: </dt>
          <dd className="inline">{entry.howToGet}</dd>
        </div>
      </dl>

      {present && (
        <p className="mt-2 text-xs text-white/60">
          Current value: <span className="font-mono text-white/90">{currentValue}</span>
          {provenanceLabel && <span className="ml-2 text-white/40">({provenanceLabel})</span>}
        </p>
      )}

      {entry.note && (
        <p className="mt-2 rounded-lg border border-indigo-400/20 bg-indigo-400/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-indigo-200/80">
          {entry.note}
        </p>
      )}

      {/* ── Assignment guidance — never a dead disabled button ──────── */}
      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2.5 text-[11px] leading-relaxed text-white/50">
        <p>
          <span className="text-white/70">Who should generate it: </span>
          {entry.assignment.whoShouldGenerate}
        </p>
        <p className="mt-1">
          <span className="text-white/70">Who should not: </span>
          {entry.assignment.whoShouldNotGenerate}
        </p>
        <p className="mt-1">
          <span className="text-white/70">Import from: </span>
          {entry.assignment.importFrom}
        </p>
      </div>

      {actionSlot && <div className="mt-3">{actionSlot}</div>}
    </div>
  )
}

// ─── Generate action (client) ────────────────────────────────────────
// Used as an IdentifierGuideCard actionSlot on the identifiers reference
// page. Calls the generalized generator route; the server re-checks
// eligibility unconditionally, so this button existing at all already
// implies the caller passed a server-computed eligible=true.
export function GenerateIdentifierButton({
  projectId,
  scheme,
  hint,
}: {
  projectId: string
  scheme: 'upc' | 'grid' | 'catalog_number'
  hint?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function generate() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/metadata/generate-identifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheme, projectId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMsg(json.error ?? 'Could not generate')
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setMsg('Network error')
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-30"
      >
        {busy ? 'Generating…' : 'Generate'}
      </button>
      {hint && <p className="mt-1 text-[11px] text-white/40">{hint}</p>}
      {msg && <p className="mt-1 text-xs text-amber-300/90">{msg}</p>}
    </div>
  )
}
