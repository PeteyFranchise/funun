---
phase: 05-launchpad-checklist
reviewed: 2026-06-30T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - app/(admin)/checklist/page.tsx
  - app/(admin)/layout.tsx
  - app/(admin)/page.tsx
  - app/(admin)/tips/page.tsx
  - app/(artist)/launchpad/[projectId]/page.tsx
  - app/(artist)/launchpad/page.tsx
  - app/api/admin/checklist/[itemKey]/route.ts
  - app/api/admin/checklist/route.ts
  - app/api/admin/tips/[itemKey]/route.ts
  - app/api/admin/tips/route.ts
  - app/api/launchpad/[projectId]/checklist/route.ts
  - app/api/launchpad/[projectId]/progress/route.ts
  - components/admin/ChecklistAdmin.tsx
  - components/admin/TipsAdmin.tsx
  - components/launchpad/ChecklistItem.tsx
  - components/launchpad/ChecklistSection.tsx
  - components/launchpad/LaunchpadRoom.tsx
  - components/launchpad/TipPanel.tsx
  - lib/admin/gate.ts
  - supabase/migrations/028_launchpad_checklist.sql
  - types/index.ts
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-06-30
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

The Launchpad Checklist phase introduces admin-managed checklist items, per-project per-user completion tracking, a tip authoring/approval pipeline, and an artist-facing LaunchpadRoom UI. The overall architecture is sound: admin gate double-checks at every API handler, RLS enforces row ownership for progress records, and admin-only fields (`tip_draft`, `author`) are explicitly stripped before artist-facing responses.

Three critical issues were identified: a double-invoke bug on the checkbox click handler that fires every toggle twice, a silent data-integrity hole on the atomic reorder PATCH where keys are never validated against `KEY_REGEX` (allowing arbitrary `key` values to reach the DB `WHERE` clause), and the RLS policy on `launchpad_checklist_items` allows any authenticated user to read unapproved rows — including `tip_body` text that has been partially written — relying entirely on the API layer for tip gating with no DB-layer safety net.

---

## Critical Issues

### CR-01: Checkbox click fires `onToggle` twice per interaction

**File:** `components/launchpad/ChecklistItem.tsx:34-58`

**Issue:** The outer `<div>` wrapping the checkbox has its own `onClick` handler that calls `onToggle` (line 34-37), and the inner `<button>` also has its own `onClick` handler that calls `onToggle` again (lines 48-51). Both are wrapped in `e.stopPropagation()` calls, but the stopPropagation on the inner button only stops propagation to the outer parent `<div role="button">` (the row opener), not to the outer `<div>` that wraps the checkbox `p-2.5` container. The flow is:

1. User clicks the `<button role="checkbox">` (lines 39–58).
2. The button's `onClick` fires: `e.stopPropagation()` + `onToggle(item.key, !item.completed)`.
3. The click event bubbles up to the `<div className="shrink-0 p-2.5">` wrapper (line 33-38), which has its own `onClick` that also calls `onToggle`.

The `stopPropagation` on the button only prevents bubbling to the row-level `<div role="button">` if the div at line 33 did not intercept it first. However, because both the wrapper div (line 34) and the button (line 48) call `onToggle`, every click on the button fires `onToggle` twice — once from the button, once from the wrapper. The net effect is a double-toggle: the item immediately checks then unchecks (or vice versa), appearing to do nothing, while issuing two API PATCHes.

**Fix:** Remove the `onClick` from the outer `<div className="shrink-0 p-2.5">` wrapper. The `<button>` already handles the toggle.

```tsx
{/* Before: outer div had its own onClick */}
<div
  className="shrink-0 p-2.5"
  onClick={e => {
    e.stopPropagation()
    onToggle(item.key, !item.completed)
  }}
>
  <button
    role="checkbox"
    ...
    onClick={e => {
      e.stopPropagation()
      onToggle(item.key, !item.completed)
    }}
  >

{/* After: remove the onClick from the wrapper div */}
<div className="shrink-0 p-2.5">
  <button
    role="checkbox"
    ...
    onClick={e => {
      e.stopPropagation()
      onToggle(item.key, !item.completed)
    }}
  >
```

