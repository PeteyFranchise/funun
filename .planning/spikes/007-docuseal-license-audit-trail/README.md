# Spike 007: DocuSeal Licensing & Audit-Trail Verification

**Type:** standard (research verification with primary sources)
**Status:** VALIDATED ✓ (conflicting claims resolved; one item left for account-holder verification)
**Date:** 2026-07-18
**Tags:** esign, docuseal, licensing, agpl, audit-trail, compliance
**Deliberation:** `.planning/deliberations/esign-split-sheet-economics.md` (research item 2)

## Validates

Given DocuSeal's repo, docs, and published terms as primary sources, when the AGPL scope, self-hosted license-key question, and audit-trail quality are verified, then the deliberation doc's conflicting claims are resolved with citations.

## Findings

### 1. Licensing — resolved, and better than feared

- **Server:** DocuSeal core is **AGPLv3 with Section 7(b) Additional Terms** (per the repo README, github.com/docusealco/docuseal).
- **Embed SDKs are MIT:** verified directly on npm — `@docuseal/react` is **MIT** (v1.0.75). (For comparison: `@documenso/embed-react` is also MIT, v0.6.2.)
- **Consequence for Funūn:** using DocuSeal's **hosted cloud** via API + MIT embed SDK involves **zero AGPL exposure** — Funūn never runs or modifies AGPL code. AGPL obligations only arise if Funūn self-hosts (and especially if it modifies) the DocuSeal server. The deliberation's "verify licensing before committing" flag is CLEAR for the hosted path; self-hosting would need a real review of the Section 7(b) additional terms (typically attribution/branding preservation).

### 2. Self-hosted license keys — resolved

The repo README explicitly lists **"Pro Features"** requiring paid licensing, and **embedded signing forms (React/Vue/Angular/JS) are on that Pro list**, as are white-labeling, roles, reminders, SMS verification, conditional fields, bulk send, SSO, and HTML/PDF template APIs. So the earlier source conflict resolves to: **self-hosting the free core does NOT include embedded signing — the embedding feature Funūn needs is paid (Pro license key) even self-hosted.** The "self-hosted = free embedding" claim in early research was wrong.

- **Consequence:** the realistic DocuSeal path for Funūn is the **hosted API/embedding tier** (~$20/mo Pro seat + $0.20/completed document, volume discounts) — which was already the front-runner shape. Self-hosting saves little since the needed feature is paid either way; it would only matter at volumes where $0.20/doc dominates ops cost.

### 3. Audit trail / legal defensibility — substantiated

Per DocuSeal's own compliance and FAQ pages (docuseal.com/compliance, /faq/what-is-the-certificate-of-signature-audit-log):

- On completion, DocuSeal generates a **Certificate of Signature (audit log)** — downloadable as a separate PDF or combined with the signed document.
- Positioned as supporting **ESIGN, UETA, and eIDAS**; DocuSeal states it implements **Simple, Advanced, and Qualified eIDAS signature levels**.
- Signed PDFs carry a cryptographic signature: document hash encrypted with a signing key, so post-signing modification is detectable ("PDF signature verification" is a listed core feature).

**Assessment:** on paper this is the same compliance story the hosted incumbents tell. What marketing pages cannot prove is the *quality* of the certificate (IP, timestamps, event granularity, verification UX) — that needs one real signed document + certificate inspected during the account-holder pass.

## Net effect on the deliberation

- DocuSeal front-runner status **survives all three checks**: mobile UX (006a), licensing (clear for hosted), audit trail (credible, pending one artifact inspection).
- The evaluation between SignWell and DocuSeal for split sheets now rests on: certificate quality inspection, deliverability, template ergonomics for the split-sheet form, and multi-party async flow — all account-gated, none resolvable by further desk research.

## Remaining account-holder items

1. Sign one real doc on a DocuSeal trial; download and inspect the Certificate of Signature (fields, timestamps, IP, event log granularity).
2. Confirm hosted-tier white-label scope (removing DocuSeal branding from the embedded form) and its price.
3. Multi-party async split-sheet template: 3 signers, separate links, days apart; webhook events on each signature.
