'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const ASSET_TYPES: { value: string; label: string }[] = [
  { value: 'press_photo', label: 'Press photo' },
  { value: 'snippet_visual', label: 'Snippet visual' },
  { value: 'lyric_card', label: 'Lyric card' },
  { value: 'banner', label: 'Banner' },
  { value: 'promo_video', label: 'Promo video' },
]

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30'

export function AssetUpload({ projectId }: { projectId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(ASSET_TYPES[0].value)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)

    const body = new FormData()
    body.append('file', file)
    body.append('type', type)

    const res = await fetch(`/api/vault/${projectId}/assets`, { method: 'POST', body })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Upload failed')
      setUploading(false)
      return
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/50 transition hover:border-white/30 hover:text-white"
      >
        + Add asset
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <select value={type} onChange={e => setType(e.target.value)} className={inputClass}>
        {ASSET_TYPES.map(t => (
          <option key={t.value} value={t.value} className="bg-neutral-900">
            {t.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {uploading ? 'Uploading…' : 'Choose image'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="text-sm text-white/50 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  )
}
