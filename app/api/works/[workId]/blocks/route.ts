import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
// Imported via namespace, not a named import, so this file mentions the
// wave-1 auto-split function's name exactly once — at its call site below —
// which is a deliberate readability property this route's own tests assert.
import * as CatalogueBlocks from '@/lib/catalogue/blocks'
import type { LyricBlockType } from '@/types/catalogue'

// ─── POST /api/works/[workId]/blocks — insert anywhere, repeat, paste ────
// Every creation shape lands here through ONE strict discriminated schema.
// `resolveWorkAccess()` requires only the `contribute` tier — migration
// 136's posture is that BOTH tiers may write into the pad; `administer` is
// reserved for membership and (in 37.2) the money/release doors, not for
// content.

const BLOCK_TYPE_VALUES = [
  'verse',
  'pre_chorus',
  'chorus',
  'bridge',
  'intro',
  'outro',
  'hook',
  'custom',
] as const satisfies readonly LyricBlockType[]

const IndexSchema = z.number().int().min(0).max(199)

// Shape 1 — a single new, empty section. `custom_label` is validated against
// `block_type === 'custom'` by hand below rather than with zod's own
// `.refine()`, because `.refine()` turns a ZodObject into a ZodEffects and
// `z.discriminatedUnion` requires every member to stay a plain ZodObject.
const SingleShape = z
  .object({
    kind: z.literal('single'),
    block_type: z.enum(BLOCK_TYPE_VALUES),
    custom_label: z.string().trim().min(1).max(80).optional(),
    index: IndexSchema.optional(),
  })
  .strict()

// Shape 2 — a repeat. No `custom_label`: a repeated section always displays
// the source's own label/type, never a second name of its own.
const RepeatShape = z
  .object({
    kind: z.literal('repeat'),
    block_type: z.enum(BLOCK_TYPE_VALUES),
    source_block_id: z.string().uuid(),
    index: IndexSchema.optional(),
  })
  .strict()

// Shape 3 — a paste. Bounded (T-37-47): both the raw text length here and
// the resulting stanza count below cap an unbounded paste from becoming an
// unbounded bulk insert.
const PasteShape = z
  .object({
    kind: z.literal('paste'),
    text: z.string().trim().min(1).max(20000),
  })
  .strict()

const CreateBlockSchema = z.discriminatedUnion('kind', [SingleShape, RepeatShape, PasteShape])

type ApiClient = Awaited<ReturnType<typeof createApiClient>>
type ExistingBlock = { id: string; position: number }

/**
 * INSERT-ANYWHERE RULE, server-side. When `index` is supplied, every
 * existing block at or below that index (position >= index) shifts down by
 * one BEFORE the new row is inserted, making room at exactly that spot; when
 * `index` is absent, the new block appends after everything that exists
 * today. This runs on the server, not the client, because the pad's
 * plus-divider between two blocks is a one-tap affordance — having the
 * client compute and send a whole new order for a single insert would make
 * an ordinary keystroke-adjacent action race with an in-flight autosave.
 * Each shifted row is an ordinary single-row UPDATE (no unique constraint on
 * `position` exists to violate), and shifting never touches `text`,
 * `block_type` or `custom_label`, so it fires no diary trigger of its own.
 */
