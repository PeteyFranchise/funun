import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createApiClient } from '@/lib/supabase/server'
import { parseAdmittedFormData } from '@/lib/security/upload-admission'

const BUCKET = 'vault-assets'
const MAX_BYTES = 10 * 1024 * 1024

const VALID_TYPES = ['avatar', 'banner'] as const
type AssetType = (typeof VALID_TYPES)[number]

function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const index = url.indexOf(marker)
  if (index === -1) return null
  try {
    return decodeURIComponent(url.slice(index + marker.length))
  } catch {
    return null
  }
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

// POST /api/profile/avatar — upload the current user's avatar or banner
// image (multipart/form-data). Handles both via a `type` field; the
// storage path (${user.id}/profile/...) is the ownership boundary, so
// there is no separate project-row ownership check like the vault-assets
// route has.
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsedUpload = await parseAdmittedFormData(supabase, request, {
    operation: 'profile:image',
    maxBodyBytes: MAX_BYTES + 1024 * 1024,
    dailyCountLimit: 20,
    dailyByteLimit: 200 * 1024 * 1024,
  })
  if (!parsedUpload.ok) {
    return NextResponse.json({ error: parsedUpload.error }, { status: parsedUpload.status })
  }
  const form = parsedUpload.form
  const file = form.get('file')
  const type = String(form.get('type') ?? '') as AssetType

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 10MB' }, { status: 400 })
  }
  const ext = EXT_BY_MIME[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Image must be JPG, PNG, or WebP' }, { status: 400 })
  }

  const column = type === 'avatar' ? 'avatar_url' : 'banner_url'
  const { data: current, error: currentError } = await supabase
    .from('user_profiles')
    .select(column)
    .eq('id', user.id)
    .maybeSingle()
  if (currentError || !current) {
    return NextResponse.json({ error: 'Could not load this profile' }, { status: 500 })
  }
  const previousPath = pathFromPublicUrl((current as Record<string, string | null> | null)?.[column])

  const path = `${user.id}/profile/${type}-${randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { data: updated, error: updateError } = await supabase
    .from('user_profiles')
    .update({ [column]: publicUrl })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (updateError || !updated) {
    await supabase.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: 'Could not save this profile image' }, { status: 500 })
  }

  if (previousPath && previousPath !== path) {
    await supabase.storage.from(BUCKET).remove([previousPath])
  }

  return NextResponse.json({ data: { url: publicUrl } })
}