---

### CR-02: Reorder PATCH skips `KEY_REGEX` validation on each entry's `key`

**File:** `app/api/admin/checklist/route.ts:118-143`

**Issue:** The atomic reorder PATCH at `POST /api/admin/checklist` (actually handled under `PATCH`) validates that each entry has `{ key: string; sort_order: number }` (lines 118-130), but it does NOT validate the `key` value against `KEY_REGEX` before using it in a `WHERE` clause (line 140). This is inconsistent with the explicit comment in `lib/admin/gate.ts` (`T-05-08: regex prevents SQL injection via the key path param`) and with the single-item PATCH and DELETE handlers in `[itemKey]/route.ts` which both validate the key first. A malicious admin could send a crafted key string in the `order` array. While Supabase's parameterized queries mitigate traditional SQL injection, an unvalidated key could still match unexpected rows (e.g., a key with spaces or special chars that should not exist) or cause unexpected update behavior.

**Fix:** Add `KEY_REGEX` validation for each key in the loop:

```typescript
import { verifyAdmin, KEY_REGEX } from '@/lib/admin/gate'

// In the validation loop:
for (const entry of body.order) {
  if (
    typeof entry !== 'object' ||
    entry === null ||
    typeof (entry as Record<string, unknown>).key !== 'string' ||
    typeof (entry as Record<string, unknown>).sort_order !== 'number'
  ) {
    return NextResponse.json({ error: 'Each order entry must have { key: string; sort_order: number }' }, { status: 400 })
  }
  // Add this:
  if (!KEY_REGEX.test((entry as { key: string }).key)) {
    return NextResponse.json({ error: 'Invalid item key in order array' }, { status: 400 })
  }
}
```

---

### CR-03: RLS on `launchpad_checklist_items` exposes unapproved `tip_body` text at the DB layer

**File:** `supabase/migrations/028_launchpad_checklist.sql:35-37`

**Issue:** The RLS policy `"Anyone can read checklist items"` uses `USING (true)`, meaning any authenticated user can `SELECT *` from `launchpad_checklist_items` directly — including `tip_body` rows where `tip_approved = false` (a partially-written or mistakenly-published tip body), and `tip_draft` text that is supposed to be admin-only. The migration comment acknowledges this: "approved-tip filtering is enforced at the API layer, not RLS." This creates a defense-in-depth gap: any artist who queries the table directly (e.g., via the Supabase JS client in a browser dev console) can read all tip text and all draft text without restriction.

The `launchpad_progress` table correctly uses `USING (auth.uid() = user_id)`. The checklist items table should at minimum filter `tip_draft` and `tip_approved=false` tip_body from the SELECT policy, or use a security-definer view.

**Fix (option 1 — view-based):** Create a security-definer view that exposes only `tip_approved = true` tip content and excludes `tip_draft`/`author` fields, and grant `SELECT` on the view instead of the base table.

**Fix (option 2 — partial RLS):** This cannot be done with a single column-level RLS policy in PostgreSQL's standard row security, but a security barrier view accomplishes the same:

```sql
-- Revoke direct table access from authenticated role
-- Grant access via a view that strips draft content
CREATE VIEW launchpad_checklist_items_public AS
  SELECT
    id, key, label, section, suggested_week, sort_order,
    action_type, action_href, action_label,
    CASE WHEN tip_approved THEN tip_body ELSE NULL END AS tip_body,
    tip_approved,
    created_at, updated_at
  FROM launchpad_checklist_items;
```

The API routes use the service client (which bypasses RLS), so they continue to read the full table. The artist-facing `createApiClient()` routes and the direct `createServerClient()` page queries should target the view instead.

---

## Warnings

### WR-01: `sort_order` from the edit form is not validated as an integer — fractional/`NaN` values reach the DB

