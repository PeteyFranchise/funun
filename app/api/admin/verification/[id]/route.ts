import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { validateVerificationAction, grantOrRevokeVerification } from '@/lib/trust-safety/verification'

// ─── PATCH /api/admin/verification/[id] ──────────────────────────────────
// Body: { action: 'grant' | 'revoke' }
// Grants or revokes the verified badge for profile [id] and appends a row
// to verification_audit_log (action, actor_id) — every action is audited,
// including idempotent re-grants/re-revokes (SAFETY-03). Admin-only; the
// member-owned profile update route (app/api/profile/route.ts) can never
// reach `verified`/`verified_at` — they are absent from its EDITABLE_FIELDS
// allowlist by design.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const validated = validateVerificationAction(body)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  const service = createServiceClient()
  const result = await grantOrRevokeVerification(service, id, validated.value.action, auth.user.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ data: result.data })
}
