# Playbook Connected Knowledge — Release 2 Plan

**Status:** Complete locally; awaiting concurrent-work reconciliation and owner-gated migration adoption
**Depends on:** `.planning/quick/260907-playbook-rich-documents/`

## Scope

- Add safe, idempotent Markdown doctrine adoption as a draft.
- Track source path, source hash and source-change state without filesystem writes.
- Add published revision history and published-versus-pending comparison.
- Add entry ownership and review scheduling metadata.
- Add room-library search and filters.
- Link doctrine entries to reusable Member CRM Gameplan templates.
- Extend the unnumbered, human-gated schema draft and tests.

## Security and lifecycle rules

- Adoption is available only to leadership or a lead of the selected room.
- The browser supplies Markdown and an informational repository-relative source path; the server calculates the hash.
- Source paths are normalized and restricted to approved doctrine roots.
- An adopted source can create one draft only; re-adoption never overwrites in-app content.
- A changed source produces a review signal, not an automatic mutation.
- Revision and relationship reads occur only after room access is established.
- Existing published content remains visible while a proposed revision is reviewed.
- No raw HTML, arbitrary remote images, Mermaid/SVG execution or browser-role database access.

## Concurrent-work constraints

- Do not edit Claude's Phase 38 planning or migration files.
- Do not commit, push, apply a migration or deploy until the working sets are reconciled.
- Keep schema SQL in the existing draft artifact even though migration numbers 201–202 are reserved.

## Verification

- Unit tests for source normalization, hashing, duplicate/change classification and Markdown comparison.
- Route tests for adoption authority and server-derived source hashes.
- Revision/relationship access tests where practical.
- Existing Playbook and CRM compatibility suites.
- TypeScript, ESLint, production build and `git diff --check`.
