import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  verifyAdmin,
  EDITABLE_FIELDS,
  SECTION_VALUES,
  ACTION_TYPE_VALUES,
  KEY_REGEX,
} from '@/lib/admin/gate'

// ─── PATCH /api/admin/checklist/[itemKey] ───────────────────────────────
// Updates allowlisted fields on a single checklist item.
// T-05-07: EDITABLE_FIELDS allowlist prevents mass assignment.
// T-05-08: itemKey validated against regex before use in WHERE clause.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemKey: string }> }
) {
  const { itemKey } = await params

  // T-05-08: validate itemKey before using it in a WHERE clause
  if (!KEY_REGEX.test(itemKey)) {
    return NextResponse.json({ error: 'Invalid item key' }, { status: 400 })
  }

  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json()) as Record<string, unknown>

  // Build update object from allowlist only — mass-assignment protection
  const update: Record<string, unknown> = {}

  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue

    if (field === 'section') {
      if (!SECTION_VALUES.includes(body.section as (typeof SECTION_VALUES)[number])) {
        return NextResponse.json(
          { error: `section must be one of: ${SECTION_VALUES.join(', ')}` },
          { status: 400 }
        )
      }
      update.section = body.section
      continue
    }

    if (field === 'action_type') {
      if (!ACTION_TYPE_VALUES.includes(body.action_type as (typeof ACTION_TYPE_VALUES)[number])) {
        return NextResponse.json(
          { error: `action_type must be one of: ${ACTION_TYPE_VALUES.join(', ')}` },
          { status: 400 }
        )
      }
      update.action_type = body.action_type
      continue
    }

    if (field === 'sort_order') {
      if (typeof body.sort_order !== 'number') {
        return NextResponse.json({ error: 'sort_order must be a number' }, { status: 400 })
      }
      update.sort_order = body.sort_order
      continue
    }

    if (field === 'label') {
      const label = typeof body.label === 'string' ? body.label.trim() : ''
      if (!label) return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 })
      update.label = label
      continue
    }

    // action_href, action_label — nullable string fields
    update[field] = body[field] ?? null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('launchpad_checklist_items')
    .update(update)
    .eq('key', itemKey)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  return NextResponse.json({ data })
}

// ─── DELETE /api/admin/checklist/[itemKey] ──────────────────────────────
// Hard-deletes a checklist item by key.
// launchpad_progress rows cascade automatically via the FK ON DELETE CASCADE
// defined in migration 028 — no manual progress deletion needed.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ itemKey: string }> }
) {
  const { itemKey } = await params

  // T-05-08: validate itemKey before using it in a WHERE clause
  if (!KEY_REGEX.test(itemKey)) {
    return NextResponse.json({ error: 'Invalid item key' }, { status: 400 })
  }

  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('launchpad_checklist_items')
    .delete()
    .eq('key', itemKey)
    .select('key')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
