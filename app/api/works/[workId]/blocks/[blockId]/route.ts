import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { planDetach } from '@/lib/catalogue/blocks'
import type { LyricBlock, LyricBlockType } from '@/types/catalogue'

// ─── PATCH / DELETE /api/works/[workId]/blocks/[blockId] ─────────────────
// The pad's debounced autosave target, its type/label/performer editor, its
// detach action, and its remove action. `resolveWorkAccess()` requires only
// the `contribute` tier — both tiers may edit the pad (136's posture); only
// membership changes and the 37.2 money/release doors are administer-only.

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

// PERFORMER RULE, singer half: unlike the writer badge, the 🎤 cluster IS
// declared by a caller — tap "who sings this?" and pick a member or name a
// guest. It moves CREDITS and never splits, and multiple entries stack for a
// duet. Validated here against the same shape types/catalogue.ts declares
// for `PerformerRef` (`works.primary_performer`, `work_versions.performers`,
// `lyric_blocks.performers` all share it). The pad's own performer list is
// the current PLAN; the authoritative per-recording credits live on the
// version, which is what feeds DDEX contributor roles and the human-take
// registry behind the Crate vocal rule.
const PerformerRefSchema = z
  .object({
    kind: z.enum(['self', 'collaborator', 'guest']),
    collaboratorId: z.string().uuid().nullable().optional(),
    userId: z.string().uuid().nullable().optional(),
    name: z.string().trim().max(120).nullable().optional(),
  })
  .strict()

// Five editable fields plus one scoped lock capability and nothing else —
// the debounced autosave target.
// Migration 138's edit trigger fires only on text/block_type/custom_label,
// and only once per SAVE (the client debounces before it PATCHes), which is
// what makes the diary read as section-level history rather than a wall of
// "lyrics changed".
const PatchFieldsSchema = z
  .object({
    text: z.string().max(4000).optional(),
    block_type: z.enum(BLOCK_TYPE_VALUES).optional(),
    custom_label: z.string().trim().max(80).nullable().optional(),
    performers: z.array(PerformerRefSchema).max(12).optional(),
    vocal_direction: z.string().trim().min(1).max(160).nullable().optional(),
    lock_session_id: z.string().uuid().optional(),
  })
  .strict()

// The detach action. A dedicated field on this same PATCH schema (rather
// than a separate sub-path) because a detach and an ordinary field edit are
// both "the pad wrote something" from the client's point of view, and the
// route below is the one place that already knows which block this is.
const DetachActionSchema = z
  .object({
    detach: z.literal(true),
  })
  .strict()

const PatchSchema = z.union([DetachActionSchema, PatchFieldsSchema])

type ApiClient = Awaited<ReturnType<typeof createApiClient>>

/**
 * Loads the block AND proves it belongs to this work in one query. A block
 * id from another song must be indistinguishable from a block id that does
 * not exist — this returns the same `null` for both cases, and every caller
 * below turns that into the same 404.
 */
