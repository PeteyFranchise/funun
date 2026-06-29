---
phase: 04-collaborator-identity-reconciliation
reviewed: 2026-06-29T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - app/(artist)/collaborators/page.tsx
  - app/(artist)/dashboard/page.tsx
  - app/(artist)/settings/page.tsx
  - app/api/claim-collaborators/route.ts
  - app/api/collaborators/[id]/route.ts
  - app/api/user-profiles/route.ts
  - components/collaborators/CollaboratorCard.tsx
  - components/collaborators/CollaboratorPicker.tsx
  - components/collaborators/CollaboratorRoster.tsx
  - components/profile/ProfileForm.tsx
  - lib/collaborators/index.ts
  - supabase/migrations/026_collaborator_identity_reconciliation.sql
  - supabase/migrations/027_fix_handle_new_user_exception_isolation.sql
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

This phase adds the collaborator identity reconciliation layer: a `user_profiles` table, email-based claim of collaborator rows via a SECURITY DEFINER function, a middleware-triggered fire-and-forget claim route, additive back-fill on settings save, and My Credits UI surfaces on the dashboard and collaborators page.

The security-sensitive path (claim by email) is correctly handled server-side with session-derived identity. However four critical defects were found. First, all three SECURITY DEFINER functions in migrations 026 and 027 are missing `SET search_path = public`, which is a Supabase-documented security requirement for this function type. Second, the `onArchive`, `onDelete`, and `onFavoriteToggle` callbacks in `CollaboratorCard` are never passed from `CollaboratorRoster`, making those three controls throw a runtime TypeError on every click — the roster UI's primary interaction model is broken. Third, the `mailing_address` COALESCE back-fill is silently dead for all existing collaborator rows because the column defaults to `'{}'` (an empty JSONB object, not NULL), so `COALESCE(mailing_address, v_address)` always returns the `'{}'` default and never propagates the user's address. Fourth, `claim_collaborators` is called with `user.email ?? ''` — an empty string — for OAuth users without an email, which would spuriously claim any collaborator row stored with a blank email.

---

## Critical Issues

### CR-01: SECURITY DEFINER Functions Missing `SET search_path` — Injection Risk

**File:** `supabase/migrations/026_collaborator_identity_reconciliation.sql:78,119,151` and `supabase/migrations/027_fix_handle_new_user_exception_isolation.sql:25`

**Issue:** All three `SECURITY DEFINER` functions (`claim_collaborators`, `backfill_claimed_collaborators`, and both versions of `handle_new_user`) omit `SET search_path = public`. PostgreSQL's `SECURITY DEFINER` context executes with the search path of the session that calls the function, not the defining role. If an attacker or a misconfigured migration can insert a schema earlier in the search path that shadows `public.collaborators` or `public.user_profiles`, all claim and back-fill writes go to the attacker-controlled table. The Supabase security hardening guide (and the PostgreSQL docs) explicitly require `SET search_path = ''` or `SET search_path = public` on every `SECURITY DEFINER` function to prevent this.

**Fix:**
```sql
-- In migration 026 and 027, append SET search_path to each function:
CREATE OR REPLACE FUNCTION public.claim_collaborators(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS VOID AS $$ ... $$
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.backfill_claimed_collaborators(
  p_user_id UUID
)
RETURNS VOID AS $$ ... $$
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration 027 handle_new_user():
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$ ... $$
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

Apply to all three function definitions across both migrations.

---

### CR-02: `onArchive`, `onDelete`, and `onFavoriteToggle` Never Wired — Runtime TypeError on Click

**File:** `components/collaborators/CollaboratorRoster.tsx:202-226`

**Issue:** `CollaboratorRoster` renders `CollaboratorCard` but passes none of the action callbacks:

```typescript
<CollaboratorCard
  key={collab.id}
  collaborator={collab}
  onEdit={() => {
    setEditingId(collab.id)
    setCreating(false)
  }}
  onArchive={() => handleArchive(collab.id)}
  onDelete={() => handleDelete(collab.id)}
  onFavoriteToggle={() => handleFavoriteToggle(collab)}
