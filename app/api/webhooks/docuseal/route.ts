import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyDocusealSignature, parseDocusealEvent } from '@/lib/esign/webhook'
import { docusealProvider } from '@/lib/esign/docuseal'
import { DOC_BUCKET } from '@/lib/storage'

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
 */
function artifactPath(
  initiatorUserId: string,
  sheetId: string,
  submissionId: string,
  kind: 'executed' | 'audit-log' | 'certificate'
): string {
  return `${initiatorUserId}/split-sheets/${sheetId}/${kind}-${submissionId}.pdf`
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
    event.requestId,
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
    const path = artifactPath(sheet.initiator_user_id, sheet.id, event.requestId, 'audit-log')
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

  // ── 7. Transition envelope, signers, and sheet ─────────────────────
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

  await service
    .from('esign_envelope_signers')
    .update({ status: 'completed', signed_at: completedAt })
    .eq('envelope_id', envelope.id)

  // Flips the sheet to executed. The 17-02 readiness trigger moves the
  // attached project to tier 15 once the fan-out rows land.
  await service.from('split_sheets').update({ status: 'executed' }).eq('id', sheet.id)

  return NextResponse.json({
    ok: true,
    envelopeId: envelope.id,
    splitSheetId: sheet.id,
    executedFilePath: executedPath,
    auditLogPath,
  })
}
