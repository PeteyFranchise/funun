# Phase 42: Member Requests Center & Settings IA — Context

**Captured:** 2026-09-23
**Status:** Ready for implementation planning/execution
**Migration:** None expected

## Phase boundary

Move decision-requiring permission requests, rights-information updates, and holder-side master claims
out of Settings into a unified Member Requests experience. Keep their existing source tables, mutation
routes, authorization rules, and audit behavior. Connect the new center to Dashboard and notifications,
then reduce Settings to durable profile/payout information.

## Locked decisions

- **R-01:** Settings contains Rights & identity, Public profile, and Payouts—not operational queues.
- **R-02:** `/requests` has Needs your decision, Active access, and History views.
- **R-03:** “Rights proposals” is presented as **Rights information updates**.
- **R-04:** Creation remains contextual to the workspace/work; decision-making is Member-centric.
- **R-05:** Dashboard **Your next moves**, Requests, and notification links resolve to the same records.
- **R-06:** The aggregate layer is read-only. Domain mutation endpoints remain authoritative.
- **R-07:** Feed/notification content is summary-only. Sensitive values/evidence appear only on an
  authorized detail surface when required for the decision.
- **R-08:** Old Settings URLs redirect to filtered Requests views.
- **R-09:** Master-claim records remain reachable from work/Song Passport history.
- **R-10:** No database migration is planned. Discovery of a schema need stops execution and triggers a
  separately numbered, human-gated re-plan.

## Canonical evidence

- `lib/profile/settings-form.ts:100-139` — current six-tab Settings IA.
- `lib/workspaces/rights-proposals.ts:3-31` — four proposal fields and confirm/decline decision.
- `lib/workspaces/master-ownership.ts:12-60` — decisions and limited evidence-derived access.
- `components/settings/PermissionsTab.tsx` — pending decisions plus active revoke UI.
- `app/(artist)/dashboard/page.tsx:225-264` — existing cross-account next-moves doctrine.
- `components/nav/NotificationPanel.tsx:260-275` — generic notification deep links.
- `.planning/reviews/CODEX-PLAN-260923-member-requests-settings-ia.md` — approved product plan.

## Required states

Empty, loading, partial-source failure, complete failure, stale/concurrently decided, unauthorized,
expired/revoked, keyboard, screen-reader, narrow viewport, and back-button/deep-link behavior.

## Out of scope

No permission semantics, rights authority, master-claim doctrine, payout sharing, or database changes.
