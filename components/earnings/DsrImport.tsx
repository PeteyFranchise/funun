'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type IsrcTotal = { isrc: string; title: string | null; units: number; revenue: number }
type Summary = {
  recordCount: number
  byRecordType: Record<string, number>
  totalRevenue: number
  totalUnits: number
  currency: string | null
  byIsrc: IsrcTotal[]
  warnings: string[]
}

function money(n: number, cur: string | null): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD' }).format(n)
  } catch {
    return `${n.toLocaleString()} ${cur ?? ''}`.trim()
  }
}

export function DsrImport() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Summary | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  async function submit() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setError('Choose a DSR file to import.')
    setBusy(true)
    setError(null)
    setFileName(file.name)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/earnings/import', { method: 'POST', body: fd })
    setBusy(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setError(json.error ?? 'Import failed')
    setResult(json.data as Summary)
    router.refresh() // refresh the persisted history below
  }

  return (
    <div className="mb-7 rounded-card border border-hair bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[16px] font-bold text-white">Import a DSR file</div>
          <div className="mt-1 text-[13px] text-lavdim">
            Upload a DDEX Digital Sales Report (.tsv) from a DSP/distributor to see real earnings.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".tsv,.txt,text/tab-separated-values,text/plain" className="text-[13px] text-lavdim file:mr-3 file:rounded-md file:border-0 file:bg-card2 file:px-3 file:py-1.5 file:text-white" />
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-[10px] bg-grad px-5 py-[10px] text-[14px] font-bold text-white shadow-cta disabled:opacity-50"
          >
            {busy ? 'Parsing…' : 'Import'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-[13px] text-rose-400">{error}</p>}

      {result && (
        <div className="mt-5 border-t border-hair pt-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Stat label="Total revenue" value={money(result.totalRevenue, result.currency)} />
            <Stat label="Total units" value={result.totalUnits.toLocaleString()} />
            <Stat label="Rows parsed" value={result.recordCount.toLocaleString()} />
          </div>

          {result.warnings.length > 0 && (
            <div className="mt-4 rounded-[12px] border border-money/30 bg-money/10 px-4 py-3 text-[13px] text-money2">
              {result.warnings.join(' ')}
            </div>
          )}

          {result.byIsrc.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">Top recordings</div>
              <div className="space-y-1">
                {result.byIsrc.slice(0, 6).map(r => (
                  <div key={r.isrc} className="flex items-center justify-between rounded-[10px] border border-hair bg-card2 px-4 py-2 text-[13.5px]">
                    <span className="tnum font-semibold text-white">{r.isrc}</span>
                    <span className="text-lavdim">
                      {r.units.toLocaleString()} units · <span className="mtext font-bold">{money(r.revenue, result.currency)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-[11.5px] text-lavdim">
            Parsed from {fileName}. Tolerant reader — verify against your statement before relying on the figures.
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-hair bg-card2 p-4">
      <div className="text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">{label}</div>
      <div className="mtext tnum mt-1 text-[24px] font-black tracking-[-.02em]">{value}</div>
    </div>
  )
}
