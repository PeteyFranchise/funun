import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildVoidReset } from '@/lib/split-sheets/envelopes'
import { docusealProvider } from '@/lib/esign/docuseal'

// ─── POST /api/split-sheets/[id]/void ─────────────────────────────────
// ANY party's objection voids a minted envelope before all signatures
// land (P17-02, ESIGN-05) — not just the initiator's. A collaborator who
// reads the document and disagrees must be able to stop it; requiring
// them to ask the sender to withdraw it would put the objecting party at
// the mercy of the person they are objecting to.
//
// The DocuSeal submission is ARCHIVED (DELETE /submissions/{id}), which
// leaves it at status `pending` and never `completed` — so it never bills
// (provider gate, submission 9477116). Funūn's own envelope row is marked
// 'voided' with voided_at and is NEVER deleted: the attempt is audit
// history (T-17-18). Re-consensus mints a brand-new row.

type PartyRow = {
  id: string
  user_id: string | null
  approval_status: string | null
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth gate ───────────────────────────────────────────────────
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // ── 2. Load via the SESSION client ─────────────────────────────────
  // RLS (migration 018) already scopes this to the initiator and named
  // parties, but authorization is re-checked explicitly below rather than
  // inferred from "the read succeeded".
  const { data: sheet, error: sheetError } = await apiClient
    .from('split_sheets')
    .select('id, status, initiator_user_id, split_sheet_parties(id, user_id, approval_status)')
    .eq('id', id)
    .maybeSingle()

  if (sheetError || !sheet) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  const parties = (sheet.split_sheet_parties ?? []) as PartyRow[]
  const isInitiator = sheet.initiator_user_id === user.id
  const isParty = parties.some(p => p.user_id === user.id)

  if (!isInitiator && !isParty) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  if (sheet.status !== 'esign_pending') {
    return NextResponse.json(
      { error: `A split sheet in "${sheet.status}" has no envelope awaiting signature` },
      { status: 409 }
    )
  }

  const service = createServiceClient()

  // ── 3. The live envelope — most recent pending attempt ─────────────
  const { data: envelope, error: envelopeError } = await service
    .from('esign_envelopes')
    .select('id, docuseal_submission_id, status')
    .eq('split_sheet_id', id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (envelopeError || !envelope) {
    return NextResponse.json({ error: 'No pending envelope to void' }, { status: 404 })
  }

  // ── 4. Archive at the provider ─────────────────────────────────────
  // Attempted before the local writes so a provider failure leaves the
  // sheet untouched rather than showing a party a voided sheet whose
  // signing form is still live and signable.
  if (envelope.docuseal_submission_id) {
    try {
      await docusealProvider.archiveSubmission(String(envelope.docuseal_submission_id))
    } catch (e) {
      return NextResponse.json(
        {
          error: `Could not withdraw the signature request: ${e instanceof Error ? e.message : 'unknown error'}`,
        },
        { status: 502 }
      )
    }
  }

  // ── 5. Apply the void reset (P17-02) ───────────────────────────────
  // The sheet returns to 'countered' when any party has an outstanding
  // counter-proposal to resolve, otherwise to 'pending_approval'.
  const hasCounter = parties.some(p => p.approval_status === 'countered')
  const reset = buildVoidReset(new Date().toISOString(), hasCounter)

  const { error: voidError } = await service
    .from('esign_envelopes')
    // Marked voided, never deleted — the attempt is audit history.
    .update({ ...reset.envelopeUpdate, billed: false })
    .eq('id', envelope.id)

  if (voidError) {
    return NextResponse.json(
      { error: `Signature request withdrawn but could not be recorded: ${voidError.message}` },
      { status: 500 }
    )
  }

  await service.from('split_sheets').update(reset.sheetUpdate).eq('id', id)

  return NextResponse.json({
    ok: true,
    envelopeId: envelope.id,
    envelopeStatus: reset.envelopeUpdate.status,
    sheetStatus: reset.sheetUpdate.status,
    voidedBy: isInitiator ? 'initiator' : 'party',
  })
}
