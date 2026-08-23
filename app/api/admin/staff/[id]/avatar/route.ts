import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, getStaffRoles, type StaffRole } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { isAvatarSelfEditEnabled } from '@/lib/staff/avatarSelfEdit'

// Team management is leadership + TMS (people ops) — same gate as the other
// /api/admin/staff mutations.
const MANAGE_ROLES: StaffRole[] = ['leadership', 'tms']

// Reuse the existing public asset bucket + limits from the artist avatar flow
// (app/api/profile/avatar). Manager uploads go through the SERVICE client so a
// Leadership/TMS member can set ANOTHER member's photo — the per-user storage
// RLS on vault-assets would otherwise block writing outside one's own uid path.
const BUCKET = 'vault-assets'
const MAX_BYTES = 10 * 1024 * 1024
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

// ─── POST /api/admin/staff/[id]/avatar — set a member's profile picture ──────
// Leadership/TMS may set ANY member's photo; other staff may set only their own,
// and only while STAFF_AVATAR_SELF_EDIT is enabled (avatarSelfEdit). Uploads the
// image and writes funun_staff.avatar_url (the display copy the roster + Avatar
// component read). avatar_url is presentation only — NOT part of the app_metadata
// auth gate — so, unlike role changes, there is no dual-write here.
// multipart/form-data, field `file`.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Any operational staff may reach this route; authorization is manager-OR-self.
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const isManager = getStaffRoles(auth.user).some(r => MANAGE_ROLES.includes(r))
  const isSelf = id === auth.user.id
  if (!isManager && !(isSelf && isAvatarSelfEditEnabled())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
    return NextResponse.json({ error: 'Image must be JPG, PNG, or WebP' }, { status: 400 })
  }

  const service = createServiceClient()

  // The target must be a real staff row before we write its avatar.
  const { data: staffRow } = await service
    .from('funun_staff')
    .select('user_id')
    .eq('user_id', id)
    .maybeSingle()
  if (!staffRow) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 })

  const path = `staff/${id}/avatar-${Date.now()}.${ext}`
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const {
    data: { publicUrl },
  } = service.storage.from(BUCKET).getPublicUrl(path)

  const { error: updateError } = await service
    .from('funun_staff')
    .update({ avatar_url: publicUrl })
    .eq('user_id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'update_staff',
    targetType: 'funun_staff',
    targetId: id,
    changes: { avatar_url: publicUrl },
  })

  return NextResponse.json({ data: { avatar_url: publicUrl } })
}
