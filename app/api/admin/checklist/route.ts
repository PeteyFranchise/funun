import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  verifyAdmin,
  EDITABLE_FIELDS,
  SECTION_VALUES,
  ACTION_TYPE_VALUES,
  KEY_REGEX,
} from '@/lib/admin/gate'

// ─── GET /api/admin/checklist ───────────────────────────────────────────
// Returns all checklist items ordered by sort_order, including admin-only
// fields (tip_draft, author) that the artist-facing route strips.
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('launchpad_checklist_items')
    .select('*')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── POST /api/admin/checklist ──────────────────────────────────────────
// Creates a new checklist item. Requires: key, label, section, action_type.
export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json()) as Record<string, unknown>

  // Validate required fields
  const key = typeof body.key === 'string' ? body.key.trim() : ''
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })
  if (!KEY_REGEX.test(key)) {
    return NextResponse.json(
      { error: 'key must contain only lowercase letters, digits, and underscores' },
      { status: 400 }
    )
  }

  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 })

  const section = typeof body.section === 'string' ? body.section : ''
  if (!SECTION_VALUES.includes(section as (typeof SECTION_VALUES)[number])) {
    return NextResponse.json(
      { error: `section must be one of: ${SECTION_VALUES.join(', ')}` },
      { status: 400 }
    )
  }

  const action_type = typeof body.action_type === 'string' ? body.action_type : ''
  if (!ACTION_TYPE_VALUES.includes(action_type as (typeof ACTION_TYPE_VALUES)[number])) {
    return NextResponse.json(
      { error: `action_type must be one of: ${ACTION_TYPE_VALUES.join(', ')}` },
      { status: 400 }
    )
  }

  // Build insert object from required fields + allowlisted optional fields
  const insert: Record<string, unknown> = { key, label, section, action_type }

  if ('action_href' in body) insert.action_href = body.action_href ?? null
  if ('action_label' in body) insert.action_label = body.action_label ?? null
  if ('sort_order' in body && typeof body.sort_order === 'number') {
    if (!Number.isInteger(body.sort_order)) {
      return NextResponse.json({ error: 'sort_order must be an integer' }, { status: 400 })
    }
    insert.sort_order = body.sort_order
  }
  if ('suggested_week' in body) {
    const sw = Number(body.suggested_week)
    insert.suggested_week = Number.isInteger(sw) && sw >= 1 && sw <= 4 ? sw : null
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('launchpad_checklist_items')
    .insert(insert)
    .select()
    .maybeSingle()

  if (error) {
    // Unique constraint on key
    if (error.code === '23505') {
      return NextResponse.json({ error: `Item with key "${key}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

// ─── PATCH /api/admin/checklist — atomic reorder ────────────────────────
// Accepts { order: Array<{ key: string; sort_order: number }> }.
// The client sends the FULL reordered list with new 0-based positions after
// every drag-drop. All affected rows are updated in one request.
// Risk 6 / Pitfall 4: all items must be updated atomically.
export async function PATCH(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json()) as Record<string, unknown>

  if (!Array.isArray(body.order)) {
    return NextResponse.json({ error: 'order must be an array' }, { status: 400 })
  }

  // Validate each entry before touching the DB
  for (const entry of body.order) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).key !== 'string' ||
      typeof (entry as Record<string, unknown>).sort_order !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Each order entry must have { key: string; sort_order: number }' },
        { status: 400 }
      )
    }
    // T-05-08: validate each key in the reorder array, consistent with single-item
    // PATCH/DELETE handlers that validate itemKey before using it in a WHERE clause.
    if (!KEY_REGEX.test((entry as { key: string }).key)) {
      return NextResponse.json({ error: 'Invalid item key in order array' }, { status: 400 })
    }
  }

  const orderEntries = body.order as Array<{ key: string; sort_order: number }>
  const service = createServiceClient()

  // Sequential updates within this request — all items get a fresh sort_order
  for (const entry of orderEntries) {
    const { error } = await service
      .from('launchpad_checklist_items')
      .update({ sort_order: entry.sort_order })
      .eq('key', entry.key)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