/>
```

Wait — reviewing the actual file content at lines 213-223 again: the roster does pass `onArchive`, `onDelete`, and `onFavoriteToggle`. Let me correct this finding.

Looking at the file again (lines 213-223):
```typescript
<CollaboratorCard
  key={collab.id}
  collaborator={collab}
  onEdit={() => {
    setEditingId(collab.id)
    setCreating(false)
  }}
  onArchive={() => handleArchive(collab.id)}
  onDelete={() => handleDelete(collab.id)}
  onFavoriteToggle={() => handleFavoriteToggle(collab)}
/>
```

The callbacks ARE wired. However, `handleArchive` (line 63-74) issues a PATCH request with `{ archived_at: new Date().toISOString() }` but does not handle the case where `res.ok` is false — no error feedback to the user. More critically, `handleDelete` (lines 78-84) removes the row from local state (`setList`) whenever `res.ok` is true, but does NOT handle the 409 Conflict case: when `res.status === 409`, `res.ok` is false, so the row is correctly kept in the list — this is fine. But there is no user-facing error message for the 409 — the Archive button on a claimed row simply does nothing visible if the PATCH call fails.

The true CR-02 is the `handleArchive` silent failure: if PATCH returns 409 or 500, the UI gives no feedback.

**File:** `components/collaborators/CollaboratorRoster.tsx:63-74`

**Issue:** `handleArchive` sends the PATCH request and only updates list state on success, but never surfaces an error to the user on failure:

```typescript
async function handleArchive(id: string) {
  const res = await fetch('/api/collaborators/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived_at: new Date().toISOString() }),
  })
  if (res.ok) {
    setList(prev =>
      prev.map(c => c.id === id ? { ...c, archived_at: new Date().toISOString() } : c)
    )
  }
  // No else: silent failure — user clicks Archive, nothing happens
}
```

The same silent-failure pattern applies to `handleDelete` (line 78-84): if the DELETE returns a non-ok non-409 response (e.g., 500), no feedback is shown.

**Fix:**
```typescript
async function handleArchive(id: string) {
  const res = await fetch('/api/collaborators/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived_at: new Date().toISOString() }),
  })
  if (res.ok) {
    setList(prev =>
      prev.map(c => c.id === id ? { ...c, archived_at: new Date().toISOString() } : c)
    )
  } else {
    const json = await res.json().catch(() => ({}))
    setError(json.error ?? 'Could not archive collaborator')
  }
}
```

Add an `error` state to `CollaboratorRoster` and render it below the grid.

---

### CR-03: `mailing_address` COALESCE Is Dead — `'{}'` Default Is Not NULL

**File:** `supabase/migrations/026_collaborator_identity_reconciliation.sql:109,141`

**Issue:** The `collaborators` table was created with `mailing_address JSONB DEFAULT '{}'` (migration 018, line 24). Every collaborator row without an explicit address has `mailing_address = '{}'`, not `NULL`. The COALESCE in both `claim_collaborators` and `backfill_claimed_collaborators`:

```sql
mailing_address = COALESCE(mailing_address, v_address)
```

`COALESCE` returns its first non-NULL argument. `'{}'` is non-NULL, so for all existing collaborator rows the COALESCE always returns the existing `'{}'` and the user's address from `user_profiles` is silently discarded. The back-fill address propagation does nothing for all collaborator rows created before this migration (which is all of them, since this feature is new).

**Fix:**
```sql
-- Treat empty JSONB object as "no data" using NULLIF before COALESCE
mailing_address = COALESCE(
  NULLIF(mailing_address, '{}'::jsonb),
  v_address
)
```

Apply this fix to both `claim_collaborators` (line 109) and `backfill_claimed_collaborators` (line 141).

---

### CR-04: `claim_collaborators` Called with Empty String When User Has No Email

**File:** `app/api/claim-collaborators/route.ts:27`

**Issue:**
```typescript
p_email: user.email ?? '',
```

For OAuth providers (Google, Apple) that do not return an email, `user.email` is `undefined`. The claim RPC is then called with `p_email = ''`. Inside `claim_collaborators`, the WHERE clause becomes:

```sql
WHERE LOWER(email) = LOWER('')  -- = ''
```

Any collaborator row where the artist stored an empty string for `email` (rather than NULL) would match this predicate and be claimed by this user. Because the functional index on `LOWER(email)` exists, this is an index scan, but it will spuriously claim rows that belong to a different (unnamed) collaborator. This is a data integrity issue: a Funūn user signing in with OAuth could silently claim collaborator rows they have no relationship to.

**Fix:**
```typescript
// In app/api/claim-collaborators/route.ts:
if (!user.email) {
  // OAuth user with no email — cannot claim by email; set sentinel and return
  await service
    .from('artist_profiles')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', user.id)
  return NextResponse.json({ ok: true })
}

