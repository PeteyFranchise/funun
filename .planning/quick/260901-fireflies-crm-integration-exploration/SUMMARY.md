# Fireflies.ai → Funūn Internal CRM Exploration — Summary

## What Changed

- Added a self-contained exploration plan for a private, one-way Fireflies-to-Funūn CRM integration.
- Grounded the plan in Funūn's existing Client Partner contacts, append-only relationship history, staff authorization and durable jobs queue.
- Defined a conservative automatic-matching rule based on exact participant email addresses.
- Required ambiguous and unmatched meetings to enter a staff review queue instead of being guessed or silently creating CRM records.
- Documented a proposed signed-webhook → durable-job → canonical Fireflies fetch → CRM match flow.
- Separated concise CRM summaries from any future decision to retain full transcript or media data.
- Defined a founder-only pilot, operational review-queue stage, team rollout decision and optional later Fireflies partner-program exploration.
- Recorded Fireflies' current owner-meeting webhook limitation and the reported Enterprise/Super Admin requirement for team-wide webhooks as vendor facts that must be reverified before implementation.
- Added a pending team-discussion TODO with product, commercial, privacy and implementation decisions.

## Validation Run

- Confirmed the cited Funūn CRM tables, relationship-log helper/routes and durable job queue exist in the repository.
- Confirmed the plan distinguishes verified current vendor documentation from assumptions that require rechecking.
- Confirmed the plan never claims the integration is built, live, team-wide or officially partnered.
- Confirmed full transcripts, audio/video, deal stages, pricing and legal terms are outside the automatic first release.
- Ran `git diff --check` against the new planning files; no whitespace errors were reported.

## Remaining Risks and Follow-ups

- The team must confirm Peter's Fireflies plan, API/Webhooks V2 access and whether the pilot should cover only meetings owned by his account.
- Legal/privacy review must set meeting disclosure, storage-minimization, retention and deletion rules.
- A future GSD discussion must choose the connection model, meeting schema, unmatched-review authority and operational success metric.
- Fireflies plan limits, team-wide webhook availability, rate limits and any OAuth/partner-app path must be reverified against current vendor documentation before implementation.
- The top-level roadmap was intentionally left untouched because it contains unrelated uncommitted work. Promote this exploration after the team discussion resolves the launch gates.

## Claude / GSD Handoff

Resume from `.planning/todos/pending/2026-09-01-fireflies-crm-integration-exploration.md`. Treat the exact-email/never-guess rule, signed webhook, durable queue, idempotency, staff-only access and data-minimization posture as the recommended baseline. The owner has approved exploration, not implementation or vendor purchasing.
