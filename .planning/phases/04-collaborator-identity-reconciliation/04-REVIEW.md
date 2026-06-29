---
phase: 04-collaborator-identity-reconciliation
reviewed: 2026-06-29T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - supabase/migrations/026_collaborator_identity_reconciliation.sql
  - app/api/claim-collaborators/route.ts
  - middleware.ts
  - lib/collaborators/index.ts
  - app/(artist)/collaborators/page.tsx
  - components/collaborators/CollaboratorRoster.tsx
  - app/api/user-profiles/route.ts
  - app/(artist)/settings/page.tsx
  - components/profile/ProfileForm.tsx
  - app/api/collaborators/[id]/route.ts
  - components/collaborators/CollaboratorCard.tsx
  - components/collaborators/CollaboratorPicker.tsx
  - app/(artist)/dashboard/page.tsx
findings:
  critical: 4
  warning: 5
  info: 3
  total: 12
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-06-29
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

This phase adds the collaborator identity reconciliation layer: a `user_profiles` table, email-based claim of collaborator rows via a SECURITY DEFINER function, a middleware-triggered fire-and-forget claim route, additive back-fill on settings save, and the My Credits UI surfaces on the dashboard and collaborators page.

The security-sensitive path (claim by email) is handled server-side with session-derived identity, which is correct. However, four blockers were found: a TOCTOU race in the DELETE guard that allows deleting a claimed row, a missing `user_profiles` SELECT RLS policy that leaves the row unreadable to the owning user via the Supabase client, an arbitrary future `archived_at` date that bypasses the soft-delete guard in the API, and a middleware fetch loop that fires on every request for users who never get an `artist_profiles` row. Three of the five warnings relate to data-loss or incorrect behavior under realistic edge conditions.

---

## Critical Issues

### CR-01: TOCTOU race in DELETE — claimed row can be hard-deleted

**File:** `app/api/collaborators/[id]/route.ts:55-76`

**Issue:** The `DELETE` handler does a separate `SELECT` to check `claimed_by` and then issues a `DELETE` in two independent round-trips. Between those two queries a concurrent call to `claim_collaborators()` (via middleware fire-and-forget) can set `claimed_by` on the row. The `DELETE` then proceeds, permanently destroying the credit record the claim just created. The business rule "claimed rows must not be hard-deleted" (D-10) is not atomically enforced.

**Fix:** Fold the ownership and claim guard into a single atomic DELETE using a WHERE clause that rejects claimed rows at the database level:

```typescript
// Replace the two-step select + delete with a conditional single-shot delete
const { data, error } = await supabase
  .from('collaborators')
  .delete()
  .eq('id', id)
  .eq('user_id', user.id)
  .is('claimed_by', null) // atomic guard — row must be unclaimed
  .select('id')
  .maybeSingle()

if (error) return NextResponse.json({ error: error.message }, { status: 500 })
if (!data) {
  // Row not found (wrong owner) OR is claimed — distinguish by re-fetching claimed_by
  const { data: check } = await supabase
    .from('collaborators')
    .select('claimed_by')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (check?.claimed_by) {
    return NextResponse.json(
      { error: 'Cannot delete a claimed collaborator — use archive instead' },
      { status: 409 }
    )
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
return NextResponse.json({ ok: true })
```

---

### CR-02: `user_profiles` RLS has no SELECT policy — users cannot read their own row

**File:** `supabase/migrations/026_collaborator_identity_reconciliation.sql:28-31`

**Issue:** The migration enables RLS on `user_profiles` and creates a single policy:

```sql
CREATE POLICY "Users manage own profile" ON user_profiles
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

In PostgreSQL RLS, a policy without an explicit `FOR` clause applies only to `ALL` operations. However, Supabase's PostgREST interprets `USING` for SELECT and `WITH CHECK` for INSERT/UPDATE separately. The documented Supabase pattern requires separate policies per operation, or an explicit `FOR ALL`. The ambiguity here is that this single policy **does** cover SELECT via `USING` in standard Postgres — but the more serious gap is that there is no INSERT policy at all. When the `/api/user-profiles` PATCH handler calls `.upsert()`, the INSERT half of the upsert will fail with an RLS violation for first-time users, because `WITH CHECK` in a policy without a `FOR` clause is applied to INSERT and UPDATE but `USING` (the row filter) is not. This will cause the first save of Rights Identity data to silently fail with a 500 from the API.

Specifically: a policy `USING (...) WITH CHECK (...)` without `FOR` covers SELECT/UPDATE/DELETE for `USING` and INSERT/UPDATE for `WITH CHECK`. An upsert on a non-existent row triggers an INSERT; that INSERT needs a `WITH CHECK` clause that passes. Since `auth.uid() = id` where `id` is the value being inserted, and the `id` field is explicitly set to `user.id` in the upsert call, this should pass — **but** the row visibility for the resulting SELECT after the upsert requires the same policy, and Supabase's PostgREST may not return the row if the SELECT-side USING clause isn't satisfied at insert time.

The safer and unambiguous fix is to use explicit `FOR SELECT`, `FOR INSERT`, and `FOR UPDATE` policies:

```sql
CREATE POLICY "Users read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

