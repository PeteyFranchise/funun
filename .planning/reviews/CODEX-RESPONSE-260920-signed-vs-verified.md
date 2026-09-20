# BOTTOM LINE

The statuses are orthogonal, not ordinal: `signed` currently records an authenticated owner's PDF upload, while `verified` records an AI completeness/accuracy verdict.  
`verified` does not strictly dominate `signed`, because the verdict may be `verified` while `signatures_present` is `pending`; conversely, `signed` carries no AI content check at all (`lib/contracts/verify.ts:39-62,131-137`; `app/api/vault/[projectId]/documents/[docId]/upload/route.ts:62-69`).  
Do not widen `signedOf()` to accept every `verified` row, because that would let an AI-reviewed but not affirmatively executed split sheet or hire-right agreement satisfy two of the Crate's three rights requirements.  
The correct fix is to introduce explicit execution assurance, keep AI verification as a separate axis, and make the Crate accept only provider-completed or staff-confirmed execution rather than either overloaded status word.  
Until that model and its migration are human-approved and deployed, leave `signedOf()` conservative and treat the existing upload-backed `signed` path as uploader attestation—not independent proof of authorization.

# CORRECTIONS

Your central concern is correct, but four details need correction or qualification.

1. **The upload path does perform technical validation, but no execution validation.** It authenticates the user, scopes the document to that user's project/document, applies upload admission, and calls `uploadSignedPdf()` (`app/api/vault/[projectId]/documents/[docId]/upload/route.ts:14-46`). The helper accepts only a client-declared `application/pdf` MIME type and a file no larger than 5 MB, then uploads it; it does not inspect PDF magic bytes, parse pages, find signature blocks, validate signatures, or compare parties/terms (`lib/vault/documents.ts:35-68`). After that technical upload succeeds, the route unconditionally writes `status: 'signed'`, `signed_at`, `file_url`, and the uploader's email/id (`app/api/vault/[projectId]/documents/[docId]/upload/route.ts:62-74`). Therefore “uploading a PDF transitions it to signed” is correct; “no validation at all” would be too broad, while “no validation that it is executed” is exact.

2. **`result.status === 'verified'` does not mean all four checks passed.** The prompt asks the model to assess splits/financial consistency, parties, signatures, and terms, and specifically says the signature check passes only when every required signature block is signed and dated (`lib/contracts/verify.ts:102-137`). The decision function, however, returns `verified` whenever all four keys contain a recognized state, no state is `fail`, and at least one state is `pass`; individual `pending` states are allowed (`lib/contracts/verify.ts:39-62`). The existing test deliberately proves “three pass plus one pending” is verified, although its fixture makes `splits_total` the pending check (`lib/contracts/verify.test.ts:53-65`). By direct application of the same status-agnostic predicate, `signatures_present: pending` plus another pass also yields `verified`; that last sentence is a code inference, not an observed provider response.

3. **The three cited modules do not all make the same rights decision.** `stage3.ts` does collapse `signed || verified` into its UI-level `signed` state for every document type (`lib/vault/stage3.ts:86-90,100-137`). `locker-attention.ts` puts both statuses in the settled document archive, but that function is bucketing the Contract Locker, not deciding Crate eligibility (`lib/contracts/locker-attention.ts:1-11,301-313`). `direct-overlay.ts` is mixed: a split sheet must be exactly `signed`, while a sample clearance may be `signed || verified` (`lib/eligibility/direct-overlay.ts:91-104,150-174`). The premise that all three already establish a uniform policy is therefore refuted.

4. **Changing `signedOf()` would affect only two readiness items directly.** The local helper is invoked for legacy `split_sheet` and `hire_right` documents (`lib/vault/readiness.ts:116-122,181-190,283-315`). Copyright uses `evidencedOf()`, which intentionally accepts attached/checked evidence for a filing rather than execution (`lib/vault/readiness.ts:124-160,239-256`). Sample clearance is not one of the six Crate-entry readiness items at all (`lib/sync-library/readiness.ts:47-54,285-299`).

Your schema reading is correct. The original status constraint permits only `pending`, `signed`, and `verified` (`supabase/migrations/001_initial_schema.sql:165-178`). A later validated database guard requires file/e-sign evidence for `signed`, and requires a file, `verification_status = 'verified'`, and `verified_at` for `verified`; it does **not** require the stored signature check to be `pass` (`supabase/migrations/045_pitch_token_expiry_document_status_guard.sql:16-41`; `supabase/migrations/049_validate_document_status_evidence_guard.sql:1-16`).