async function loadBlockInWork(
  supabase: ApiClient,
  workId: string,
  blockId: string
): Promise<{ block: LyricBlock | null; error: string | null }> {
  const { data, error } = await supabase
    .from('lyric_blocks')
    .select('*')
    .eq('id', blockId)
    .eq('work_id', workId)
    .maybeSingle()

  if (error) return { block: null, error: error.message }
  return { block: (data as LyricBlock | null) ?? null, error: null }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workId: string; blockId: string }> }
) {
  const { workId, blockId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const { block, error } = await loadBlockInWork(supabase, workId, blockId)
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!block) return NextResponse.json({ error: 'Block not found.' }, { status: 404 })
  return NextResponse.json({ data: block })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workId: string; blockId: string }> }
) {
  const { workId, blockId } = await params

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

  const { block, error: loadError } = await loadBlockInWork(supabase, workId, blockId)
  if (loadError) return NextResponse.json({ error: loadError }, { status: 500 })
  if (!block) return NextResponse.json({ error: 'Block not found.' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid block patch payload' }, { status: 400 })
  }

  // ── Detach branch — copy-on-write, no diary write of our own. ─────────
  if ('detach' in parsed.data) {
    if (!block.repeat_of_block_id) {
      return NextResponse.json({ error: 'Block is not a linked repeat' }, { status: 400 })
    }

    // planDetach() needs a lookup so resolveRepeat() can walk a chain back
    // to its real origin — fetching the whole work's blocks is cheap (a work
    // is one song) and keeps this route from reimplementing the walk.
    const { data: allBlocks, error: allBlocksError } = await supabase
      .from('lyric_blocks')
      .select('*')
      .eq('work_id', workId)

    if (allBlocksError) {
      return NextResponse.json({ error: allBlocksError.message }, { status: 500 })
    }

    const lookup = new Map(((allBlocks as LyricBlock[] | null) ?? []).map(row => [row.id, row]))
    const { patch } = planDetach(block, lookup, user.id)

    // "Detach to vary" is copy-on-write for final-chorus lifts and ad-libs:
    // the detached row takes the source's current resolved text as its own
    // starting text, its link is cleared, and it takes the detaching user as
    // its own author from this moment — the source block is never touched.
    // No diary write here: migration 138's trigger fires on the
    // repeat_of_block_id transition from non-null to null, which this
    // update is.
    const { data: detached, error: detachError } = await supabase.rpc('detach_lyric_block_with_text', {
      p_work_id: workId,
      p_block_id: blockId,
      p_text: String(patch.text ?? ''),
    })

    if (detachError || !detached) {
      return NextResponse.json(
        { error: detachError?.message ?? 'Could not detach block' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: detached })
  }

  // ── Field-patch branch. ────────────────────────────────────────────────
  const fields = parsed.data
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // A linked repeat's OWN text is never edited — its displayed words come
  // from the source. Editing it here would create a block whose displayed
  // words and stored words disagree, and the artist's real intent in that
  // moment is the detach, not a silent text write.
  if (fields.text !== undefined && block.repeat_of_block_id) {
    return NextResponse.json(
      { error: 'This section repeats another one — detach it first to edit its own text' },
      { status: 409 }
    )
  }

  if (fields.text !== undefined) {
    if (!fields.lock_session_id) {
      return NextResponse.json(
        { error: 'Reserve this lyric section before saving.' },
        { status: 409 }
      )
    }
    if (
      fields.block_type !== undefined ||
      fields.custom_label !== undefined ||
      fields.performers !== undefined ||
      fields.vocal_direction !== undefined
    ) {
      return NextResponse.json(
        { error: 'Lyric text saves must be sent separately from section settings.' },
        { status: 400 }
      )
    }

    const { data: updated, error: saveError } = await supabase.rpc('save_locked_lyric_block_text', {
      p_work_id: workId,
      p_block_id: blockId,
      p_session_id: fields.lock_session_id,
      p_text: fields.text,
    })
    if (saveError || !updated) {
      const lockConflict = saveError?.message.includes('lyric_lock_required')
      return NextResponse.json(
        { error: lockConflict ? 'This section is no longer reserved for this tab.' : saveError?.message ?? 'Could not save lyrics' },
        { status: lockConflict ? 409 : 500 }
      )
    }
    return NextResponse.json({ data: updated })
  }

  if (fields.lock_session_id !== undefined) {
    return NextResponse.json(
      { error: 'A lock session may only accompany a lyric text save.' },
      { status: 400 }
    )
  }

  const update: Record<string, unknown> = {}
  if (fields.block_type !== undefined) update.block_type = fields.block_type
  if (fields.custom_label !== undefined) update.custom_label = fields.custom_label
  if (fields.performers !== undefined) update.performers = fields.performers
  if (fields.vocal_direction !== undefined) update.vocal_direction = fields.vocal_direction

  // No numeral is ever written here or anywhere else in this route file —
  // "Verse 2" is derived at read time from position among same-type
  // siblings, never stored, so nothing above needs to (and nothing may)
  // touch a numeral column.
  const { data: updated, error: updateError } = await supabase
    .from('lyric_blocks')
    .update(update)
    .eq('id', blockId)
    .eq('work_id', workId)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? 'Could not update block' },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workId: string; blockId: string }> }
) {
  const { workId, blockId } = await params

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

  const { block, error: loadError } = await loadBlockInWork(supabase, workId, blockId)
  if (loadError) return NextResponse.json({ error: loadError }, { status: 500 })
  if (!block) return NextResponse.json({ error: 'Block not found.' }, { status: 404 })

  // Migration 135 declares the self-FK as ON DELETE SET NULL, so any repeat
  // pointing at THIS block becomes an ordinary empty block rather than a
  // dangling link the moment this DELETE lands — that is intended behaviour,
  // not a gap to patch here, and plan 02's resolveRepeat() already returns
  // empty text rather than throwing for a missing source, so nothing
  // downstream breaks.
  const { error: deleteError } = await supabase
    .from('lyric_blocks')
    .delete()
    .eq('id', blockId)
    .eq('work_id', workId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  // RENUMBERING RULE, once more, where it is easiest to get wrong: no
  // numeral is ever written. Positions are renormalised to be contiguous
  // from zero purely so the reorder RPC's completeness/contiguity check
  // keeps passing on the next drag — the derived "Verse 2" label renumbers
  // itself for free once the row is gone, with no write to any label column.
  const { data: remaining, error: remainingError } = await supabase
    .from('lyric_blocks')
    .select('id, position')
    .eq('work_id', workId)
    .order('position', { ascending: true })

  if (remainingError) {
    return NextResponse.json({ error: remainingError.message }, { status: 500 })
  }

  for (const [index, row] of (remaining ?? []).entries()) {
    if (row.position === index) continue
    const { error: renumberError } = await supabase
      .from('lyric_blocks')
      .update({ position: index })
      .eq('id', row.id)
    if (renumberError) {
      return NextResponse.json({ error: renumberError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
