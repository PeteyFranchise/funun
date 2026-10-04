# Contract Template System → Contract Locker Implementation Blueprint

**Status:** Recommended architecture; ready for counsel/product decisions and GSD phase planning  
**Recorded:** 2026-10-04  
**Scope:** Governed templates, structured generation, lawyer collaboration, e-signature, and Contract Locker lifecycle  
**Does not do:** Approve legal language, draft final Terms of Service, apply migrations, or enable a template

## Executive decision

Build a governed contract domain beside the existing Contract Locker rather than teaching the application to read Markdown from `research/contracts/` or adding more one-off generators.

The clean architecture has three deliberately separate layers:

```text
Repository research source
  -> immutable, counsel-reviewed production template version
  -> document instance with its own fields, parties, review, signing, and evidence
  -> Contract Locker index and authorized access surface
```

`research/contracts/` remains an authoring and provenance source only. Production generation must select an immutable published template version from a server-owned registry. Contract Locker remains the user's lifecycle surface and evidence index, while new contract-domain records carry the richer template, review, party, disclosure, and signing state.

Do not use a language model to compose operative clauses for a document presented as lawyer-reviewed. Use deterministic rendering from counsel-approved clause variants and structured fields. AI may explain fields, summarize a document for an authorized user, or check completeness, but it must not silently choose or rewrite legal terms.

## Why this fits the existing system

The repository already provides useful foundations:

- `vault_documents` is the current Contract Locker index and readiness link.
- `lib/esign/provider.ts` is vendor-neutral, and `lib/esign/docuseal.ts` already creates submissions without exposing the API key.
- `app/api/webhooks/docuseal/route.ts` and `lib/esign/webhook.ts` provide HMAC-verified, server-authoritative completion handling.
- Split-sheet execution already preserves envelope attempts, signer state, executed files, certificates, and per-party access.
- Member workspaces already separate professional-role labels from actual permissions.
- Attorneys already fit the Member identity model through `attorney` and `entertainment_attorney` profile roles.
- Workspace permissions already distinguish viewing contracts, uploading/generating contracts, and requesting signatures.

These parts should be reused. The missing piece is a reusable governed-template and contract-instance layer.

## Critical conflicts to resolve before expansion

### P0 — block non-approved legal text from production signing

`lib/sync-library/agreement.ts` identifies its blanket agreement as a non-final, non-counsel-reviewed draft, while `lib/sync-library/mint-agreement.ts` can render it and create a live DocuSeal request. This conflicts with the newly approved governance model. Before adding another template, place that signing path behind a server-side publication gate and disable it unless its exact version is approved and published.

Existing executed records must remain preserved. The change is prospective: prevent new submissions from an ineligible version.

### P0 — stop presenting AI completeness checks as legal verification

`app/api/contracts/verify/route.ts` performs an AI completeness/consistency check, but Contract Locker copy includes “Verified” and “Verified — airtight.” Those labels can be mistaken for legal review. Rename this state in the UI to “AI completeness checked” or “Needs information,” while displaying template legal-review status separately.

### P0 — protect executed records from deletion or mutation

The generic project document route currently permits DELETE by the owner and `vault_documents` remains broadly mutable. Executed agreements should be append-only evidence: allow per-user hide/archive, correction workflows, superseding documents, or amendments, but never hard-delete or overwrite the executed artifact, template snapshot, signer evidence, or audit history through ordinary user routes.

### P0 — normalize private storage

Contract files should store private bucket paths, never durable public URLs. Every read should issue a short-lived signed URL only after current authorization is checked. `uploadSignedPdf()` currently calls `getPublicUrl()` for `release-documents`; the governed contract path should not repeat that pattern.

### P1 — reconcile type and lifecycle drift