# WHAT EACH STATUS ACTUALLY MEANS

## `pending`

At the table level, `pending` is the default workflow state (`supabase/migrations/001_initial_schema.sql:166-178`). The ordinary create route rejects any client request to create a document directly as `signed` or `verified` and inserts only `pending` (`app/api/vault/[projectId]/documents/route.ts:43-71,83-104`). Generated split sheets and AI-generated gated documents also begin `pending` (`app/api/vault/[projectId]/documents/generate/route.ts:79-97,164-179`). The generic PATCH route can reset only to `pending`; it cannot promote a document (`app/api/vault/[projectId]/documents/[docId]/route.ts:7-12,39-58`).

Meaning: a document record exists, but the generic lifecycle has not recorded execution or a clean AI review. It may contain generated document data, or it may be an uploaded file whose AI result was `failed`/`unverified`, because the verification route maps every non-verified AI result back to document `status: 'pending'` (`app/api/contracts/verify/route.ts:117-132`).

## `signed`

There are two materially different producers of `signed`:

- **Upload-backed self-attestation.** An authenticated owner uploads a file advertised as a PDF; the route writes `signed` without reading its contractual content or signatures (`lib/vault/documents.ts:35-68`; `app/api/vault/[projectId]/documents/[docId]/upload/route.ts:22-29,62-74`). The database guard proves only that `signed_at` exists and either `file_url` or `document_data.esign.completedAt` exists (`supabase/migrations/045_pitch_token_expiry_document_status_guard.sql:23-34`).
- **Provider-backed execution.** DocuSeal completion fetches the executed PDF, marks signer state signed, records `completedAt`, and persists completion through server-owned webhook/RPC handling (`app/api/webhooks/docuseal/route.ts:128-150,169-224,577-637`). That is materially stronger evidence than an arbitrary owner upload, even though both collapse into the same `status` value.

Meaning: `signed` is not one assurance level. It can mean “the owner uploaded what they say is the executed copy” or “the e-sign provider completed the envelope.” The status alone cannot tell those apart reliably without also reading provenance/e-sign data.

## `verified`

The AI route accepts an uploaded PDF, loads the release title, ISRCs, and expected writers/splits, and sends both the PDF and context to the model (`app/api/contracts/verify/route.ts:47-79,90-108`). The prompt describes the task as completeness/accuracy checking, expressly not legal advice/review, and asks for four states: financial/split consistency, parties present, signatures present, and terms matching the release (`lib/contracts/verify.ts:1-4,109-137`). Malformed output, missing checks, unknown states, or all-pending output fails closed to `unverified`; any explicit failure becomes `failed` (`lib/contracts/verify.ts:30-77`). The route stores document `status: 'verified'` only for the clean overall verdict and otherwise stores `pending`, while preserving the separate `verification_status` and individual checks (`app/api/contracts/verify/route.ts:117-140`).

Meaning: `verified` says the model returned a parseable, fully enumerated, no-explicit-failure assessment with at least one affirmative pass. It does not by itself say the signature check passed, does not authenticate signers, does not validate a cryptographic signature, does not prove authority, and is explicitly not legal review. A malicious or simply misleading PDF is also model input in the same user message as the instructions (`lib/contracts/verify.ts:154-170`); the code validates the output shape/state vocabulary, but it does not establish that document-borne prompt injection or model error is impossible.

## Relationship between the statuses

They are **orthogonal signals compressed into one three-valued column**:

| Signal | What it currently proves | What it does not prove |
|---|---|---|
| `signed` from upload | Authenticated owner attached a MIME/size-accepted file and attested through the signing upload flow. | That the file is a real PDF, contains the expected agreement, has every required signature, matches the project, or grants the necessary rights. |
| `signed` from e-sign completion | The configured provider reported completion and Funūn retained the executed artifact/signing state. | Ultimate legal validity, signer authority outside provider identity, or absence of all substantive contract defects. |
| `verified` | AI returned an assessed, no-explicit-fail completeness/accuracy result over the four requested checks. | Affirmative execution unless `signatures_present` itself is `pass`; legal review; signer identity/authority; contractual enforceability. |