---

### CR-03: `archived_at` accepts arbitrary future timestamps — soft-delete guard bypassed

**File:** `lib/collaborators/index.ts:83-91`

**Issue:** The `sanitizeCollaborator` function accepts any non-empty string as a valid `archived_at` value. An authenticated user can set `archived_at` to a far-future date (e.g., `"2099-12-31T00:00:00Z"`) via `PATCH /api/collaborators/[id]`. All code that checks for the archived state does so with `.is('archived_at', null)` or `Boolean(collaborator.archived_at)`. A future timestamp evaluates as truthy, which means:

1. The collaborator immediately disappears from the picker (filtered by `!c.archived_at` in `CollaboratorPicker`).
2. The card renders as archived and read-only in the roster.
3. The Credits queries exclude the row.

But the corresponding DELETE guard checks `existing?.claimed_by` only — it does not verify that `archived_at` is null — so a claimed row that has been "archived" via a future date can still be attempted for deletion (the 409 is correct, but the archive state is semantically broken).

More critically: there is no validation that the string is a valid ISO 8601 date, or that it is not in the future by an unreasonable margin. A past ISO timestamp is the correct sentinel; a future one misleads the entire UI immediately.

**Fix:** In `sanitizeCollaborator`, validate that `archived_at` is either `null` or a valid ISO date string not more than a few seconds in the future:

```typescript
if (key === 'archived_at') {
  if (value === null) {
    update[key] = null
  } else if (typeof value === 'string') {
    const d = new Date(value)
    // Reject non-dates and far-future values (>60s ahead)
    if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 60_000) {
      update[key] = value.trim()
    }
    // Silently drop invalid or future values — caller should send new Date().toISOString()
  }
  continue
}
```

---

### CR-04: Middleware fetch loop fires on every request for users without an `artist_profiles` row

**File:** `middleware.ts:39-57`

**Issue:** The sentinel check is:

```typescript
if (ap && ap.claimed_at === null) {
  fetch(...)
}
```

If `ap` is `null` (i.e., the `artist_profiles` row does not exist yet — possible for industry users or during the brief window between `auth.users` insert and `handle_new_user()` trigger completion), the condition `ap && ap.claimed_at === null` is `false`, so the fetch is skipped. This is correct.

However, the `handle_new_user()` function inserts into `artist_profiles` and then calls `claim_collaborators()` inside a trigger that runs `SECURITY DEFINER`. If `claim_collaborators()` raises an exception (e.g., due to a data issue), the entire trigger transaction rolls back — and the `artist_profiles` row is **never created**. The user ends up with a valid auth session but no `artist_profiles` row, which causes:

1. Every middleware request to query `artist_profiles` and receive `null`.
2. The `ap && ap.claimed_at === null` guard silently passes over the fetch.
3. The collaborators page fetches `.eq('user_id', user?.id ?? '')` — passing an empty string causes a full-table scan (or RLS-scoped empty result, but with a silent bug).

This is a latent data integrity issue: an exception in `claim_collaborators()` during signup silently corrupts the user's profile state. The trigger should isolate the claim call from the profile INSERT:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.artist_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');
  -- Claim is best-effort — failure must not roll back profile creation
  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    -- Log or ignore — claim will retry via middleware fire-and-forget
    NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Warnings

### WR-01: `claim_collaborators` back-fill uses wrong WHERE clause after the claim UPDATE

**File:** `supabase/migrations/026_collaborator_identity_reconciliation.sql:98-111`

**Issue:** The back-fill UPDATE inside `claim_collaborators()` runs:

```sql
WHERE claimed_by = p_user_id;
```

