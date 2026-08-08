import { createServiceClient } from '@/lib/supabase/server'
import { docusealProvider } from '@/lib/esign/docuseal'
import { renderBlanketAgreement } from '@/lib/vault/pdf/blanket-agreement'
import { partyRoleTag } from '@/lib/vault/pdf/split-sheet'
import { readEsignState, allSigned } from '@/lib/esign/provider'
import { getCurrentBlanketAgreement, BLANKET_AGREEMENT_VERSION } from '@/lib/sync-library/agreement'
import { isValidTransition } from '@/lib/sync-library/submission'

// ─── Sign-once mint of the artist->Funūn blanket agreement (SYNCLIB-06) ─
// Shared core, extracted from app/api/sync-library/mint-agreement/route.ts
// (26-04) so the signing page (26-07-PLAN, app/(artist)/sync-library/
// agreement/page.tsx) can get-or-create the artist's agreement directly,
// server-side, without a same-origin HTTP self-call from a React Server
// Component (fragile: would need to re-derive an absolute URL and forward
// the session cookie by hand — this codebase's server-first architecture
// reads data server-side via Supabase directly instead, per CLAUDE.md).
// The API route (still the entry point for any other/future caller) is
// now a thin auth-gate + NextResponse wrapper around this function — same
// behavior, same response shapes, zero logic duplicated.
//
// Uses the LIGHTWEIGHT vault_documents.document_data.esign JSONB path —
// NOT the split-sheet esign_envelopes/esign_envelope_signers schema
// (migration 062), which is split-sheet-specific.
//
// Every write uses a SERVICE client (never a session client) and every
// gate that can block a mint runs BEFORE the single DocuSeal call
// (T-26-14 mass-assignment, T-26-15 minting for another artist) — the
// caller (route or page) supplies `userId`/`userEmail` from ITS OWN
// verified session, never from request/query input.
//
// SIGN-ONCE: at most one live vault_documents(type='blanket_agreement')
// row per artist. A second call — whether the first is still pending or
// already signed — returns the existing agreement rather than minting a
// second one; later sync-library submissions ride the same signed
// agreement (26-CONTEXT.md "sign-once, NOT per-submission").
//
// RUNTIME: default Node, deliberately. renderBlanketAgreement ->
// renderToBuffer() depends on Node built-ins (fonts, buffers). NEVER call
// this from an Edge-runtime route or page (mirrors RESEARCH Pitfall 6
// from the split-sheet mint route).

/** The pre-signed cohort — listings whose artist needs to sign before they can move. */
const AGREEMENT_PENDING_COHORT = ['applied', 'invited', 'agreement_pending'] as const

/** Statuses backfilled to agreement_pending once the mint succeeds. */
const ADVANCE_ON_MINT_STATUSES = ['applied', 'invited'] as const

type BlanketAgreementDocRow = {
  id: string
  status: string
  signed_at: string | null
  document_data: Record<string, unknown> | null
}

/**
 * Reads the per-signer embed credential this route persists alongside the
 * shared EsignState shape (readEsignState/allSigned in lib/esign/provider.ts
 * intentionally do not carry embedSlug/embedSrc — those are a DocuSeal-
 * embedded-flow concern for the signing surface, not part of the vendor-
 * agnostic contract). Returns null when no embed credential was recorded.
 */
function embedFromEsign(
  documentData: Record<string, unknown> | null | undefined
): { slug: string; src: string } | null {
  const esign = (documentData?.esign ?? null) as Record<string, unknown> | null
  const slug = typeof esign?.embedSlug === 'string' ? esign.embedSlug : ''
  const src = typeof esign?.embedSrc === 'string' ? esign.embedSrc : ''
  if (!slug || !src) return null
  return { slug, src }
}

type MintAgreementSignedData = {
  agreementId: string
  status: 'signed'
  agreementVersion: string
  signedAt: string | null
}

type MintAgreementPendingData = {
  agreementId: string
  status: 'pending'
  agreementVersion: string
  embed: { slug: string; src: string } | null
}

export type MintAgreementResult =
  | { status: 200; body: { data: MintAgreementSignedData } }
  | { status: 200; body: { data: MintAgreementPendingData } }
  | { status: number; body: { error: string; docusealSubmissionId?: string } }

/**
 * Get-or-create the caller's one blanket agreement. `userId`/`userEmail`
 * MUST come from the caller's own verified session (createApiClient's
 * auth.getUser() in the route, createServerClient's in the page) — never
 * from request input (T-26-15).
 */