The database accepts `sync_license`, while the hand-maintained `DocumentType` union and some Contract Locker label maps do not. The current `pending | signed | verified` status is also too small to describe drafting, counsel review, approval, partial signing, decline, void, expiration, supersession, and amendment. The new contract lifecycle should live in its own typed domain while `vault_documents.status` remains a compatibility projection.

## Domain boundaries

### Research source

- Human-readable source and intake audit in `research/contracts/`.
- Never imported by application runtime.
- May be incomplete, unreviewed, or legally unsuitable.
- Identified by a stable research ID and provenance.

### Production template

- Exact immutable legal content, allowed clause variants, field schema, signer roles, disclosure requirements, jurisdiction/use scope, renderer key, and content hash.
- Has explicit review and publication state.
- Can be generated only while `published` and within its approved scope.
- Retirement prevents new documents but does not affect existing instances.

### Contract instance

- A user's specific document created from one exact template version.
- Snapshots every input, selected clause variant, party identity, disclosure version, and rendered hash.
- May branch into a custom/unreviewed document if protected language changes.
- Owns review, approval, signing, amendment, and evidence lifecycle.

### Contract Locker record

- User-facing index and access point.
- Keeps compatibility with project readiness and the existing Locker.
- References the contract instance and displays its provenance rather than duplicating the legal source of truth.

## Recommended data model

Names are recommendations for phase planning; final migration names can follow the repository's phase numbering.

### `contract_templates`

Stable identity for a template family.

| Column | Purpose |
| --- | --- |
| `id`, `key` | Stable identity such as `producer-agreement` |
| `title`, `document_type` | Product title and normalized type |
| `research_source_id` | Link back to repository provenance |
| `status` | `draft`, `active`, or `retired` family state |
| `current_published_version_id` | Convenience pointer; never the only source of version history |
| `created_by`, timestamps | Administrative provenance |

### `contract_template_versions`

Immutable version actually used to generate documents.

| Column | Purpose |
| --- | --- |
| `template_id`, `version` | Unique human-readable version identity |
| `state` | `draft`, `in_review`, `approved`, `published`, `retired`, `rejected` |
| `legal_content` | Structured headings, paragraphs, and pre-approved conditional variants |
| `field_schema` | Bounded input types, validation, dependencies, helper text, and editable/protected classification |
| `signer_schema` | Signer roles, required parties, order, and DocuSeal field mapping |
| `disclosure_version_id` | Required non-counsel disclosure |
| `renderer_key`, `renderer_schema_version` | Server allowlisted renderer, never arbitrary executable content |
| `jurisdictions`, `use_cases`, `exclusions` | Counsel-approved scope |
| `content_sha256` | Integrity identity for the exact compiled manifest |
| `source_commit`, `source_path` | Repository provenance |
| `created_by`, `created_at` | Authorship provenance |

Once a version reaches `approved`, its legal content, schemas, scope, and hash become database-immutable. A change creates a new version.

### `contract_template_reviews`

Append-only review decisions.

| Column | Purpose |
| --- | --- |
| `template_version_id` | Exact reviewed version |
| `reviewer_user_id` | Reviewing Member/authorized counsel account |
| `reviewer_role_snapshot` | `template_review_counsel` and approved attribution data |
| `decision` | `changes_requested`, `approved`, `approval_withdrawn` |
| `scope`, `jurisdictions`, `exclusions` | Review boundary |
| `notes_path` | Optional restricted review memorandum; not broad JSON/text exposure |
| `decided_at`, `review_due_at` | Review provenance and cadence |

A professional profile label alone cannot create one of these records. Publication requires a server-verified internal scope assigned for template review.

### `contract_instances`

One row per generated or imported agreement lifecycle.

