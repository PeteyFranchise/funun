'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Read an image's pixel dimensions in the browser before upload — mirrors
// CoverArtUpload's helper; kept for parity in case a future crop-check
// needs it, though the avatar/banner API does not currently consume it.
function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

// Owner-only avatar/banner upload affordance. Renders as an absolutely
// positioned overlay — the parent (ProfileView) is expected to wrap the
// existing banner/avatar visuals in a `relative` container and mount this
// on top, so the current image itself is never re-rendered here.
export function AvatarBannerUpload({
  variant,
  currentUrl,
}: {
  variant: 'avatar' | 'banner'
  currentUrl: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    // Client-side pre-check for instant feedback, mirrors the server's contract.
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setError('Image must be JPG, PNG, or WebP')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be under 10MB')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    await readImageSize(file)

    const body = new FormData()
    body.append('file', file)
    body.append('type', variant)

    const res = await fetch('/api/profile/avatar', { method: 'POST', body })
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

  if (variant === 'banner') {
    return (
      <>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute right-[18px] top-[18px] z-10 flex items-center gap-1.5 rounded-full border border-white/[.18] bg-[rgba(10,9,16,.5)] px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-[8px] transition hover:bg-[rgba(10,9,16,.7)] disabled:opacity-60"
          aria-label={currentUrl ? 'Edit cover image' : 'Upload cover image'}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[15px] w-[15px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          {uploading ? 'Uploading…' : 'Edit cover'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          className="hidden"
        />
        {error && (
          <p className="absolute right-[18px] top-[54px] z-10 max-w-[220px] rounded-md bg-[rgba(10,9,16,.7)] px-2 py-1 text-right text-[12px] font-semibold text-amber-300">
            {error}
          </p>
        )}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group absolute inset-0 z-10 flex items-center justify-center rounded-full opacity-0 transition-opacity duration-[160ms] ease-out hover:opacity-100 focus:opacity-100 focus-visible:opacity-100"
        style={{ backgroundColor: 'rgba(10,9,16,.55)' }}
        aria-label={currentUrl ? 'Edit photo' : 'Upload photo'}
      >
        <span className="flex flex-col items-center gap-1">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span className="text-[11px] font-semibold text-white">
            {uploading ? 'Uploading…' : 'Edit photo'}
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
      />
      {error && (
        <p className="absolute -bottom-6 left-1/2 z-10 w-max max-w-[160px] -translate-x-1/2 text-center text-[11px] font-semibold text-amber-300">
          {error}
        </p>
      )}
    </>
  )
}