export async function mintOrGetBlanketAgreement(
  userId: string,
  userEmail: string | null
): Promise<MintAgreementResult> {
  const service = createServiceClient()

  // ── 1. Sign-once idempotency — at most one live agreement per artist ─
  const { data: existingRaw, error: existingError } = await service
    .from('vault_documents')
    .select('id, status, signed_at, document_data')
    .eq('type', 'blanket_agreement')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return { status: 500, body: { error: existingError.message } }
  }

  const existing = existingRaw as BlanketAgreementDocRow | null
  if (existing) {
    const state = readEsignState(existing.document_data)
    if (allSigned(state)) {
      return {
        status: 200,
        body: {
          data: {
            agreementId: existing.id,
            status: 'signed',
            agreementVersion: BLANKET_AGREEMENT_VERSION,
            signedAt: existing.signed_at,
          },
        },
      }
    }
    return {
      status: 200,
      body: {
        data: {
          agreementId: existing.id,
          status: 'pending',
          agreementVersion: BLANKET_AGREEMENT_VERSION,
          embed: embedFromEsign(existing.document_data),
        },
      },
    }
  }

  // ── 2. Gates-before-spend — nothing to sign for, nothing to mint ────
  const { data: cohortRows, error: cohortError } = await service
    .from('sync_listings')
    .select('id')
    .eq('artist_user_id', userId)
    .in('status', AGREEMENT_PENDING_COHORT)
    .limit(1)

  if (cohortError) {
    return { status: 500, body: { error: cohortError.message } }
  }
  if (!cohortRows || cohortRows.length === 0) {
    return { status: 409, body: { error: 'No pending sync-library submissions to sign for.' } }
  }

  // ── 3. Render the CURRENT versioned template (26-CONTEXT.md swap rule) ─
  const { data: profileRaw } = await service
    .from('user_profiles')
    .select('artist_name')
    .eq('id', userId)
    .maybeSingle()
  const profile = profileRaw as { artist_name: string | null } | null
  const artistName = (profile?.artist_name ?? '').trim() || (userEmail ?? 'Artist')
  const artistEmail = userEmail ?? ''

  let pdfBytes: Buffer
  try {
    pdfBytes = await renderBlanketAgreement({ artistName, artistEmail, agreementDate: new Date() })
  } catch (e) {
    return {
      status: 500,
      body: {
        error: `Could not render the blanket agreement: ${e instanceof Error ? e.message : 'unknown error'}`,
      },
    }
  }

  // ── 4. Mint — the first and only DocuSeal call, after every gate ────
  let created
  try {
    created = await docusealProvider.createRequest({
      title: getCurrentBlanketAgreement().title,
      pdf: {
        filename: `sync-library-agreement-${userId}.pdf`,
        bytes: new Uint8Array(pdfBytes),
      },
      signers: [
        {
          name: artistName,
          email: artistEmail,
          // Must match the {{Signature;role=Party1}} tag the renderer
          // embedded — this is what binds the artist to their own field.
          role: partyRoleTag(0),
          externalId: userId,
        },
      ],
      embedded: true,
      replyTo: (process.env.ESIGN_FROM_EMAIL ?? '').trim() || undefined,
    })
  } catch (e) {
    return {
      status: 502,
      body: {
        error: `Could not create the signature request: ${e instanceof Error ? e.message : 'unknown error'}`,
      },
    }
  }

  // ── 5. Persist — a single vault_documents row, allowlisted columns only ─
  // Never spread the request body (T-26-14). user_id is the CALLER's
  // verified session id, never a caller-supplied id (T-26-15).
  const signer = created.signers?.[0]
  const { data: insertedRaw, error: insertError } = await service
    .from('vault_documents')
    .insert({
      user_id: userId,
      project_id: null,
      track_id: null,
      type: 'blanket_agreement',
      status: 'pending',
      source: 'generated',
      document_data: {
        esign: {
          provider: 'docuseal',
          requestId: created.requestId,
          agreementVersion: BLANKET_AGREEMENT_VERSION,
          signers: [{ name: artistName, email: artistEmail, status: 'pending' }],
          // Extra fields beyond the shared EsignState contract, so a
          // second call to this function (still-pending branch above) or
          // the signing surface (26-07) can resolve the embed without
          // re-minting.
          ...(signer ? { embedSlug: signer.slug, embedSrc: signer.embedSrc } : {}),
        },
      },
    })
    .select('id')
    .single()

  if (insertError || !insertedRaw) {
    // The agreement exists at DocuSeal but Funūn could not record it —
    // surfaced loudly; the submission id is the only reconciliation handle.
    return {
      status: 500,
      body: {
        error: `Signature request created but could not be recorded: ${insertError?.message ?? 'unknown error'}`,
        docusealSubmissionId: created.requestId,
      },
    }
  }

  const inserted = insertedRaw as { id: string }

  // ── 6. Advance the pre-signed cohort so the Vault chip reflects signing ─
  const { data: cohortDetail } = await service
    .from('sync_listings')
    .select('id, status')
    .eq('artist_user_id', userId)
    .in('status', ADVANCE_ON_MINT_STATUSES)

  const toAdvance = ((cohortDetail ?? []) as { id: string; status: string }[])
    .filter(row => isValidTransition(row.status, 'agreement_pending'))
    .map(row => row.id)

  if (toAdvance.length > 0) {
    await service.from('sync_listings').update({ status: 'agreement_pending' }).in('id', toAdvance)
  }

  return {
    status: 200,
    body: {
      data: {
        agreementId: inserted.id,
        status: 'pending',
        agreementVersion: BLANKET_AGREEMENT_VERSION,
        embed: signer ? { slug: signer.slug, src: signer.embedSrc } : null,
      },
    },
  }
}
