// ─── Split-sheet agreement — operative language + counsel gate ─────────
// The verbatim legal text every party signs against (ESIGN-16, P17-09),
// the guidance notes that print on the document, the pre-signature review
// prompt (decision 3b), and the production-only counsel-review gate that
// blocks the operative language from reaching a real signature until an
// attorney has reviewed it (ESIGN-17, P17-09a).
//
// Source: the approved template spec
// (.planning/phases/17-split-sheet-esign/17-SPLIT-SHEET-TEMPLATE-SPEC.md),
// itself sourced from the original contract at
// ~/Desktop/Music/Music Contract Templates/Split_Sheet.doc
// ("SONGWRITER/PUBLISHING SPLITS AGREEMENT"). lib/vault/pdf/split-sheet.tsx
// prints AGREEMENT_CLAUSES and GUIDANCE_NOTES directly, verbatim and in
// order — no paraphrasing in the renderer — so what the P17-09a checkpoint
// reviews is exactly what ships.

// ─── Operative agreement clauses (VERBATIM — do not reword) ────────────

/**
 * The two operative sentences, in source order, exactly as approved.
 * "named above" / "below" are positional references to the approved
 * section order (Split Breakdown above, Writer Signature Details below —
 * see the spec's "Positional integrity check") and are already accurate;
 * no rewording is required or permitted without a fresh counsel review.
 */
export const AGREEMENT_CLAUSES: readonly string[] = [
  'This Songwriter/Publishing split agreement may not be modified or amended except by writing and signed by all Co-writers named above.',
  'If the foregoing accurately represents the agreement between the Co-writers as to their respective ownership interests and shares of songwriting royalties payable in connection with the above-noted composition, please acknowledge your understanding and agreement by executing this contract in the appropriate space below.',
]

// ─── Guidance notes (VERBATIM — printed on the document) ───────────────

/**
 * The three approved Guidance Notes, printed verbatim in this order at
 * the foot of the document inside a callout box. Input-guidance copy for
 * the SAME fields belongs in the builder UI, not here — the executed PDF
 * is a signed legal record and should carry no UI helper prompts (spec's
 * "Helper text placement" section).
 */
export const GUIDANCE_NOTES: readonly string[] = [
  'Use your full legal name exactly as registered with your PRO. If you do not yet have a PRO, complete the field as "None yet" and update it later once affiliated.',
  'Where a detail is not yet known, it is shown as —. Enter the release title if known; if not final, use the current working project title. If self-releasing, the label may be entered as "Independent".',
  'This split sheet confirms songwriting and publishing shares only. Master ownership and master revenue splits, if any, are not determined by this split sheet unless expressly stated in a separate written agreement.',
]

// ─── Pre-signature review prompt (decision 3b) ──────────────────────────

/**
 * Copy shown near the signature action, in the app UI (not on the PDF)
 * before a party completes signing. Locked signature-block text (decision
 * 3) cannot be edited mid-execution by design; this prompt points a
 * signer who disagrees at the decline/object path (P17-02's void flow),
 * never at inline editing.
 */
export const PRE_SIGNATURE_REVIEW_PROMPT =
  'Check that your legal name, PRO, publishing designee, and administrator are correct before you sign. If anything is wrong, decline and let the sender know — these details flow into your PRO and publisher registrations.'

// ─── Counsel gate (P17-09a) ─────────────────────────────────────────────

export type CounselReviewStatus = 'unreviewed' | 'reviewed'

/**
 * Single source of truth for whether AGREEMENT_CLAUSES has cleared
 * attorney review. Flip this to 'reviewed' ONLY after a licensed attorney
 * competent in music publishing has reviewed AGREEMENT_CLAUSES, the
 * scope/guidance wording, and a rendered sample document — see the
 * P17-09a blocking checkpoint in
 * .planning/phases/17-split-sheet-esign/17-09-PLAN.md. This is a
 * deliberate, reviewable one-line change, not a build flag: the comment
 * below records who reviewed it and when, so the flip itself is the audit
 * trail.
 *
 * Reviewing attorney: (unreviewed — pending P17-09a)
 * Firm: —
 * Review date: —
 */
export const COUNSEL_REVIEW_STATUS: CounselReviewStatus = 'unreviewed'

/**
 * Throws a descriptive Error when the runtime environment is production
 * and COUNSEL_REVIEW_STATUS has not been flipped to 'reviewed' — the
 * guard P17-09a exists to enforce: an unreviewed instrument must never
 * reach a real artist's signature. No-op in every non-production
 * environment (development, test, preview) so the rest of this phase
 * stays testable while the operative language is unreviewed. The mint
 * route (17-06) calls this before any DocuSeal call.
 */
export function assertCounselReviewedForProduction(): void {
  if (process.env.NODE_ENV !== 'production') return
  if (COUNSEL_REVIEW_STATUS === 'reviewed') return
  throw new Error(
    'assertCounselReviewedForProduction(): the split-sheet operative language ' +
      '(AGREEMENT_CLAUSES in lib/split-sheets/agreement.ts) has not cleared attorney ' +
      'review (P17-09a). Minting a live envelope against unreviewed operative language ' +
      'is blocked in production. See the P17-09a checkpoint in ' +
      '.planning/phases/17-split-sheet-esign/17-09-PLAN.md — an attorney competent in ' +
      'music publishing must review AGREEMENT_CLAUSES before COUNSEL_REVIEW_STATUS can ' +
      'be flipped to "reviewed".'
  )
}

// ─── Display helpers ─────────────────────────────────────────────────────

/**
 * Renders a field value, substituting an em-dash when absent or
 * whitespace-only (decision 4). A missing optional value on the document
 * reads as not-yet-known — it never renders as blank, and it never
 * blocks a signature.
 */
export function displayValue(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? '—' : trimmed
}

/**
 * "Legal Name (p/k/a Professional Name)" when a distinct professional
 * name is present (decision 6); legal name alone when they match. Falls
 * back to the professional name when no legal name has been captured yet
 * (a pre-063 legacy row, or simply not entered) — the document always
 * shows the best name it has rather than rendering blank.
 */
export function displayLegalName(
  legalName: string | null | undefined,
  professionalName: string
): string {
  const legal = (legalName ?? '').trim()
  const professional = professionalName.trim()
  if (!legal) return professional
  if (legal === professional) return legal
  return `${legal} (p/k/a ${professional})`
}

/**
 * Composes a legal name from artist_profiles' structured legal-name
 * fields (migration 021) — the first link in decision 3a's auto-populate
 * chain ("signer is a Funūn user → artist_profiles"). Mirrors
 * lib/collaborators/index.ts's assembleDisplayName suffix convention
 * (", Suffix"). Returns an empty string when no legal name parts are on
 * file, so callers can fall back to manual entry rather than rendering a
 * bare comma.
 */
export function composeLegalNameFromProfile(profile: {
  legal_first_name?: string | null
  legal_middle_name?: string | null
  legal_last_name?: string | null
  legal_name_suffix?: string | null
}): string {
  const parts = [profile.legal_first_name, profile.legal_middle_name, profile.legal_last_name]
    .map(p => (p ?? '').trim())
    .filter(Boolean)
  if (parts.length === 0) return ''
  const base = parts.join(' ')
  const suffix = (profile.legal_name_suffix ?? '').trim()
  return suffix ? `${base}, ${suffix}` : base
}
