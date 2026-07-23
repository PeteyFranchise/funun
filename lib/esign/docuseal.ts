// ─── DocuSeal provider — plain fetch adapter ──────────────────────────
// Funūn's first LIVE e-sign integration (D-18b, AM-5), implementing the
// vendor-agnostic EsignProvider contract from lib/esign/provider.ts.
//
// NO VENDOR SERVER SDK. This file is `fetch` and nothing else, matching
// provider.ts's own header philosophy and the approach 16-09's SignWell
// adapter reuses. The ONLY DocuSeal package in package.json is
// @docuseal/react — the MIT client embed SDK — and it is imported solely
// by components/split-sheets/SplitSheetSigningEmbed.tsx, never here.
//
// SERVER ONLY. DOCUSEAL_API_KEY is read at call time from a non-public env
// var and travels only in the X-Auth-Token request header. It must never
// be NEXT_PUBLIC_*, never be returned to a caller, and never reach the
// browser (RESEARCH V13, T-17-15). What the browser receives instead is a
// per-signer `slug` — a scoped credential for ONE signer's fields on ONE
// submission.
//
// COST NOTE: every completed document on the hosted tier bills $0.20 and
// every submission can mint real signature invites. Nothing in this file
// may be exercised against the live API from a test — lib/esign/docuseal
// .test.ts mocks fetch throughout, deliberately.
//
// Webhook verification is NOT re-implemented here. parseWebhook delegates
// to lib/esign/webhook.ts (17-01), the pure crypto module whose HMAC
// scheme was confirmed against a live webhook at the provider-verification
// gate. Two implementations of one signature scheme is one too many.

import type {
  EsignCreateResult,
  EsignCreatedSigner,
  EsignProvider,
  EsignRequestInput,
  EsignWebhookEvent,
} from './provider'
import { parseDocusealEvent, verifyDocusealSignature } from './webhook'

// ─── Constants ──────────────────────────────────────────────────────────

/** Global cloud API root. EU cloud (api.docuseal.eu) would be a config change. */
export const DOCUSEAL_API_BASE = 'https://api.docuseal.com'

/** Host serving per-signer `/s/{slug}` embed URLs. */
export const DOCUSEAL_EMBED_BASE = 'https://docuseal.com'

/**
 * Submission lifetime in days. Deliberately LONGER than Funūn's own
 * 30-day approval-token window (APPROVAL_TOKEN_EXPIRY_DAYS): the provider
 * gate left signer-link expiry independent of Funūn's token, so a
 * submission that expired first would strand a party holding a still-valid
 * Funūn link on a dead signing form (RESEARCH Assumption A4). Funūn's
 * token must always be the binding constraint.
 */
export const SUBMISSION_EXPIRY_DAYS = 45

/** The `X-Docuseal-Signature` header carrying `{unixSeconds}.{hexHmac}`. */
const SIGNATURE_HEADER = 'X-Docuseal-Signature'

// ─── Env access ─────────────────────────────────────────────────────────

/**
 * Reads the server-only API key at call time (not module load) so a route
 * importing this module never fails to build in an environment without
 * credentials — it fails loudly at the moment a call would actually go
 * out. Throws rather than sending an unauthenticated request, which
 * DocuSeal would reject anyway with a far less useful message.
 */
function requireApiKey(): string {
  const key = (process.env.DOCUSEAL_API_KEY ?? '').trim()
  if (!key) {
    throw new Error(
      'DOCUSEAL_API_KEY is not configured — cannot call the DocuSeal API. ' +
        'Set it from the DocuSeal dashboard (API → X-Auth-Token) in the server environment.'
    )
  }
  return key
}

function requireWebhookSecret(): string {
  const secret = (process.env.DOCUSEAL_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    throw new Error(
      'DOCUSEAL_WEBHOOK_SECRET is not configured — refusing to process an unverified webhook. ' +
        'Set it from the DocuSeal dashboard (Webhooks) in the server environment.'
    )
  }
  return secret
}

// ─── Low-level request helper ───────────────────────────────────────────

/**
 * Formats an absolute expiry in the `YYYY-MM-DD HH:MM:SS UTC` shape the
 * DocuSeal API documents for `expire_at`.
 */
