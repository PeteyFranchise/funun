# Phase 17 — DocuSeal Provider Verification Results

**Run:** 2026-07-20 · **Account:** DocuSeal Developer Sandbox (free tier) · **Operator email:** esign@funun.studio
**Test submission:** 9477115 (3 signers, `order: 'random'`) · **Void test:** 9477116
**Outcome: PASS** — all five gate items resolved. Two bugs found (see below).

## Gate items

| # | Item | Result |
|---|------|--------|
| a | 3-signer parallel async | ✅ `order: 'random'` — all three live simultaneously; `external_id` round-trips per signer; per-signer `slug` returned for embedding |
| b | Certificate of Signature | ✅ **Exceeds bar** — see inspection below |
| c | Voided-envelope billing | ✅ **Voids do NOT bill.** `DELETE /submissions/{id}` archives (`archived_at` set, status stays `pending`, never `completed`). DocuSeal bills per **completed** document, so an archived-before-completion envelope is free → **`VOIDED_ENVELOPES_COUNT_TOWARD_CAP = false`** (confirmed, not assumed) |
| d | Webhook HMAC scheme | ✅ Confirmed `X-Docuseal-Signature: {timestamp}.{hexHmac}`, HMAC-SHA256 over `{timestamp}.{rawBody}`, 5-min tolerance, `whsec_`-prefixed secret used as-is. **Timestamp is UNIX SECONDS** — 17-01's provisional implementation assumed milliseconds and would have rejected every genuine webhook as stale. Fixed in `de9ce7f` |
| e | White-label scope/price | ✅ Pro = **$20/user/mo + $0.20/completion**; covers logo, own email sender, personalized email content, custom domain (annual). Audit-log branding coverage **undocumented** — hence Funūn's own Certificate of Completion |

## Certificate of Signature — inspection

DocuSeal's audit log carries: **Original + Result SHA256** (tamper-evidence on the exact artifact), and per signer — role, email, name, **"Email verification: Verified"**, IP address, session ID, user agent, timezone, and the signature image. Plus a full timestamped event log (email sent → link clicked → form viewed → submission started → completed).

Notable for P17-01's fast lane: API-completed signers are labeled **"Submission completed via API"**, distinct from the full click→view→start→complete trail of a hand-signed party. An API-assisted signature is therefore *distinguishable in the legal record* — no ambiguity about how a signature was captured.

## Deliverability

Invites delivered to `esign@funun.studio` and Gmail plus-addresses; event log confirms send → click → view → complete within the same minute for the funun.studio address. Domain receiving path works.

## Bugs found (not previously known)

1. **[SHIPPED CODE] Non-Latin-1 glyphs silently corrupted in every Funūn PDF.** `@react-pdf/renderer`'s standard-14 fonts use WinAnsi encoding. Latin-1 renders fine (ó/é/ñ/ü/ï/ë), but anything beyond is destroyed: **`ć` is silently DROPPED** (`Nikola Jokić` → `Nikola Joki`) and **`ū` mangles** (`Funūn` → `Funkn`, visible in the footer of every credits sheet, metadata sheet, and split sheet ever generated). Breaks Polish/Czech/Croatian/Serbian/Turkish/Baltic/Vietnamese names and all non-Latin scripts. **A collaborator's legal name is corrupted on the document governing their royalty share.** Fix: bundle Noto Sans (SIL OFL) and register it — decided 2026-07-20.
2. **Dangling label** — `Split Sheet · Prepared by ` renders with nothing after it when `initiatorName` is absent.

## Document content gaps (drove the legal-grade rebuild decision)

The executed test document is a table, not an agreement. Missing: **composition-vs-master scope statement** (a "Producer — 25%" row is dangerously ambiguous between publishing share, master share, and producer points), date of agreement, publisher per writer (PRO/IPI present but publishers are who collect), legal names distinct from professional names, operative agreement language, sample/interpolation disclosure, ISWC/ISRC linkage (both already captured in the metadata studio), and per-signature date lines.

## Artifacts

Executed PDF and Certificate of Signature retrieved via `GET /submissions/{id}/documents` and the submission's `audit_log_url` — confirming 17-07's planned re-host flow works. (Session scratchpad only; not committed.)
