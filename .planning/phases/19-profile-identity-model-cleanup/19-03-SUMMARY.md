---
phase: 19-profile-identity-model-cleanup
plan: 03
subsystem: split-sheets-identity
tags: [rls, notifications, api-route, migration, r4]
dependency graph:
  requires:
    - lib/social/notifications.ts (buildSplitSheetCounteredNotification pattern)
    - lib/notifications/index.ts (createNotification dual-channel write)
    - app/api/profile/route.ts (auth + service-client + allowlist convention)
  provides:
    - supabase/migrations/074_split_sheet_identity_flags.sql (authored, unpushed)
    - POST /api/split-sheets/[id]/correction-flag
    - split_sheet_identity_flagged notification type + buildIdentityCorrectionFlagNotification()
  affects:
    - plan 19-06 (guided-apply consumes the ?stagedFlag= deep link and split_sheet_identity_flags rows)
    - plan 19-07 (human-gated push of migration 074)
tech-stack:
  added: []
  patterns:
    - "DB-layer CHECK allowlist (migration 074 field constraint) kept identical to the route's TS-layer FLAGGABLE_FIELDS"
    - "Server-derived flagged_by=auth.uid() — client-supplied id never trusted, verified by both an RLS INSERT policy and a route unit test"
    - "Dual-channel notification (bell + Resend) in one createNotification call, wrapped best-effort so a notify failure never blocks the already-committed write"
key-files:
  created:
    - supabase/migrations/074_split_sheet_identity_flags.sql
    - "app/api/split-sheets/[id]/correction-flag/route.ts"
    - __tests__/split-sheet-correction-flag.test.ts
  modified:
    - lib/social/notifications.ts
decisions:
  - "Party's claimed-user identity resolved two ways: party.user_id === user.id (direct account link) OR party.collaborator_id -> collaborators.claimed_by === user.id (roster claim) — mirrors the existing pattern in app/(artist)/split-sheets/[id]/page.tsx rather than inventing a new resolution path"
  - "Owner email resolved via service.auth.admin.getUserById(initiator_user_id), reusing the exact pattern already established in app/api/approve/[token]/route.ts"
  - "Notification partyName uses the frozen split_sheet_parties.name snapshot (the flagger's own party row), not a live artist_profiles read — consistent with this route never touching live-profile state"
metrics:
  duration: 25min
  completed: 2026-07-24
status: complete
---

# Phase 19 Plan 03: Correction-Flag Backend (R4) Summary

Backend for the split-sheet identity flag-for-fix mechanism: a claimed user on a frozen (`esign_pending`/`executed`) sheet can submit a structured field + suggested-value correction that persists to a dedicated `split_sheet_identity_flags` table and dual-notifies the sheet owner — with no code path that can write another user's `split_sheet_parties` row or any deal term.

## What Was Built

**Migration 074** (`supabase/migrations/074_split_sheet_identity_flags.sql`, authored only — never pushed): a new `split_sheet_identity_flags` table with `split_sheet_party_id` FK to `split_sheet_parties`, `flagged_by` FK to `auth.users`, and a `field` CHECK constraint restricted to `pro`/`ipi`/`publisher`/`administrator`/`legal_name`. RLS enabled with an INSERT policy scoped to `auth.uid() = flagged_by` and a SELECT policy scoped to the flagger OR the sheet's initiator (resolved via a party→sheet join), following migration 026's additive-policy discipline — never a table-wide grant. Carries the mandatory "an executor agent must NEVER run `supabase db push`" header; the live push is deferred to plan 19-07's human-gated checkpoint.

**Notification type + builder** (`lib/social/notifications.ts`): added `split_sheet_identity_flagged` to `NOTIFICATION_TYPES` (flag icon, `split_sheet_review` inline action) and `buildIdentityCorrectionFlagNotification()`, a pure builder mirroring `buildSplitSheetCounteredNotification()`'s shape. The deep link is `/split-sheets/{splitSheetId}?stagedFlag={flagId}` — the D-08 guided-apply staging target plan 19-06 will consume. No migration needed for the new type since `notifications.type` is unconstrained TEXT.

**POST `/api/split-sheets/[id]/correction-flag`** (`app/api/split-sheets/[id]/correction-flag/route.ts`): authenticates via `createApiClient().auth.getUser()` (401 if absent); validates `field` against a module-level `FLAGGABLE_FIELDS` allowlist identical to migration 074's CHECK (400 on any other value, including `split_percentage`/`role`); loads the sheet + its parties via the service client and rejects with 409 unless `status` is `esign_pending` or `executed`; resolves the target party by `partyId` (404 if not found on this sheet); authorizes the caller as the CLAIMED user on that exact party row — either `party.user_id === user.id` directly, or via `party.collaborator_id → collaborators.claimed_by === user.id` — returning 403 otherwise. On success, inserts into `split_sheet_identity_flags` with `flagged_by` set to the server-derived `user.id` (never client-supplied) and `suggested_value` trimmed/capped to 500 chars. Resolves the sheet owner's email via `service.auth.admin.getUserById()` (matching `app/api/approve/[token]/route.ts`'s existing pattern) and calls `createNotification(service, { ..., sendEmailCopy: true })` for bell + Resend in one dual-channel write, wrapped in try/catch so a notification failure never blocks the already-committed flag.

**Test** (`__tests__/split-sheet-correction-flag.test.ts`): 13 tests combining behavioral route-mock tests (auth gate, field-allowlist rejection including `split_percentage`/`role`, frozen-status gate, party-not-found, the authorization-negative case where a non-claimed user is rejected with 403 and no insert occurs, and a spoofed `flaggedBy`/`userId` body field that is silently ignored in favor of the session user) with static source-scan assertions (mirroring `__tests__/claim-collaborators-rpc.test.ts`'s established `readFileSync` pattern) confirming `FLAGGABLE_FIELDS` excludes `split_percentage`/`role`, no `UPDATE` is ever issued against `split_sheet_parties`, `flagged_by` is always `user.id` never `body.*`, and the notification call is wrapped in `try { ... createNotification( ... }`.

## Deviations from Plan

None — plan executed exactly as written. The two authorization paths (direct `party.user_id` vs. roster `collaborators.claimed_by`) were both implemented as the plan's action block explicitly called for both.

## Verification

- `npx jest __tests__/split-sheet-correction-flag.test.ts` — 13/13 passed
- `npx jest` (full suite) — 89 suites / 1106 tests, all green, zero regressions
- `npx tsc --noEmit` — clean
- `npm run lint` — clean (max-warnings=0)
- Migration 074 authored, not pushed (deferred to 19-07 human checkpoint)

## Self-Check: PASSED

- FOUND: supabase/migrations/074_split_sheet_identity_flags.sql
- FOUND: app/api/split-sheets/[id]/correction-flag/route.ts
- FOUND: __tests__/split-sheet-correction-flag.test.ts
- FOUND: lib/social/notifications.ts (split_sheet_identity_flagged + buildIdentityCorrectionFlagNotification)
- FOUND commit 3a5c668 (migration 074)
- FOUND commit c52709d (notification type + builder)
- FOUND commit 8da4bd0 (route + test)
