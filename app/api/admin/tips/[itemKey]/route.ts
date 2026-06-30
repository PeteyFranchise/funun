import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin, KEY_REGEX } from '@/lib/admin/gate'

// ─── PATCH /api/admin/tips/[itemKey] ───────────────────────────────────
// Approve or reject a pending tip draft.
//
// approve: tip_draft → tip_body, tip_approved = true, tip_draft cleared
// reject:  tip_draft cleared; tip_body / tip_approved unchanged
//
// T-05-05 (Risk 7): drafted text only becomes visible to artists after
// approve sets tip_approved=true. Reject discards without publishing.
// Optional: admin may pass `tip_text` in the body to override the stored
// draft before approving.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemKey: string }> }
) {
  const { itemKey } = await params

  // T-05-08: validate itemKey before WHERE clause use
  if (!KEY_REGEX.test(itemKey)) {
    return NextResponse.json({ error: 'Invalid item key' }, { status: 400 })
  }

  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json()) as Record<string, unknown>
  const action = typeof body.action === 'string' ? body.action : ''

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  const service = createServiceClient()

  if (action === 'approve') {
    // Read current row to get the draft text
    const { data: row, error: fetchError } = await service
      .from('launchpad_checklist_items')
      .select('tip_draft, author')
      .eq('key', itemKey)
      .maybeSingle()

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    // Admin may optionally provide edited tip text in the request body
    const approvedText =
      typeof body.tip_text === 'string' && body.tip_text.trim()
        ? body.tip_text.trim()
        : (row.tip_draft ?? '')

    if (!approvedText) {
      return NextResponse.json({ error: 'No tip draft to approve' }, { status: 400 })
    }

    const { data, error } = await service
      .from('launchpad_checklist_items')
      .update({
        tip_body: approvedText,
        tip_approved: true,
        tip_draft: null,
      })
      .eq('key', itemKey)
      .select()
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    return NextResponse.json({ data })
  }

  // action === 'reject': clear the draft only; leave tip_body/tip_approved unchanged
  const { data, error } = await service
    .from('launchpad_checklist_items')
    .update({ tip_draft: null })
    .eq('key', itemKey)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  return NextResponse.json({ data })
}
