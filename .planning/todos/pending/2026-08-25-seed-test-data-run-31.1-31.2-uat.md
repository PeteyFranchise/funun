---
created: 2026-08-25
area: testing / seed data
title: Seed test-only data, then run the tabled 31.1 + 31.2 UAT
---

# Seed test-only data, then run the tabled 31.1 + 31.2 UAT

**Why:** Phase 31.2's 4 UAT items (`31.2-UAT.md`, status: blocked) and 31.1's live-walkthrough items can't run — prod has no client (buyer) accounts and no songs. Owner plan: possibly have Codex create clearly-marked fake accounts + fake songs for testing only, then run `/gsd-verify-work 31.2`.

## Minimal seed dataset the UAT actually needs

1. **Staff:** one AE account with an assigned book (plus the owner's leadership account — already exists). *(UAT test 2 — the access editor — needs only a second staff account with a non-leadership role, no client data at all; it could run before the rest.)*
2. **~5 fake buyer orgs** assigned to that AE, with `license_requests.executed_at` backdated to hit every health band under the live 30/60/180 thresholds:
   - ~20 days ago → 🟢 Good · ~45d → 🟡 Warning · ~120d → 🔴 At-risk · ~300d → 🔵 Cold · one org with NO executed license → 🦁 Prospect
   - give at least one org a `pipeline_stage_id` + `stage_entered_at` (stage-targeted Play test)
3. **1–2 contact persons** per org (`buyer_org_contacts`) so the person workspace / Game Plan mounts.
4. **Fake songs with real playable audio:** a couple of vault tracks whose share files produce actual previews in the previews bucket (audio must genuinely play in the Selects player — the audible-time accumulator needs real `timeupdate` events; a WAV source also exercises the tonal-pulse watermark path).
5. **One Selects** built from those tracks, sent to a fake org's recipient (share token) — powers UAT tests 1 & 4 (listen session → AE panel → leadership rollup).

## Guardrails for fake data in prod

- Mark everything unmistakably (e.g. names prefixed `[TEST]`, a reserved fake domain like `@test.funun.internal` for contacts/accounts).
- Keep a **manifest of every created row id** (orgs, contacts, auth users, tracks, selects, license_requests) so teardown is exact — delete by id, not by pattern.
- Seed via service-role script (the new tables are zero-policy/REVOKE'd — client-side inserts won't work).
- Never mark fake artists verified / never let fake songs into the public catalogue admission flow.
- If Codex does the seeding: per the house convention, ask Codex to return its report **in a copy-paste-ready fenced block**, including the teardown manifest.

## Then

- `/gsd-verify-work 31.2` — walks the 4 items, completes the phase on pass (also registers R9's REQUIREMENTS row).
- 31.1's tabled live items (leadership/AE walkthrough; Resend intro email — sender config still pending) can ride the same session.