| Column | Purpose |
| --- | --- |
| `id`, `owner_user_id` | Stable document identity and custody owner |
| `vault_document_id` | One-to-one Contract Locker compatibility link |
| `template_version_id` | Nullable only for uploads/custom documents |
| `origin` | `governed_template`, `custom_revision`, or `external_upload` |
| `lifecycle_status` | Full lifecycle state described below |
| `project_id`, `track_id`, `deal_id` | Optional typed associations |
| `input_snapshot` | Exact structured answers used at render time |
| `clause_selection_snapshot` | Exact pre-approved variants selected |
| `template_content_sha256` | Template integrity copied at generation |
| `draft_file_path`, `executed_file_path`, `certificate_path` | Private storage paths |
| `rendered_sha256`, `executed_sha256` | Artifact integrity |
| `created_by`, timestamps | Provenance |

Do not place bearer signing slugs, privileged legal comments, or full audit history in broadly selected `document_data` JSON.

### `contract_instance_parties`

Snapshots the parties and signer roles for this transaction. Link to a Member when one exists, but preserve names/emails and authority assertions as immutable transaction snapshots. Do not re-read mutable profile values into an existing agreement.

### `contract_matter_members`

Document-specific collaboration access for the owner, Funūn staff operator, user's counsel, counterparty counsel, or reviewer.

Recommended fields include `contract_instance_id`, `user_id`, `relationship_role`, permission booleans or normalized grants, `invited_by`, `accepted_at`, `expires_at`, `revoked_at`, and representation disclosure where counsel approves it.

This is narrower than workspace membership. A lawyer may be a normal Funūn Member, accept a document/matter invitation, and receive only the exact contract access granted. Their `attorney` profile label grants nothing by itself.

### `contract_disclosure_versions` and `contract_disclosure_acknowledgments`

Store counsel-approved boundary copy separately from template clauses. Record the actor, disclosure version, action (`generate`, `send`, `approve_for_signature`, or `sign`), contract instance, timestamp, and invitation/signer context. External signers can acknowledge through their non-enumerable signing flow without being forced to create a full account.

### `contract_events`

Append-only audit spine for creation, field changes, review requests, comments/proposals, approval, publication provenance, send, signer view, signature, decline, void, expiration, execution, download, supersession, access grant, and revocation. Event payloads must be allowlisted and avoid copying full contract text or confidential advice into logs.

### `contract_esign_envelopes` and `contract_esign_signers`

Use new generic tables keyed to `contract_instance_id`. Preserve every signing attempt; void/re-send creates a new attempt. Do not force the split-sheet-specific `esign_envelopes.split_sheet_id` and `split_sheet_party_id` schema to become polymorphic.

Split sheets can remain on their proven legacy tables until a later migration. All new template types use the generic contract envelope model.

## Lifecycle state machines

### Template version

```text
draft -> in_review -> changes_requested -> in_review
                   -> approved -> published -> retired
                   -> rejected
```

Only `published` can create a governed instance. Approval and publication should be separate: counsel approves legal scope; an authorized Funūn publisher enables product availability.

### Contract instance

```text
draft
  -> review_requested
  -> changes_requested -> draft
  -> approved_for_signature
  -> sent
  -> partially_signed
  -> executed

sent/partially_signed -> declined | voided | expired
executed -> superseded | amendment_in_progress
```

`vault_documents.status` remains a derived compatibility summary:

- pre-execution states → `pending`
- `executed` → `signed`
- external-upload completeness result may continue projecting to `verified`, but its UI label must not imply legal approval

## Generation rules

1. The server resolves a published template version by ID; the client cannot submit arbitrary legal text or a review flag.
2. The server validates the questionnaire against an allowlisted schema and applicable scope.
3. Conditional clauses come from a counsel-reviewed decision table. Each branch is deterministic and snapshotted.
4. The renderer escapes user values and emits a stable PDF plus DocuSeal role/field tags.
5. The server stores template hash, input snapshot, clause-selection snapshot, renderer version, and rendered-file hash before the document can advance.
6. Free-form changes to protected legal text are unavailable in governed V1.
7. If counsel uploads a custom revision, it becomes `custom_revision`, visibly loses the standard-template reviewed designation, and requires transaction-specific approval before signature.

