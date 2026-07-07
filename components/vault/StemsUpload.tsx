'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as tus from 'tus-js-client'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'track-audio'
const MAX_STEMS_SIZE = 250 * 1024 * 1024 // 250MB
const MAX_INSTRUMENTAL_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_INSTRUMENTAL_TYPES = ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac', 'audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/x-aac', 'audio/mp4']
const ALLOWED_INSTRUMENTAL_EXTS = ['wav', 'flac', 'mp3', 'aac', 'm4a']

function extFromFile(file: File): string {
  const name = file.name
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'mp3'
}

// ─── Info (ⓘ) popover for stems ────────────────────────────────────────────

function StemsInfo() {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ml-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-hair text-[11px] font-bold text-lavdim transition hover:border-lav hover:text-lav"
        aria-label="What are stems?"
      >
        ⓘ
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-label="Close"
          />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-[280px] rounded-[10px] border border-hair bg-[#0a0a0f] p-4 shadow-2xl">
            <div className="mb-2 text-[13px] font-bold text-white">What are stems?</div>
            <p className="text-[12.5px] leading-relaxed text-lavdim">
              Stems are the separated instrument and vocal tracks that make up this song — everything a mixer, remixer, or sync supervisor might need beyond the final master. Zip all files into a single archive before uploading (max 250MB). Name each file clearly, e.g.{' '}
              <code className="rounded bg-white/10 px-1 text-[11.5px]">songtitle_vocals.wav</code>
              ,{' '}
              <code className="rounded bg-white/10 px-1 text-[11.5px]">songtitle_drums.wav</code>
              , so anyone who opens the archive can tell what&apos;s inside.
            </p>
          </div>
        </>
      )}
    </span>
  )
}

// ─── StemsUpload component ──────────────────────────────────────────────────

