import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { resolveCitation, resolveLevel, composeReceipt } from '@/lib/catalogue/ai-entries'
import { checkRateLimit } from '@/lib/security/rate-limit'

// ─── POST /api/works/[workId]/ai-entries — the receipt is composed HERE ─
// This route protects two properties, and both are enforced by what this
// file does NOT accept as much as by what it does.
//
// 1. ZERO SPLIT EFFECT. There is no percentage anywhere in this route and
//    `ai_entries` has no column for one (migration 135). AI takes nothing,
//    and the split sheet is untouched by anything here.
//
// 2. NO TOOL NAMES. Nothing in the request, the stored row, or the
//    response names a vendor. DDEX vocabulary (vocal/instrument/lyric/
//    melody/full) appears only inside the receipt block `composeReceipt()`
//    builds — never in any other copy this route produces. Citing a tool
//    is the artist's own act inside the diary text they write elsewhere,
//    not something Funūn's own copy names for them.
//
// The strict schema below is the technical half of CAT-Q3's when-in-doubt
// rule: the artist answers questions (mode, component, which recording),
// and this route — never the client — composes the citation from
// `lib/catalogue/ai-entries.ts`'s `resolveCitation()`. A body that carries
// a `citation`, `receipt` or `disclosure` key is rejected outright by
// `.strict()`, because a citation that is evidence and a citation that is
// a free-text claim are not the same thing, and only one of them belongs
// on this table.
//
// This route does NOT write a diary row. Migration 138's
// trg_capture_ai_entry trigger fires the `ai_entry` diary entry on AFTER
// INSERT.

type RouteCtx = { params: Promise<{ workId: string }> }

// Literal, not derived from lib/catalogue/ai-entries.ts's *_VALUES arrays —
// zod's z.enum() needs a literal tuple to narrow its output type, and
// these two vocabularies are closed and stable (they mirror migration
// 135's CHECK constraints byte-for-byte).
const AiEntryBodySchema = z
  .object({
    mode: z.enum(['performance', 'generate']),
    component: z.enum(['vocal', 'instrument', 'lyric', 'melody', 'full']),
    versionId: z.string().uuid().nullable().optional(),
    blockId: z.string().uuid().nullable().optional(),
    humanSourceVersionId: z.string().uuid().nullable().optional(),
  })
  .strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`ai-entry:${user.id}`, { maxAttempts: 60, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const raw = await request.json().catch(() => null)
  const parsed = AiEntryBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid AI entry payload' }, { status: 400 })
  }
  const { mode, component, versionId, blockId, humanSourceVersionId } = parsed.data

  // Every id this entry could carry is verified as belonging to THIS work
  // before it is trusted for anything (T-37-39) — this is what makes the
  // when-in-doubt rule enforceable rather than decorative. The safe
  // citation is only true if it points at a take that actually exists in
  // THIS song's diary, so the pointer is verified, never merely accepted.
  let targetVersion: { id: string; created_at: string } | null = null
  if (versionId) {
    const { data: v, error: versionError } = await supabase
      .from('work_versions')
      .select('id, created_at')
      .eq('id', versionId)
      .eq('work_id', workId)
      .maybeSingle()
    if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 })
    if (!v) return NextResponse.json({ error: 'versionId does not belong to this work' }, { status: 400 })
    targetVersion = v as { id: string; created_at: string }
  }
  if (blockId) {
    const { data: b } = await supabase
      .from('lyric_blocks')
      .select('id')
      .eq('id', blockId)
      .eq('work_id', workId)
      .maybeSingle()
    if (!b) return NextResponse.json({ error: 'blockId does not belong to this work' }, { status: 400 })
  }

  let hasHumanSource = false
  if (humanSourceVersionId) {
    if (mode !== 'performance') {
      return NextResponse.json(
        { error: 'humanSourceVersionId is only valid for a performed human-written part' },
        { status: 400 }
      )
    }
    const { data: hv, error: humanSourceError } = await supabase
      .from('work_versions')
      .select('id, created_at')
      .eq('id', humanSourceVersionId)
      .eq('work_id', workId)
      .maybeSingle()
    if (humanSourceError) return NextResponse.json({ error: humanSourceError.message }, { status: 500 })
    if (!hv) {
      return NextResponse.json(
        { error: 'humanSourceVersionId does not belong to this work' },
        { status: 400 }
      )
    }

    const { data: sourceAiEntry, error: sourceAiError } = await supabase
      .from('ai_entries')
      .select('id')
      .eq('work_id', workId)
      .eq('level', 'version')
      .eq('version_id', humanSourceVersionId)
      .limit(1)
      .maybeSingle()
    if (sourceAiError) return NextResponse.json({ error: sourceAiError.message }, { status: 500 })
    if (sourceAiEntry) {
      return NextResponse.json(
        { error: 'The human source must be an earlier take without an AI entry.' },
        { status: 400 }
      )
    }

    if (targetVersion) {
      const sourceCreatedAt = Date.parse(hv.created_at)
      const targetCreatedAt = Date.parse(targetVersion.created_at)
      if (
        hv.id === targetVersion.id ||
        !Number.isFinite(sourceCreatedAt) ||
        !Number.isFinite(targetCreatedAt) ||
        sourceCreatedAt >= targetCreatedAt
      ) {
        return NextResponse.json(
          { error: 'The human source must have been recorded before the AI-assisted take.' },
          { status: 400 }
        )
      }
    }
    hasHumanSource = true
  }

  // resolveCitation() is the when-in-doubt rule made structural (plan 03):
  // `kind: 'cited'` — the maximal-ownership citation — is unreachable
  // unless mode is 'performance' AND hasHumanSource is true, and
  // hasHumanSource is only ever true here after the verification above.
  // When the resolver refuses the safe citation, this route does not
  // invent a substitute — it returns the refusal's own re-author guidance
  // so the client shows sketch 003-A's inline prompt, and stores the
  // honest (refusal) citation text instead. Doubt is resolved by work, not
  // by wording — the diary is the arbiter, because CAT-Q1's auto-capture
  // means the timeline either shows the human-first version or it does not.
  const citationOutcome = resolveCitation({ mode, component, hasHumanSource })
  const level = resolveLevel(mode, component)

  // migration 135's CHECK constraint: level = 'version' requires
  // version_id NOT NULL. A performance entry, or a generated vocal/
  // instrument, resolves to 'version' — the caller must have supplied one.
  if (level === 'version' && !versionId) {
    return NextResponse.json(
      { error: 'versionId is required for this mode/component combination' },
      { status: 400 }
    )
  }

  const receipt = composeReceipt({ mode, component, hasHumanSource })

  const { data: inserted, error: insertError } = await supabase
    .from('ai_entries')
    .insert({
      work_id: workId,
      level,
      version_id: level === 'version' ? versionId : null,
      block_id: blockId ?? null,
      component,
      mode,
      // The composed citation — never a client-supplied string. Storing
      // `receipt.citation` (not just resolveCitation()'s own field, which
      // differs in shape by outcome kind) is what makes the row's citation
      // and the receipt block the artist was shown the SAME source of
      // truth, per the CAT-Q3 doctrine's "composed server-side at write
      // time, stored on the row, never regenerated" rule.
      citation: receipt.citation,
      human_source_version_id: humanSourceVersionId ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Could not file the AI entry' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      data: inserted,
      receipt,
      guidance: citationOutcome.kind !== 'cited' ? citationOutcome.reason : null,
    },
    { status: 201 }
  )
}
