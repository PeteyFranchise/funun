---
phase: 32-production-observability-capacity-incident-readiness
plan: 04
subsystem: observability
tags: [vercel, spend-management, docs, ops]

# Dependency graph
requires: []
provides:
  - "docs/observability/VERCEL-ALERTS-RESPONSE.md — Vercel signal→owner→response playbook (the app's DOC_PATH target)"
  - "docs/observability/SUPABASE-HEALTH-REVIEW.md — Supabase metric→read-location→trigger review checklist"
  - "Live Vercel Spend Management + usage/spend notifications configured by the owner"
affects: [32-10]

key-files:
  created:
    - docs/observability/VERCEL-ALERTS-RESPONSE.md
    - docs/observability/SUPABASE-HEALTH-REVIEW.md
  modified: []

key-decisions:
  - "Vercel tier is PRO (confirmed live on the billing dashboard 2026-08-16) — corrects an earlier 'Hobby' answer. The Hobby 10s function cap does NOT bind; downstream 'assume Hobby' notes fixed (lib/watermark/README.md; this doc §0)."
  - "Spend Management configured: On-Demand Budget $200 USD, NOTIFY-ONLY — 'Pause production deployment' left OFF (D-07: a spend cap must never take production down)."
  - "Personal notifications (Vercel Team Settings → My Notifications): Email + Web ON for Usage → '75% of included credit' and Team → Spend Management. Vercel's real usage alert is a single '75% of included credit' threshold (not the 50/75/100% an earlier draft assumed)."

requirements-completed: [R1]

coverage:
  - id: D1
    description: "Vercel platform monitoring is configured (usage + spend notifications, pause-off) and documented; plan tier confirmed and reconciled across the codebase."
    requirement: "R1"
    verification:
      - kind: manual
        ref: "owner configured Spend Management ($200 notify-only, pause off) + confirmed Pro tier + email/web notifications, 2026-08-16 (screenshots)"
        status: pass
    human_judgment: true

duration: interactive (owner-guided)
completed: 2026-08-16
status: complete
---

# Phase 32 Plan 04: Vercel Platform Monitoring + Docs Summary

**Vercel usage/spend monitoring configured (Pro tier confirmed; Spend Management $200 notify-only, pause OFF) and documented (`VERCEL-ALERTS-RESPONSE.md` + `SUPABASE-HEALTH-REVIEW.md`), executed owner-guided.**

## Accomplishments
- **Task 1 (tier):** Confirmed **Pro Plan — Active** live on the Vercel billing dashboard (corrects the prior "Hobby" assumption). Reconciled the codebase: fixed `lib/watermark/README.md` (async is now good-practice, not a forced 10s-cap requirement) and this plan's `VERCEL-ALERTS-RESPONSE.md §0`.
- **Task 2 (notifications):** Owner enabled **Spend Management** (On-Demand Budget $200 USD, **notify-only**, "Pause production deployment" **OFF** per D-07) and confirmed **Email + Web** notifications ON for **Usage → 75% of included credit** and **Spend Management**.
- **Task 3 (docs):** `VERCEL-ALERTS-RESPONSE.md` (the app's `DOC_PATH` target) + `SUPABASE-HEALTH-REVIEW.md` drafted (in the draft-first pass), then §0 updated to the confirmed-Pro state.

## Deviations / adjustments
- Ran **draft-first** (docs) then **owner-guided** (the two dashboard checkpoints) rather than a single autonomous pass — matches the owner's chosen "draft everything first" approach.
- The drafted "destination = pete@funun.studio" and "50/75/100%" details were corrected to Vercel's real model (per-user account email; single 75%-credit usage alert).

## Open follow-ups (non-blocking)
1. **Notification email destination** — currently the owner's Vercel account address (`peter.zora@gmail.com`), not a company/ops inbox. Owner to decide whether to switch (My Notifications → Email).
2. **`VERCEL_PLAN_TIER=pro` env var** — set on the Vercel project **at deploy time** so the daily digest cron (`app/api/cron/daily-observability-check/route.ts` → `isProTier()`) uses the Spend-Management branch instead of the "Hobby fallback" line. Not urgent (this branch isn't deployed yet).

## Next Phase Readiness
Vercel platform monitoring is live + documented. Supersedes `32-04-DRAFT.md`.

---
*Completed: 2026-08-16 (owner-guided)*

## Self-Check: PASSED
- FOUND: docs/observability/VERCEL-ALERTS-RESPONSE.md
- FOUND: docs/observability/SUPABASE-HEALTH-REVIEW.md
- CONFIRMED: owner configured Spend Management + Pro tier (2026-08-16)
