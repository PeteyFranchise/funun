---
phase: 04
plan: 02
subsystem: collaborator-identity-reconciliation
status: complete
tags: [api, settings, profile, back-fill, security, rls]
dependency_graph:
  requires:
    - supabase/migrations/026_collaborator_identity_reconciliation.sql
    - app/api/claim-collaborators/route.ts
  provides:
    - app/api/user-profiles/route.ts
    - app/(artist)/settings/page.tsx (extended)
    - components/profile/ProfileForm.tsx (extended)
  affects:
    - user_profiles table (written via PATCH /api/user-profiles)
    - collaborators table (back-filled via backfill_claimed_collaborators RPC)
tech_stack:
  added: []
  patterns:
    - EDITABLE_FIELDS allowlist + sanitize() pattern (mass-assignment defense, T-04-06)
    - Upsert-keyed-by-id for first-save compatibility (user_profiles row may not exist yet)
    - Fire-and-forget via void Promise.resolve().catch() (swallows PromiseLike rejection without blocking response)
    - Dual-form pattern (main profile form + separate Rights Identity form with own submit/error state)
    - Seed-with-fallback pattern (userProfile values ?? artist_profile values)
key_files:
  created:
    - app/api/user-profiles/route.ts
  modified:
    - app/(artist)/settings/page.tsx
    - components/profile/ProfileForm.tsx
decisions:
  - "USER_PROFILES_EDITABLE_FIELDS contains exactly the seven identity fields; id, claimed_by, created_at, updated_at excluded — mass-assign mitigation T-04-06"
  - "Fire-and-forget back-fill via void Promise.resolve().catch() — PromiseLike returned by .rpc() does not have .catch() directly; wrapped in Promise.resolve() to swallow rejection without blocking HTTP response"
  - "Rights Identity rendered as a second <form> element below the main profile form — separate submit/error/saved state, separate endpoint; non-rights fields remain unchanged on /api/profile"
  - "Upsert (not update) into user_profiles keyed by id so first-time saves create the row without requiring the client to know whether the row exists"
metrics:
  duration: 5m
  completed: 2026-06-29
  tasks_completed: 2
  files_changed: 3
---

# Phase 04 Plan 02: Settings Back-fill Slice Summary

## One-liner

user_profiles GET+PATCH API with seven-field allowlist and fire-and-forget back-fill, plus a "Rights Identity" Settings section that seeds from user_profiles and auto-fills claimed collaborator rows on every save.

## What Was Built

### Task 1: user_profiles GET + PATCH API

Created `app/api/user-profiles/route.ts` following the `app/api/profile/route.ts` pattern exactly.

**GET handler:**
- `createApiClient()` → `auth.getUser()` → 401 guard
- Queries `user_profiles` scoped to `id = user.id` via `.maybeSingle()` — returns `null` when the row does not exist yet (first-time users)
- T-04-08 mitigated: no cross-user data leakage, query is scoped to the authenticated user

**PATCH handler:**
- `USER_PROFILES_EDITABLE_FIELDS = ['pro', 'ipi', 'publisher', 'phone', 'mailing_address', 'display_name', 'bio']` as const
- `id`, `claimed_by`, `created_at`, `updated_at` intentionally excluded (T-04-06 mass-assign mitigation)
- `sanitize()` trims strings to null-on-empty, accepts `mailing_address` as object-or-null (JSONB), drops any non-allowlisted key from the body
- 400 returned when sanitized body is empty (no DB write)
- Upserts into `user_profiles` keyed by `id` — handles first-save (row creation) and subsequent updates identically
- After successful upsert, fires `backfill_claimed_collaborators(p_user_id)` fire-and-forget via `void Promise.resolve(createServiceClient().rpc(...)).catch(() => {})` — rejection never reaches HTTP response (D-08)

**Auto-fix during implementation (Rule 1):**
The `.rpc()` call on the Supabase client returns a `PromiseLike`, not a full `Promise` — it does not have `.catch()` directly. Wrapping in `Promise.resolve()` resolves the TS2339 error and correctly swallows the rejection.