The existing Anthropic document route can remain for clearly labeled drafting assistance only, but its output must be classified `custom/unreviewed` and must not flow directly into a “lawyer-reviewed template” signing path.

## Counsel and collaboration model

### Template-review counsel

- Uses a Member identity plus server-assigned internal review scope.
- Reviews one exact template version and compiled preview.
- Can request changes or approve within recorded jurisdiction/use scope.
- Cannot publish unless separately granted the publishing capability.

### User's counsel

- Uses an ordinary Member account, optionally displaying Attorney or Entertainment Attorney.
- Receives a client-authorized invitation to one contract matter or explicitly scoped workspace/project.
- Can view, comment, download a review copy, or propose a custom revision according to the grant.
- Does not receive signing authority or “act on behalf” merely by being a lawyer.
- Representation, conflicts, privilege, and engagement remain between lawyer and client.

### Counterparty counsel

- Receives a separate, explicit role and cannot see client-only comments or unrelated Locker documents.
- Adverse-side access must never be inferred from being a signer or from an email domain.

### Comments and redlines

V1 should support structured comments and replacement uploads rather than a collaborative rich-text editor for protected clauses. A proposed legal-language change creates a custom branch. Later, a redline editor may be added only if it preserves exact versions, author attribution, comparison, and review-status invalidation.

## Authorization model

- Keep the existing “one identity, many roles” doctrine. Attorney is a descriptive professional role, not an authorization source.
- Reuse `view_contracts`, `upload_contracts`, and `request_signatures` where project/workspace scope is appropriate.
- Add document-specific matter permissions for `comment`, `propose_revision`, `approve_for_client`, and `download` rather than widening workspace access.
- Keep `request_signatures` and any `act_on_behalf` behavior authority-tier permissions.
- Every mutating route re-resolves current access server-side. Revocation takes effect immediately.
- Direct database writes to template, review, instance lifecycle, envelope, and audit tables should be revoked from authenticated/anonymous roles. Mutations go through narrow service routes/RPCs with RLS-backed reads.
- Publication and legal-review decisions require staff/counsel scopes, not a request-body role or profile badge.

## DocuSeal integration

Reuse `EsignProvider`, webhook HMAC verification, idempotent completion claims, private artifact download, and client-event-as-hint doctrine.

For new contract instances:

1. Require `approved_for_signature`, required acknowledgments, complete parties, and a rendered hash before provider spend.
2. Atomically claim the mint operation before the first provider request.
3. Prefer DocuSeal's one-off `POST /submissions/pdf` path when the selected plan supports it; it fits per-deal PDFs and avoids creating a reusable provider template for every agreement. Keep the existing template-plus-submission adapter as a capability fallback behind the same provider interface.
4. Set `send_email: false` when Funūn owns delivery, use per-signer URLs, bind `external_id`, and keep server-defined signer roles and readonly values.
5. Make signing order, expiration, and optional email/phone 2FA part of the approved signer schema/security policy.
6. Never expose signer slugs through broad Contract Locker queries, logs, analytics, or `document_data` reads.
7. Treat browser completion events as UI hints only. Webhooks or provider revalidation advance authoritative state.
8. On completion, download the executed PDF and audit certificate, calculate hashes, store private paths, append an event, and project the instance to a signed `vault_documents` record.
9. Add reconciliation for provider-created-but-not-persisted submissions and webhook retries.

Do not expose DocuSeal's template builder to ordinary artists for governed templates. If an internal builder is introduced later, JWT issuance must be server-side, short-lived, and authorized against the exact template version; the builder must create a new draft version rather than mutate an approved one.

## Contract Locker experience

### Main navigation

Recommended sections:

- **Needs attention** — review requests, missing information, signatures, declines, and expirations.
- **Drafts** — questionnaires and generated drafts.
- **In review** — user counsel/Funūn review activity.
- **Awaiting signatures** — signer-by-signer progress.
- **Executed** — immutable agreements and certificates.
- **Uploads** — external agreements and AI completeness results.
- **Templates** — published templates available to the current context; not the raw research library.

