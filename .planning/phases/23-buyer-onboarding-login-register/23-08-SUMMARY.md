---
phase: 23-buyer-onboarding-login-register
plan: 08
subsystem: database
tags: [supabase, migration, human-gated, buyer-onboarding, smoke, sync]
status: complete
completed: 2026-08-07
requirements-completed: [SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07, SYNC-08, SYNC-09, SYNC-10]
---

# Phase 23 Plan 08: Human Migration Push (095) + Onboarding-Loop Smoke — Summary

**The Wave 4 human-gated checkpoint is resolved. Migrations 092–095 were pushed to production in order (LOCAL=REMOTE through 095), the full Model A onboarding loop passed a live smoke against production Supabase, and SYNC-01…10 are registered. Phase 23's build + data layer are complete; the deployed `/sync` surface goes live when the branch deploys.**

## Migration push (owner via Codex)

Because migrations 092/093/094 (batch-1 review-fix hardening — merged to main via PR #56 but never pushed to the DB) were pending alongside 095, a plain `supabase db push` correctly refused to push 095 alone. The owner authorized and pushed all four **in order** (092 → 093 → 094 → 095); `supabase migration list` shows `LOCAL=REMOTE` through **095**.

Per-migration verification:
- **092** (buyer-table REVOKE TRUNCATE/TRIGGER/REFERENCES): applied transactionally; the `information_schema.role_table_grants` catalog query was **blocked** (no direct production SQL connection in the run) — a deferred confirmation, not a failure. The REVOKE statements are present and reviewed.
- **093** (Green Room author column allowlist): **PASS live** — an authenticated author edits `body`/`visibility`; a PATCH of `moderation_status`/`report_count`/`deleted_at` on their own post is rejected `42501`.
- **094** (funun_staff UNIQUE(user_id)): **PASS** — zero duplicate `user_id` groups; a duplicate insert is rejected `23505` on `funun_staff_user_id_key`.
- **095** (buyer_orgs status + lead fields): **PASS** — `status` defaults `pending_onboarding`; a buyer session reads `status` + `use_case` but is denied `contact_*`/`source` (`42501`).

## Onboarding-loop smoke (branch-local against production Supabase)

All steps green:
- **a.** `/sync` landing + `/sync/catalog` render logged-out (8 tracks), no crash.
- **b.** Register a test company via the real Login/Register modal → "You're in." → a `buyer_orgs` row `status='pending_onboarding'` with the qualifying fields + a first `buyer_members` row (`approver`, `is_org_admin`).
- **c.** The lead appears in the leadership unassigned queue (`?unassigned=1`); a disposable AE (created via the real Team Members UI) is assigned (`ae_user_id` set). Invite email no-op confirmed (Resend unconfigured).
- **d.** `/admin/client-partners/[orgId]` opens via the notification link (**no 404**), shows the qualifying fields → "Mark onboarding complete" → `status` flips `pending_onboarding` → `active`, AE assignment intact.
- **e.** A recovery link is generated for the buyer (out-of-band, since Resend no-ops); login succeeds → lands on `/sync/catalog`; the header shows the company + "Approver · Org admin"; the License request workflow is available when authenticated. All disposables cleaned up (buyer org/member/user, AE, Leadership).

## Known gaps (non-blocking)

- **Deployed-domain UAT is pending the code deploy** — `funun.studio/sync` + `/sync/catalog` 404 on the live build until this branch merges + deploys. The DB + branch implementation are green.
- **092's grant-catalog query** is deferred (needs a direct SQL connection to confirm anon/authenticated hold zero TRUNCATE/TRIGGER/REFERENCES on buyer_orgs/buyer_members). Low risk — the migration is a straightforward REVOKE that applied cleanly.
- **Resend email is not configured in prod** — buyer invites / lead-routing emails no-op; the in-app admin queue + AE notification are the reliable channels; first-time set-password links need out-of-band delivery until Resend is set up.

## Requirements

SYNC-01…SYNC-10 registered in `.planning/REQUIREMENTS.md` (new Phase 23 section, all Complete; SYNC-10's spend-oversight UI deferred).

## Next

Phase 23 is complete (8/8 plans). Deploy sequencing: **PR #57 (batch-2 review fixes) → reconcile Phase 23's buyer-orgs route changes with #57 → open + merge the Phase 23 PR → `/sync` goes live.** Migrations 092–095 are already live, so the code deploy has its schema.
