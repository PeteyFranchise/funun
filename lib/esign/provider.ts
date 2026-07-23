// ─── E-signature provider abstraction ────────────────────────────────
// Vendor-agnostic contract for signing split sheets / contracts, so Funūn isn't
// locked to one provider. First implementation will be Dropbox Sign (see
// docs/e-sign-integration.md); DocuSign can slot in behind this same interface
// later with no caller changes.
//
// No vendor SDK is imported here yet — this file is the *contract* + the storage
// shape that the routes and UI build against. The concrete Dropbox Sign provider
// lands once DROPBOX_SIGN_API_KEY is configured (it's an env-gated, server-only
// module). Signing state rides vault_documents.document_data.esign (JSONB), so no
// migration is needed.
//
// Phase 17 (D-18b, dual-provider): DocuSeal is Funūn's first LIVE e-sign
// integration, used for split sheets — added to the provider union below
// without changing the interface shape, so this seam stays vendor-agnostic
// for 16-09's SignWell sync-license adapter too. The concrete DocuSeal
// provider + the PDF/mint/webhook wiring land in later Phase 17 plans; this
// file only carries the contract + state round-trip (ESIGN-01).

export type EsignSignerStatus = 'pending' | 'signed' | 'declined'

export type EsignSigner = {
  name: string
  email: string
  /** Optional mobile for SMS signature confirmation. */
  phone?: string
  status: EsignSignerStatus
}

/** Persisted on `vault_documents.document_data.esign`. */
export type EsignState = {
  provider: 'dropbox_sign' | 'docusign' | 'docuseal'
  /** The provider's signature-request / envelope id. */
  requestId: string
  signers: EsignSigner[]
  /** Storage path of the completed, signed PDF (set on completion). */
  signedFileUrl?: string
  auditTrailUrl?: string
  completedAt?: string
}

/** What a caller hands a provider to start a signature request. */
export type EsignRequestInput = {
  title: string
  /** The document to sign (split sheet / contract), rendered to PDF. */
  pdf: { filename: string; bytes: Uint8Array }
  signers: {
    name: string
    email: string
    phone?: string
    /**
     * Signing role, matched against the role tags embedded in the rendered
     * PDF (partyRoleTag() — "Party1", "Party2", …). Every provider in this
     * union binds a signer to their fields by role name, so this is a
     * contract-level concept, not a DocuSeal detail. Optional for
     * single-signer documents where no binding is needed.
     */
    role?: string
    /** Caller's own stable id for this signer, round-tripped by the provider. */
    externalId?: string
  }[]
  /** Embedded → signer signs in an iframe inside Funūn (no signer account). */
  embedded: boolean
  /**
   * Reply-to for the provider's own transactional mail (completion copies).
   * Funūn sends its own invites (P17-10, ESIGN-18), but a collaborator who
   * replies to any provider-sent mail must still reach a monitored mailbox.
   * Omitted entirely when unset — never defaulted to a no-reply address.
   */
  replyTo?: string
}

/** One signer as the provider registered them — the row shape the mint route persists. */
export type EsignCreatedSigner = {
  email: string
  role?: string
  externalId?: string
  /** The provider's own submitter/signer id. */
  submitterId: string
  /** Per-signer scoped slug — the only credential the browser embed receives. */
  slug: string
  /** Fully-qualified per-signer embed URL. */
  embedSrc: string
}

export type EsignCreateResult = {
  requestId: string
  /** The one-off template the document was uploaded as, when the provider uses one. */
  templateId?: string
  /** Per-signer embedded signing URLs (embedded flow only). */
  signingUrls?: { email: string; url: string }[]
  /** Full per-signer detail for persistence (embedded flow only). */
  signers?: EsignCreatedSigner[]
}

export type EsignWebhookEvent = {
  requestId: string
  type: 'signed' | 'all_signed' | 'declined' | 'other'
  signerEmail?: string
}

/** The contract every e-sign provider implements. */
export interface EsignProvider {
  readonly id: EsignState['provider']
  createRequest(input: EsignRequestInput): Promise<EsignCreateResult>
  downloadSignedPdf(requestId: string): Promise<Uint8Array>
  /** Verify + parse an inbound webhook; throws if the signature is invalid. */
  parseWebhook(request: Request): Promise<EsignWebhookEvent>
}

/** Read e-sign state out of a document's `document_data` JSONB (null if none). */
export function readEsignState(
  documentData: Record<string, unknown> | null | undefined
): EsignState | null {
  const raw = documentData?.esign as Record<string, unknown> | undefined
  if (!raw || typeof raw.requestId !== 'string' || !raw.requestId) return null
  const provider =
    raw.provider === 'docuseal' ? 'docuseal' : raw.provider === 'docusign' ? 'docusign' : 'dropbox_sign'
  const signers: EsignSigner[] = Array.isArray(raw.signers)
    ? raw.signers.map(s => {
        const o = (s ?? {}) as Record<string, unknown>
        const status: EsignSignerStatus =
          o.status === 'signed' ? 'signed' : o.status === 'declined' ? 'declined' : 'pending'
        return {
          name: String(o.name ?? ''),
          email: String(o.email ?? ''),
          phone: o.phone ? String(o.phone) : undefined,
          status,
        }
      })
    : []
  return {
    provider,
    requestId: raw.requestId,
    signers,
    signedFileUrl: typeof raw.signedFileUrl === 'string' ? raw.signedFileUrl : undefined,
    auditTrailUrl: typeof raw.auditTrailUrl === 'string' ? raw.auditTrailUrl : undefined,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
  }
}

/** True once every signer has signed — the signal to flip the document to 'signed'. */
export function allSigned(state: EsignState | null): boolean {
  return !!state && state.signers.length > 0 && state.signers.every(s => s.status === 'signed')
}
