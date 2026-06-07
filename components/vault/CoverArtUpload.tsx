'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function CoverArtUpload({
  projectId,
  coverUrl,
  fallbackLetter,
}: {
  projectId: string
  coverUrl: string | null
  fallbackLetter: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)

    const body = new FormData()
    body.append('file', file)
    body.append('type', 'cover_art')

    const res = await fetch(`/api/vault/${projectId}/assets`, { method: 'POST', body })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Upload failed')
      setUploading(false)
      return
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    router.refresh()
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative block h-32 w-32 overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/30"
        aria-label={coverUrl ? 'Replace cover art' : 'Upload cover art'}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl font-semibold text-white/70">
            {fallbackLetter}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
          {uploading ? 'Uploading…' : coverUrl ? 'Replace' : 'Upload art'}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFile}
        className="hidden"
      />
      {error && <p className="mt-1 max-w-32 text-xs text-rose-300">{error}</p>}
    </div>
  )
}