Consequently, neither status strictly dominates the other. A particular `verified` row whose signature check is `pass` contains more machine-read evidence than a generic uploaded `signed` row, but the bare status does not preserve that distinction. A provider-completed `signed` row has stronger execution provenance than either generic status alone communicates.

# CONSEQUENCE

Widening `signedOf()` from exact `signed` to `signed || verified` would change both `split_sheets` and `hire_right` from `warning` to `complete` when every matching document is one of those two statuses (`lib/vault/readiness.ts:116-122,181-190,283-315`). A remaining `pending` matching document would still keep the item at `warning`; this is not an “any verified document wins” rule.

The concrete newly qualifying case is:

- A single/EP/album has the other four Crate entry items complete.
- Its split sheet is `verified` but not `signed`; for a project with hired producers/engineers, the hire-right document may likewise be `verified` but not `signed`.
- The verifier may have returned `signatures_present: pending` while other checks passed, yet persisted document status `verified` under the current verdict algorithm (`lib/contracts/verify.ts:39-62`; `app/api/contracts/verify/route.ts:117-132`).
- Today those execution-bearing readiness items are `warning`, so the six-item gate fails closed (`lib/sync-library/readiness.ts:47-54,243-252,294-299`). After a global widening, they become `complete` despite no affirmative execution signal in the status.

That produces four admission/visibility movements:

1. **Staff admission becomes possible.** The admit route derives `rightsClear` from split-sheet, copyright, and hire-right completion, combines it with quality and metadata, and changes the listing to `admitted` when the gate passes (`app/api/sync-library/admin/[listingId]/route.ts:248-301`). A listing previously refused with 409 for incomplete rights could be admitted after the widening.
2. **An already-admitted but currently hidden track can become buyer-visible immediately on the next read.** Buyer catalogue loading recomputes readiness, requires an admitted listing, and calls `isRightsReady`; all six items must be complete (`lib/deals/catalog-query.ts:302-336`; `lib/deals/catalog.ts:185-208`). The status change alone does not create an admitted listing, but legacy/drifted already-admitted rows can cross the visibility gate without another staff action.
3. **Staff work changes from incomplete to ready for review/admission.** The worklist and admin page select project document type/status, feed the same readiness engine, and derive missing items from it (`app/api/sync-library/worklist/route.ts:25-35,75-83,199-203`; `app/(admin)/admin/sync-library/page.tsx:84-89,121-151,200-206`).
4. **Downstream rights-ready labels/ranking change.** Shortlists recompute `stillRightsReady` (`lib/deals/shortlists.ts:116-149`); Selects rows recompute `rights_ready` (`lib/selects/tracks-query.ts:129-175`); AI-draft candidates sort rights-ready first and expose that flag to the draft (`lib/selects/ai-draft.ts:63-76,152-155`). The AI draft does not hard-filter near-ready songs, so there the consequence is rank/label rather than sole admission.

The asymmetric harm is real: a false negative delays an authorised song and can be corrected; a false positive can expose or facilitate licensing of a song whose splits or work-for-hire ownership is not executed. The repository itself labels these readiness items “Split sheets signed” and “Producer agreements signed” (`types/index.ts:177-185,224-231`). A content-complete but unsigned document does not satisfy that proposition.

The blast radius is wider than the Crate. Because `signedOf()` is a local closure, no other module calls it directly; every indirect consumer calls `readinessItemsForProject()`:

- Artist dashboard and Vault cards change complete-item/gates-left counts (`app/(artist)/dashboard/page.tsx:165-182,370-390`; `app/(artist)/vault/page.tsx:538-555,567-585,603-621`).
- Project detail and readiness pages change complete counts, earned points, percentage, and first blocker (`app/(artist)/vault/[projectId]/page.tsx:155-166`; `app/(artist)/vault/[projectId]/readiness/page.tsx:150-165`).
- The buyer catalogue, staff worklist/admit gate, shortlists, Selects, and AI-draft surfaces move as described above.
- Demo-mode readiness score recomputation also consumes the helper (`lib/vault/demo-store.ts:6-18`).

One important non-movement: the database `vault_readiness_score` calculation remains exact-`signed` for legacy split-sheet and hire-right documents (`supabase/migrations/070_readiness_definer_privilege_sweep.sql:97-101,145-169`). A TypeScript-only widening would therefore create another deliberate-looking but unexplained divergence: UI item counts and Crate gates could pass while the stored score stayed lower. That is additional evidence against a one-line change.

