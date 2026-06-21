'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const TYPES: { value: string; label: string }[] = [
  { value: 'split_sheet', label: 'Split Sheet' },
  { value: 'sample_clearance', label: 'Sample Clearance' },
  { value: 'distribution_agreement', label: 'Distribution Agreement' },
  { value: 'copyright_registration', label: 'Copyright Registration' },
  { value: 'hire_right', label: 'Work-for-Hire' },
]

export function ContractUpload({ projects }: { projects: { id: string; title: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [type, setType] = useState(TYPES[0].value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setError('Choose a PDF to upload.')
    if (!projectId) return setError('Pick a release.')
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('projectId', projectId)
    fd.append('type', type)
    const res = await fetch('/api/contracts/verify', { method: 'POST', body: fd })
    setBusy(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setError(json.error ?? 'Verification failed')
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-[9px] rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[15px] font-bold text-white"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 18v2h16v-2" />
        </svg>
        Upload
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[340px] rounded-[14px] border border-hairstrong bg-[#0b0a16] p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)]">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[.14em] text-lavdim">Upload a contract</div>

          <label className="mb-1 block text-[12.5px] font-semibold text-lav">Release</label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="mb-3 w-full rounded-[9px] border border-hair bg-card px-3 py-2 text-[14px] text-white focus:outline-none"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>

          <label className="mb-1 block text-[12.5px] font-semibold text-lav">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="mb-3 w-full rounded-[9px] border border-hair bg-card px-3 py-2 text-[14px] text-white focus:outline-none"
          >
            {TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <label className="mb-1 block text-[12.5px] font-semibold text-lav">PDF</label>
          <input ref={fileRef} type="file" accept="application/pdf" className="mb-3 w-full text-[13px] text-lavdim file:mr-3 file:rounded-md file:border-0 file:bg-card2 file:px-3 file:py-1.5 file:text-white" />

          {error && <p className="mb-3 text-[13px] text-rose-400">{error}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-[10px] bg-grad px-4 py-[10px] text-[14px] font-bold text-white shadow-cta disabled:opacity-50"
          >
            {busy ? 'Verifying with AI…' : 'Upload & verify'}
          </button>
          <p className="mt-2 text-[11.5px] text-lavdim">AI-verified for completeness and accuracy — not legal review.</p>
        </div>
      )}
    </div>
  )
}
