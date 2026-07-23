import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyDocusealSignature, parseDocusealEvent } from '@/lib/esign/webhook'
import { docusealProvider } from '@/lib/esign/docuseal'
import type { EsignCompletionArtifacts } from '@/lib/esign/docuseal'
import { DOC_BUCKET } from '@/lib/storage'
import { buildFanoutRows } from '@/lib/split-sheets/distribution'
import { renderCompletionCertificate } from '@/lib/vault/pdf/completion-certificate'
import { buildSplitSheetExecutedNotification } from '@/lib/social/notifications'
import { createNotification } from '@/lib/notifications'

// ─── POST /api/webhooks/docuseal ──────────────────────────────────────
// The completion half of Funūn's first live e-sign integration (ESIGN-07).
// A verified `submission.completed` is what turns a minted envelope into a
// fully executed split sheet: documents re-hosted, envelope/signers/sheet
// transitioned, locker rows fanned out (Task 2), notifications fired.
//
// THREE PROPERTIES, IN THIS ORDER, ARE NON-NEGOTIABLE:
//
// 1. RAW BODY FIRST. The HMAC is computed over the exact bytes DocuSeal
//    signed. Every other route in this app calls request.json() first, but
//    a parsed-then-reserialized object rarely reproduces those bytes — key
//    order and whitespace both drift. So: read text, verify, and only then
//    parse. Nothing above the gate touches the database, and the gate runs
//    before the service client is even constructed, so a forged
//    `submission.completed` cannot fabricate an executed sheet no matter
//    what it claims (T-17-20, RESEARCH V6).
//
// 2. IDEMPOTENT ON THE ENVELOPE'S STATUS. Providers retry, and DocuSeal
//    redelivers on any non-2xx. A second delivery for an already-completed
//    envelope must not re-file documents into a collaborator's Contract
//    Locker or re-notify them (T-17-21, RESEARCH Pitfall 7).
//
// 3. PROMPT. The executed PDF and audit-log URLs expire in ~40 minutes.
//    Both are downloaded and re-hosted synchronously inside this handler.
//    Queueing them for a later job is how a document is lost permanently
//    (RESEARCH Anti-Patterns, T-17-22).
//
// RUNTIME: default Node, deliberately. Raw-body access and the certificate
// renderer's renderToBuffer() both depend on Node built-ins. NEVER add
// `export const runtime = 'edge'` to this file (RESEARCH Pitfall 6).
//
// RESPONSE DOCTRINE: any outcome that a retry cannot improve — bad
// signature aside — returns 200 so the provider stops redelivering. A
// genuinely transient failure (download, storage, database) returns 5xx so
// it retries into the idempotency guard, which is safe by construction.

/** The `X-Docuseal-Signature` header carrying `{unixSeconds}.{hexHmac}`. */
const SIGNATURE_HEADER = 'X-Docuseal-Signature'

type PartyRow = {
  id: string
  user_id: string | null
  name: string
  email: string | null
  legal_name: string | null
  split_percentage: number
  pro: string | null
  publishing_designee: string | null
  administrator: string | null
}

type SheetRow = {
  id: string
  song_name: string
  artist_name: string | null
  album_project_title: string | null
  record_label: string | null
  vault_project_id: string | null
  initiator_user_id: string
  split_sheet_parties: PartyRow[]
}

type EnvelopeRow = {
  id: string
  status: string
  split_sheet_id: string
  docuseal_submission_id: string | null
  esign_envelope_signers: {
    id: string
    split_sheet_party_id: string
    docuseal_submitter_id: string | null
  }[]
  split_sheets: SheetRow | null
}

/**
 * Storage path for one completion artifact. Scoped under the INITIATOR's
 * id to match the bucket's existing `{userId}/...` convention, and shared
 * by every fanned-out locker row — the fan-out duplicates database rows,
 * never files (buildFanoutRows, 17-05).
 *
 * KEYED ON FUNŪN'S ENVELOPE ID, NEVER THE PROVIDER'S SUBMISSION ID. Two
 * reasons, and the second is the load-bearing one:
 *
 *   - Funūn's storage layout should not encode a vendor's identifier. The
 *     envelope id is stable across any future provider migration; a
 *     DocuSeal submission id is not.
 *   - This path is a Funūn-OBSERVED fact and renders in the certificate's
 *     unattributed section. A submission id baked into the filename would
 *     therefore print a provider-reported value outside the attributed
 *     provider region — a real violation of the honesty constraint
 *     (T-17-30), caught by the provenance test in
 *     __tests__/docuseal-webhook.test.ts. Do not reintroduce it.
 *
 * The envelope id is per-ATTEMPT (a void→re-mint inserts a new row), so
 * this stays collision-free across re-mints without a timestamp.
 */
