// ─── Blanket-agreement content — versioned, swappable template ─────────
// Phase 26, SYNCLIB-06. The artist->Funūn blanket agreement (26-CONTEXT.md
// "agreement scope") is sign-once per artist and pre-authorizes Funūn to
// shop AND negotiate/execute sync licenses on the artist's behalf — EXCEPT
// price, scope, medium, and exclusivity, which are negotiated per deal.
//
// SWAPPABLE BY DESIGN: this file is the ONLY place the agreement's copy
// lives. The temporary draft below (26-BLANKET-AGREEMENT-DRAFT.md,
// owner-authored as a build placeholder — "counsel/production gate is NOT
// a build blocker") is what artists sign today. The counsel-approved final
// version replaces BLANKET_AGREEMENT_SECTIONS and bumps
// BLANKET_AGREEMENT_VERSION — no caller (the PDF renderer, the mint route,
// the webhook, the future signing surface) changes. Callers read structured
// data through getCurrentBlanketAgreement(); none of them parse markdown.
//
// Pure module: no I/O, no imports beyond types — the renderer stays
// presentation-only (lib/vault/pdf/blanket-agreement.tsx just maps this
// data onto PDF primitives).

/** One section of the agreement — a heading plus its paragraphs, in order. */
export type BlanketAgreementSection = {
  heading: string
  paragraphs: string[]
}

/**
 * Bumped only when the agreement's CONTENT materially changes (e.g. the
 * counsel-approved swap). A previously-signed artist's agreement stays
 * valid under the version they signed — re-sign is a future concern, not
 * this plan's (26-CONTEXT.md: "a re-sign is needed only if the agreement
 * version materially changes").
 */
export const BLANKET_AGREEMENT_VERSION = 'draft-0.1'

/**
 * The signing-surface title — used as BOTH the DocuSeal request/template
 * title (app/api/sync-library/mint-agreement/route.ts) and the PDF
 * document's own title, so what an artist sees at signing time always
 * matches what this module calls the agreement. Single source of truth —
 * do not hardcode this string a second time anywhere else.
 */
export const BLANKET_AGREEMENT_TITLE = 'Funūn Sync Library Agreement'

/**
 * Structured content sourced from 26-BLANKET-AGREEMENT-DRAFT.md (owner-
 * authored draft, NOT reviewed by counsel — see the Notice section below,
 * carried into the document itself for transparency). Headings + paragraphs
 * only, so the PDF renderer never has to parse markdown or make layout
 * decisions about legal wording.
 */