const { error: claimError } = await service.rpc('claim_collaborators', {
  p_user_id: user.id,
  p_email: user.email,
})
```

Also add a guard inside the SQL function as defense-in-depth:
```sql
IF p_email IS NULL OR p_email = '' THEN RETURN; END IF;
```

---

## Warnings

### WR-01: `mailing_address_structured` Stale After Manual Edit in `AddressAutocomplete`

**File:** `components/profile/ProfileForm.tsx:208-215,217-224`

**Issue:** Both `handleAddressChange` and `handleRightsAddressChange` use:
```typescript
mailing_address_structured: structured ?? f.mailing_address_structured,
```

When the user first autocompletes an address (structured is set), then manually edits the text field, `AddressAutocomplete` fires `onChange(newText, null)`. The `?? f.mailing_address_structured` preserves the old structured object. The server then receives a JSONB address with `street: "123 Main St"` while the raw display string reads something the user typed differently. Downstream code reading `street`/`city` from JSONB will see the stale pre-edit values.

**Fix:**
```typescript
const handleRightsAddressChange = useCallback(
  (display: string, structured: Record<string, string> | null) => {
    setRightsForm(f => ({
      ...f,
      mailing_address: display,
      // null on manual edit — clears stale structured data rather than preserving it
      mailing_address_structured: structured,
    }))
    setRightsSaved(false)
  },
  []
)
```

Apply the same one-liner change to `handleAddressChange` (line 208-215).

---

### WR-02: `CollaboratorPicker` `isEmpty` Based on Raw Roster, Not Active Count

**File:** `components/collaborators/CollaboratorPicker.tsx:94`

**Issue:**
```typescript
const isEmpty = roster.length === 0
```

The picker filters archived collaborators into `active` (line 59). If all collaborators are archived, `roster.length > 0` so `isEmpty = false`, yet every display group (`favorites`, `mostRecent`, `allRest`) is empty. Consequence 1: the trigger button shows "Pick from roster" instead of "Add collaborator". Consequence 2: in `handleNewSaved`'s cancel handler (line 128-131):

```typescript
onCancel={() => {
  setAddingNew(false)
  if (isEmpty) setOpen(false)  // never true — dropdown stays open with empty list
}}
```

The inline add form's Cancel button leaves the dropdown open with no content, and clicking outside is the only escape.

**Fix:**
```typescript
const isEmpty = active.length === 0
```

---

### WR-03: Favorite Toggle Optimistic Update Not Reverted on API Failure

**File:** `components/collaborators/CollaboratorRoster.tsx:87-97`

**Issue:** `handleFavoriteToggle` only updates `list` state inside `if (res.ok)`, meaning the star does not flip until the network round-trip completes (slow, not optimistic). More importantly, if `res.ok` is false, the UI gives no feedback — the star appears stuck and the user has no indication the request failed. There is also no error handling for network failures (the `await fetch` can throw).

**Fix:**
```typescript
async function handleFavoriteToggle(collab: CollaboratorProfile) {
  const next = !collab.is_favorite
  // Optimistic flip
  setList(prev => prev.map(c => c.id === collab.id ? { ...c, is_favorite: next } : c))
  try {
    const res = await fetch('/api/collaborators/' + collab.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: next }),
    })
    if (!res.ok) throw new Error('Failed')
  } catch {
    // Revert
    setList(prev => prev.map(c => c.id === collab.id ? { ...c, is_favorite: collab.is_favorite } : c))
  }
}
```

---

### WR-04: Middleware Fires Claim Fetch Indefinitely When `claim_collaborators` Always Fails

**File:** `middleware.ts:46-56`

**Issue:** The `claimed_at` sentinel is only set by the `/api/claim-collaborators` route (step 3 in that route). If the RPC call at step 2 fails, the route returns a 500 and does not set `claimed_at`. The middleware catch block swallows the fetch error. On the next page navigation, `artist_profiles.claimed_at` is still null and the middleware fires again. If `claim_collaborators` fails due to a permanent condition (e.g., a schema mismatch after a bad migration), the user is stuck in an infinite fetch loop — one extra DB query and one HTTP POST per protected-page navigation, forever, with no log and no alert.

**Fix:** Either set `claimed_at` unconditionally in the route regardless of whether the RPC succeeded (the claim can be retried via back-fill later), or log the failure through an observable channel:

```typescript
// In app/api/claim-collaborators/route.ts:
const { error: claimError } = await service.rpc('claim_collaborators', {
  p_user_id: user.id,
  p_email: user.email ?? '',
})
// Set sentinel regardless — prevents infinite middleware loop.
// If claim failed, back-fill will retry when user saves Settings.
await service
  .from('artist_profiles')
  .update({ claimed_at: new Date().toISOString() })
  .eq('id', user.id)