export function StemsUpload({
  projectId,
  trackId,
  userId,
  hasStemsFile,
  hasInstrumental,
  canManage,
}: {
  projectId: string
  trackId: string
  userId: string
  hasStemsFile: boolean
  hasInstrumental: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const stemsInputRef = useRef<HTMLInputElement>(null)
  const instrumentalInputRef = useRef<HTMLInputElement>(null)

  const [stemsProgress, setStemsProgress] = useState<number | null>(null)
  const [stemsError, setStemsError] = useState<string | null>(null)

  const [instrumentalUploading, setInstrumentalUploading] = useState(false)
  const [instrumentalError, setInstrumentalError] = useState<string | null>(null)

  // ── Stems upload (tus-js-client direct-to-Supabase-Storage) ─────────────

  async function uploadStems(file: File) {
    setStemsError(null)

    // Client-side validation
    if (!file.name.toLowerCase().endsWith('.zip') && file.type !== 'application/zip' && file.type !== 'application/x-zip-compressed') {
      setStemsError('Stems must be a ZIP archive.')
      return
    }
    if (file.size > MAX_STEMS_SIZE) {
      setStemsError('Stems archive must be under 250MB.')
      return
    }

    const supabase = createClient()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setStemsError('Not signed in.')
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      setStemsError('Upload configuration error.')
      return
    }

    const objectPath = `${userId}/${projectId}/${trackId}.stems.zip`

    setStemsProgress(0)

    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: objectPath,
        contentType: 'application/zip',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // 6MB — Supabase's required fixed chunk
      onError(err) {
        setStemsError(`Upload failed: ${err.message}`)
        setStemsProgress(null)
      },
      onProgress(bytesUploaded, bytesTotal) {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100)
        setStemsProgress(pct)
      },
      async onSuccess() {
        setStemsProgress(100)
        try {
          const res = await fetch(`/api/vault/${projectId}/tracks/${trackId}/stems`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: objectPath, size: file.size, name: file.name }),
          })
          if (!res.ok) {
            const json = await res.json().catch(() => ({}))
            setStemsError(json.error ?? 'Failed to save stems reference.')
          } else {
            router.refresh()
          }
        } catch (err) {
          // Network failure AFTER the bytes landed in Storage — without this catch
          // the rejection is swallowed and the user sees no error at all.
          setStemsError(
            `Failed to save stems reference: ${err instanceof Error ? err.message : String(err)}`
          )
        } finally {
          setStemsProgress(null)
        }
      },
    })

    upload.findPreviousUploads().then(prev => {
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    }).catch((err: unknown) => {
      // findPreviousUploads can reject (e.g. urlStorage/localStorage errors) —
      // without this catch, start() never runs and the UI sticks at 0% forever.
      setStemsError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
      setStemsProgress(null)
    })
  }

  // ── Instrumental upload (small file — plain Supabase Storage upload) ─────

  async function uploadInstrumental(file: File) {
    setInstrumentalError(null)

    // Client-side validation
    const ext = extFromFile(file)
    const validType = ALLOWED_INSTRUMENTAL_TYPES.some(t => file.type === t) || ALLOWED_INSTRUMENTAL_EXTS.includes(ext)
    if (!validType) {
      setInstrumentalError('Instrumental must be WAV, FLAC, MP3, or AAC format.')
      return
    }
    if (file.size > MAX_INSTRUMENTAL_SIZE) {
      setInstrumentalError('Instrumental file must be under 50MB.')
      return
    }

    setInstrumentalUploading(true)
    try {
      const supabase = createClient()
      const objectPath = `${userId}/${projectId}/${trackId}.instrumental.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(objectPath, file, {
        upsert: true,
        contentType: file.type || 'audio/mpeg',
      })
      if (error) {
        setInstrumentalError(`Upload failed: ${error.message}`)
        return
      }

      const res = await fetch(`/api/vault/${projectId}/tracks/${trackId}/instrumental`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: objectPath, size: file.size, ext }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setInstrumentalError(json.error ?? 'Failed to save instrumental reference.')
      } else {
        router.refresh()
      }
    } finally {
      setInstrumentalUploading(false)
    }
  }

  // When not owner and file is absent: hide entirely (D-08)
  const showInstrumental = hasInstrumental || canManage
  const showStems = hasStemsFile || canManage

  if (!showInstrumental && !showStems) return null

  return (
    <>
      {/* Instrumental row */}
      {showInstrumental && (
        <div className="mt-2 flex items-center justify-between text-[13px]">
          <span className="text-lav">Instrumental</span>
          <span>
            {hasInstrumental ? (
              <span className="text-emerald-400">Uploaded</span>
            ) : canManage ? (
              <span>
                {instrumentalUploading ? (
                  <span className="text-lavdim">Uploading…</span>
                ) : (
                  <label className="cursor-pointer text-lavdim transition hover:text-white">
                    + Add instrumental
                    <input
                      ref={instrumentalInputRef}
                      type="file"
                      accept=".wav,.flac,.mp3,.aac,.m4a,audio/*"
                      className="hidden"
                      disabled={instrumentalUploading}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) void uploadInstrumental(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </span>
            ) : null}
          </span>
        </div>
      )}
      {instrumentalError && (
        <p className="mt-1 text-[12px] text-rose-400">{instrumentalError}</p>
      )}

      {/* Stems row */}
      {showStems && (
        <div className="mt-2 flex items-center justify-between text-[13px]">
          <span className="flex items-center text-lav">
            Stems
            {!hasStemsFile && canManage && <StemsInfo />}
          </span>
          <span>
            {hasStemsFile ? (
              <span className="text-emerald-400">Uploaded</span>
            ) : canManage ? (
              <span>
                {stemsProgress !== null ? (
                  <span className="text-lavdim">Uploading… {stemsProgress}%</span>
                ) : (
                  <label className="cursor-pointer text-lavdim transition hover:text-white">
                    + Add stems (ZIP)
                    <input
                      ref={stemsInputRef}
                      type="file"
                      accept=".zip,application/zip,application/x-zip-compressed"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) void uploadStems(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </span>
            ) : null}
          </span>
        </div>
      )}
      {stemsError && (
        <p className="mt-1 text-[12px] text-rose-400">{stemsError}</p>
      )}
    </>
  )
}
