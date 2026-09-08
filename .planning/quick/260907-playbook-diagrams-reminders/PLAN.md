# Playbook Diagrams and Review Reminders — Release 3 Plan

**Status:** Complete locally; awaiting Playbook migration reconciliation
**Depends on:** Playbook rich documents and connected knowledge Releases 1–2

## Objective

Complete the next safe, application-layer Playbook capabilities while Phase 38 continues independently: restricted Mermaid diagrams, accessible fallbacks, and idempotent review-reminder preparation.

## Scope

- Recognize fenced `mermaid` blocks only inside rich Playbook documents.
- Reject oversized or unsupported diagrams before rendering.
- Render in Mermaid strict-security mode and sanitize generated SVG before insertion.
- Prevent remote resources, scripts, foreign HTML, clickable external URLs and unsafe SVG attributes.
- Preserve readable source fallback and error details when rendering is blocked or fails.
- Add focused parser, sanitizer and component tests.
- Add review-reminder scheduling only if it can be made idempotent without touching Claude's workspace-authorization migrations.

## Expected files

- `components/playbook/MarkdownDoc.tsx`
- `components/playbook/PlaybookDiagram.tsx`
- `lib/playbook/diagrams.ts`
- Co-located tests and package lockfiles for audited rendering dependencies
- Existing human-gated Playbook schema draft only if reminder idempotency requires additive schema

## Coordination boundaries

- Do not edit Phase 38 plans, migrations or workspace-authorization code.
- Recheck the shared working tree before each group of edits.
- Do not create or apply migration 201, commit, push or deploy.
- Stop rather than weakening SVG sanitization or allowing raw HTML.

## Verification

- Parser/sanitizer tests including hostile payloads.
- Existing Markdown security tests.
- TypeScript and targeted ESLint.
- Full Jest suite and production build.
- `git diff --check` and a local completion summary.