### Create agreement

1. Choose a published template and see its supported use case, jurisdiction, exclusions, version, and review date.
2. Answer a progressive structured questionnaire.
3. Review a plain-language term summary and exact PDF preview.
4. Acknowledge the non-counsel disclosure.
5. Invite counsel or request review, or approve the draft for signature if authorized.
6. Configure signers and signing order from the template's signer schema.
7. Send, monitor, and receive the executed document in the same Locker record.

### Provenance panel

Every instance should display:

- Origin: governed Funūn template, custom revision, or external upload.
- Template name/version and generation timestamp.
- Review status and scope; reviewer attribution only if approved for public display.
- Whether protected language changed after template review.
- Document lifecycle and current responsible party.
- Rendered/executed artifact identifiers and audit certificate availability.
- A clear statement that template review is not representation of the user.

Avoid a generic “legally verified” badge. Use precise labels such as “Generated from counsel-reviewed standard template,” “Custom revision — not reviewed by Funūn template counsel,” and “AI completeness checked — not legal review.”

## Storage and evidence

- Use a private contract bucket with paths such as `{custody_owner}/{contract_instance_id}/{revision_or_envelope_id}/{artifact}`.
- Store paths in the database, not public URLs.
- Issue short-lived signed URLs only after instance/matter authorization.
- Calculate SHA-256 for the compiled template manifest, generated draft, executed PDF, and audit certificate.
- Preserve every executed artifact and envelope attempt; user removal is a per-user hide/archive action.
- Separate client-visible audit events from restricted legal-review notes.
- Define retention, export, deletion, legal hold, and account-closure behavior with counsel/privacy before launch.

## API boundaries

Recommended route families:

```text
/api/contract-templates                       # published discovery
/api/contract-templates/[versionId]/preview   # authorized preview
/api/contracts/instances                      # create governed instance
/api/contracts/instances/[id]                 # detail / allowed draft fields
/api/contracts/instances/[id]/review          # invite/request/review decision
/api/contracts/instances/[id]/revisions       # custom replacement branch
/api/contracts/instances/[id]/approve         # authority-gated signature approval
/api/contracts/instances/[id]/send            # atomic provider mint
/api/contracts/instances/[id]/artifacts/[kind]# authorization-bound signed URL
/api/contracts/instances/[id]/access          # matter invitations and revocation
/api/admin/contract-templates/...              # draft, review, publish, retire
```

The browser never supplies owner IDs, legal-review status, template hashes, provider IDs, storage paths, or authority roles as trusted values.

## Rollout plan

### Phase 0 — safety and vocabulary

- Add a server-side publication gate to all generated-agreement signing paths.
- Disable new signing from the draft blanket-agreement version until counsel approval.
- Replace “Verified — airtight” and similar AI-check language.
- Prevent hard deletion/mutation of executed documents.
- Normalize private-path storage for new contract artifacts.
- Reconcile `DocumentType` and label maps, including `sync_license`.

### Phase 1 — governed registry

- Add template, version, review, disclosure, and publication records.
- Create immutable-state triggers and service-owned mutation functions.
- Build an internal import/compile command for repository research sources.
- Add an internal review/publish surface with exact PDF preview and content hash.

### Phase 2 — reusable instance engine

- Add contract instances, parties, events, and the `vault_documents` compatibility link.
- Build deterministic field validation and rendering.
- Implement Contract Locker Drafts/Review/Provenance views.
- Migrate the split-sheet template identity/provenance first without rewriting historical executed sheets.

### Phase 3 — second template proof

- Publish one counsel-approved second template—prefer the producer or work-for-hire agreement from the approved drafting order—to prove the engine is not split-sheet-specific.
- Keep the synchronization/master-use memo in research or staging until counsel resolves the rights-holder variants, binding status, option mechanics, and sync-signing model.

