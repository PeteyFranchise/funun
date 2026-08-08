import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { docusealProvider } from '@/lib/esign/docuseal'
import { renderBlanketAgreement } from '@/lib/vault/pdf/blanket-agreement'
import { partyRoleTag } from '@/lib/vault/pdf/split-sheet'
import { readEsignState, allSigned } from '@/lib/esign/provider'
import { getCurrentBlanketAgreement, BLANKET_AGREEMENT_VERSION } from '@/lib/sync-library/agreement'
import { isValidTransition } from '@/lib/sync-library/submission'

// ─── POST /api/sync-library/mint-agreement ─────────────────────────────
// Sign-once mint of the artist->Funūn blanket agreement (SYNCLIB-06). Uses
// the LIGHTWEIGHT vault_documents.document_data.esign JSONB path — NOT the
// split-sheet esign_envelopes/esign_envelope_signers schema (migration
// 062), which is split-sheet-specific.
//
// Structure mirrors app/api/split-sheets/[id]/mint-envelope/route.ts:
// SESSION client verifies identity, SERVICE client performs every write,
// and every gate that can block a mint runs BEFORE the single DocuSeal
// call (T-26-14 mass-assignment, T-26-15 minting for another artist).
//
// SIGN-ONCE: at most one live vault_documents(type='blanket_agreement') row
// per artist. A second call — whether the first is still pending or
// already signed — returns the existing agreement rather than minting a
// second one; later sync-library submissions ride the same signed
// agreement (26-CONTEXT.md "sign-once, NOT per-submission").
//
// RUNTIME: default Node, deliberately. renderBlanketAgreement ->
// renderToBuffer() depends on Node built-ins (fonts, buffers). NEVER add
// `export const runtime = 'edge'` to this file (mirrors RESEARCH Pitfall 6
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

export async function POST(_request: Request) {
  // ── 1. Auth gate ───────────────────────────────────────────────────
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // ── 2. Sign-once idempotency — at most one live agreement per artist ─
  const { data: existingRaw, error: existingError } = await service
    .from('vault_documents')
    .select('id, status, signed_at, document_data')
    .eq('type', 'blanket_agreement')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const existing = existingRaw as BlanketAgreementDocRow | null
  if (existing) {
    const state = readEsignState(existing.document_data)
    if (allSigned(state)) {
      return NextResponse.json({
        data: {
          agreementId: existing.id,
          status: 'signed',
          agreementVersion: BLANKET_AGREEMENT_VERSION,
          signedAt: existing.signed_at,
        },
      })
    }
    return NextResponse.json({
      data: {
        agreementId: existing.id,
        status: 'pending',
        agreementVersion: BLANKET_AGREEMENT_VERSION,
        embed: embedFromEsign(existing.document_data),
      },
    })
  }

  // ── 3. Gates-before-spend — nothing to sign for, nothing to mint ────
  const { data: cohortRows, error: cohortError } = await service
    .from('sync_listings')
    .select('id')
    .eq('artist_user_id', user.id)
    .in('status', AGREEMENT_PENDING_COHORT)
    .limit(1)

  if (cohortError) {
    return NextResponse.json({ error: cohortError.message }, { status: 500 })
  }
  if (!cohortRows || cohortRows.length === 0) {
    return NextResponse.json(
      { error: 'No pending sync-library submissions to sign for.' },
      { status: 409 }
    )
  }

  // ── 4. Render the CURRENT versioned template (26-CONTEXT.md swap rule) ─
  const { data: profileRaw } = await service
    .from('user_profiles')
    .select('artist_name')
    .eq('id', user.id)
    .maybeSingle()
  const profile = profileRaw as { artist_name: string | null } | null
  const artistName = (profile?.artist_name ?? '').trim() || (user.email ?? 'Artist')
  const artistEmail = user.email ?? ''

  let pdfBytes: Buffer
  try {
    pdfBytes = await renderBlanketAgreement({ artistName, artistEmail, agreementDate: new Date() })
  } catch (e) {
    return NextResponse.json(
      {
        error: `Could not render the blanket agreement: ${e instanceof Error ? e.message : 'unknown error'}`,
      },
      { status: 500 }
    )
  }

  // ── 5. Mint — the first and only DocuSeal call, after every gate ────
  let created
  try {
    created = await docusealProvider.createRequest({
      title: getCurrentBlanketAgreement().title,
      pdf: {
        filename: `sync-library-agreement-${user.id}.pdf`,
        bytes: new Uint8Array(pdfBytes),
      },
      signers: [
        {
          name: artistName,
          email: artistEmail,
          // Must match the {{Signature;role=Party1}} tag the renderer
          // embedded — this is what binds the artist to their own field.
          role: partyRoleTag(0),
          externalId: user.id,
        },
      ],
      embedded: true,
      replyTo: (process.env.ESIGN_FROM_EMAIL ?? '').trim() || undefined,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: `Could not create the signature request: ${e instanceof Error ? e.message : 'unknown error'}`,
      },
      { status: 502 }
    )
  }

  // ── 6. Persist — a single vault_documents row, allowlisted columns only ─
  // Never spread the request body (T-26-14). user_id is the SESSION user,
  // never a caller-supplied id (T-26-15).
  const signer = created.signers?.[0]
  const { data: insertedRaw, error: insertError } = await service
    .from('vault_documents')
    .insert({
      user_id: user.id,
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
          // second call to this route (still-pending branch above) or the
          // future signing surface (26-07) can resolve the embed without
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
    return NextResponse.json(
      {
        error: `Signature request created but could not be recorded: ${insertError?.message ?? 'unknown error'}`,
        docusealSubmissionId: created.requestId,
      },
      { status: 500 }
    )
  }

  const inserted = insertedRaw as { id: string }

  // ── 7. Advance the pre-signed cohort so the Vault chip reflects signing ─
  const { data: cohortDetail } = await service
    .from('sync_listings')
    .select('id, status')
    .eq('artist_user_id', user.id)
    .in('status', ADVANCE_ON_MINT_STATUSES)

  const toAdvance = ((cohortDetail ?? []) as { id: string; status: string }[])
    .filter(row => isValidTransition(row.status, 'agreement_pending'))
    .map(row => row.id)

  if (toAdvance.length > 0) {
    await service.from('sync_listings').update({ status: 'agreement_pending' }).in('id', toAdvance)
  }

  return NextResponse.json({
    data: {
      agreementId: inserted.id,
      status: 'pending',
      agreementVersion: BLANKET_AGREEMENT_VERSION,
      embed: signer ? { slug: signer.slug, src: signer.embedSrc } : null,
    },
  })
}
