---
phase: 30
slug: the-crate-sync-library-catalogue-engine-sync-readiness
status: deferred
started: 2026-08-13
tester: pete (leadership @ pete@funun.studio)
environment: localhost:3000 (branch feat/lane1-catalogue-menu-help — NOT deployed)
---

# Phase 30 — UAT

Verifying the session-gated paths the executor sandbox couldn't reach (no staff cookie). Test on **localhost:3000** logged in as **pete@funun.studio** (leadership).

> **Status: DEFERRED (2026-08-13).** Tests 1–2 auto-confirmed. Tests 3–7 (the staff-view visual pass) deferred by Pete — code is built + logic-verified (2141 unit tests, tsc clean); the eyeball pass can happen anytime. **Resume with `/gsd-verify-work 30`.** When resuming, Claude seeds a throwaway `sync_listing` on an incomplete track first so the worklist/gate/staff-layers have data.

## Constraints
- **No test data:** prod has 0 `sync_listings` rows; the catalogue renders fixtures. The worklist / gate / staff-layers need a seeded `sync_listing` on an incomplete track to be visible. (Claude can seed one via service role, then clean up.)
- **No AE account:** only leadership + A&R roles exist so far; the "AE proposal → pending" half of the tag flow can't be walked until an AE account exists.

## Tests

| # | Test | Needs | Status |
|---|------|-------|--------|
| 1 | Staff gate: unauth `/admin/sync-library` → redirect to signin | — | ✅ pass (curl 307 → /signin) |
| 2 | Buyer/anon `/sync/catalog` renders clean (no staff panels) | — | ✅ pass (curl 200; executor confirmed 0 `.staffpanel`) |
| 3 | Backstage loads for leadership: `/admin/sync-library` shows queue + "Sync Readiness" worklist section | login | ⬜ pending |
| 4 | Worklist lists a seeded incomplete track + its exact missing items + staff_notes | login + seed | ⬜ pending |
| 5 | Leadership curation: quality Pass/Fail + note persists; admit an incomplete track → inline 409, row stays pending (never auto-rejected) | login + seed | ⬜ pending |
| 6 | Role-aware Crate: as leadership `/sync/catalog` shows staff-only layers on a live row (rights/readiness/notes); a buyer sees none | login + seed live row | ⬜ pending |
| 7 | Tag flow (leadership): propose tags → auto-confirm; approve/reject a pending | login + seed track | ⬜ partial (AE→pending half needs an AE account) |

## Notes
- Tests 1 + 2 are automated-confirmed (no session needed).
- Tests 3–7 are the hands-on pass — Pete on localhost as leadership; Claude seeds a throwaway `sync_listing` first.
</content>
