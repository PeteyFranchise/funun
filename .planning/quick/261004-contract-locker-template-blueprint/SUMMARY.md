# Contract Locker Template-System Blueprint — Summary

## What changed

- Added a repository-grounded implementation blueprint for governed contract templates, structured generation, lawyer collaboration, e-signature, private evidence storage, and Contract Locker presentation.
- Recommended a three-layer architecture: research sources, immutable published template versions, and transaction-specific contract instances indexed by `vault_documents`.
- Defined proposed template, review, instance, party, matter-access, disclosure, event, and generic e-sign data models.
- Defined template and contract lifecycle states, deterministic generation rules, authorization boundaries, DocuSeal integration, Contract Locker UX, rollout phases, tests, and release gates.
- Added a pointer to the blueprint from the existing lawyer-reviewed contract-product foundation TODO.

## Key findings recorded

- The current non-final blanket-agreement draft is wired to a live DocuSeal mint path and needs a server-side publication gate before template expansion.
- AI completeness results currently use “Verified”/“airtight” language that can be mistaken for legal review.
- Generic executed documents need immutability/soft-hide rules rather than ordinary deletion.
- New contract artifacts should store private paths and issue authorization-bound signed URLs rather than durable public URLs.
- The database/type/label maps have document-type drift, including `sync_license`.
- Attorney profile roles already fit the Member identity model but must never grant document access or signing authority by themselves.

## Validation run

- Cross-checked recommendations against current Contract Locker, `vault_documents`, workspace permissions, Member identity doctrine, DocuSeal provider/webhook code, upload paths, and split-sheet template/e-sign architecture.
- Confirmed the blueprint keeps `research/contracts/` outside runtime.
- Confirmed only `published` immutable versions may create governed instances.
- Confirmed lawyer collaboration is client-authorized and document-scoped.
- Confirmed webhook/provider evidence—not browser events—drives signed state.
- `git diff --check` passed for all task paths.

## Remaining decisions

- Counsel approval of final Terms of Service/disclosures, first template language, jurisdictions, exclusions, review attribution, privilege/confidentiality, and retention.
- Product decisions for initial editable fields, protected clauses, signer roles, and lawyer collaboration permissions.
- Security review of private storage, signer credentials, invitation tokens, RLS/RPCs, and audit minimization.
- GSD must assign implementation phases before runtime/schema work begins.

## Workflow note

Native `/gsd-quick` invocation was unavailable in this Codex session, so the AGENTS.md manual quick-task fallback was used.

