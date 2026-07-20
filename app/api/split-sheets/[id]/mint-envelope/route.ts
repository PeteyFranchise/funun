import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { renderSplitSheet, partyRoleTag } from '@/lib/vault/pdf/split-sheet'
import type { SplitSheetAgreementInput } from '@/lib/vault/pdf/split-sheet'
import type { SplitSheetParty } from '@/lib/split-sheets/approval'
import { generateApprovalToken, APPROVAL_TOKEN_EXPIRY_DAYS } from '@/lib/split-sheets/approval'
import { assertCounselReviewedForProduction } from '@/lib/split-sheets/agreement'
import {
  MONTHLY_NEW_RECIPIENT_CAP,
  checkNewRecipientCap,
  envelopeCountsTowardCap,
  normalizeRecipient,
  buildFastLaneBackfill,
} from '@/lib/split-sheets/envelopes'
import { sendSignatureInvite } from '@/lib/split-sheets/esign-invite'
import type { SignatureInviteResult } from '@/lib/split-sheets/esign-invite'
import { docusealProvider } from '@/lib/esign/docuseal'

// ─── POST /api/split-sheets/[id]/mint-envelope ────────────────────────
// Mints the DocuSeal envelope for a split sheet (ESIGN-04/ESIGN-13).
// Structure mirrors send-for-approval: ownership verified with the SESSION
// client first, then service-client writes (T-01-12).
//
// RUNTIME: default Node. renderSplitSheet -> renderToBuffer() depends on
// Node built-ins (fonts, buffers). NEVER add `export const runtime = 'edge'`
// to this file (RESEARCH Pitfall 6).
//
// This route is the ONLY path that spends money in Phase 17 — each
// completed document bills $0.20 and each signer gets a real email. Every
// gate below runs BEFORE the first DocuSeal call, deliberately: once
// createRequest returns, the envelope exists and the spend is committed.
//
// Two entry paths:
//   post-consensus  sheet.status === 'approved'  — the normal loop
//   fast lane       sheet.status === 'draft'     — initiator skips straight
//                   to signing on a sheet already agreed in person (P17-01,
//                   signature ⊃ approval)

/** Statuses a mint may start from. Anything else is already past this stage. */
const MINTABLE_STATUSES = new Set(['approved', 'draft'])

type PartyRow = {
  id: string
  name: string
  email: string | null
  role: string | null
  pro: string | null
  ipi: string | null
  split_percentage: number
  approval_token: string | null
  legal_name: string | null
  publishing_designee: string | null
  administrator: string | null
}

/** Envelope history rows used to derive the initiator's recipient sets. */
type HistoryRow = {
  status: string
  created_at: string | null
  esign_envelope_signers: { split_sheet_parties: { email: string | null } | null }[] | null
}

function startOfCurrentMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/**
 * Derives the two recipient sets the AM-2c cap needs from an initiator's
 * envelope history:
 *
 *   priorRecipients       every address ever contacted, all time
 *   newRecipientsThisMonth those whose FIRST contact falls in this month
 *
 * History is filtered through envelopeCountsTowardCap first, so a voided
 * attempt's recipients never enter either set — a void spends no allowance
 * (VOIDED_ENVELOPES_COUNT_TOWARD_CAP), so those people become "new" again
 * on a re-mint.
 */
