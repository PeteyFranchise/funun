import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

// ─── POST /api/split-sheets/[id]/detach ───────────────────────────────
// Reverses a single split_sheet_attachments relationship (migration 067)
// — the recovery path for "attached to the wrong track" (17-DUAL-ENTRY-
// DESIGN section 7). What matters most here is what this route does NOT
// do: no split_sheets delete, no split_sheet_parties delete, no
// vault_documents delete, no storage delete (T-18-15). Readiness
// recalculating downward afterwards is the correct outcome.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    vault_project_id?: unknown
    track_id?: unknown
  }
  const vaultProjectId = typeof body.vault_project_id === 'string' ? body.vault_project_id : ''
  const trackId = typeof body.track_id === 'string' && body.track_id ? body.track_id : null
  if (!vaultProjectId) {
    return NextResponse.json({ error: 'vault_project_id is required' }, { status: 400 })
  }

  // ── Same double authorization check as attach (T-17-12/T-18-13). ───────
  // P18-12 (section 10c): reads split_sheet_parties across parties — the
  // block exception documented at the attach route above applies
  // identically here; see that comment for the full citation.
  const { data: sheet, error: sheetError } = await apiClient
    .from('split_sheets')
    .select('id, initiator_user_id, split_sheet_parties(user_id)')
    .eq('id', id)
    .maybeSingle()

  const parties = (sheet?.split_sheet_parties ?? []) as { user_id: string | null }[]
  const isParty = !!sheet && (sheet.initiator_user_id === user.id || parties.some(p => p.user_id === user.id))

  if (sheetError || !sheet || !isParty) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data: project } = await apiClient
    .from('vault_projects')
    .select('id')
    .eq('id', vaultProjectId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const service = createServiceClient()

  // ── Remove ONLY the matching attachment row — never the sheet, never
  // its parties, never any vault_documents row, never storage.
  let deleteQuery = service
    .from('split_sheet_attachments')
    .delete()
    .eq('split_sheet_id', id)
    .eq('vault_project_id', vaultProjectId)
  deleteQuery = trackId ? deleteQuery.eq('track_id', trackId) : deleteQuery.is('track_id', null)
  await deleteQuery

  // ── Null the caller's own document row's project/track, ONLY when it
  // currently points at the attachment being removed (the primary
  // attachment, design section 2c). Detaching a non-primary attachment
  // leaves the document row untouched, since it never pointed there.
  const { data: candidateDocs } = await apiClient
    .from('vault_documents')
    .select('id, document_data, project_id, track_id')
    .eq('user_id', user.id)
    .eq('type', 'split_sheet')

  const ownDoc = (
    (candidateDocs ?? []) as {
      id: string
      document_data: Record<string, unknown> | null
      project_id: string | null
      track_id: string | null
    }[]
  ).find(
    d =>
      d.document_data?.split_sheet_id === id &&
      d.project_id === vaultProjectId &&
      (trackId ? d.track_id === trackId : d.track_id === null)
  )

  if (ownDoc) {
    await service.from('vault_documents').update({ project_id: null, track_id: null }).eq('id', ownDoc.id)
  }

  return NextResponse.json({ ok: true })
}
