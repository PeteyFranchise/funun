import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { isLegalSelectsTransition } from '@/lib/selects/stage-machine'
import { loadSelectsInScope } from '@/lib/selects/persistence'

const SELECTS_COLUMNS =
  'id, buyer_org_id, created_by, brief_id, name, cover_note, share_token, status, download_enabled, download_max_seconds, created_at, updated_at, sent_at'

const SendSelectsBodySchema = z
  .object({
    downloadEnabled: z.boolean().optional(),
    downloadMaxSeconds: z.union([z.number().int().min(0), z.null()]).optional(),
  })
  .strict()

// ─── POST /api/admin/selects/[id]/send ─────────────────────────────────────
// The "a client receives a Selects" boundary (R11). Own-book scoped (via
// loadSelectsInScope, same 404-not-403 shape as every other Selects route).
// Gated by TWO independent guards, checked in this order:
//   1. isLegalSelectsTransition(current.status, 'sent') — imported directly
//      from lib/selects/stage-machine (the SAME state-machine authority
//      31-13's respond route uses), mirroring app/api/admin/deals/[id]/
//      route.ts's convention of calling a pure transition predicate inline
//      in the route rather than through a persistence-layer wrapper. An
//      already-'approved' Selects fails here (terminal, no re-send).
//   2. The empty-Selects guard — zero non-removed selects_tracks rows
//      cannot be sent (R11 AC). Checked AFTER the transition guard so a
//      terminal-status Selects always reports "wrong status", not "empty".
// share_token already exists from insert-time DEFAULT (migration 111) and
// is never re-minted here. The D-02 download settings (download_enabled/
// download_max_seconds) persist alongside the status move in the SAME
// UPDATE so both land atomically.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const selects = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!selects) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!isLegalSelectsTransition(selects.status, 'sent')) {
    return NextResponse.json(
      { error: `Cannot send a Selects that is currently "${selects.status}".` },
      { status: 400 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = SendSelectsBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const { count, error: countError } = await service
    .from('selects_tracks')
    .select('id', { count: 'exact', head: true })
    .eq('selects_id', id)
    .is('removed_at', null)
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if (!count || count === 0) {
    return NextResponse.json(
      { error: 'This Selects has no tracks yet — add at least one before sending.' },
      { status: 400 }
    )
  }

  const update: Record<string, unknown> = {
    status: 'sent',
    sent_at: new Date().toISOString(),
  }
  if (parsed.data.downloadEnabled !== undefined) update.download_enabled = parsed.data.downloadEnabled
  if (parsed.data.downloadMaxSeconds !== undefined) update.download_max_seconds = parsed.data.downloadMaxSeconds

  const { data, error } = await service
    .from('selects')
    .update(update)
    .eq('id', id)
    .select(SELECTS_COLUMNS)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to send Selects' }, { status: 500 })
  }

  const sent = data as { share_token: string }
  return NextResponse.json({ data, shareUrl: `/selects/${sent.share_token}` })
}