# RECOMMENDATION

## Decision

**Introduce explicit execution assurance; do not widen `signedOf()` by status alone.** The current schema already has a separate AI axis—`verification_status` plus `verification_checks` (`supabase/migrations/011_contract_verification.sql:10-29`)—but it lacks a normalized assurance axis that distinguishes owner-attested upload, model-observed signatures, provider-completed execution, and staff confirmation.

The proposed model is:

- `status`: document workflow/display state; preserve temporarily for compatibility.
- `verification_status` and `verification_checks`: what the AI could assess about content.
- New `execution_assurance`: `none | uploader_attested | ai_observed | provider_completed | staff_confirmed`.
- Crate-qualifying execution: only `provider_completed` or `staff_confirmed` for execution-required documents.
- `ai_observed` is a useful review aid, never automatic licensing authority. `uploader_attested` can support the artist workflow but should require staff confirmation before Crate admission.

This is a proposed post-227 migration only; it is **not applied** and its migration number must be allocated when implementation starts, because another migration may land first. A human-gated migration should add the constrained assurance column plus review metadata (`execution_reviewed_at`, `execution_reviewed_by`), backfill provider-completed rows from trusted e-sign completion evidence, classify ordinary upload-backed `signed` rows as `uploader_attested`, and leave ambiguous `verified` rows at `none` or `ai_observed` according to their stored signature check. It should not bulk-promote AI-observed rows to staff-confirmed.

## Code change

1. Replace `signedOf(docType)` with a document-type-aware `executedOf(docType)` that reads `execution_assurance`, not `status`. Preserve the all-matching-documents rule. Split sheets and hire-right agreements should reach `complete` only when every applicable document has Crate-qualifying execution assurance.
2. Expand readiness input/selects to include the new field. This must cover every caller that currently fetches only `type,status`, especially the staff worklist (`app/api/sync-library/worklist/route.ts:75-83`) and admin page (`app/(admin)/admin/sync-library/page.tsx:121-151`).
3. On ordinary signed-PDF upload, write `uploader_attested`, not an authoritative Crate-clear signal. The route may retain `status: 'signed'` during migration compatibility, but copy/UI must state that this is attested, awaiting rights review.
4. On DocuSeal completion, write `provider_completed`. The webhook already possesses provider request/completion state and the executed artifact, so it is the correct authoritative producer (`app/api/webhooks/docuseal/route.ts:128-224,577-637`).
5. On AI verification, store the verification result exactly as today but write at most `ai_observed` when the `signatures_present` check is `pass`; write `none` when it is `pending` or `fail`. Do not translate the overall AI verdict into execution.
6. Add a staff review action that records `staff_confirmed`, reviewer, and time after the document has been opened and checked. The admit route must continue to fail closed until that assurance exists for upload-backed split/hire documents.
7. Correct neighboring consumers by meaning, not mechanically: `stage3.ts` should show AI-verified-but-unexecuted documents as awaiting execution; `direct-overlay.ts` should require execution assurance for split sheets and sample clearances; `locker-attention.ts` should archive based on settled workflow while keeping an execution-needed item visible rather than equating “AI reviewed” with “executed.” Its archive policy need not be identical to a Crate gate.
8. Keep copyright on an evidence/filing predicate. A copyright receipt/certificate is not an agreement awaiting signatures, so forcing it through execution assurance would repeat the category error that `evidencedOf()` was created to avoid (`lib/vault/readiness.ts:124-160,239-256`).

If a schema change cannot ship immediately, the safe interim is to leave `signedOf()` unchanged and add no broader acceptance. A narrower temporary helper could accept `verified` only when its stored `signatures_present` check is explicitly `pass`, but that would merely match the already weak uploader-attested `signed` bar; it would not solve Crate-grade assurance and would require widening every document select to include checks. I would not spend a migration-free patch on that intermediate state unless product operations urgently need AI-reviewed executed PDFs to stop blocking.

## Tests that prove the fix

