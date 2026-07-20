import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

// ─── POST /api/split-sheets/[id]/attach ───────────────────────────────
// Attaches a standalone (project_id IS NULL) executed split sheet to a
// vault project — "the document follows the song, not the project row"
// (P17-05/P17-05a). Mirrors send-for-approval's ownership-check-with-
// session-client-then-service-write structure (RESEARCH Pattern 4).
//
// Double ownership check (V4, T-17-12): the caller must be BOTH (a) a party
// on the sheet (initiator OR an account-holder signer) AND (b) the owner of
// the destination project. Neither check alone is sufficient. Every
// rejection uses the same generic shape — this is a cross-user surface, so
// no response distinguishes "not a party" from "not the project owner" from
// "sheet not found," honoring the Phase 13 no-leak doctrine even though no
// party-to-party block state is read here (lib/trust-safety/block-check.ts
// gates targeted writes at another specific user; this route only ever
// writes into the CALLER's own project/document rows).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { vault_project_id?: unknown }
  const vaultProjectId = typeof body.vault_project_id === 'string' ? body.vault_project_id : ''
  if (!vaultProjectId) {
    return NextResponse.json({ error: 'vault_project_id is required' }, { status: 400 })
  }

  // ── 1. Party-or-initiator check (session client, RLS-scoped read) ──────
  const { data: sheet, error: sheetError } = await apiClient
    .from('split_sheets')
    .select('id, initiator_user_id, status, vault_project_id, split_sheet_parties(user_id)')
    .eq('id', id)
    .maybeSingle()

  const parties = (sheet?.split_sheet_parties ?? []) as { user_id: string | null }[]
  const isParty = !!sheet && (sheet.initiator_user_id === user.id || parties.some(p => p.user_id === user.id))

  if (sheetError || !sheet || !isParty) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (sheet.status !== 'executed') {
    return NextResponse.json({ error: 'Only a fully executed split sheet can be attached' }, { status: 400 })
  }

  // ── 2. Target-project ownership check ───────────────────────────────────
  const { data: project } = await apiClient
    .from('vault_projects')
    .select('id')
    .eq('id', vaultProjectId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // ── 3. Locate the caller's own standalone document row for this sheet ──
  // Scoped by user_id (own row only, RLS-consistent), type, and
  // project_id IS NULL — then matched to THIS sheet by document_data, all
  // read via the session client before any write.
  const { data: candidateDocs } = await apiClient
    .from('vault_documents')
    .select('id, document_data')
    .eq('user_id', user.id)
    .eq('type', 'split_sheet')
    .is('project_id', null)

  const ownDoc = ((candidateDocs ?? []) as { id: string; document_data: Record<string, unknown> | null }[]).find(
    d => d.document_data?.split_sheet_id === id
  )

  // ── 4. Service client — the sheet + document follow the song ───────────
  const service = createServiceClient()
  await service.from('split_sheets').update({ vault_project_id: vaultProjectId }).eq('id', id)

  if (ownDoc) {
    // project_id UPDATE fires the existing calculate_vault_readiness()
    // trigger, moving the destination project's readiness (RESEARCH
    // Pattern 4).
    await service.from('vault_documents').update({ project_id: vaultProjectId }).eq('id', ownDoc.id)
  }

  return NextResponse.json({ ok: true })
}
