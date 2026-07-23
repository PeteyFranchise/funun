'use client'

import { useState } from 'react'
import { DocusealForm } from '@docuseal/react'
import { PRE_SIGNATURE_REVIEW_PROMPT } from '@/lib/split-sheets/agreement'

// ─── SplitSheetSigningEmbed ─────────────────────────────────────────────
// The party signs INSIDE Funūn (D-18b, ESIGN-06). No redirect to a
// provider-hosted page: the collaborator arrived from Funūn's own invite
// on Funūn's own /approve/[token] link, and bouncing them to a third-party
// domain at the moment they are asked to sign a legal document is exactly
// the trust break P17-10 removes from the email path.
//
// Signature capture is the VENDOR'S — draw, type, and camera capture at
// 375px were validated in spike 006a. Do NOT hand-roll a canvas signature
// pad here (RESEARCH "Don't Hand-Roll"): a bespoke pad would have to
// re-solve touch smoothing, undo, and the typed/drawn toggle, and would
// produce a signature image the provider's audit log did not witness.
//
// SECURITY (T-17-15, T-17-19, RESEARCH V13): the ONLY credential this
// component receives is `src` — the per-signer `/s/{slug}` URL minted for
// ONE esign_envelope_signers row. DOCUSEAL_API_KEY is server-only and must
// never reach this file. The slug is also never derived from Funūn's
// approval token, so one party's link cannot be transformed into another's.

type Props = {
  /**
   * The per-signer embed source from this party's esign_envelope_signers
   * row (`/s/{slug}`). Scoped to one signer on one submission — never a
   * template URL, never an API key.
   */
  src: string
  /** Pre-fills the signer step so the party isn't asked to re-enter it. */
  signerEmail?: string
  signerName?: string
  /** Called once the party completes their signature. */
  onSigned?: () => void
}

export function SplitSheetSigningEmbed({ src, signerEmail, signerName, onSigned }: Props) {
  const [completed, setCompleted] = useState(false)

  if (completed) {
    return (
      <div className="w-full rounded-[18px] border border-emerald-400/30 bg-emerald-400/10 px-6 py-4 text-center">
        <p className="font-semibold text-emerald-400">Signature recorded</p>
        <p className="mt-1 text-sm text-white/50">
          We&rsquo;ll let you know as soon as everyone else has signed.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-3">
      {/* Decision 3b: the locked signature block cannot be edited mid-
          execution by design, so a signer who disagrees is pointed at the
          decline/object path (P17-02's void flow), never at inline editing. */}
      <p className="text-xs leading-relaxed text-white/40">{PRE_SIGNATURE_REVIEW_PROMPT}</p>

      {/* Full-width and unconstrained so the embed stays thumb-signable and
          non-overflowing at 375px — the studio-with-only-a-phone canonical
          test (D-18b). No fixed widths, no horizontal scroll. */}
      <div className="w-full overflow-hidden rounded-[18px] border border-white/10 bg-white">
        <DocusealForm
          src={src}
          email={signerEmail}
          name={signerName}
          // The signer reached this embed through their own scoped link;
          // re-showing the document title duplicates the heading already
          // above it in SplitApprovalView.
          withTitle={false}
          // Decline is the objection path — it is what makes P17-02's
          // any-party void reachable from the signing surface itself.
          withDecline
          // Funūn sends its own mail (P17-10, ESIGN-18); the provider must
          // not send signed-copy email either.
          sendCopyEmail={false}
          // Client-side completion is a UI hint ONLY. The authoritative
          // state change is driven by the HMAC-verified submission.completed
          // webhook (17-07) — browser events can be forged.
          onComplete={() => {
            setCompleted(true)
            onSigned?.()
          }}
        />
      </div>
    </div>
  )
}