1. **Verifier semantics:** preserve tests that malformed/missing/all-pending output is not verified; add an explicit test showing the current overall verifier can be `verified` with `signatures_present: pending`, so nobody again infers execution from the overall label (`lib/contracts/verify.test.ts:15-65`).
2. **Execution normalization:** table-test every source/evidence combination: owner upload → `uploader_attested`; AI signature pass → `ai_observed`; AI signature pending/fail → `none`; completed provider envelope → `provider_completed`; staff review → `staff_confirmed`.
3. **Readiness:** a `verified` split/hire document with signature pending remains `warning`; `ai_observed` remains `warning`; provider-completed/staff-confirmed becomes `complete`; one nonqualifying document among multiple matching documents keeps the item `warning`.
4. **Admission mutation:** with all other requirements complete, an AI-only split sheet makes the admin admit route return 409 and perform no listing update; provider/staff-confirmed execution plus quality/metadata lets the route update to `admitted` (`app/api/sync-library/admin/[listingId]/route.ts:248-304`).
5. **Buyer visibility:** an already-admitted listing with AI-only execution remains absent from buyer catalogue results; the same fixture becomes visible only after qualifying execution assurance (`lib/deals/catalog-query.ts:302-336`).
6. **Downstream parity:** staff worklist, shortlists, Selects `rights_ready`, AI-draft ordering, artist checklist, and demo scoring all read the same execution predicate.
7. **Provider path:** webhook fixtures prove completion alone writes `provider_completed`, while redelivery remains idempotent and cannot downgrade/re-promote incorrectly.
8. **Migration tests:** constraint vocabulary, conservative backfill, grants/RLS for review writes, and rollback/rolling-deploy compatibility. Because production is at 227 and migrations are human-gated, tests may validate proposed SQL text/local schema only; no agent should claim production application.

# CONFIDENCE

## Verified by reading code

- The repository state inspected was local `main` at commit `caf6f506ee7c694d6c007dd4ed57fc0299c2101e`; local/remote refs were inspected without fetching, switching branches, or changing git state.
- `vault_documents.status` has the three stated values, and migration 045/049's evidence guard does not require `verification_checks.signatures_present = pass` (`supabase/migrations/001_initial_schema.sql:165-178`; `supabase/migrations/045_pitch_token_expiry_document_status_guard.sql:23-41`; `supabase/migrations/049_validate_document_status_evidence_guard.sql:6-16`).
- The ordinary upload path authenticates/authorizes and validates client MIME/size, but it does not inspect execution before setting `signed` (`app/api/vault/[projectId]/documents/[docId]/upload/route.ts:14-74`; `lib/vault/documents.ts:35-68`).
- The AI prompt checks signatures, while the decision function permits individual pending checks in an overall verified result (`lib/contracts/verify.ts:39-62,102-137`).
- The AI route maps only overall verified to document status `verified`, stores every individual check, and maps other results to `pending` (`app/api/contracts/verify/route.ts:103-140`).
- `signedOf()` affects legacy split-sheet and hire-right readiness; the six-item Crate gate requires both complete (`lib/vault/readiness.ts:116-122,181-190,283-315`; `lib/sync-library/readiness.ts:47-54,249-252,294-299`).
- `stage3`, Contract Locker attention, and direct overlay do not share one uniform status policy (`lib/vault/stage3.ts:86-90`; `lib/contracts/locker-attention.ts:301-313`; `lib/eligibility/direct-overlay.ts:91-104`).
- Four targeted suites passed: `lib/contracts/verify.test.ts`, `lib/vault/readiness.test.ts`, `lib/deals/catalog.test.ts`, and `lib/sync-library/readiness.test.ts`; 120 tests passed, 0 failed. These tests confirm current behavior, not the proposed execution-assurance model.

## Inferred or proposed

- A `verified` response with `signatures_present: pending` is a deterministic inference from the generic decision predicate; I did not call the provider or observe a production row with that exact combination.
- The legal/licensing risk assessment is architectural/product reasoning, not legal advice. Whether uploader attestation is contractually sufficient is an owner/legal-policy decision; given the stated asymmetric Crate risk, I recommend that it not be sufficient for automatic admission.
- The proposed `execution_assurance` vocabulary, qualifying levels, staff-review requirement, migration/backfill, and tests are recommendations only. No code, schema, policy, production data, or deployment was changed.
- I did not inspect live production rows, provider account configuration, or actual stored PDFs. Production-at-227 is accepted from the task constraint rather than independently queried.
- AI can misread documents and document text can attempt to influence a model; the code does not prove immunity. I did not perform adversarial provider testing, so the practical success rate is unknown.
