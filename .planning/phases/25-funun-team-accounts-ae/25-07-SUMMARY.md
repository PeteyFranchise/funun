---
phase: 25-funun-team-accounts-ae
plan: 07
subsystem: database
tags: [supabase, migration, human-gated, staff-rbac, security-smoke, seed]
status: complete
completed: 2026-08-07
requirements-completed: [TEAM-01, TEAM-02, TEAM-03, TEAM-04, TEAM-05, TEAM-06, TEAM-07, TEAM-08, TEAM-09]
---

# Phase 25 Plan 07: Human Migration Push + Bootstrap Leadership Seed + Live Security Smoke — Summary

**The Wave 5 human-gated checkpoint is resolved. Migrations 089/090 were pushed, a live six-point security smoke surfaced one privilege-hardening gap in 089 (closed by corrective migration 091), the owner account was seeded as Leadership with a directory row, and all six security checks are green. Phase 25 is complete.**

## Task 1 — Migration push (089 + 090)

- `supabase db push` applied **089** (`funun_staff` + `staff_audit_log`, RLS-enabled zero-policy, DML REVOKE) and **090** (`buyer_orgs.ae_user_id` private column). `supabase migration list` confirmed `LOCAL=REMOTE` through 090 (later through 091).

## Task 2 — Live security smoke (six checks)

Run against the live DB / running app on branch `codex/phase-11-presence-messaging`:

| # | Check | Result |
|---|-------|--------|
| 1 | Staff tables unreadable by a normal session (service-role-only) | **PARTIAL → fixed** — SELECT/INSERT/UPDATE/DELETE denied (42501), but anon/authenticated retained TRUNCATE/TRIGGER/REFERENCES (see 091) |
| 2 | `buyer_orgs.ae_user_id` not exposed to buyers | PASS |
| 3 | AE assignment scope — PATCH to a non-assigned Client Partner → 404 | PASS |
| 4 | Exactly one `staff_audit_log` row per staff action | PASS |
| 5 | AE `/admin/my-client-partners` shows only assigned Client Partner; leadership sees all | PASS |
| 6 | AE/BD hitting a leadership-only page (`/admin/verification`) → redirect (307 → `/`) | PASS |

### Gap closure — migration 091

Check 1 revealed migration 089's "service-role-only" invariant was incomplete: it used `REVOKE SELECT, INSERT, UPDATE, DELETE ... FROM authenticated, anon` (mirroring migration 058), but Supabase's default privileges also grant TRUNCATE/TRIGGER/REFERENCES, which a DML-only REVOKE leaves behind. RLS does not gate TRUNCATE — an authenticated user could have wiped `funun_staff`/`staff_audit_log`. **Migration 091** (`REVOKE ALL ON <table> FROM PUBLIC, anon, authenticated`, service_role untouched) was authored, text-tested (5/5), committed, and pushed. Live re-verification: a `role_table_grants` query for anon/authenticated on both tables now returns **zero rows** — TRUNCATE/TRIGGER/REFERENCES gone. 089 was not edited (already live).

**Separate finding flagged (not fixed here):** migration 058's `verification_audit_log` and `reports` carry the identical DML-only REVOKE and the same latent TRUNCATE exposure — spun off as its own follow-up task, out of this checkpoint's scope.

## Task 1 (cont.) — Bootstrap Leadership seed

A1 decision: **explicit `staff_role='leadership'` + directory row** (the Phase 25 model), not the `is_admin` fallback. The owner account `peter.zora@gmail.com` (`1d7990e2-55c1-42a0-b5a5-be55798047f3`) had `staff_role='leadership'` merged into `app_metadata` (existing `provider`/`providers` keys preserved), and a matching `funun_staff` row was inserted (`display_name: Peter Zora`). Post-seed, the owner's fresh JWT carries `staff_role=leadership`; `GET /admin/my-client-partners` → 200, `GET /admin/directory` → 200 rendering "Peter Zora / Leadership".

Note: there is no `/admin` index page yet (`GET /admin` 404s by design) — the login-routing fast-follow (25-11) routes staff to `/admin/my-client-partners` rather than `/admin`.

## Task 3 — Requirement registration

`TEAM-01…TEAM-09` registered in `.planning/REQUIREMENTS.md` (new Phase 25 section), all marked **Complete** and live-verified. Mapping: TEAM-01 gate (25-01) · TEAM-02 schema incl. 091 hardening (25-03/25-07) · TEAM-03 provisioning (25-04) · TEAM-04 scoped edit + AE assign/reassign (25-05/25-09) · TEAM-05 audit (25-02) · TEAM-06 lead/work routing (25-02/25-06) · TEAM-07 admin surface (25-06) · TEAM-08 Team Console theme (25-08) · TEAM-09 Team Member Directory (25-10).

## Migrations & commits (this checkpoint)

| Migration | Purpose | State |
|-----------|---------|-------|
| 089 | funun_staff + staff_audit_log (RLS zero-policy, DML REVOKE) | live |
| 090 | buyer_orgs.ae_user_id private column | live |
| 091 | REVOKE ALL hardening — closes 089's TRUNCATE/TRIGGER/REFERENCES gap | live |

## Verification

- Live: `LOCAL=REMOTE` through 091; grant query empty for anon/authenticated on both staff tables; owner reaches `/admin/my-client-partners` + `/admin/directory` as Leadership; all six security checks green.
- Repo closeout gate: `npm test` green (see closeout commit).

## Outcome

Phase 25 (Funūn Team Accounts + AE / staff RBAC) is **complete** — 10/10 plans. Fast-follow: **25-11** (login-routing Option A — post-sign-in staff → `/admin/my-client-partners`, everyone else → `/dashboard`).
