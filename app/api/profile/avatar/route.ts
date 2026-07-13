import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const BUCKET = 'vault-assets'
const MAX_BYTES = 10 * 1024 * 1024

const VALID_TYPES = ['avatar', 'banner'] as const
type AssetType = (typeof VALID_TYPES)[number]

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
  const form = await request.formData()
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

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const path = `${user.id}/profile/${type}-${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)

  await supabase
    .from('artist_profiles')
    .update({ [type === 'avatar' ? 'avatar_url' : 'banner_url']: publicUrl })
    .eq('id', user.id)

  return NextResponse.json({ data: { url: publicUrl } })
}