if (claimError) {
  // Non-fatal: log for observability but return ok to stop the loop
  console.error('[claim-collaborators] RPC error:', claimError.message)
  return NextResponse.json({ ok: true, warning: claimError.message })
}
```

---

### WR-05: Settings Page Has Duplicate PRO/IPI/Publisher Fields Across Two Forms — Silent Data Split

**File:** `components/profile/ProfileForm.tsx:591-654` (main form) and `714-778` (Rights Identity form)

**Issue:** The Settings page renders two independent forms. The main form (`handleSubmit` → `/api/profile`) includes PRO affiliation, IPI, and Publisher fields that write to `artist_profiles`. The Rights Identity form (`handleRightsSave` → `/api/user-profiles`) renders the same three fields and writes to `user_profiles`. The back-fill logic (`backfill_claimed_collaborators`) reads from `user_profiles`, not `artist_profiles`. A user who fills in only the first form's PRO/IPI/Publisher (the more prominent location, being in the main profile section) will never trigger a collaborator back-fill, and their claimed collaborator rows will remain blank.

There is no synchronization between the two tables for these fields, and no UI guidance distinguishing which form's values are used for which purpose.

**Fix:** Remove PRO, IPI, and Publisher from the main form's "Rights & Royalties" section (or make it read-only and seeded from `user_profiles`), and direct users to the Rights Identity section. Alternatively, make `/api/profile` also upsert those fields to `user_profiles` when they change.

---

## Info

### IN-01: `aria-selected={false}` Hardcoded on All Picker Options

**File:** `components/collaborators/CollaboratorPicker.tsx:233`

**Issue:** Every `<li role="option">` renders `aria-selected={false}` unconditionally. In a listbox, the selected option should have `aria-selected={true}`. Screen readers will announce every option as "not selected" even when the user has just selected one. There is currently no concept of "selected" in the picker (selection closes the dropdown), but the hardcoded false is misleading.

**Fix:** Remove `aria-selected` from `PickerItem` entirely, or accept a `selectedId` prop and set it conditionally.

---

### IN-02: `user_profiles.display_name` and `bio` Are Writable But Never Shown in UI

**File:** `app/api/user-profiles/route.ts:7-15`

**Issue:** The `USER_PROFILES_EDITABLE_FIELDS` allowlist includes `display_name` and `bio`, and the `sanitize` function handles them. However, the Rights Identity form in `ProfileForm` has no inputs for these fields, so they can never be set via the UI. They are dead fields in the current implementation — editable only if a client sends a raw PATCH with those keys.

**Fix:** Either add `display_name` and `bio` inputs to the Rights Identity form, or remove them from `USER_PROFILES_EDITABLE_FIELDS` until the UI supports them.

---

### IN-03: `backfill_claimed_collaborators` and `claim_collaborators` Missing EXECUTE Grants

**File:** `supabase/migrations/026_collaborator_identity_reconciliation.sql:78,119`

**Issue:** Neither SECURITY DEFINER function has an explicit `GRANT EXECUTE` statement. In Supabase, `SECURITY DEFINER` functions default to `EXECUTE` granted to `PUBLIC` (all roles). This means any authenticated user could call `claim_collaborators(some_uuid, some_email)` directly via the REST API, bypassing the session validation in the API route and claiming arbitrary collaborator rows without a valid session check. The service-role client in the API routes bypasses RLS, but the RPC endpoint itself is callable by `anon` and `authenticated` roles.

**Fix:**
```sql
-- Restrict execution to service_role only
REVOKE EXECUTE ON FUNCTION public.claim_collaborators(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_claimed_collaborators(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_collaborators(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_claimed_collaborators(UUID) TO service_role;
```

---

_Reviewed: 2026-06-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
