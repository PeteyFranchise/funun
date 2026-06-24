import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { addDemoAsset } from '@/lib/vault/demo-store'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const BUCKET = 'vault-assets'
const MAX_BYTES = 10 * 1024 * 1024

const VALID_TYPES = [
  'cover_art',
  'press_photo',
  'lyric_card',
  'snippet_visual',
  'promo_video',
  'banner',
] as const
type AssetType = (typeof VALID_TYPES)[number]

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// POST /api/vault/[projectId]/assets — upload an image asset (multipart/form-data).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const form = await request.formData()
  const file = form.get('file')
  const type = String(form.get('type') ?? '') as AssetType
  const toDim = (v: FormDataEntryValue | null): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  const width = toDim(form.get('width'))
  const height = toDim(form.get('height'))

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
  }
  const ext = EXT_BY_MIME[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  if (DEMO) {
    const project = await addDemoAsset(projectId, { type })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ data: project })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm ownership (RLS also enforces this on the insert/upload).
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const path = `${user.id}/${projectId}/${type}-${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { data: asset, error: insertError } = await supabase
    .from('vault_assets')
    .insert({
      user_id: user.id,
      project_id: projectId,
      type,
      url: publicUrl,
      filename: file.name,
      size_bytes: file.size,
      width,
      height,
    })
    .select()
    .single()
  if (insertError) {
    // Roll back the orphaned object so storage doesn't drift from the table.
    await supabase.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Cover art doubles as the project's display image.
  if (type === 'cover_art') {
    await supabase
      .from('vault_projects')
      .update({ cover_art_url: publicUrl })
      .eq('id', projectId)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ data: asset })
}
