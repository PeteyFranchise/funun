import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { CONFIG_ROW_ID } from '@/lib/client-partners/health-rules-config'

// ─── POST /api/admin/health-rules/prospect-image — swap the D-31.1-08 mark ─
// Mirrors app/api/admin/staff/[id]/avatar/route.ts's shape exactly (vault-
// assets bucket, mime allowlist, size cap, service-role upload + getPublicUrl)
// but leadership-only, writing health_rules_config.prospect_image_url on the
// id=1 row instead of funun_staff.avatar_url. Applies live with no code
// change — the next render of the prospect slot just reads the new URL
// (D-06 doctrine); NULL renders the neutral placeholder shipped in code.
// multipart/form-data, field `file`.

const BUCKET = 'vault-assets'
const MAX_BYTES = 10 * 1024 * 1024
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function POST(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 10MB' }, { status: 400 })
  }
  const ext = EXT_BY_MIME[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Image must be PNG, JPG, or WebP' }, { status: 400 })
  }

  const service = createServiceClient()

  const path = `health-rules/prospect-${Date.now()}.${ext}`
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const {
    data: { publicUrl },
  } = service.storage.from(BUCKET).getPublicUrl(path)

  const { error: updateError } = await service
    .from('health_rules_config')
    .update({ prospect_image_url: publicUrl })
    .eq('id', CONFIG_ROW_ID)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'update_health_rules_config',
    targetType: 'health_rules_config',
    targetId: String(CONFIG_ROW_ID),
    changes: { prospect_image_url: publicUrl },
  })

  return NextResponse.json({ data: { prospect_image_url: publicUrl } })
}