### Phase 4 — lawyer collaboration

- Add contract-matter invitations, narrow permissions, comments, review decisions, custom-revision branches, and audit events.
- Support attorney Member accounts without creating a new account class.
- Add withdrawal/revocation and confidential/adverse-side visibility tests.

### Phase 5 — generic e-sign and execution

- Add generic contract envelopes/signers, atomic minting, webhook completion, private evidence storage, and reconciliation.
- Reuse the existing provider adapter and security posture.
- Prove a complete draft → review → approve → send → execute → Locker flow.

### Phase 6 — legacy convergence

- Route the old AI document tools to drafting-only/custom-unreviewed status or retire them.
- Remove duplicate one-off template sources after historical compatibility is secured.
- Consider migrating split-sheet envelopes only if the value exceeds the audit/migration risk.

### Phase 7 — sync instruments

- After counsel resolves the open sync representation and per-deal signing decisions, publish the sync representation agreement and individual synchronization/master-use license through the same engine.
- Connect deal records, rights-clearance evidence, commercial approvals, invoice/payment gates, and delivery gates without inferring authority from catalogue admission.

## Testing requirements

### Template governance

- An unreviewed, approved-but-unpublished, retired, scope-incompatible, or hash-mismatched version cannot generate or sign.
- Approved/published version content cannot be updated or deleted.
- Protected-language changes always create a new version/custom branch and invalidate the reviewed designation.

### Authorization

- Profile role `attorney` alone grants no access.
- Matter invitation acceptance, expiry, revocation, and adverse-side isolation are enforced server-side and in RLS/read RPCs.
- View, comment, revise, approve, send, and download are tested as distinct permissions.
- A user cannot grant authority they do not hold.

### Generation

- Schema validation rejects unknown fields, invalid dependencies, and out-of-scope choices.
- Every conditional branch is covered and produces a stable content hash.
- Unicode, pagination, long names, multiple parties, money, percentages, dates, and empty optional fields render correctly.

### E-signature

- No provider call occurs before all gates pass.
- Concurrent send requests create one active envelope.
- Signer roles map to the correct fields; readonly values cannot be changed client-side.
- Forged client events do not advance state.
- Webhook signatures, replay windows, idempotency, decline, expiration, void, retries, and reconciliation are covered.
- Executed file and certificate hashes are stored and download authorization is rechecked.

### Contract Locker

- Historical documents remain visible with honest legacy provenance.
- One instance appears once, even when shared with multiple authorized parties.
- Hide/archive never deletes shared evidence.
- “AI completeness checked,” “counsel-reviewed standard template,” and “custom/unreviewed” cannot be conflated.

## Release gates

Do not launch the governed template system until:

- Counsel approves the template-review workflow, disclosure text, and first exact template version.
- Product approves editable fields, protected clauses, signer roles, and lifecycle language.
- Security approves private storage, invitation tokens, signer URL handling, webhook behavior, RLS/RPC boundaries, and audit data minimization.
- Privacy/counsel approve lawyer collaboration, representation labels, confidentiality, retention, export, revocation, and privilege-related product behavior.
- The migration is tested against existing `vault_documents`, split sheets, workspace access, and Contract Locker rows.
- A human-gated Supabase and DocuSeal sandbox verification passes before production enablement.

## Recommended first implementation slice

The first shippable slice should be deliberately narrow:

1. Phase 0 safety corrections.
2. Immutable template registry and review provenance.
3. Governed split-sheet provenance migration.
4. One counsel-approved producer or work-for-hire template.
5. Structured questionnaire and deterministic PDF preview.
6. Contract Locker draft/review/provenance detail.
7. User-counsel invitation and comment access.
8. Generic DocuSeal send/completion into the same record.

That slice proves the architecture end to end without making the legally unresolved sync model the system's first reusable implementation.

