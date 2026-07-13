import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// PATCH /api/antenna/opportunities/[id] — owner toggles active / edits fields.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  if (DEMO) return NextResponse.json({ error: 'Disabled in demo mode' }, { status: 400 })
  const { opportunityId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (typeof b.active === 'boolean') patch.active = b.active
  if (typeof b.title === 'string') patch.title = b.title
  if (typeof b.description === 'string') patch.description = b.description
  if (typeof b.pete_exclusive === 'boolean') patch.pete_exclusive = b.pete_exclusive
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('opportunities')
    .update(patch)
    .eq('id', opportunityId)
    .eq('created_by', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/antenna/opportunities/[id] — owner removes an opportunity.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  if (DEMO) return NextResponse.json({ error: 'Disabled in demo mode' }, { status: 400 })
  const { opportunityId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('opportunities')
    .delete()
    .eq('id', opportunityId)
    .eq('created_by', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { deleted: true } })
}