**File:** `app/api/admin/checklist/[itemKey]/route.ts:62-65`

**Issue:** The PATCH handler validates `sort_order` with `typeof body.sort_order !== 'number'` (line 62), which accepts any JavaScript number including `Infinity`, `-Infinity`, and `NaN` (all of type `"number"`). The `sort_order` column in the migration is `INT NOT NULL DEFAULT 0`, so inserting `NaN` or `Infinity` will error at the DB layer, but the error message bubbles up as a generic 500. The same issue exists in the POST handler at `app/api/admin/checklist/route.ts:74-76`.

**Fix:**
```typescript
if (field === 'sort_order') {
  if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
    return NextResponse.json({ error: 'sort_order must be an integer' }, { status: 400 })
  }
  update.sort_order = body.sort_order
  continue
}
```

---

### WR-02: Race condition in optimistic rollback — stale `prior` captured at toggle start

**File:** `components/launchpad/LaunchpadRoom.tsx:49-90`

**Issue:** The `onToggle` function captures `prior` from `items` at the start of the call (line 50). If multiple toggles fire in quick succession before any API response arrives, each call's `prior` value reflects the state at the time of the call — not the last persisted state. This means a fast double-click could capture `prior.completed = false` for both calls, and if the second API call fails, the rollback resets to `false` even though the first call already succeeded and the "correct" persisted state is `true`. The result is a UI state that does not reflect the DB state, with no further reconciliation.

This is a known trade-off of optimistic UI, but the rollback is subtly wrong: it should roll back to the last *confirmed* server state, not the in-flight optimistic state captured before the toggle. The standard fix is to track a separate `serverState` ref or re-fetch on error.

**Fix (minimal):** After a failed PATCH, re-fetch the item's actual state from the API instead of relying on the captured `prior`:

```typescript
// On API error, re-fetch to get authoritative state
const refetch = await fetch(`/api/launchpad/${project.id}/checklist`)
if (refetch.ok) {
  const { data } = await refetch.json()
  setItems(data)
} else {
  // Fallback: roll back to prior
  setItems(prev => prev.map(i => (i.key === key ? { ...i, completed: prior.completed } : i)))
}
```

---

### WR-03: `action_href` is not validated as a URL — arbitrary string values accepted

**File:** `app/api/admin/checklist/route.ts:72-73` and `app/api/admin/checklist/[itemKey]/route.ts:76-77`

**Issue:** Both the POST (create) and PATCH (edit) handlers accept `action_href` as any string without URL format validation. Since `action_href` is rendered as a raw `href` in `TipPanel.tsx` line 73 (`<a href={item.action_href}>`), a malicious admin could set it to a `javascript:` URI. While this requires admin access to exploit, the principle of defense-in-depth suggests URL scheme validation:

**Fix:**
```typescript
if ('action_href' in body && body.action_href !== null) {
  const href = String(body.action_href).trim()
  if (href && !href.startsWith('https://') && !href.startsWith('http://') && !href.startsWith('/')) {
    return NextResponse.json({ error: 'action_href must be a valid URL or internal path' }, { status: 400 })
  }
  insert.action_href = href || null
}
```

---

### WR-04: Admin page fetches checklist items with the service client, bypassing RLS — no ownership check

**File:** `app/(admin)/checklist/page.tsx:16-20`

**Issue:** The admin checklist page uses `createServiceClient()` (service-role key, bypasses RLS) to fetch all checklist items for SSR. This is appropriate for admin views, but the page does NOT call `verifyAdmin()` or any equivalent check before fetching. The admin status check exists in the layout (`app/(admin)/layout.tsx:12-13`), but the layout's `redirect('/signin')` is a Next.js navigation — a direct server-rendered page render could theoretically reach this page without the layout guard running first if the route is misconfigured. The pattern in the API routes (`verifyAdmin()` on every handler) establishes the project's own principle that layout redirects alone are insufficient (see `lib/admin/gate.ts` comment: "T-05-02: verifyAdmin() provides the per-route auth check so that the layout redirect alone is not relied upon as the authority decision"). The page component itself does not follow this principle.