function artifactPath(
  initiatorUserId: string,
  sheetId: string,
  envelopeId: string,
  kind: 'executed' | 'audit-log' | 'certificate'
): string {
  return `${initiatorUserId}/split-sheets/${sheetId}/${kind}-${envelopeId}.pdf`
}

/**
 * Renders Funūn's Certificate of Completion and files it into the locker
 * bucket. Returns false when either half failed.
 *
 * NON-FATAL BY DESIGN. By the time this runs, the envelope is complete at
 * the provider and the $0.20 is already spent; the executed PDF and the
 * audit log are already stored. Throwing here would hand the provider a
 * 5xx, and the retry would short-circuit on the idempotency guard — so the
 * failure would be permanent AND invisible. Degrading instead keeps the
 * executed document filed and leaves the certificate regenerable, since
 * every input to it is persisted.
 */
async function renderAndStoreCertificate(args: {
  service: ReturnType<typeof createServiceClient>
  sheet: SheetRow
  artifacts: EsignCompletionArtifacts
  submissionId: string
  executedPath: string
  auditLogPath: string | null
  certificatePath: string
}): Promise<boolean> {
  const { service, sheet, artifacts, executedPath, auditLogPath, certificatePath } = args

  try {
    const pdf = await renderCompletionCertificate({
      // Funūn's own database rows. Every value here is something Funūn
      // recorded itself.
      funuunObserved: {
        songName: sheet.song_name,
        artistName: sheet.artist_name,
        albumProjectTitle: sheet.album_project_title,
        recordLabel: sheet.record_label,
        splitSheetId: sheet.id,
        executedDocumentPath: executedPath,
        parties: sheet.split_sheet_parties.map(p => ({
          legalName: p.legal_name || p.name,
          professionalName: p.legal_name && p.legal_name !== p.name ? p.name : null,
          splitPercentage: Number(p.split_percentage),
          pro: p.pro,
          publishingDesignee: p.publishing_designee,
          administrator: p.administrator,
        })),
      },
      // Facts DocuSeal reported. Handed through from the adapter WITHOUT
      // reshaping — the adapter already returns this group in the exact
      // shape the renderer's single attributed consumer expects.
      providerReported: {
        providerName: 'DocuSeal',
        submissionId: args.submissionId,
        originalDocumentSha256: artifacts.originalDocumentSha256,
        resultDocumentSha256: artifacts.resultDocumentSha256,
        auditLogPath,
        signers: artifacts.signers.map(s => ({
          name: s.name,
          email: s.email,
          completedAt: s.completedAt,
          completionMethod: s.completionMethod,
          emailVerified: s.emailVerified,
          ipAddress: s.ipAddress,
          sessionId: s.sessionId,
          userAgent: s.userAgent,
          timezone: s.timezone,
        })),
      },
    })

    const { error } = await service.storage
      .from(DOC_BUCKET)
      .upload(certificatePath, Buffer.from(pdf), {
        upsert: true,
        contentType: 'application/pdf',
      })

    return !error
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  // ── 1. Raw body, read BEFORE anything else ─────────────────────────
  const rawBody = await request.text()
  const signature = request.headers.get(SIGNATURE_HEADER)

  const secret = (process.env.DOCUSEAL_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    // Refuse rather than degrade: an unverifiable webhook that still wrote
    // would be strictly worse than one that never ran.
    return NextResponse.json(
      { error: 'Webhook verification is not configured' },
      { status: 503 }
    )
  }

  // ── 2. THE GATE — nothing below runs on a bad or stale signature ───
  if (!verifyDocusealSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 401 })
  }

  // ── 3. Only now is it safe to parse ────────────────────────────────
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    // Signed but unparseable: a retry produces the same bytes, so 200.
    return NextResponse.json({ ok: true, ignored: 'unparseable' })
  }

  const event = parseDocusealEvent(payload)

  // Funūn acts only on full completion. Every other event type — viewed,
  // started, declined, archived — is acknowledged so the provider stops
  // redelivering it. (Per-signer progress is 17-04's nudge surface, not
  // this route's concern.)
  if (event.type !== 'all_signed' || !event.requestId) {
    return NextResponse.json({ ok: true, ignored: event.type })
  }

  const service = createServiceClient()

  // ── 4. Resolve the envelope, its signers, and the sheet in one query ─
  const { data: envelopeData, error: envelopeError } = await service
    .from('esign_envelopes')
    .select(
      'id, status, split_sheet_id, docuseal_submission_id, ' +
        'esign_envelope_signers(id, split_sheet_party_id, docuseal_submitter_id), ' +
        'split_sheets(id, song_name, artist_name, album_project_title, record_label, ' +
        'vault_project_id, initiator_user_id, ' +
        'split_sheet_parties(id, user_id, name, email, legal_name, split_percentage, ' +
        'pro, publishing_designee, administrator))'
    )
    .eq('docuseal_submission_id', event.requestId)
    .maybeSingle()

  if (envelopeError) {
    // Transient — let the provider retry into the idempotency guard.
    return NextResponse.json({ error: 'Could not resolve the envelope' }, { status: 500 })
  }

  const envelope = envelopeData as EnvelopeRow | null

  // An envelope Funūn does not know about is permanent, not transient:
  // 200 so DocuSeal stops retrying a delivery no retry can fix.
  if (!envelope) {
    return NextResponse.json({ ok: true, ignored: 'unknown_submission' })
  }

  // ── 5. THE IDEMPOTENCY GUARD ───────────────────────────────────────
  // Everything expensive, billable, or user-visible lives below this line.
  if (envelope.status === 'completed') {
    return NextResponse.json({ ok: true, idempotent: true })
  }

  const sheet = envelope.split_sheets
  if (!sheet) {
    return NextResponse.json({ ok: true, ignored: 'orphaned_envelope' })
  }

  // ── 6. Re-host both provider artifacts, promptly (T-17-22) ─────────
  let artifacts
  try {
    artifacts = await docusealProvider.fetchCompletionArtifacts(event.requestId)
  } catch (e) {
    return NextResponse.json(
      {
        error: `Could not fetch the executed documents: ${e instanceof Error ? e.message : 'unknown error'}`,
      },
      { status: 502 }
    )
  }

  const executedPath = artifactPath(
    sheet.initiator_user_id,
    sheet.id,
    envelope.id,
    'executed'
  )

  const { error: executedUploadError } = await service.storage
    .from(DOC_BUCKET)
    .upload(executedPath, Buffer.from(artifacts.executedPdf), {
      upsert: true,
      contentType: 'application/pdf',
    })

  if (executedUploadError) {
    return NextResponse.json(
      { error: `Could not store the executed document: ${executedUploadError.message}` },
      { status: 500 }
    )
  }

  let auditLogPath: string | null = null
  if (artifacts.auditLog) {
    const path = artifactPath(sheet.initiator_user_id, sheet.id, envelope.id, 'audit-log')
    const { error: auditUploadError } = await service.storage
      .from(DOC_BUCKET)
      .upload(path, Buffer.from(artifacts.auditLog), {
        upsert: true,
        contentType: 'application/pdf',
      })
    // A missing audit log must not strand an otherwise complete execution.
    // The certificate cites the log by stored path only when one landed,
    // and a citation to a file that is not there is worse than none
    // (17-10's one integration invariant).
    if (!auditUploadError) auditLogPath = path
  }

  const completedAt = new Date().toISOString()

  // ── 7. Funūn's OWN Certificate of Completion (P17-10, ESIGN-19) ────
  // The artist-facing completion artifact is Funūn's, not the provider's.
  // DocuSeal's audit log remains the authoritative evidence record and is
  // CITED by its stored locker path — which is why this renders only after
  // the audit log has actually landed above. A citation to a file that is
  // not there is worse than no citation (17-10's one integration
  // invariant), so auditLogPath is null rather than speculative when the
  // upload did not succeed.
  //
  // The two provenance groups are passed SEPARATELY and are never merged,
  // reshaped, or flattened. That separation is the honesty guarantee that
  // Funūn does not present provider-captured evidence (IP, session, user
  // agent, timezone, verification status) as its own observation
  // (T-17-30). 17-10 owns the renderer; this route only supplies each
  // group from its actual source and files the result.
  const certificatePath = artifactPath(
    sheet.initiator_user_id,
    sheet.id,
    envelope.id,
    'certificate'
  )

  const certificateStored = await renderAndStoreCertificate({
    service,
    sheet,
    artifacts,
    submissionId: event.requestId,
    executedPath,
    auditLogPath,
    certificatePath,
  })

  // ── 8. Transition envelope, signers, and sheet ─────────────────────
  const { error: envelopeUpdateError } = await service
    .from('esign_envelopes')
    .update({
      status: 'completed',
      completed_at: completedAt,
      executed_file_path: executedPath,
      audit_log_path: auditLogPath,
      // DocuSeal bills per COMPLETED document (provider gate, 2026-07-20);
      // this is the moment the $0.20 is actually incurred.
      billed: true,
    })
    .eq('id', envelope.id)

  if (envelopeUpdateError) {
    return NextResponse.json(
      { error: `Could not record the completion: ${envelopeUpdateError.message}` },
      { status: 500 }
    )
  }

  // Certificate pointer, written SEPARATELY and non-fatally.
  //
  // esign_envelopes.certificate_path arrives in migration 065, which is
  // authored but not yet pushed (pushes are human-gated in this repo — see
  // 062's header). Folding this key into the update above would make the
  // whole completion fail on an unpushed database AFTER the $0.20 was
  // already spent and the documents already stored. Isolated instead: on
  // an unpushed database the pointer is skipped, every artifact is still
  // filed, and the path is deterministic from (initiator, sheet, envelope)
  // so it is recoverable. The response reports which happened.
  const { error: certificatePointerError } = certificateStored
    ? await service
        .from('esign_envelopes')
        .update({ certificate_path: certificatePath })
        .eq('id', envelope.id)
    : { error: null }

  await service
    .from('esign_envelope_signers')
    .update({ status: 'completed', signed_at: completedAt })
    .eq('envelope_id', envelope.id)

  // Flips the sheet to executed. The 17-02 readiness trigger moves the
  // attached project to tier 15 once the fan-out rows land.
  await service.from('split_sheets').update({ status: 'executed' }).eq('id', sheet.id)

  // ── 9. Cross-account Contract Locker fan-out (P17-06, ESIGN-10) ────
  // One vault_documents row per ACCOUNT-HOLDER party — a collaborator
  // without a Funūn account gets nothing here and retrieves the executed
  // PDF from their token link instead. Every row points at the SAME stored
  // file: the fan-out duplicates database rows, never files. buildFanoutRows
  // (17-05) owns the row shape, including the evidence guard that migration
  // 045/049 enforces and the document_data.split_sheet_id join key the
  // attach affordance resolves against.
  const fanoutRows = buildFanoutRows({
    parties: sheet.split_sheet_parties.map(p => ({
      user_id: p.user_id,
      name: p.name,
      email: p.email ?? '',
    })),
    sheet: { id: sheet.id, vault_project_id: sheet.vault_project_id },
    executedFileUrl: executedPath,
    // Empty, NOT a fallback to the executed PDF, when no audit log landed.
    // Pointing auditTrailUrl at the executed document would assert that the
    // signed contract IS its own audit trail — a false evidentiary claim in
    // exactly the artifact a royalty dispute reaches for. Absent is honest;
    // wrong is not.
    auditTrailUrl: auditLogPath ?? '',
    completedAt,
    requestId: event.requestId,
  })

  if (fanoutRows.length > 0) {
    await service.from('vault_documents').insert(fanoutRows)
  }

  // ── 10. Executed notification + the OFFERED write-back (P17-07) ─────
  // Nothing below writes composers[]. `reconcileOffered` is a prompt: the
  // diff is computed on demand by GET /api/split-sheets/[id]/reconcile and
  // applied ONLY by an explicit POST confirm, a request shape this route
  // never issues. Dismissing the offer therefore leaves composers[]
  // untouched by construction, not by convention (ESIGN-12).
  //
  // Offered only when the sheet is attached to a project — there is no
  // composers[] to reconcile against on a standalone sheet.
  const reconcileOffered = Boolean(sheet.vault_project_id)

  // One notification per ACCOUNT-HOLDER party. The initiator is a party on
  // their own sheet, so they are covered by this same pass rather than
  // notified twice.
  const notified = new Set<string>()
  for (const party of sheet.split_sheet_parties) {
    if (!party.user_id || notified.has(party.user_id)) continue
    notified.add(party.user_id)

    const payload = buildSplitSheetExecutedNotification({
      recipientId: party.user_id,
      splitSheetId: sheet.id,
      songName: sheet.song_name,
      partyId: party.id,
      partyName: party.name,
    })

    await createNotification(service, {
      ...payload,
      data: { ...payload.data, reconcileOffered },
    })
  }

  return NextResponse.json({
    ok: true,
    envelopeId: envelope.id,
    splitSheetId: sheet.id,
    executedFilePath: executedPath,
    auditLogPath,
    certificatePath: certificateStored ? certificatePath : null,
    // false on an unpushed migration 065 — the file is stored regardless.
    certificatePathRecorded: certificateStored && !certificatePointerError,
    fanoutRows: fanoutRows.length,
    notified: notified.size,
    reconcileOffered,
  })
}
