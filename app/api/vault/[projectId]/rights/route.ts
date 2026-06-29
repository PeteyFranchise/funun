import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const ALLOWED_FIELDS = ['copyright_status', 'pro_registration_status', 'soundexchange_registered']

const COPYRIGHT_STATUS_VALUES = ['not_filed', 'filed', 'registered'] as const
const PRO_STATUS_VALUES = ['not_registered', 'registered'] as const

// PATCH /api/vault/[projectId]/rights — update per-project rights registration status.
// Write-only route: copyright_status, pro_registration_status, soundexchange_registered.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Record<string, unknown>

  // Validate enum values before building the update object.
  if (
    'copyright_status' in body &&
    !COPYRIGHT_STATUS_VALUES.includes(body.copyright_status as (typeof COPYRIGHT_STATUS_VALUES)[number])
  ) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
  }
  if (
    'pro_registration_status' in body &&
    !PRO_STATUS_VALUES.includes(body.pro_registration_status as (typeof PRO_STATUS_VALUES)[number])
  ) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
  }

  // Build update object from allowlist only — prevents column injection.
  const update: Record<string, unknown> = {}
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      update[field] = body[field]
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('vault_projects')
    .update(update)
    .eq('id', projectId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
