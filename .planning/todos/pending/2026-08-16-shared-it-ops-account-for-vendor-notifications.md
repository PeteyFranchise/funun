---
created: 2026-08-16T06:05:00Z
title: Add shared IT/ops account for vendor alert notifications (as team grows)
area: ops
files:
  - docs/observability/VERCEL-ALERTS-RESPONSE.md (§0 — notification routing)
  - .planning/phases/32-production-observability-capacity-incident-readiness/32-OWNER-SETUP.md
---

## Problem

Observability vendor alerts route to the **owner's personal email** (`peter.zora@gmail.com`) —
Vercel usage/spend today, and Sentry / Better Stack / Supabase as they come online in Phase 32.
Vercel (and most of these vendors) route notifications **per-user**, so alerts die if Pete is out
and never reach an on-call / ops group.

**Owner decision (2026-08-16):** keep the personal email **for now**; revisit and add a shared
IT/ops account **as the team grows**.

## Solution

When ready (hiring IT/ops, or before real production traffic):
1. Create/verify a shared IT/ops address (e.g. an `it@` / `ops@funun.studio` inbox or group).
2. Add it as a Vercel **team member** (or verified email) and set its notification prefs for
   Usage + Spend Management + Deployment Failures.
3. Do the same alert routing for **Sentry / Better Stack / Supabase** as those are stood up
   (Phase 32 setup steps 2–4, see `32-OWNER-SETUP.md`).

Ties into the **access-model / RBAC discussion** — this shared IT/ops account is a concrete
instance of the **"IT team member" role** Pete raised (in-app monitoring-dashboard access + alert
routing). Fold it into that discussion when it happens.
