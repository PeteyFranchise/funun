import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/admin/gate'
import { isOperationalV1SchemaMissing } from '@/lib/playbook/operational-v1'
import { createServiceClient } from '@/lib/supabase/server'

const Key = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/)
const Schema = z
  .object({
    action: z.enum(['enable', 'disable', 'emergency_disable', 'emergency_clear']),
    note: z.string().trim().min(1).max(4000),
  })
  .strict()

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const key = Key.safeParse((await context.params).key)
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!key.success || !parsed.success) {
    return NextResponse.json({ error: 'Invalid activation change' }, { status: 400 })
  }

  const service = createServiceClient()
  const current = await service
    .from('playbook_feature_controls')
    .select('updated_at')
    .eq('feature_key', key.data)
    .maybeSingle()
  if (current.error) {
    if (isOperationalV1SchemaMissing(current.error)) {
      return NextResponse.json(
        { error: 'Activation controls are built but not activated yet.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Activation controls are unavailable.' }, { status: 503 })
  }
  if (!current.data) return NextResponse.json({ error: 'Feature not found' }, { status: 404 })

  const mutation = await service.rpc('mutate_playbook_feature_control', {
    p_feature_key: key.data,
    p_action: parsed.data.action,
    p_actor_id: auth.user.id,
    p_note: parsed.data.note,
    p_expected_updated_at: current.data.updated_at,
  })
  if (mutation.error) {
    return NextResponse.json({ error: 'Activation change could not be saved.' }, { status: 503 })
  }
  if (mutation.data !== true) {
    return NextResponse.json(
      { error: 'Activation changed in another session. Refresh and try again.' },
      { status: 409 }
    )
  }
  return NextResponse.json({ data: { saved: true } })
}