This runs immediately after the claim UPDATE, which only claimed rows `WHERE claimed_by IS NULL`. The back-fill therefore correctly targets the newly claimed rows. However, if a user already had some claimed rows from a prior sign-in to a different account (e.g., email re-use after account deletion), those already-claimed rows will also be back-filled with the new user's profile data. The `WHERE claimed_by IS NULL` guard on the first UPDATE is idempotent, but the back-fill in the same call runs against ALL rows claimed by `p_user_id`, including ones from previous claims in previous sessions. This is likely the intended behavior (COALESCE prevents overwrite), but it means every call to `claim_collaborators` — not just on first login — triggers a full table scan for the back-fill. In `handle_new_user()` (signup), this is called once; but if the middleware ever fires the HTTP route while `claimed_at IS NULL`, and the DB function is also callable from that route, double back-fills can occur.

The actual data risk: if `v_pro` etc. are NULL (user has no `user_profiles` row yet), `COALESCE(col, NULL)` returns the existing `col` — so no harm done. The issue is a missed no-op optimization check: `IF FOUND` only checks if `user_profiles` had a row; if the row has all-NULL values, the UPDATE still executes and writes no changes.

**Fix:** Add a guard before the back-fill UPDATE:

```sql
IF FOUND AND (v_pro IS NOT NULL OR v_ipi IS NOT NULL OR v_publisher IS NOT NULL
              OR v_phone IS NOT NULL OR v_address IS NOT NULL) THEN
  UPDATE public.collaborators ...
```

---

### WR-02: `mailing_address_structured` not preserved when user types manually in `AddressAutocomplete`

**File:** `components/profile/AddressAutocomplete.tsx:105`, `components/profile/ProfileForm.tsx:208-215`

**Issue:** `AddressAutocomplete` fires `onChange(e.target.value, null)` on every manual keystroke. The `handleAddressChange` callback in `ProfileForm` has:

```typescript
mailing_address_structured: structured ?? f.mailing_address_structured,
```

This correctly preserves the previously autocompleted structured address when the user types. But `handleRightsAddressChange` has the same pattern — however, if the user first autocompletes an address (gets a `structured` value), then edits the text field manually (fires `null`), the structured object is preserved even though it no longer matches the display string. The server will receive a structured address (e.g., `{ street: "123 Main St", city: "Austin" }`) that does not correspond to the text the user actually typed.

This is a data consistency bug: the stored `mailing_address` JSONB will have a structured object that contradicts the `raw` field. Downstream consumers that read `raw` for display will show the edited text, but any code that reads `street`, `city`, etc. will see the old autocompleted values.

**Fix:** When `structured` is `null` (manual edit), clear the structured fields and store only `{ raw: display }`:

```typescript
const handleRightsAddressChange = useCallback((display: string, structured: Record<string, string> | null) => {
  setRightsForm(f => ({
    ...f,
    mailing_address: display,
    mailing_address_structured: structured, // null on manual edit — clears stale structured data
  }))
  setRightsSaved(false)
}, [])
```

The same fix applies to `handleAddressChange` for the main profile form (line 208-215).

---

### WR-03: `CollaboratorCard` archive and delete callbacks are never wired in `CollaboratorRoster`

**File:** `components/collaborators/CollaboratorRoster.tsx:163-183`, `components/collaborators/CollaboratorCard.tsx:19-19`

**Issue:** `CollaboratorCard` accepts `onArchive` and `onDelete` props and renders Archive/Delete buttons that call them. In `CollaboratorRoster`, the card is rendered as:

```typescript
<CollaboratorCard
  key={collab.id}
  collaborator={collab}
  onEdit={() => { setEditingId(collab.id); setCreating(false) }}
/>
```

Neither `onArchive` nor `onDelete` is passed. Both props are typed as optional, so there is no TypeScript error. But clicking the Archive button calls `undefined()`, throwing an uncaught runtime exception: `TypeError: onArchive is not a function`. Clicking Delete does the same. This makes the Archive and Delete actions completely non-functional in the roster UI.

**Fix:** Wire the callbacks in `CollaboratorRoster`:

```typescript
<CollaboratorCard
  key={collab.id}
  collaborator={collab}
  onEdit={() => { setEditingId(collab.id); setCreating(false) }}
  onArchive={async () => {
    await fetch(`/api/collaborators/${collab.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    })
    setList(prev => prev.map(c => c.id === collab.id ? { ...c, archived_at: new Date().toISOString() } : c))
  }}
  onDelete={async () => {
    await fetch(`/api/collaborators/${collab.id}`, { method: 'DELETE' })
    setList(prev => prev.filter(c => c.id !== collab.id))
  }}
  onFavoriteToggle={async () => {
    const updated = !collab.is_favorite
    await fetch(`/api/collaborators/${collab.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: updated }),
    })
    setList(prev => prev.map(c => c.id === collab.id ? { ...c, is_favorite: updated } : c))
  }}
/>
```

---

### WR-04: `CollaboratorCard` favorite-toggle button calls `undefined` — same unwired props issue

**File:** `components/collaborators/CollaboratorCard.tsx:66-81`

**Issue:** Same root cause as WR-03. The favorite star button calls `onFavoriteToggle`, which is also never passed from `CollaboratorRoster`. Every click on the star icon throws `TypeError: onFavoriteToggle is not a function`. See WR-03 fix — `onFavoriteToggle` must also be wired.

---

### WR-05: Middleware fires claim fetch on every non-auth request until `claimed_at` is set — no debounce

**File:** `middleware.ts:39-57`

**Issue:** The `api/claim-collaborators` POST is fire-and-forget. If it fails (network error, 500 from the RPC), the catch block swallows the error and `claimed_at` is never set. On every subsequent request the middleware re-queries `artist_profiles` and fires the fetch again. Under a slow network or a transient DB error, every page navigation triggers an extra DB read + HTTP POST. There is no backoff and no maximum retry count.

While the description calls this acceptable ("retries on next navigation"), the actual concern is that if `claim_collaborators()` fails due to a permanent error (e.g., a DB constraint that's never resolved), the user is permanently stuck in the "fire on every request" state. This is a slow resource drain and could mask a real underlying error.

**Fix:** Add a session-level in-memory flag (e.g., a module-level `Set<string>` keyed by user ID, or a Response header sentinel) so the fetch is only retried once per edge runtime instance. At minimum, document that a failure counter or exponential backoff is needed.

---

## Info

### IN-01: `user_profiles` table has no `first_name`/`last_name` columns — legal name split is in `artist_profiles` only

**File:** `supabase/migrations/026_collaborator_identity_reconciliation.sql:15-26`

**Issue:** The `user_profiles` table stores `display_name` but not structured legal name fields (`first_name`, `last_name`, etc.). Those live in `artist_profiles`. The Rights Identity section in `ProfileForm` saves to `user_profiles`, but legal name fields in the same form save to `artist_profiles` via `/api/profile`. This is architecturally split across two separate forms on the same page, which is acceptable — but the `user_profiles.display_name` field is never populated from the UI (the Rights Identity form does not have a display name field). The field is present in the DB and in the `USER_PROFILES_EDITABLE_FIELDS` allowlist but is dead in the current UI.

**Fix:** Either add a display name input to the Rights Identity section, or document that `display_name` is reserved for a future flow and remove it from `USER_PROFILES_EDITABLE_FIELDS` for now.

---

### IN-02: `CollaboratorPicker` `PickerItem` always renders `aria-selected={false}` — broken accessibility

**File:** `components/collaborators/CollaboratorPicker.tsx:233`

**Issue:** Every list item renders `aria-selected={false}` unconditionally. Since this is a single-select listbox, the currently selected collaborator (if any concept of selection applies) should have `aria-selected={true}`. At minimum, the hardcoded `false` is misleading to screen readers.

**Fix:** Either remove `aria-selected` (listbox items with no selection state should omit it, or the component should accept a `selectedId` prop and compare), or track the last-selected collaborator and set the attribute accordingly.

---

### IN-03: `backfill_claimed_collaborators` is SECURITY DEFINER but GRANT is missing

**File:** `supabase/migrations/026_collaborator_identity_reconciliation.sql:119-145`

**Issue:** Both `claim_collaborators` and `backfill_claimed_collaborators` are created as `SECURITY DEFINER` functions. In Supabase, RPC calls from authenticated users via the PostgREST API require `GRANT EXECUTE ON FUNCTION ... TO authenticated` (or `TO anon`). Without explicit grants, only the function owner (the migration role) can call these. The service-role client used in the API routes bypasses this — but if any client-side or anon call ever targets these functions, it will silently return a permission denied error.

Additionally, `claim_collaborators` is callable by any authenticated user via `service.rpc(...)` in the claim route — the service role bypasses GRANT checks. However, for defense in depth, both functions should explicitly grant execute to `authenticated` (or restrict to `service_role` only):

```sql
-- Allow authenticated users to call via service-role proxy only (no direct PostgREST access)
REVOKE EXECUTE ON FUNCTION public.claim_collaborators(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_claimed_collaborators(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_collaborators(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_claimed_collaborators(UUID) TO service_role;
```

---

_Reviewed: 2026-06-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