export const BLANKET_AGREEMENT_SECTIONS: BlanketAgreementSection[] = [
  {
    heading: 'Notice',
    paragraphs: [
      'This document is a non-final draft template, prepared as a starting point for review and not a substitute for advice from qualified music/IP legal counsel. It may be replaced by a counsel-approved version in the future without further action required from the Artist beyond what Section 8.2 describes. Bracketed items below are business or legal terms the parties have not yet fixed.',
    ],
  },
  {
    heading: 'Parties',
    paragraphs: [
      'This Sync Library Representation & Shopping Authorization Agreement (the "Agreement") is entered into as of the date of electronic signature below by and between Funūn ("Funūn," "we," "us") and the Artist ("you," "Artist") — the Funūn account holder identified at signature, who represents that they own or control the songs submitted to the Sync Library. Funūn and the Artist are each a "Party" and together the "Parties."',
    ],
  },
  {
    heading: '1. Purpose & Recitals',
    paragraphs: [
      'The Artist maintains one or more musical works ("Songs") in their Funūn Sound Vault and wishes to make one or more Songs available for synchronization ("sync") licensing by including them in the Funūn Sync Library — a curated, represented catalogue that Funūn makes browsable to prospective licensees ("Buyers"). This Agreement authorizes Funūn to represent, shop, and negotiate sync licenses for the Artist’s submitted Songs on the terms below. It is not itself a license to any Buyer and does not by itself grant, sell, or transfer any rights in the Songs to any third party.',
    ],
  },
  {
    heading: '2. Songs Covered (Blanket Scope)',
    paragraphs: [
      'This is a blanket agreement: it covers each Song the Artist submits to and that Funūn admits into the Sync Library, from time to time, without a separate agreement per Song. A current list of the Artist’s admitted Songs is maintained in the Artist’s Funūn account.',
      'Admission is per Song. The Artist may submit a single Song, several Songs, or a whole release; Funūn reviews and admits each Song individually. A Buyer licenses one Song at a time.',
      'The Artist may withdraw any Song from the Sync Library at any time via their Funūn account, subject to Section 7 (Term, Withdrawal & Termination).',
    ],
  },
  {
    heading: '3. Grant of Authority',
    paragraphs: [
      'For each admitted Song, the Artist authorizes Funūn, on the Artist’s behalf, to: (a) include the Song in the Sync Library and make it browsable and audition-able to Buyers; (b) shop, pitch, and represent the Song for sync licensing opportunities; (c) negotiate and agree the terms of individual sync licenses with Buyers (see Section 4); and (d) issue and execute sync licenses to Buyers consistent with those negotiated terms.',
      'Reservation of ownership: the Artist retains all ownership of the Songs and their underlying copyrights (composition and master, as applicable). Funūn acquires no ownership — only the representation and licensing authority described here.',
      '[PLACEHOLDER — exclusivity of representation]: whether Funūn’s representation under this Agreement is exclusive or non-exclusive is to be decided with counsel/BD. Default proposed for review: non-exclusive, unless a specific Song/deal is made exclusive per Section 4.',
    ],
  },
  {
    heading: '4. Terms Pre-Authorized; Price Negotiated Per Deal',
    paragraphs: [
      'The Artist pre-authorizes Funūn to grant sync licenses on the Sync Library’s standard licensing terms (attached as Exhibit A — [PLACEHOLDER: standard terms to be drafted/attached with counsel]), except for the deal-specific commercial variables below.',
      'The following are negotiated per deal (typically by a Funūn Account Executive) and are not fixed by this Agreement: (a) the price / license fee; (b) the scope of use (project, placement, duration of the sync, cue length, etc.); (c) the medium / media (film, TV, streaming, advertising, game, social, etc.); and (d) whether the Buyer’s rights are exclusive or non-exclusive for that Song.',
      'By this Agreement, the Artist grants Funūn the authority to negotiate and set the variables above on the Artist’s behalf and to bind the Artist to the resulting license, provided the license is otherwise consistent with the standard terms in this Section.',
      '[PLACEHOLDER — approval threshold]: whether certain deals (e.g., below a floor price, exclusive grants, or specified sensitive media) require the Artist’s per-deal approval before Funūn executes is to be decided with counsel. Proposed default for review: Funūn may execute non-exclusive deals at or above a standard floor without further approval; exclusive deals require Artist approval.',
    ],
  },
  {
    heading: '5. Payment & Splits',
    paragraphs: [
      '[PLACEHOLDER — Funūn commission / revenue split]: Funūn’s fee or commission on sync license revenue, and the split payable to the Artist (and any co-owners per the Song’s split sheet), is to be decided with BD/counsel and must be fixed before production use.',
      'Funūn will account to the Artist for licensing revenue on [PLACEHOLDER: cadence, e.g., monthly/quarterly].',
      'Where a Song has multiple rights holders, payment follows the Song’s split sheet of record in Funūn.',
    ],
  },
  {
    heading: '6. Artist Representations & Warranties',
    paragraphs: [
      'The Artist represents and warrants that, for each Song they submit, they own or control the rights necessary to authorize sync licensing (or have obtained all necessary consents from co-writers, producers, and rights holders), and that the Song does not infringe any third party’s rights.',
      'The Artist will keep their Funūn split sheets and rights information accurate and current.',
    ],
  },
  {
    heading: '7. Term, Withdrawal & Termination',
    paragraphs: [
      '[PLACEHOLDER — term]: proposed for review, this Agreement continues until terminated and applies to each Song while it remains admitted in the Sync Library.',
      'Withdrawal of a Song: the Artist may withdraw any Song from the Sync Library at any time; on withdrawal, Funūn will stop shopping and remove the Song from Buyer-browsable listings promptly. Withdrawal does not retroactively affect any sync license already executed for that Song before withdrawal.',
      '[PLACEHOLDER — termination & survival]: termination rights, notice, and which provisions survive (e.g., accounting for deals already in progress) are to be decided with counsel.',
    ],
  },
  {
    heading: '8. General',
    paragraphs: [
      '[PLACEHOLDER — governing law / venue] to be decided with counsel.',
      'Entire agreement / amendment: this Agreement (with its Exhibits) is the entire agreement on its subject and may be amended only as the Parties agree in writing, including a counsel-approved updated version accepted by the Artist.',
      'Electronic signature: the Parties agree this Agreement may be executed by electronic signature, which is binding to the same extent as a handwritten signature.',
    ],
  },
]

/** One bundle — version, sections, title — for every caller (renderer, mint route, webhook, future signing surface). */
export function getCurrentBlanketAgreement(): {
  version: string
  sections: BlanketAgreementSection[]
  title: string
} {
  return {
    version: BLANKET_AGREEMENT_VERSION,
    sections: BLANKET_AGREEMENT_SECTIONS,
    title: BLANKET_AGREEMENT_TITLE,
  }
}

// ─── Signing-surface copy (26-07-PLAN, 26-UI-SPEC.md Screen D) ─────────
// UI strings for the signing page + BlanketAgreementSigningEmbed — kept
// here, not hardcoded in the component, so this file stays the single
// source of everything an artist reads about the blanket agreement
// (mirrors lib/split-sheets/agreement.ts's PRE_SIGNATURE_REVIEW_PROMPT
// convention). Verbatim per 26-UI-SPEC.md's Copywriting Contract.

/** Shown above the embed, before the artist signs (mirrors PRE_SIGNATURE_REVIEW_PROMPT's role). */
export const BLANKET_AGREEMENT_REVIEW_PROMPT =
  "This one-time agreement authorizes Funūn to represent and shop your submitted songs for sync licensing. Price and deal terms are always negotiated per deal — this only signs off Funūn's authority to negotiate on your behalf. You'll sign this once; future songs you submit are covered automatically."

/** The completion panel heading, shown once onComplete fires (client hint only — see BlanketAgreementSigningEmbed). */
export const BLANKET_AGREEMENT_SIGNED_HEADING = "Signed — you're in the Sync Library"

/** The completion panel body. */
export const BLANKET_AGREEMENT_SIGNED_BODY =
  "We'll notify you as soon as your first song goes live in Browse the Catalogue."