async function shiftForInsert(
  supabase: ApiClient,
  currentBlocks: ExistingBlock[],
  index: number | undefined
): Promise<{ position: number; error?: undefined } | { error: string; position?: undefined }> {
  const total = currentBlocks.length
  if (index === undefined) {
    return { position: total }
  }

  const insertPosition = Math.min(Math.max(index, 0), total)
  const toShift = currentBlocks.filter(block => block.position >= insertPosition)

  for (const block of toShift) {
    const { error } = await supabase
      .from('lyric_blocks')
      .update({ position: block.position + 1 })
      .eq('id', block.id)
    if (error) return { error: error.message }
  }

  return { position: insertPosition }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> }
) {
  const { workId } = await params

  // ── 1. Auth gate, then the one access decision every work route calls. ──
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(
    createWorkAccessDeps(supabase),
    workId,
    user.id,
    'contribute'
  )
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  // ── 2. Strict, discriminated payload validation. ─────────────────────
  const body = await request.json().catch(() => null)
  const parsed = CreateBlockSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid block payload' }, { status: 400 })
  }
  const input = parsed.data

  if (
    input.kind === 'single' &&
    input.custom_label !== undefined &&
    input.block_type !== 'custom'
  ) {
    return NextResponse.json(
      { error: 'custom_label is only accepted when block_type is custom' },
      { status: 400 }
    )
  }

  // ── 3. Load current positions once — every shape needs them. ─────────
  const { data: existing, error: fetchError } = await supabase
    .from('lyric_blocks')
    .select('id, position')
    .eq('work_id', workId)
    .order('position', { ascending: true })

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  const currentBlocks: ExistingBlock[] = existing ?? []

  // PERFORMER RULE, writer half: the ✍ badge is automatic and non-negotiable
  // — it is set from the authenticated caller in every shape below, never
  // from the request body (the schemas above have no slot for one). It MOVES
  // SPLITS, so accepting it from a body would let a caller attribute someone
  // else's authorship — the one field on this table with money attached.
  //
  // `performers` (the 🎤 declared singer cluster) is left at its empty
  // default in every shape: a blank block inherits the work's
  // primary_performer for DISPLAY only, so the solo artist is never nagged,
  // and a per-block singer tag is for exceptions only — nothing here writes
  // an inherited badge into the record.
  //
  // No diary row is written by this route in any branch. Migration 138's
  // insert trigger on lyric_blocks fires the section-level entry ("Ben added
  // Verse 2") for every row this route inserts, at exactly the granularity
  // sketch 006-A specified.

  if (input.kind === 'single') {
    const shift = await shiftForInsert(supabase, currentBlocks, input.index)
    if (shift.error) return NextResponse.json({ error: shift.error }, { status: 500 })

    const { data: created, error: insertError } = await supabase
      .from('lyric_blocks')
      .insert({
        work_id: workId,
        block_type: input.block_type,
        custom_label: input.block_type === 'custom' ? (input.custom_label ?? null) : null,
        position: shift.position,
        text: '',
        author_kind: 'human',
        author_user_id: user.id,
        performers: [],
      })
      .select()
      .single()

    if (insertError || !created) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Could not create block' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { blocks: [created] } }, { status: 201 })
  }

  if (input.kind === 'repeat') {
    // REPEAT RULE: verify the source belongs to THIS work, then insert a
    // block whose repeat link points at it and whose own text stays empty.
    // It displays the source's lyrics with its repeat badge, editing the
    // source updates every repeat, and attribution stays with the original
    // writer automatically — this route never copies the source's text.
    const { data: source, error: sourceError } = await supabase
      .from('lyric_blocks')
      .select('id')
      .eq('id', input.source_block_id)
      .eq('work_id', workId)
      .maybeSingle()

    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 })
    if (!source) {
      return NextResponse.json({ error: 'Source block not found on this work' }, { status: 404 })
    }

    const shift = await shiftForInsert(supabase, currentBlocks, input.index)
    if (shift.error) return NextResponse.json({ error: shift.error }, { status: 500 })

    const { data: created, error: insertError } = await supabase
      .from('lyric_blocks')
      .insert({
        work_id: workId,
        block_type: input.block_type,
        custom_label: null,
        position: shift.position,
        text: '',
        author_kind: 'human',
        author_user_id: user.id,
        performers: [],
        repeat_of_block_id: input.source_block_id,
      })
      .select()
      .single()

    if (insertError || !created) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Could not create repeat block' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { blocks: [created] } }, { status: 201 })
  }

  // input.kind === 'paste'. Auto-split is on blank lines, and a stanza whose
  // first line reads as a section name adopts that type — sketch 006-A's
  // rule, implemented once in plan 02's pure module and consumed here, never
  // reimplemented. Every draft is inserted in one bulk INSERT statement (a
  // single array passed to `.insert()`), which is what keeps the diary from
  // filling with one entry per stanza in an unpredictable order: migration
  // 138's per-row trigger still fires once per stanza, but a single
  // statement fires those triggers in the exact order the drafts were
  // written, rather than however N separate requests happened to interleave.
  const drafts = CatalogueBlocks.splitPastedLyric(input.text)
  if (drafts.length === 0) {
    return NextResponse.json({ error: 'Nothing to paste — the lyric was empty' }, { status: 400 })
  }
  if (drafts.length > 200) {
    return NextResponse.json(
      { error: 'Pasted lyric is too long — at most 200 sections at once' },
      { status: 400 }
    )
  }

  const total = currentBlocks.length
  const rows = drafts.map((draft, i) => ({
    work_id: workId,
    block_type: draft.block_type,
    custom_label: null,
    position: total + i,
    text: draft.text,
    author_kind: 'human' as const,
    author_user_id: user.id,
    performers: [],
  }))

  const { data: created, error: insertError } = await supabase
    .from('lyric_blocks')
    .insert(rows)
    .select()

  if (insertError || !created) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Could not create blocks from paste' },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: { blocks: created } }, { status: 201 })
}
