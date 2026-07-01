---
phase: 05-launchpad-checklist
fixed_at: 2026-06-30T00:00:00Z
review_path: .planning/phases/05-launchpad-checklist/05-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-06-30
**Source review:** .planning/phases/05-launchpad-checklist/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (3 Critical, 5 Warning — Info excluded per fix_scope)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: Checkbox click fires `onToggle` twice per interaction

**Files modified:** `components/launchpad/ChecklistItem.tsx`
**Commit:** bc8788e
**Applied fix:** Removed the `onClick` handler (plus `e.stopPropagation()` and `onToggle` call) from the outer `<div className="shrink-0 p-2.5">` wrapper. The inner `<button role="checkbox">` already has its own `onClick` with `stopPropagation` + `onToggle`. The wrapper div is now a plain container that only provides the 44×44px hit-area padding, not a second event source.

---

### CR-02: Reorder PATCH skips `KEY_REGEX` validation on each entry's `key`

**Files modified:** `app/api/admin/checklist/route.ts`
**Commit:** 14ba5e7
**Applied fix:** Added `KEY_REGEX.test(entry.key)` validation inside the pre-DB entry-validation loop in the `PATCH /api/admin/checklist` handler, immediately after the shape check. Returns 400 `"Invalid item key in order array"` for any entry whose key fails the regex. This is consistent with the single-item PATCH and DELETE handlers in `[itemKey]/route.ts` which both validate via `KEY_REGEX` before using a key in a `WHERE` clause.

---

### CR-03: RLS on `launchpad_checklist_items` exposes unapproved `tip_body` text at the DB layer

**Files modified:** `app/api/launchpad/[projectId]/checklist/route.ts`, `supabase/migrations/029_launchpad_checklist_rls_tighten.sql`
**Commit:** 8f8e876
**Applied fix (option b — least churn):**

Chose option (b) — tighten the RLS policy rather than a security-barrier view — because all existing API routes that write checklist items already use `createServiceClient()` (which bypasses RLS), and the only user-scoped read path is the single artist checklist GET route. Switching that one fetch to the service client requires a two-line change vs. re-routing all page queries through a view.

Changes:
1. **Migration 029** (`supabase/migrations/029_launchpad_checklist_rls_tighten.sql`): Drops the `USING(true)` policy and replaces it with `USING(false)` — no authenticated role can `SELECT` the base table directly. A migration comment explains the rationale and approach.
2. **Checklist route** (`app/api/launchpad/[projectId]/checklist/route.ts`): Auth + ownership check continues to use `createApiClient()` (user-scoped). The `launchpad_checklist_items` fetch is now explicitly via `createServiceClient()` (bypasses RLS). The route already destructures and gates all tip fields in code (LAUNCH-03) before returning the response — that behavior is unchanged.

Admin reads (all via `createServiceClient()`) and `launchpad_progress` reads (user-scoped, RLS `USING(auth.uid() = user_id)`) are unaffected.

**Follow-up (commit a4fc748):** The initial fix missed a second user-scoped read path — the artist project page `app/(artist)/launchpad/[projectId]/page.tsx` fetches `launchpad_checklist_items` directly in a server component (not through the GET route). Under `USING(false)` that read returned zero rows, rendering an empty Launchpad. Fixed by routing that page's items fetch through `createServiceClient()` after its existing ownership check (progress read stays user-scoped). The original claim that "the only user-scoped read path is the single artist checklist GET route" was incorrect. `npm run build` passes with both changes.

---

### WR-01: `sort_order` not validated as integer — fractional/`NaN` values reach the DB

**Files modified:** `app/api/admin/checklist/route.ts`, `app/api/admin/checklist/[itemKey]/route.ts`
**Commit:** 03eeed6
**Applied fix:** Added `!Number.isInteger(body.sort_order)` guard in two places:
- `[itemKey]/route.ts` PATCH handler: changed `typeof body.sort_order !== 'number'` to `typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)` with updated error message `'sort_order must be an integer'`.
- `route.ts` POST handler: added an explicit `!Number.isInteger` check inside the existing `typeof === 'number'` guard before assigning to the insert object.

Both now return 400 for `NaN`, `Infinity`, `-Infinity`, and fractional values.

---

### WR-02: Race condition in optimistic rollback — stale `prior` captured at toggle start

**Files modified:** `components/launchpad/LaunchpadRoom.tsx`
**Commit:** 48992b9
**Applied fix:** On PATCH failure (both non-ok response and network error), the handler now re-fetches authoritative state from `GET /api/launchpad/{id}/checklist` before updating UI. If the re-fetch succeeds, the full `items` array is replaced with the server's response, and the active TipPanel item (if open for this key) is refreshed from the new data. If the re-fetch also fails, the handler falls back to rolling back with the captured `prior` value. This ensures that concurrent in-flight toggles don't overwrite each other's state with stale optimistic snapshots.

---

### WR-03: `action_href` not validated as a URL — arbitrary string values accepted

**Files modified:** `app/api/admin/checklist/route.ts`, `app/api/admin/checklist/[itemKey]/route.ts`
**Commit:** f145234
**Applied fix:** Both POST and PATCH handlers now validate `action_href` against an allowlist of URL schemes before inserting or updating:
- Must start with `https://`, `http://`, or `/` (internal path).
- Returns 400 `'action_href must be a valid URL (https:// or http://) or an internal path (/)'` for any other value (e.g., `javascript:`, `data:`, arbitrary strings).
- `null` / empty values are still accepted and stored as `null`.

In the PATCH handler, explicit `action_href` handling was extracted from the generic nullable-field fallthrough to allow the validation + `continue` pattern.

---

### WR-04: Admin page fetches data with service client before verifying admin status

**Files modified:** `app/(admin)/checklist/page.tsx`, `app/(admin)/tips/page.tsx`
**Commit:** d55aa72
**Applied fix:** Both admin page server components now perform an explicit auth + admin check (matching the layout's pattern) before invoking `createServiceClient()`:
1. `createServerClient()` → `supabase.auth.getUser()` → redirect to `/signin` if no user.
2. Check `user.app_metadata.is_admin === true` → redirect to `/` if not admin.
3. Only then instantiate the service client and fetch data.

This follows the T-05-02 principle documented in `lib/admin/gate.ts`: layout redirect alone is not relied upon as the authority decision.

---

### WR-05: `handleDragEnd` closure captures stale `items` on rollback

**Files modified:** `components/admin/ChecklistAdmin.tsx`
**Commit:** 306968d
**Applied fix:** In both `handleDragEnd` and `move` callbacks, a `const snapshot = items` local variable is captured immediately before the optimistic `setItems(reordered)` call. The `catch` block now calls `setItems(snapshot)` instead of `setItems(items)`. Because `snapshot` is a local variable in the current function invocation (not a closure reference to the mutable `items` state), it correctly represents the pre-operation state for this specific drag/move — regardless of how many subsequent drags have started or what the current closure value of `items` is at the time of the catch.

---

_Fixed: 2026-06-30_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