function deriveRecipientHistory(
  rows: HistoryRow[],
  now: Date
): { priorRecipients: string[]; newRecipientsThisMonth: string[] } {
  const monthStart = startOfCurrentMonth(now)
  // Earliest counting contact per recipient.
  const firstSeen = new Map<string, number>()

  for (const row of rows) {
    if (!envelopeCountsTowardCap(row.status)) continue
    const at = row.created_at ? Date.parse(row.created_at) : Number.NaN
    const timestamp = Number.isFinite(at) ? at : Date.now()

    for (const signer of row.esign_envelope_signers ?? []) {
      const email = normalizeRecipient(signer.split_sheet_parties?.email)
      if (!email) continue
      const existing = firstSeen.get(email)
      if (existing === undefined || timestamp < existing) firstSeen.set(email, timestamp)
    }
  }

  const priorRecipients = [...firstSeen.keys()]
  const newRecipientsThisMonth = priorRecipients.filter(
    email => (firstSeen.get(email) ?? 0) >= monthStart.getTime()
  )

  return { priorRecipients, newRecipientsThisMonth }
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

  // ── 2. Ownership — only the initiator mints (session client) ───────
  const { data: sheet, error: sheetError } = await apiClient
    .from('split_sheets')
    .select('*, split_sheet_parties(*)')
    .eq('id', id)
    .eq('initiator_user_id', user.id)
    .maybeSingle()

  if (sheetError || !sheet) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  const status = String(sheet.status)
  if (!MINTABLE_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `A split sheet in "${status}" cannot be minted for signature` },
      { status: 409 }
    )
  }
  const isFastLane = status === 'draft'

  const parties = (sheet.split_sheet_parties ?? []) as PartyRow[]
  if (parties.length === 0) {
    return NextResponse.json({ error: 'Split sheet has no parties' }, { status: 400 })
  }

  const signableParties = parties.filter(p => normalizeRecipient(p.email))
  if (signableParties.length !== parties.length) {
    return NextResponse.json(
      { error: 'Every party needs an email address before the sheet can be sent for signature' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // ── 3. PRE-FLIGHT GATES — both run BEFORE any DocuSeal call ────────
  // Kept together and first so the two things that must never reach a
  // real artist's signature are visibly adjacent: unreviewed legal
  // language, and uncapped spend.

  // 3a. Counsel gate (P17-09a, T-17-35). No-op outside production;
  // throws in production while AGREEMENT_CLAUSES is unreviewed.
  try {
    assertCounselReviewedForProduction()
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'Split-sheet operative language has not cleared attorney review',
      },
      { status: 503 }
    )
  }

  // 3b. AM-2c new-recipient cap (T-17-16). NOT a document cap: many
  // documents to known collaborators is normal use (a 12-track album to
  // three bandmates must succeed); many documents to many strangers is
  // the spam vector this throttles.
  const { data: historyRows, error: historyError } = await service
    .from('esign_envelopes')
    .select(
      'status, created_at, split_sheets!inner(initiator_user_id), esign_envelope_signers(split_sheet_parties(email))'
    )
    .eq('split_sheets.initiator_user_id', user.id)

  if (historyError) {
    return NextResponse.json(
      { error: `Could not verify the monthly sending limit: ${historyError.message}` },
      { status: 500 }
    )
  }

  const { priorRecipients, newRecipientsThisMonth } = deriveRecipientHistory(
    (historyRows ?? []) as unknown as HistoryRow[],
    now
  )

  const capCheck = checkNewRecipientCap({
    priorRecipients,
    newRecipientsThisMonth,
    outgoingRecipients: signableParties.map(p => p.email),
  })

  if (!capCheck.allowed) {
    return NextResponse.json(
      {
        error:
          `This sheet would bring you to ${capCheck.projectedCount} new collaborators this month, ` +
          `over the limit of ${capCheck.cap}. Sheets to people you have already sent to don't count — ` +
          'only first-time recipients do.',
        cap: capCheck.cap,
        projectedCount: capCheck.projectedCount,
        newRecipients: capCheck.newRecipients.length,
      },
      { status: 429 }
    )
  }

  // ── 4. Render the legal-grade agreement (17-09) ────────────────────
  // The FULL SplitSheetAgreementInput, not a reduced shape: work details,
  // agreement date, and every party's legal name / PRO / publishing
  // designee / administrator. A reduced input would put the old ambiguous
  // single-percentage table in front of real signers.
  const agreementParties: SplitSheetParty[] = signableParties.map(p => ({
    name: p.name,
    email: p.email,
    pro: p.pro,
    ipi: p.ipi,
    role: p.role,
    split_percentage: Number(p.split_percentage),
    legal_name: p.legal_name,
    publishing_designee: p.publishing_designee,
    administrator: p.administrator,
  }))

  const { data: initiatorProfile } = await service
    .from('artist_profiles')
    .select('artist_name')
    .eq('id', user.id)
    .maybeSingle()

  const initiatorName = (initiatorProfile?.artist_name as string | null) ?? null

  const agreementInput: SplitSheetAgreementInput = {
    songName: String(sheet.song_name),
    artistName: (sheet.artist_name as string | null) ?? initiatorName,
    albumProjectTitle: (sheet.album_project_title as string | null) ?? null,
    recordLabel: (sheet.record_label as string | null) ?? null,
    // Snapshotted at mint time so the executed record is stable even if
    // the sheet is edited later.
    agreementDate: nowIso,
    initiatorName,
    parties: agreementParties,
  }

  let pdfBytes: Buffer
  try {
    pdfBytes = await renderSplitSheet(agreementInput)
  } catch (e) {
    return NextResponse.json(
      { error: `Could not render the split sheet: ${e instanceof Error ? e.message : 'unknown error'}` },
      { status: 500 }
    )
  }

  // ── 5. Mint — the first and only DocuSeal call, after every gate ───
  let created
  try {
    created = await docusealProvider.createRequest({
      title: `Split Sheet — ${sheet.song_name}`,
      pdf: {
        filename: `split-sheet-${id}.pdf`,
        bytes: new Uint8Array(pdfBytes),
      },
      signers: signableParties.map((p, index) => ({
        name: p.name,
        email: String(p.email),
        // Must match the {{Signature;role=PartyN}} tags the renderer
        // embedded, by the same index — this is what binds a submitter to
        // their own signature field.
        role: partyRoleTag(index),
        externalId: p.id,
      })),
      embedded: true,
      replyTo: (process.env.ESIGN_FROM_EMAIL ?? '').trim() || undefined,
    })
  } catch (e) {
    return NextResponse.json(
      { error: `Could not create the signature request: ${e instanceof Error ? e.message : 'unknown error'}` },
      { status: 502 }
    )
  }

  // ── 6. Persist the attempt ─────────────────────────────────────────
  // A new esign_envelopes ROW per attempt — a re-mint after a void never
  // overwrites the voided attempt (P17-02, T-17-18).
  const { data: envelope, error: envelopeError } = await service
    .from('esign_envelopes')
    .insert({
      split_sheet_id: id,
      docuseal_submission_id: created.requestId,
      docuseal_template_id: created.templateId ?? null,
      status: 'pending',
      order_mode: 'random',
      // Unbilled until completion — DocuSeal bills per COMPLETED document
      // (provider gate, 2026-07-20). The webhook (17-07) flips this.
      billed: false,
    })
    .select('id')
    .single()

  if (envelopeError || !envelope) {
    // The envelope exists at DocuSeal but Funūn could not record it.
    // Surfaced loudly rather than swallowed: the submission id below is
    // the only handle left for reconciliation.
    return NextResponse.json(
      {
        error: `Signature request created but could not be recorded: ${envelopeError?.message ?? 'unknown error'}`,
        docusealSubmissionId: created.requestId,
      },
      { status: 500 }
    )
  }

  const signerRows = signableParties.map((party, index) => {
    const role = partyRoleTag(index)
    const match =
      created.signers?.find(s => s.externalId === party.id) ??
      created.signers?.find(s => s.role === role) ??
      created.signers?.find(s => normalizeRecipient(s.email) === normalizeRecipient(party.email))
    return {
      envelope_id: envelope.id,
      split_sheet_party_id: party.id,
      docuseal_submitter_id: match?.submitterId ?? null,
      signer_slug: match?.slug ?? null,
      status: 'pending',
    }
  })

  const { error: signersError } = await service.from('esign_envelope_signers').insert(signerRows)
  if (signersError) {
    return NextResponse.json(
      {
        error: `Signature request created but signer rows could not be recorded: ${signersError.message}`,
        docusealSubmissionId: created.requestId,
      },
      { status: 500 }
    )
  }

  // ── 7. Advance the sheet ───────────────────────────────────────────
  // Fast lane backfills approval onto every party first (P17-01,
  // signature ⊃ approval) so downstream logic — readiness tiering,
  // notifications, the approve-page phase resolver — has one truth: the
  // sheet ENTERS at tier 10 exactly as one that came through the normal
  // approve/counter loop.
  //
  // DELIBERATE ORDERING: the backfill is applied AFTER a successful mint
  // rather than before it. Writing approval state ahead of a call that can
  // fail would leave a sheet claiming consensus with no envelope behind
  // it; the semantics ("the signature backfills approval") are unchanged
  // either way, and this ordering has no failure window.
  const backfill = buildFastLaneBackfill(nowIso)

  if (isFastLane) {
    await service
      .from('split_sheet_parties')
      .update(backfill.partyUpdate)
      .eq('split_sheet_id', id)
    await service.from('split_sheets').update(backfill.sheetUpdate).eq('id', id)
  } else {
    await service
      .from('split_sheets')
      .update({ status: 'esign_pending' })
      .eq('id', id)
  }

  // ── 8. Funūn's own invites (P17-10, ESIGN-18, T-17-36) ─────────────
  // The provider's invite email was disabled at mint, so these are the
  // ONLY messages a collaborator receives. Each party needs a live
  // approval token — the fast lane starts from draft, where no token was
  // ever issued.
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)

  const tokens: Record<string, string> = {}
  for (const party of signableParties) {
    if (party.approval_token) {
      tokens[party.id] = party.approval_token
      continue
    }
    const token = generateApprovalToken()
    tokens[party.id] = token
    await service
      .from('split_sheet_parties')
      .update({ approval_token: token, token_expires_at: expiresAt.toISOString() })
      .eq('id', party.id)
  }

  const inviteParties = agreementParties.map(p => ({
    name: p.name,
    splitPercentage: p.split_percentage,
  }))

  // An invite failure must NEVER abort or roll back the mint (T-17-33):
  // the envelope is already spent by this point. Partial delivery is
  // reported instead, and re-delivery is the nudge path's job (17-04).
  const inviteResults: SignatureInviteResult[] = []
  for (const party of signableParties) {
    inviteResults.push(
      await sendSignatureInvite({
        songName: String(sheet.song_name),
        initiatorName,
        signerName: party.name,
        signerEmail: String(party.email),
        signerSplitPercentage: Number(party.split_percentage),
        token: tokens[party.id],
        parties: inviteParties,
      })
    )
  }

  const invitesSent = inviteResults.filter(r => r.ok).length
  const invitesFailed = inviteResults.filter(r => !r.ok && !r.notConfigured).map(r => r.email)
  const invitesNotConfigured = inviteResults.some(r => r.notConfigured)

  return NextResponse.json({
    ok: true,
    envelopeId: envelope.id,
    docusealSubmissionId: created.requestId,
    fastLane: isFastLane,
    status: 'esign_pending',
    cap: {
      limit: MONTHLY_NEW_RECIPIENT_CAP,
      newRecipients: capCheck.newRecipients.length,
      usedThisMonth: capCheck.projectedCount,
    },
    invites: {
      sent: invitesSent,
      ...(invitesFailed.length > 0 ? { failed: invitesFailed } : {}),
      ...(invitesNotConfigured ? { notConfigured: true } : {}),
    },
  })
}
