import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

// ─── POST /api/contracts/documents/[id]/hide ──────────────────────────────
// Per-party soft-hide for the Contract Locker (P18-11 / 17-DUAL-ENTRY-DESIGN
// section 10b: "Soft-hide, never hard-delete. A party removing a shared
// agreement from their view must never delete it for the others.").
//
// This route issues NO delete on any path, on any table. Hiding a document
// is a write to the CALLER'S OWN vault_documents row's document_data —
// every read and write below is scoped by `user_id = caller`, which is the
// route's actual security property (not a convenience): a party removing a
// shared agreement from their own Locker can never touch another party's
// copy of the same signed document (each party has their own row, per
// 17-06's per-party fan-out).
//
// document_data is READ then MERGED, never overwritten wholesale — a
// whole-object replace would silently strip the esign evidence block
// (`document_data.esign.completedAt`), tripping the
// vault_documents_status_requires_evidence_chk guard added in migration 049
// (a signed row must carry either file_url or esign.completedAt).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { hidden?: unknown }
  // Defaults to hiding; an explicit `hidden: false` clears the marker.
  const hidden = body.hidden !== false

  // ── 1. Ownership check (session client, RLS-scoped) — the caller's OWN
  // row, and only the caller's own row. No cross-party read here at all.
  const { data: doc, error } = await apiClient
    .from('vault_documents')
    .select('id, document_data')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── 2. Merge, never overwrite — existing keys (esign evidence,
  // split_sheet_id linkage, etc.) survive untouched.
  const existingData = (doc.document_data ?? {}) as Record<string, unknown>
  const nextDocumentData = { ...existingData, hidden }

  const service = createServiceClient()
  const { error: updateError } = await service
    .from('vault_documents')
    .update({ document_data: nextDocumentData })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: 'Could not update this document' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, hidden })
}
