import { createApiClient } from '@/lib/supabase/server'

const AUDIO_BUCKET  = 'release-audio'
const ASSET_BUCKET  = 'release-assets'
const DOC_BUCKET    = 'release-documents'

const MAX_AUDIO_SIZE = 250 * 1024 * 1024  // 250MB per track
const MAX_IMAGE_SIZE =  10 * 1024 * 1024  // 10MB
const MAX_DOC_SIZE   =   5 * 1024 * 1024  // 5MB

const ALLOWED_AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mpeg', 'audio/aac']
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export type UploadResult = { url: string; path: string; size: number }

export async function uploadTrackAudio(
  file: File,
  userId: string,
  releaseId: string,
  trackId: string
): Promise<UploadResult> {
  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    throw new Error('Audio must be WAV, FLAC, MP3, or AAC format')
  }
  if (file.size > MAX_AUDIO_SIZE) {
    throw new Error('Audio file must be under 250MB')
  }

  const supabase = createApiClient()
  const ext = file.name.split('.').pop()
  const path = `${userId}/${releaseId}/${trackId}.${ext}`

  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path)
  return { url: publicUrl, path, size: file.size }
}

export async function uploadReleaseArtwork(
  file: File,
  userId: string,
  releaseId: string,
  type: 'cover_art' | 'press_photo' | 'lyric_card' | 'banner'
): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Images must be JPEG, PNG, or WebP format')
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('Image must be under 10MB')
  }

  const supabase = createApiClient()
  const ext = file.name.split('.').pop()
  const path = `${userId}/${releaseId}/${type}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path)
  return { url: publicUrl, path, size: file.size }
}

export async function deleteStorageFile(bucket: string, path: string): Promise<void> {
  const supabase = createApiClient()
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw new Error(`Delete failed: ${error.message}`)
}

export { AUDIO_BUCKET, ASSET_BUCKET, DOC_BUCKET }