The same issue applies to `app/(admin)/tips/page.tsx`.

**Fix:** Add an explicit admin check in the page component before calling `createServiceClient()`:

```typescript
// At the top of AdminChecklistPage:
const supabase = createServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/signin')
const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
if (!isAdmin) redirect('/')
// Then proceed with service client
const service = createServiceClient()
```

---

### WR-05: `handleDragEnd` closure captures stale `items` on rollback

**File:** `components/admin/ChecklistAdmin.tsx:348-367`

**Issue:** The `handleDragEnd` callback is memoized with `useCallback` and has `[items, persistOrder]` in its dependency array (line 365). Inside the catch block at line 362, the rollback calls `setItems(items)` — but `items` here is the value captured in the closure at the time the callback was last re-created. If the user drags quickly before the previous drag's API call completes, the stale `items` snapshot used for rollback may not represent the correct pre-drag state. The same pattern exists in the `move` callback (line 383). 

This is the same class of problem as WR-02 but in the admin component.

**Fix:** Capture the pre-drag state in a local variable before the optimistic update:

```typescript
const handleDragEnd = useCallback(async (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = items.findIndex(it => it.key === active.id)
  const newIndex = items.findIndex(it => it.key === over.id)
  if (oldIndex === -1 || newIndex === -1) return
  const snapshot = items  // capture before update
  const reordered = arrayMove(items, oldIndex, newIndex)
  setItems(reordered)
  try {
    await persistOrder(reordered)
  } catch {
    setItems(snapshot)  // roll back to snapshot, not stale closure value
    setError('Couldn\'t save — please try again.')
  }
}, [items, persistOrder])
```

---

## Info

### IN-01: `isReleased` comparison uses `new Date()` on every render — timezone edge case

**File:** `components/launchpad/LaunchpadRoom.tsx:32-34`

**Issue:** The `isReleased` flag is computed inline using `new Date(project.release_date) < new Date()` on every render. The `release_date` column stores a date string (no time component in the seed data or migrations), so a release dated today will be treated as released starting at UTC midnight — which may be a day ahead for users in UTC-N timezones. This is a product decision (is today a release day treated as released or unreleased?), but the current logic gives different answers depending on the user's clock time during release day.

**Note:** This is also recomputed on every render rather than memoized, though this is a minor concern given the simplicity of the computation.

---

### IN-02: `noPendingAtAll` logic in `TipsAdmin` excludes the rejected count from the "no drafts" empty state

**File:** `components/admin/TipsAdmin.tsx:255`

**Issue:** The empty-state guard is `noPendingAtAll = pending.length === 0 && approved.length === 0`. This means if there are only rejected items (no pending, no approved), the component renders "No tip drafts pending approval." and the rejected toggle is rendered below in the same block. However, the rejected items section (lines 286-308) is outside the `noPendingAtAll` block, so rejected items DO still render. But a user arriving at the tips page with only rejected drafts will see "No tip drafts pending approval" followed immediately by the rejected toggle — a confusing combination. The empty state text implies there is truly nothing to show.

---

### IN-03: `TipPanel` renders an `<a>` with no label text when `action_label` is null

**File:** `components/launchpad/TipPanel.tsx:72-80`

**Issue:** The footer CTA is gated on `item.action_href` being non-null (line 72), but `item.action_label` can independently be `null`. If `action_href` is set but `action_label` is null, the `<a>` tag renders with no visible text — an empty button. Looking at the seed data, 5 items have `action_href = NULL` and `action_label = NULL` together (correct), but an admin could create a record where `action_href` is set and `action_label` is null. The UI spec calls for the CTA to show the action label.

**Fix:** Gate on both, or provide a fallback label:
```tsx
{item.action_href && (
  <a href={item.action_href} ...>
    {item.action_label ?? 'Learn more'}
  </a>
)}
```

---

_Reviewed: 2026-06-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
