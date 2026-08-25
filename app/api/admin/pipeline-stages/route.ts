import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, KEY_REGEX } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'

// ─── /api/admin/pipeline-stages — D-10 leadership-configurable stage CRUD ──
// GET list + POST create + PATCH rename/reorder + DELETE, all leadership-
// only (requireStaff(['leadership'])). Keys are constrained by the same
// KEY_REGEX used elsewhere in lib/admin/gate.ts (itemKey-in-WHERE-clause
// discipline, T-05-08) and by migration 128's CHECK (key ~ '^[a-z0-9_]+$')
// as a DB-level backstop. No dynamic [id] segment — PATCH/DELETE take `id`
// in the JSON body, mirroring the single-route CRUD shape this table needs
// (no nested resource beneath a stage).

const STAGE_COLUMNS = 'id, key, label, sort_order, is_terminal, created_at, updated_at'

const STAGE_EDITABLE_FIELDS = ['key', 'label', 'sort_order', 'is_terminal'] as const
type StageEditableField = (typeof STAGE_EDITABLE_FIELDS)[number]

const StageCreateSchema = z
  .object({
    key: z.string().trim().min(1).max(60).regex(KEY_REGEX, 'Key must be lowercase letters, numbers, and underscores only.'),
    label: z.string().trim().min(1).max(200),
    sort_order: z.number().int().optional(),
    is_terminal: z.boolean().optional(),
  })
  .strict()

const StagePatchIdSchema = z.object({ id: z.string().uuid() })

const StagePatchFieldsSchema = z
  .object({
    key: z.string().trim().min(1).max(60).regex(KEY_REGEX, 'Key must be lowercase letters, numbers, and underscores only.'),
    label: z.string().trim().min(1).max(200),
    sort_order: z.number().int(),
    is_terminal: z.boolean(),
  })
  .partial()
  .strict()

const StageDeleteSchema = z.object({ id: z.string().uuid() }).strict()

// Pure allowlist filter, mirrors lib/client-partners/contacts.ts's
// pickContactFields — the mass-assignment backstop independent of zod.
function pickStageFields(source: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of STAGE_EDITABLE_FIELDS as readonly StageEditableField[]) {
    if (!(key in source)) continue
    picked[key] = source[key]
  }
  return picked
}

export async function GET() {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data, error } = await service
    .from('pipeline_stages')
    .select(STAGE_COLUMNS)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = StageCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid pipeline stage payload' }, { status: 400 })
  }

  const service = createServiceClient()

  const fields = pickStageFields(parsed.data)
  // IN-01: default sort_order to (current max + 1) when the caller doesn't
  // supply one, instead of leaving every new stage at the column default of
  // 0 — which made GET's ORDER BY sort_order fall back to unspecified
  // insertion-order tie-breaking whenever multiple stages were created
  // without an explicit order. An explicit sort_order is still honored as-is.
  if (fields.sort_order === undefined) {
    const { data: maxRow, error: maxError } = await service
      .from('pipeline_stages')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxError) return NextResponse.json({ error: maxError.message }, { status: 500 })
    const currentMax = (maxRow as { sort_order: number } | null)?.sort_order ?? -1
    fields.sort_order = currentMax + 1
  }

  const { data, error } = await service
    .from('pipeline_stages')
    .insert(fields)
    .select(STAGE_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'create_pipeline_stage',
    targetType: 'pipeline_stage',
    targetId: (data as { id: string })?.id ?? null,
    changes: fields,
  })

  return NextResponse.json({ data })
}

export async function PATCH(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const idParsed = StagePatchIdSchema.safeParse(body)
  if (!idParsed.success) {
    return NextResponse.json({ error: 'A valid stage id is required' }, { status: 400 })
  }

  // Allowlist first (drops unknown keys silently), THEN validate the
  // remaining known fields' shapes — mirrors health-rules' pick-then-parse
  // order so an unlisted key is simply never written, not a 400.
  const picked = pickStageFields(body)
  const fieldsParsed = StagePatchFieldsSchema.safeParse(picked)
  if (!fieldsParsed.success) {
    return NextResponse.json({ error: 'Invalid pipeline stage payload' }, { status: 400 })
  }

  const fields = fieldsParsed.data
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('pipeline_stages')
    .update(fields)
    .eq('id', idParsed.data.id)
    .select(STAGE_COLUMNS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Pipeline stage not found' }, { status: 404 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'update_pipeline_stage',
    targetType: 'pipeline_stage',
    targetId: idParsed.data.id,
    changes: fields,
  })

  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = StageDeleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid stage id is required' }, { status: 400 })
  }

  const service = createServiceClient()

  // WR-04: buyer_orgs.pipeline_stage_id is ON DELETE SET NULL, so deleting a
  // referenced stage nulls that FK automatically but leaves stage_entered_at
  // stale — the UI would then show a days-in-stage number next to a blank
  // stage label. Capture the affected org ids BEFORE the delete so the
  // null-out below is scoped precisely to rows that actually referenced
  // this stage (never a broad/unscoped update).
  const { data: affectedRows, error: affectedError } = await service
    .from('buyer_orgs')
    .select('id')
    .eq('pipeline_stage_id', parsed.data.id)
  if (affectedError) return NextResponse.json({ error: affectedError.message }, { status: 500 })
  const affectedOrgIds = ((affectedRows ?? []) as { id: string }[]).map(row => row.id)

  const { error } = await service.from('pipeline_stages').delete().eq('id', parsed.data.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (affectedOrgIds.length > 0) {
    const { error: clearError } = await service
      .from('buyer_orgs')
      .update({ stage_entered_at: null })
      .in('id', affectedOrgIds)
      .not('stage_entered_at', 'is', null)
    if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 })
  }

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'delete_pipeline_stage',
    targetType: 'pipeline_stage',
    targetId: parsed.data.id,
  })

  return NextResponse.json({ data: { id: parsed.data.id } })
}