function formatExpireAt(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`
}

/**
 * Surfaces a provider failure with its status and body. The body is
 * included because DocuSeal's errors are actionable ("plan required",
 * "template not found") and a bare status code sends whoever is on call
 * to the dashboard to guess. The API key is never part of a response, so
 * echoing the body leaks nothing.
 */
async function assertOk(response: Response, operation: string): Promise<void> {
  if (response.ok) return
  let detail = ''
  try {
    detail = (await response.text()).slice(0, 500)
  } catch {
    detail = '(no response body)'
  }
  throw new Error(`DocuSeal ${operation} failed: ${response.status} ${detail}`)
}

async function docusealFetch(
  path: string,
  init: { method: string; body?: unknown },
  operation: string
): Promise<unknown> {
  const response = await fetch(`${DOCUSEAL_API_BASE}${path}`, {
    method: init.method,
    headers: {
      'X-Auth-Token': requireApiKey(),
      'Content-Type': 'application/json',
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  await assertOk(response, operation)
  return response.json()
}

// ─── Response readers ───────────────────────────────────────────────────
// DocuSeal returns loosely-typed JSON; these read defensively and coerce
// ids to strings, since Funūn persists them in TEXT columns (migration
// 062) while the API emits integers.

function readTemplateId(payload: unknown): string {
  const o = (payload ?? {}) as Record<string, unknown>
  const id = o.id
  if (typeof id === 'number' || (typeof id === 'string' && id)) return String(id)
  throw new Error('DocuSeal template creation returned no template id')
}

function readSubmitters(payload: unknown): Record<string, unknown>[] {
  // The endpoint returns a bare array of submitters; tolerate a
  // `{ submitters: [...] }` envelope in case the shape is ever wrapped.
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  const o = (payload ?? {}) as Record<string, unknown>
  if (Array.isArray(o.submitters)) return o.submitters as Record<string, unknown>[]
  return []
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/**
 * Downloads a pre-signed provider URL. These carry their own auth in the
 * query string and must NOT receive the X-Auth-Token header, so this
 * deliberately does not go through docusealFetch.
 */
async function downloadPresigned(url: string, operation: string): Promise<Uint8Array> {
  const response = await fetch(url)
  await assertOk(response, operation)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * One signer exactly as the provider reported them. Field-for-field
 * compatible with ProviderReportedSigner (lib/vault/pdf/completion-
 * certificate.tsx) so the webhook can hand this straight into the
 * certificate's `providerReported` group without reshaping — reshaping is
 * how a provider-reported fact ends up presented as a Funūn-observed one.
 */
export type EsignReportedSigner = {
  submitterId: string
  name: string
  email: string
  completedAt: string | null
  /**
   * 'api' when the provider recorded no interactive signing session — the
   * P17-01 fast lane produces these, and a party who never sat in front of
   * a form must not be presented identically to one who did.
   */
  completionMethod: 'interactive' | 'api'
  emailVerified: boolean | null
  ipAddress: string | null
  sessionId: string | null
  userAgent: string | null
  timezone: string | null
}

/** What the completion webhook needs from the provider, in one shape. */
export type EsignCompletionArtifacts = {
  executedPdf: Uint8Array
  /** null when the submission reported no audit-log URL. */
  auditLog: Uint8Array | null
  originalDocumentSha256: string | null
  resultDocumentSha256: string | null
  signers: EsignReportedSigner[]
}

function toReportedSigner(raw: Record<string, unknown>): EsignReportedSigner {
  const values = (raw.values ?? {}) as Record<string, unknown>
  // DocuSeal reports the browser-captured facts only for an interactive
  // session. Absent an IP and a user agent there was no signing session to
  // observe, which is what an API completion looks like on the wire.
  const ipAddress = readOptionalString(raw.ip)
  const userAgent = readOptionalString(raw.ua)
  const completionMethod: EsignReportedSigner['completionMethod'] =
    ipAddress || userAgent ? 'interactive' : 'api'

  return {
    submitterId: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    completedAt: readOptionalString(raw.completed_at),
    completionMethod,
    emailVerified: typeof values.email_verified === 'boolean' ? values.email_verified : null,
    ipAddress,
    sessionId: readOptionalString(raw.external_id) ?? readOptionalString(raw.uuid),
    userAgent,
    timezone: readOptionalString(raw.timezone),
  }
}

function toSigner(raw: Record<string, unknown>): EsignCreatedSigner {
  const slug = String(raw.slug ?? '')
  const embedSrc =
    typeof raw.embed_src === 'string' && raw.embed_src
      ? raw.embed_src
      : `${DOCUSEAL_EMBED_BASE}/s/${slug}`
  return {
    email: String(raw.email ?? ''),
    role: typeof raw.role === 'string' ? raw.role : undefined,
    externalId: typeof raw.external_id === 'string' ? raw.external_id : undefined,
    submitterId: String(raw.id ?? ''),
    slug,
    embedSrc,
  }
}

// ─── Provider ───────────────────────────────────────────────────────────

export class DocuSealProvider implements EsignProvider {
  readonly id = 'docuseal' as const

  /**
   * Two calls, in order: upload Funūn's rendered PDF as a one-off template
   * (/templates/pdf reads the `{{Signature;role=PartyN}}` text tags the
   * renderer embedded), then open a submission against it.
   *
   * The submission is minted with `order: 'random'` — parallel async, so
   * three collaborators can sign days apart in any order. The default
   * ('preserved') would serialise them, which is wrong for a split sheet
   * where nobody is waiting on anybody (P17-01/P17-02).
   *
   * The provider's own invite email is DISABLED at both the submission and
   * submitter level. Funūn sends the only invite a collaborator ever sees
   * (P17-10, ESIGN-18) — for many of them it is their first contact with
   * Funūn at all, and handing them a third party's email wastes that
   * moment. Disabling at both levels is deliberate: a submission-level
   * default change upstream then cannot silently put provider-branded mail
   * in a real collaborator's inbox.
   */
  async createRequest(input: EsignRequestInput): Promise<EsignCreateResult> {
    if (input.signers.length === 0) {
      throw new Error('DocuSeal createRequest requires at least one signer')
    }
    // Fail before spending a template call when credentials are absent.
    requireApiKey()

    const templatePayload = await docusealFetch(
      '/templates/pdf',
      {
        method: 'POST',
        body: {
          name: input.title,
          documents: [
            {
              name: input.pdf.filename,
              file: Buffer.from(input.pdf.bytes).toString('base64'),
            },
          ],
        },
      },
      'template creation'
    )

    const templateId = readTemplateId(templatePayload)
    const replyTo = (input.replyTo ?? '').trim()
    const expireAt = new Date(Date.now() + SUBMISSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    const submissionPayload = await docusealFetch(
      '/submissions',
      {
        method: 'POST',
        body: {
          template_id: Number(templateId),
          // Parallel async signing (P17-01/P17-02).
          order: 'random',
          // Funūn sends the invites, not DocuSeal (P17-10, ESIGN-18).
          send_email: false,
          send_sms: false,
          expire_at: formatExpireAt(expireAt),
          ...(replyTo ? { reply_to: replyTo } : {}),
          submitters: input.signers.map(signer => ({
            name: signer.name,
            email: signer.email,
            ...(signer.role ? { role: signer.role } : {}),
            ...(signer.externalId ? { external_id: signer.externalId } : {}),
            send_email: false,
            ...(replyTo ? { reply_to: replyTo } : {}),
          })),
        },
      },
      'submission creation'
    )

    const submitters = readSubmitters(submissionPayload)
    if (submitters.length === 0) {
      throw new Error('DocuSeal submission creation returned no submitters')
    }

    const signers = submitters.map(toSigner)
    const requestId = String(submitters[0].submission_id ?? '')

    return {
      requestId,
      templateId,
      signers,
      signingUrls: signers.map(s => ({ email: s.email, url: s.embedSrc })),
    }
  }

  /**
   * Archives a submission (P17-02's void path). DocuSeal has no "void" —
   * DELETE sets `archived_at` and leaves status at `pending`, so the
   * document never reaches `completed` and therefore never bills. That was
   * confirmed live at the provider gate on submission 9477116 and is what
   * VOIDED_ENVELOPES_COUNT_TOWARD_CAP = false rests on.
   *
   * Funūn's own esign_envelopes row is marked 'voided' rather than deleted
   * (buildVoidReset) — the provider archives, Funūn remembers.
   */
  async archiveSubmission(submissionId: string): Promise<void> {
    await docusealFetch(
      `/submissions/${encodeURIComponent(submissionId)}`,
      { method: 'DELETE' },
      'submission archive'
    )
  }

  /**
   * Fetches the executed PDF. The documents endpoint returns URLs rather
   * than bytes, so this is two hops: resolve, then download. The file URL
   * is pre-signed and takes no auth header.
   */
  async downloadSignedPdf(requestId: string): Promise<Uint8Array> {
    const payload = (await docusealFetch(
      `/submissions/${encodeURIComponent(requestId)}/documents`,
      { method: 'GET' },
      'document listing'
    )) as { documents?: { name?: string; url?: string }[] }

    const url = payload.documents?.find(d => typeof d.url === 'string' && d.url)?.url
    if (!url) {
      throw new Error(
        `DocuSeal submission ${requestId} has no signed document available yet`
      )
    }

    const fileResponse = await fetch(url)
    await assertOk(fileResponse, 'document download')
    return new Uint8Array(await fileResponse.arrayBuffer())
  }

  /**
   * Everything the completion webhook (17-07) needs from the provider, in
   * ONE call site: both executed artifacts as bytes, plus the per-signer
   * facts DocuSeal reported.
   *
   * WHY THIS EXISTS RATHER THAN THE ROUTE CALLING THE API ITSELF: the
   * webhook must re-host the executed PDF and the audit log within the
   * handler because both URLs expire in ~40 minutes. Leaving the two-hop
   * resolve-then-download dance in the route would put provider response
   * shapes (documents[], audit_log_url, submitters[]) inside an app route,
   * which is exactly the vendor coupling lib/esign/provider.ts exists to
   * prevent. The route gets bytes and normalized facts; it never sees a
   * DocuSeal JSON key.
   *
   * The returned `signers` group is deliberately shaped to match
   * ProviderReportedSigner (17-10) field for field. Every value in it was
   * reported BY THE PROVIDER — Funūn observed none of it — and the
   * certificate renderer's type boundary depends on it staying separable
   * from Funūn's own facts. Do not merge these into a sheet-derived shape.
   *
   * `auditLog` is null when the submission carries no audit-log URL rather
   * than throwing: a missing audit log must not strand an otherwise
   * complete execution, and the certificate cites the log by stored path
   * only when one actually landed.
   */
  async fetchCompletionArtifacts(requestId: string): Promise<EsignCompletionArtifacts> {
    const submission = (await docusealFetch(
      `/submissions/${encodeURIComponent(requestId)}`,
      { method: 'GET' },
      'submission fetch'
    )) as Record<string, unknown>

    const documents = (await docusealFetch(
      `/submissions/${encodeURIComponent(requestId)}/documents`,
      { method: 'GET' },
      'document listing'
    )) as { documents?: { name?: string; url?: string }[] }

    const executedUrl = documents.documents?.find(d => typeof d.url === 'string' && d.url)?.url
    if (!executedUrl) {
      throw new Error(`DocuSeal submission ${requestId} has no signed document available yet`)
    }

    const executedPdf = await downloadPresigned(executedUrl, 'executed document download')

    const auditLogUrl = typeof submission.audit_log_url === 'string' ? submission.audit_log_url : ''
    const auditLog = auditLogUrl
      ? await downloadPresigned(auditLogUrl, 'audit log download')
      : null

    return {
      executedPdf,
      auditLog,
      originalDocumentSha256: readOptionalString(submission.original_document_sha256),
      resultDocumentSha256: readOptionalString(submission.result_document_sha256),
      signers: readSubmitters(submission.submitters).map(toReportedSigner),
    }
  }

  /**
   * Verifies and maps an inbound webhook. Both halves delegate to
   * lib/esign/webhook.ts (17-01) — this method owns only the I/O of
   * reading the RAW body (never a re-serialized JSON.parse'd copy, which
   * can reorder keys and break the HMAC) and the header.
   */
  async parseWebhook(request: Request): Promise<EsignWebhookEvent> {
    const secret = requireWebhookSecret()
    const rawBody = await request.text()
    const header = request.headers.get(SIGNATURE_HEADER)

    if (!verifyDocusealSignature(rawBody, header, secret)) {
      throw new Error('DocuSeal webhook signature verification failed')
    }

    return parseDocusealEvent(JSON.parse(rawBody))
  }
}

/** Shared instance — the adapter is stateless, so one is enough. */
export const docusealProvider = new DocuSealProvider()
