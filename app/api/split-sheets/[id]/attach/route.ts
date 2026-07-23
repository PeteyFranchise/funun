import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

// ─── POST /api/split-sheets/[id]/attach ───────────────────────────────
// Attaches a split sheet to a vault project, and optionally a specific
// track within it, by writing a split_sheet_attachments row (migration
// 067) — "attaching does not move a document, it creates a relationship"
// (17-DUAL-ENTRY-DESIGN section 2b). Extends 17-05's project-only route
// rather than replacing it: the session-client-reads-then-service-client-
// writes shape (RESEARCH Pattern 4) and the double ownership check below
// are both preserved verbatim.
//
// Double ownership check (V4, T-17-12/T-18-13): the caller must be BOTH (a)
// a party on the sheet (initiator OR an account-holder signer) AND (b) the
// owner of the destination project. Neither check alone is sufficient.
// Every rejection uses the same generic shape — this is a cross-user
// surface, so no response distinguishes "not a party" from "not the
// project owner" from "sheet not found" from "track not in that project."
//
// P18-04 (design section 7, resolved to RELAX): 17-05 shipped this route
// gated on split_sheets.status === 'executed'. That gate is REMOVED here.
// Attachment is orthogonal to the signing lifecycle — a mid-approval sheet
// showing on the project as "in progress" is more useful than invisible,
// and the readiness consequence is bounded because 18-04 scores an
// attached sheet at the tier its own status has earned rather than
// crediting it as fully documented.
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

  // ── 1. Party-or-initiator check (session client, RLS-scoped read) ──────
  // P18-12 (17-DUAL-ENTRY-DESIGN section 10c): this reads
  // split_sheet_parties — a query that reaches across the sheet's parties,
  // which may include a user who has blocked (or been blocked by) the
  // caller. Block enforcement deliberately does NOT apply to this read: a
  // shared executed legal agreement must survive a block between its
  // co-writers (section 10c), and attach/detach are exactly the kind of
  // structured, document-scoped action section 10c-ii carves out as
  // surviving a block while free-form messaging does not. This is a
  // decision, not an oversight — cite section 10c if a future audit
  // proposes adding block filtering here.
  const { data: sheet, error: sheetError } = await apiClient
    .from('split_sheets')
    .select('id, initiator_user_id, status, vault_project_id, track_id, split_sheet_parties(user_id)')
    .eq('id', id)
    .maybeSingle()

  const parties = (sheet?.split_sheet_parties ?? []) as { user_id: string | null }[]
  const isParty = !!sheet && (sheet.initiator_user_id === user.id || parties.some(p => p.user_id === user.id))

  if (sheetError || !sheet || !isParty) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
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

  // ── 3. Cross-project track tampering check (T-18-14) ────────────────────
  // A caller-supplied track id must be proven to belong to the destination
  // project, with the session client, before any write. Failure returns
  // the route's existing generic rejection shape — a track from another
  // project must never distinguishably 403 differently from any other
  // authorization failure on this surface.
  if (trackId) {
    const { data: track } = await apiClient
      .from('tracks')
      .select('id')
      .eq('id', trackId)
      .eq('project_id', vaultProjectId)
      .maybeSingle()

    if (!track) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
  }

  // ── 4. Idempotency — an identical sheet/project/track triple is a no-op
  // success, never a duplicate row and never an error. (Migration 067's
  // partial unique indexes would reject a duplicate insert regardless;
  // checking first keeps this route's behavior explicit and testable.)
  let existingQuery = apiClient
    .from('split_sheet_attachments')
    .select('id')
    .eq('split_sheet_id', id)
    .eq('vault_project_id', vaultProjectId)
  existingQuery = trackId ? existingQuery.eq('track_id', trackId) : existingQuery.is('track_id', null)
  const { data: existingAttachment } = await existingQuery.maybeSingle()

  // ── 5. Service client — write the relationship ──────────────────────────
  const service = createServiceClient()

  if (!existingAttachment) {
    // A sheet already attached to a different project succeeds here too —
    // this INSERT produces a second attachment row rather than replacing
    // the first, which is the single-and-album case the join table exists
    // for (design section 2b).
    await service.from('split_sheet_attachments').insert({
      split_sheet_id: id,
      vault_project_id: vaultProjectId,
      track_id: trackId,
      attached_by: user.id,
    })
  }

  // Origin fields (design section 2b) record where the sheet was BORN, not
  // every place it has since been attached — set only when previously
  // null, so a sheet's second attachment never overwrites its first origin.
  const originUpdate: Record<string, unknown> = {}
  if (sheet.vault_project_id === null) originUpdate.vault_project_id = vaultProjectId
  if (sheet.track_id === null && trackId) originUpdate.track_id = trackId
  if (Object.keys(originUpdate).length > 0) {
    await service.from('split_sheets').update(originUpdate).eq('id', id)
  }

  // ── 6. Locate the caller's own document row for this sheet ─────────────
  // Scoped by user_id (own row only, RLS-consistent) and type, then matched
  // to THIS sheet by document_data — all read via the session client
  // before any write. Never touches another party's row.
  const { data: candidateDocs } = await apiClient
    .from('vault_documents')
    .select('id, document_data, project_id')
    .eq('user_id', user.id)
    .eq('type', 'split_sheet')

  const ownDoc = (
    (candidateDocs ?? []) as { id: string; document_data: Record<string, unknown> | null; project_id: string | null }[]
  ).find(d => d.document_data?.split_sheet_id === id)

  // The document row points at the PRIMARY attachment (design section 2c):
  // updated when it has no project yet, or when this attach is refining
  // the track within the SAME project it already points at. A genuinely
  // second project (single-and-album) never moves the primary — the
  // second project surfaces the sheet through the attachment join instead,
  // never by duplicating this document row.
  if (ownDoc && (ownDoc.project_id === null || ownDoc.project_id === vaultProjectId)) {
    // project_id UPDATE fires the existing calculate_vault_readiness()
    // trigger for the destination project (RESEARCH Pattern 4).
    await service
      .from('vault_documents')
      .update({ project_id: vaultProjectId, track_id: trackId })
      .eq('id', ownDoc.id)
  }

  return NextResponse.json({ ok: true })
}