### Task 2: Rights Identity section on Settings page + ProfileForm wiring

**settings/page.tsx extension:**
- Exports `UserProfile` type (id, pro, ipi, publisher, phone, mailing_address, display_name, bio, timestamps)
- In non-DEMO branch: after loading `artist_profiles`, also queries `user_profiles` with `.maybeSingle()` — `null` when user has never saved
- Passes `userProfile` as optional prop to `ProfileForm` (DEMO path passes `null`)

**ProfileForm.tsx extension:**
- Accepts `userProfile?: UserProfile | null` (default `null`)
- New `RightsIdentityState` type: `{ pro, ipi, publisher, phone, mailing_address, mailing_address_structured }`
- `toRightsIdentity(userProfile, artistProfile)` seeds from `userProfile` values, falls back to `artistProfile` values when `userProfile` is null (e.g., `userProfile?.pro ?? artistProfile.pro ?? ''`)
- All existing form sections (Legal Identity, Public Profile, Industry Roles, Contact, Rights & Royalties, ISRC) preserved unchanged; their save still PATCHes `/api/profile`
- New "Rights Identity" section rendered as a second `<form>` element at the bottom:
  - `border-t border-white/10 mt-8 pt-8` divider
  - `text-lg font-semibold text-white` heading: "Rights Identity"
  - `text-sm text-lavdim mt-1` sub-label: "Saved here, auto-filled into every split sheet and contract."
  - Fields: PRO dropdown, IPI/CAE input, Publisher input, Phone input, Mailing address (AddressAutocomplete)
  - `handleRightsSave` PATCHes `/api/user-profiles` with `{ pro, ipi, publisher, phone, mailing_address }` only
  - Save button: `rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta` per UI-SPEC
  - Separate `rightsError`, `rightsSaved`, `rightsSubmitting` state (no cross-contamination with main form)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PromiseLike returned by .rpc() lacks .catch() method**
- **Found during:** Task 1 TypeScript check (`npx tsc --noEmit`)
- **Issue:** `createServiceClient().rpc(...)` returns a `PromiseLike<void>` (Supabase SDK builder type), not a native `Promise`. Native `.catch()` is not available on `PromiseLike`, causing TS2339.
- **Fix:** Wrapped in `void Promise.resolve(createServiceClient().rpc(...)).catch(() => {})` — `Promise.resolve()` promotes the `PromiseLike` to a full `Promise` and `.catch()` swallows the rejection without blocking the HTTP response.
- **Files modified:** `app/api/user-profiles/route.ts`
- **Commit:** 0e28b64

## Threat Mitigations Applied

| Threat | Mitigation Applied |
|--------|-------------------|
| T-04-06 (T-mass-assign) | `USER_PROFILES_EDITABLE_FIELDS` contains exactly the seven allowed fields; `id`, `claimed_by`, `created_at`, `updated_at` are not in the array and are silently dropped by `sanitize()` |
| T-04-07 (T-backfill) | Back-fill uses `backfill_claimed_collaborators` shipped in plan 01 with `COALESCE(existing, new)` ordering — additive-only; no non-NULL collaborator values are overwritten |
| T-04-08 | GET query scoped to `id = user.id`; RLS policy "Users manage own profile" enforces row ownership at DB layer |
| T-04-SC | No new packages installed |

## Known Stubs

None. All data is live from the database; no hardcoded empty values or placeholder text in rendered paths. The `userProfile` prop defaults to `null` in DEMO mode, which causes the Rights Identity section to seed from artist_profile values — valid fallback behavior, not a stub.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what is documented in the plan's threat model.

## Self-Check

- [x] `app/api/user-profiles/route.ts` — created, commit 0e28b64
- [x] `app/(artist)/settings/page.tsx` — modified, commit 86d5705
- [x] `components/profile/ProfileForm.tsx` — modified, commit 86d5705

## Self-Check: PASSED
