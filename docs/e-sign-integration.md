# E-signature for split sheets & contracts — integration spec

> Wave 2 (rights & registration) · decision doc · last updated 2026-06-23
>
> Picks a binding e-signature provider for split sheets / agreements and shows how
> either one wires into Funūn's existing document system. **Not legal advice** —
> confirm the "binding signature" claim with counsel before marketing it. Pricing
> shifts; verify on each vendor's page before committing.

## Why this is a "plug in a specialist" job
Split sheets and producer agreements decide **who owns what % of a song** — money
flows from them for years, and they're the documents people actually dispute. Funūn
already **generates** these docs, lets you **mark signed** and **upload a signed copy
+ AI-verify** it. The only missing piece is **collecting a legally-defensible
signature in-app**. A signature is binding under the US **ESIGN Act + UETA** if it
captures intent, consent, attribution (who signed), and a tamper-evident record — and
the value of DocuSign/Dropbox Sign is exactly that **court-tested evidentiary package**
(identity, audit trail, certificate of completion, tamper-seal). So we integrate one
rather than hand-roll it.

---

## Shared architecture (provider-agnostic — build once, swap providers)
Wrap whichever vendor behind a single interface so we're never locked in:

```
lib/esign/provider.ts → interface EsignProvider {
  createEmbeddedRequest(doc, signers) → { requestId, signingUrls }
  downloadSignedPdf(requestId) → Buffer
  verifyWebhook(req) → event
}
```

**Flow (identical for both vendors):**
1. Generate the split sheet → PDF (from `document_data`).
2. Create a signature request with **signers = the composers + their splits**
   (`readComposers(track.metadata)` already has names/shares; we add their emails).
3. **Embedded signing** — signer signs inside Funūn (iframe), no vendor account.
4. Vendor **webhook** fires on completion → download the signed PDF to a private
   bucket → set `vault_documents.status='signed'`, `signed_at`, and stash the
   evidence in `document_data.esign`.
5. That flips the **Release Readiness split-sheet gate (+15)** automatically.

**Storage — no migration.** Everything rides the existing `vault_documents.document_data`
JSONB:
```
document_data.esign = {
  provider: 'dropbox_sign' | 'docusign',
  requestId, signers: [{ name, email, status }],
  signedFileUrl, auditTrailUrl, completedAt
}
```

**New pieces (same for either vendor):**
- `lib/esign/provider.ts` + one vendor implementation.
- `POST /api/vault/[projectId]/documents/[docId]/esign` — create request, return embedded URL.
- `POST /api/webhooks/sign/[provider]` — verify + update doc + store signed PDF.
- Embedded signing modal (iframe) on the document card.
- Capture **collaborator emails** (small addition to composer/collaborator data).
- Keep **upload-signed-copy + AI verify** as the offline fallback (already built).
- Secrets in env (server-only).

---

## Option A — Dropbox Sign (formerly HelloSign)
- **Auth:** simple **API key**. (Easiest possible.)
- **Embedded signing:** iframe via the embedded client; signer signs in Funūn,
  **no Dropbox account required**.
- **SDK:** clean official Node SDK; webhooks (`signature_request_all_signed`).
- **Build effort:** **low–medium.**
- **Pricing:** the **API is priced separately from the app**. **Embedded signing
  requires the Standard API tier ≈ $300/mo (~$3,600/yr)**; **free unlimited test
  mode** (test signatures aren't legally binding). ⚠️ The cheap "$15–40/mo" tiers you
  see listed are the *app* product — **not** API/embedded.
- **Defensibility:** ESIGN/UETA-compliant, audit trail + tamper-evidence. Strong.

## Option B — DocuSign
- **Auth:** **OAuth — JWT grant** (server-to-server) needs an integration key + RSA
  keypair + one-time admin consent. More moving parts.
- **Embedded signing:** **"Focused View"** — a minimalist embedded UX (just the
  document + a floating "go to next field" button). Mark recipients embedded with
  `clientUserId`; Funūn authenticates the signer, who **never sees a DocuSign login
  and needs no account**.
- **SDK:** official Node SDK, but more concepts (envelopes, recipients, tabs/anchor
  strings); Connect webhooks.
- **Build effort:** **medium–high.**
- **Pricing (approx — often quote-based):** developer/API plans roughly **$600/yr
  (Starter, ~40 envelopes/mo)** → **~$5,760/yr (Advanced, ~100/mo + webhooks)** →
  Enterprise custom; embedded on higher tiers. Free developer sandbox.
- **Defensibility:** the **gold standard** — most court-tested, strongest brand.

---

## The account-creation question (your specific concern)
Your bad memory is real — but it's the **email / DocuSign-hosted** flow, which upsells
"create a free account to save your document." That friction **disappears with embedded
signing**: with both vendors the signer signs *inside Funūn* and **does not need an
account** (DocuSign confirms this for `clientUserId` embedded recipients; Focused View
strips the chrome). So **both can be seamless** — the trick is using *embedded* signing,
not the email flow.

What still differs for the signer:
- **Dropbox Sign** — lighter, cleaner default signing UI; simplest to build.
- **DocuSign Focused View** — clean now too, but heavier brand chrome and a more complex build.

---

## Compare & contrast
| | **Dropbox Sign** | **DocuSign** |
|---|---|---|
| Build effort | Low–med (API key) | Med–high (JWT/OAuth, envelopes) |
| Signer UX (embedded) | Very clean, no account | Clean (Focused View), no account |
| Account-creation nag | None | Only in email flow → avoided by embedding |
| Pricing (embedded) | ~$300/mo Standard API | ~$600–5,760/yr dev plans, then custom |
| Free testing | Unlimited test mode | Developer sandbox |
| Defensibility | Strong | Gold standard / most court-tested |
| Brand recognition | Medium | Highest |
| Lock-in | Behind `EsignProvider` | Same |

---

## Recommendation
**Start with Dropbox Sign.** At our stage it's cheaper, the simplest build, the
cleanest embedded signer experience, and it directly fixes the account-creation
friction you disliked — while still being ESIGN/UETA-defensible for split sheets.
Keep the **upload-signed-copy + AI-verify** path as the offline fallback. Build it
behind the **provider-agnostic `EsignProvider`** so if a label/enterprise partner ever
demands the DocuSign brand or maximum defensibility, we add it later with **no rework**.

## Build checklist (Dropbox Sign first)
1. Capture collaborator **emails** (extend composer/collaborator data).
2. `lib/esign/provider.ts` — interface + Dropbox Sign implementation.
3. Split sheet → PDF generation.
4. `POST …/documents/[docId]/esign` — create embedded request.
5. Embedded signing modal (iframe) on the document card.
6. `POST /api/webhooks/sign/dropbox` — verify, update status, store signed PDF.
7. Env: `DROPBOX_SIGN_API_KEY` (+ client id for embedded).
8. End-to-end in test mode → then go live.

## Sources
- Dropbox Sign API pricing — https://sign.dropbox.com/products/dropbox-sign-api/pricing
- DocuSign embedded signing (no signer account) — https://developers.docusign.com/docs/esign-rest-api/esign101/concepts/embedding/embedded-signing/
- DocuSign Focused View / request signature in-app — https://developers.docusign.com/docs/esign-rest-api/how-to/request-signature-in-app-embedded/
- DocuSign vs Dropbox Sign API tiers (third-party, approximate) — https://www.esign.ai/blog/docusign-vs-dropbox-sign-api-rate-limits-pricing-tier-review-2026
