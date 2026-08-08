'use client'

import { useState } from 'react'
import { DocusealForm } from '@docuseal/react'
import {
  BLANKET_AGREEMENT_REVIEW_PROMPT,
  BLANKET_AGREEMENT_SIGNED_HEADING,
  BLANKET_AGREEMENT_SIGNED_BODY,
} from '@/lib/sync-library/agreement'

// ─── BlanketAgreementSigningEmbed ───────────────────────────────────────
// Reuses components/split-sheets/SplitSheetSigningEmbed.tsx's shell
// wholesale (26-07-PLAN Task 2, 26-UI-SPEC.md Screen D) — same full-width
// white DocusealForm embed, same pre-signature review-prompt treatment
// above it, same emerald completion panel after onComplete. Do not
// hand-roll a new signing shell: this is a sibling copy, generalized for
// the document-agnostic artist->Funūn blanket agreement (one signer, no
// collaborator fan-out) rather than a split sheet's multi-party flow.
//
// SECURITY (mirrors SplitSheetSigningEmbed / T-26-27, T-26-28): the ONLY
// credential this component receives is `src` — the per-signer embed URL
// minted by app/api/sync-library/mint-agreement/route.ts for THIS
// artist's blanket_agreement vault_documents row. DOCUSEAL_API_KEY is
// server-only and never reaches this file. onComplete is a client-side
// "completed" hint only — the authoritative signed state is the
// HMAC-verified webhook (app/api/webhooks/docuseal/route.ts), mirroring
// the split-sheet pattern exactly.

type Props = {
  /** The per-signer embed source minted by mint-agreement (`data.embed.src`). */
  src: string
  /**
   * The per-signer scoped slug from the same mint-agreement response
   * (`data.embed.slug`). Not passed to DocusealForm (src already carries
   * it) — kept as a prop so callers can round-trip the full embed
   * credential shape without picking it apart.
   */
  slug: string
  /**
   * The agreement's title. The embed itself renders `withTitle={false}`
   * (the signing page's own heading already carries this, per
   * SplitSheetSigningEmbed's precedent) — kept as a prop for shape parity
   * with the mint-agreement response and any future caller that wants it.
   */
  title: string
  /** Pre-fills the signer step so the artist isn't asked to re-enter it. */
  signerEmail?: string
  signerName?: string
  /** Called once the artist completes their signature (client hint only). */
  onSigned?: () => void
}

export function BlanketAgreementSigningEmbed({ src, signerEmail, signerName, onSigned }: Props) {
  const [completed, setCompleted] = useState(false)

  if (completed) {
    return (
      <div className="w-full rounded-[18px] border border-emerald-400/30 bg-emerald-400/10 px-6 py-4 text-center">
        <p className="font-semibold text-emerald-400">{BLANKET_AGREEMENT_SIGNED_HEADING}</p>
        <p className="mt-1 text-sm text-white/50">{BLANKET_AGREEMENT_SIGNED_BODY}</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-3">
      <p className="text-xs leading-relaxed text-white/40">{BLANKET_AGREEMENT_REVIEW_PROMPT}</p>

      {/* Full-width and unconstrained so the embed stays thumb-signable and
          non-overflowing at 375px, mirroring SplitSheetSigningEmbed. */}
      <div className="w-full overflow-hidden rounded-[18px] border border-white/10 bg-white">
        <DocusealForm
          src={src}
          email={signerEmail}
          name={signerName}
          withTitle={false}
          withDecline
          sendCopyEmail={false}
          onComplete={() => {
            setCompleted(true)
            onSigned?.()
          }}
        />
      </div>
    </div>
  )
}
