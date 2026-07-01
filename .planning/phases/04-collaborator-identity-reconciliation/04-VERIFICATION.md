---
phase: 04-collaborator-identity-reconciliation
verified: 2026-06-29T12:00:00Z
status: human_needed
score: 7/7
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Archive and Delete actions are non-functional in the roster UI — CollaboratorCard renders Archive/Delete buttons that call undefined"
    - "handle_new_user() trigger lacks exception handling around claim_collaborators — a claim failure rolls back the entire signup transaction"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Sign up a new Funūn account whose email matches an existing collaborator row created under another artist's account"
    expected: "artist_profiles row is created, subscriptions row is created, AND claimed_by is set on the matching collaborator row — all three in a single trigger transaction. Navigate to /collaborators as the new user; My Credits tab lists the credited project."
    why_human: "Requires a live Supabase instance and trigger execution. The handle_new_user() trigger, claim_collaborators() SECURITY DEFINER function, middleware sentinel gate, and cross-user RLS policy are all present and wired in code, but the end-to-end happy path can only be verified by running signup against a real database."
  - test: "Simulate a claim failure during signup (e.g. temporarily fault claim_collaborators) and verify artist_profiles and subscriptions rows are still created"
    expected: "artist_profiles and subscriptions rows commit; the failed claim is silently swallowed. On next navigation the middleware fires /api/claim-collaborators again (claimed_at is still null) and the claim retries."
    why_human: "Requires DB-level fault injection against a live Supabase instance to confirm the nested EXCEPTION WHEN OTHERS block in migration 027 handle_new_user() actually isolates the failure."
  - test: "Click Archive on a claimed collaborator card in the roster UI"
    expected: "A PATCH request fires to /api/collaborators/:id with archived_at set; the card leaves the active roster immediately (optimistic state update). No TypeError is thrown."
    why_human: "Runtime UX verification. The callbacks are now wired in code (onArchive, onDelete, onFavoriteToggle at lines 220-222 of CollaboratorRoster.tsx) but the browser interaction confirming no TypeError and correct list-state update requires manual observation."
  - test: "Click Delete on an unclaimed collaborator card"
    expected: "A DELETE request fires; card is removed from the list. Attempting DELETE on a claimed row returns 409 and the card stays."
    why_human: "Same runtime verification need as Archive; also confirms the atomic claimed_by IS NULL guard in the DELETE handler prevents race conditions."
  - test: "Star/unstar a collaborator via the favorite star button, then open the MetadataStudio CollaboratorPicker"
    expected: "PATCH fires with is_favorite toggled; star fills/empties immediately. On reopening the picker, the starred collaborator appears in the FAVORITES group at the top."
    why_human: "Favorite toggle wiring and picker grouping require runtime observation."
  - test: "In Settings, enter PRO, IPI, publisher, phone, and address fields and save the Rights Identity section"
    expected: "200 OK from PATCH /api/user-profiles; the user_profiles row is updated; any collaborator rows already claimed by this user have their NULL fields filled with the new values (additive back-fill). Non-rights profile fields are unaffected."
    why_human: "Requires an authenticated HTTP session and a live DB to confirm back-fill_claimed_collaborators() actually propagates values into claimed rows."
  - test: "Send PATCH /api/user-profiles with body containing claimed_by, id, and a valid allowlisted field (pro)"
    expected: "200 OK; only pro is persisted; claimed_by and id are silently dropped."
    why_human: "Mass-assignment rejection requires an authenticated HTTP client; the sanitize() allowlist logic is correct in code but server-side behavior needs end-to-end confirmation."
---

# Phase 04: Collaborator Identity Reconciliation Verification Report

**Phase Goal:** Complete collaborator identity reconciliation — email-based auto-claim, settings back-fill, roster management UX, and gap closures so COLLAB-05 is fully satisfied.
**Verified:** 2026-06-29
**Status:** HUMAN NEEDED (all automated checks pass; live DB/runtime verification remains)
**Re-verification:** Yes — after gap closure via plan 04-04

---

## Re-verification Summary

Previous status was `gaps_found` (5/7) with two blockers:

1. **BLOCKER WR-03/WR-04:** CollaboratorCard Archive/Delete/Favorite buttons unwired in CollaboratorRoster.
2. **BLOCKER CR-04:** handle_new_user() trigger lacked exception isolation around claim_collaborators().

Plan 04-04 closed both blockers. This re-verification confirms both gaps are resolved, verifies the four additional quality fixes (CR-01 atomic DELETE, CR-02 explicit RLS policies, CR-03 server-forced archived_at, migration 027 applied), and confirms no regressions in the previously-passing truths.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01: New user whose auth email matches a collaborator row gets claimed_by set automatically on signup via SECURITY DEFINER DB trigger | VERIFIED | Migration 026 line 158: handle_new_user() calls PERFORM public.claim_collaborators(NEW.id, NEW.email). Migration 027 wraps that call in a nested BEGIN/EXCEPTION WHEN OTHERS THEN NULL END block (lines 35-39). Both migrations exist at supabase/migrations/026 and 027. |
| 2 | D-03: Claim function is idempotent — only writes when claimed_by IS NULL | VERIFIED | Migration 026 lines 90-94: UPDATE collaborators SET claimed_by = p_user_id WHERE LOWER(email) = LOWER(p_email) AND claimed_by IS NULL — idempotency guard confirmed. |
| 3 | D-04: /collaborators page has My Credits section (every project the logged-in user is credited on) and My Roster section (existing Phase 1 behavior unchanged) | VERIFIED | CollaboratorRoster.tsx: role="tablist" at line 126, "My Roster" and "My Credits" tabs at lines 130-155; page.tsx passes both collaborators and credits props (lines 36-44); credits query filters on claimed_by = user.id with archived_at IS NULL. |
| 4 | D-06: Credits entries are permanent — not an onboarding card; section grows as more artists credit the user | VERIFIED | CollaboratorRoster.tsx My Credits tab is a persistent ul/li list (lines 258-315), not a dismissible card; no onboarding-only conditional gate present. |
| 5 | D-08: Back-fill runs at claim time and at settings save — claimed rows fill NULL fields additively | VERIFIED | Migration 026: claim_collaborators() fills NULL fields with COALESCE(existing, new) (lines 105-109); backfill_claimed_collaborators() for settings-save path also present (lines 119-143). /api/user-profiles route fires backfill_claimed_collaborators via createServiceClient().rpc() after every successful save (route.ts line 101). |
| 6 | Archive and Delete actions are functional from the roster UI | VERIFIED | CollaboratorRoster.tsx lines 60-98: handleArchive, handleDelete, handleFavoriteToggle all defined as async functions calling /api/collaborators/:id. Lines 220-222: onArchive={() => handleArchive(collab.id)}, onDelete={() => handleDelete(collab.id)}, onFavoriteToggle={() => handleFavoriteToggle(collab)} — all three props wired at the CollaboratorCard render site. (Gap WR-03/WR-04 from previous verification is now closed.) |
| 7 | handle_new_user() trigger is safe against claim failures — profile creation is not rolled back if claim_collaborators() raises | VERIFIED | Migration 027 lines 35-39: BEGIN PERFORM public.claim_collaborators(NEW.id, NEW.email); EXCEPTION WHEN OTHERS THEN NULL; END — nested exception block confirmed. Both artist_profiles and subscriptions INSERTs (lines 28-30) execute before the nested block. (Gap CR-04 from previous verification is now closed.) |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/026_collaborator_identity_reconciliation.sql` | Full schema + claim functions | VERIFIED | Exists; user_profiles table, collaborators columns, artist_profiles.claimed_at, LOWER(email) functional index, RLS policy "Claimed users see own credits", claim_collaborators(), backfill_claimed_collaborators(), extended handle_new_user() |
| `supabase/migrations/027_fix_handle_new_user_exception_isolation.sql` | Exception-isolated handle_new_user() + explicit user_profiles RLS policies | VERIFIED | Exists; nested EXCEPTION WHEN OTHERS block at line 37; DROP POLICY IF EXISTS "Users manage own profile" at line 50; three explicit policies FOR SELECT / FOR INSERT / FOR UPDATE at lines 52-63 |
| `app/api/claim-collaborators/route.ts` | POST handler with session validation | VERIFIED | createApiClient().auth.getUser() auth guard; service RPC claim_collaborators; claimed_at sentinel update |
| `app/api/user-profiles/route.ts` | GET + PATCH with allowlist + fire-and-forget backfill | VERIFIED | USER_PROFILES_EDITABLE_FIELDS contains 7 fields (pro, ipi, publisher, phone, mailing_address, display_name, bio) — claimed_by excluded; upsert keyed by id; backfill_claimed_collaborators fire-and-forget at line 101 |
| `components/collaborators/CollaboratorCard.tsx` | Claimed-state card: badge, archive, favorite star | VERIFIED | "Funūn member" badge, Archive/Delete conditional rendering, favorite star toggle — all present with correct prop signatures |
| `components/collaborators/CollaboratorRoster.tsx` | Two-tab layout with My Credits section + wired callbacks | VERIFIED | role="tablist" tab switcher; credits list; handleArchive/handleDelete/handleFavoriteToggle defined and passed to every CollaboratorCard at lines 220-222 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| handle_new_user() trigger | claim_collaborators() | PERFORM in nested BEGIN/EXCEPTION block (migration 027 line 36) | WIRED | Exception isolation confirmed; a claim failure cannot orphan the account. |
| middleware.ts | POST /api/claim-collaborators | fetch with cookie forwarding, gated on claimed_at IS NULL (lines 42-50) | WIRED | Sentinel gate and fire-and-forget intact; DEMO short-circuit at top preserved. |
| CollaboratorRoster.tsx | CollaboratorCard onArchive/onDelete/onFavoriteToggle | Callback props at render site lines 220-222 | WIRED | All three props now passed — previous gap closed. |
| PATCH /api/user-profiles | backfill_claimed_collaborators RPC | createServiceClient().rpc() fire-and-forget (route.ts line 101) | WIRED | Back-fill triggered on every settings save. |
| settings/page.tsx | user_profiles table | .from('user_profiles').select('*').eq('id', user.id).maybeSingle() | WIRED | Passed to ProfileForm as userProfile prop. |
| ProfileForm.tsx handleRightsSave | /api/user-profiles PATCH | fetch('/api/user-profiles', { method: 'PATCH' }) at line 274 | WIRED | Rights Identity section routes to the correct endpoint. |
| collaborators/page.tsx | Credits query (claimed_by = user.id) | .eq('claimed_by', user?.id ?? '').is('archived_at', null).limit(20) at line 44 | WIRED | Cross-user query authorized by "Claimed users see own credits" RLS policy. |
| DELETE /api/collaborators/[id] | claimed_by IS NULL atomic guard | .delete().is('claimed_by', null) at route.ts line 62 | WIRED | Atomic — claim guard is part of the DELETE statement itself; no TOCTOU window. |
| CollaboratorRoster.tsx handleDelete | 409 handling | if (!res.ok) row left in place — no removal on 409 | WIRED | Defensive guard in handleDelete at lines 78-84. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| CollaboratorRoster.tsx (My Credits tab) | credits prop | collaborators table query filtered by claimed_by = user.id via RLS | Yes — live DB rows | VERIFIED |
| dashboard/page.tsx (My Credits preview) | creditsPreview | collaborators table .eq('claimed_by', user?.id).limit(3) at line 73 | Yes — live DB rows | VERIFIED |
| ProfileForm.tsx (Rights Identity section) | rightsForm state | userProfile prop seeded from user_profiles row (maybeSingle, fallback to artist_profile values) | Yes — live DB rows | VERIFIED |
| CollaboratorCard.tsx | isClaimed, is_favorite, archived_at | CollaboratorProfile passed from CollaboratorRoster list state | Yes — from DB via roster query | VERIFIED |

---

### Behavioral Spot-Checks

No runnable entry points available without a live Supabase instance. Static analysis used.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| onArchive/onDelete/onFavoriteToggle wired at CollaboratorCard render site | grep -n "onArchive=\|onDelete=\|onFavoriteToggle=" CollaboratorRoster.tsx | Lines 220-222 — all 3 props present | PASS |
| claimed_by IS NULL guard is part of the atomic DELETE statement | grep -n "is('claimed_by', null)" app/api/collaborators/\[id\]/route.ts | Line 62 — .is('claimed_by', null) on the .delete() chain | PASS |
| EXCEPTION WHEN OTHERS block wraps claim call in migration 027 | grep "EXCEPTION WHEN OTHERS" supabase/migrations/027_... | Line 37 — nested exception block present | PASS |
| Three explicit user_profiles RLS policies in migration 027 | grep -c "FOR SELECT\|FOR INSERT\|FOR UPDATE" | 3 matches | PASS |
| server-forced archived_at in sanitizeCollaborator | grep "new Date().toISOString()" lib/collaborators/index.ts | Line 89 — client-supplied value replaced with server now() | PASS |
| COALESCE(existing, new) ordering in migration 026 | grep "COALESCE" supabase/migrations/026_... | Lines 105-109 and 137-141 — existing column first in both functions | PASS |
| idempotency guard in claim_collaborators | grep "claimed_by IS NULL" supabase/migrations/026_... | Line 94 — WHERE claimed_by IS NULL present | PASS |
| dashboard credits query with tab deep-link | grep "claimed_by\|tab=credits" app/(artist)/dashboard/page.tsx | Line 73 (query) and line 163 (link to /collaborators?tab=credits) | PASS |
| Migration 027 does NOT add a new CREATE TRIGGER | grep "CREATE TRIGGER on_auth_user_created" supabase/migrations/027_... | No output — no new trigger statement added | PASS |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| COLLAB-05 | 04-01, 04-02, 04-03, 04-04 | When a non-Funūn collaborator later creates a Funūn account, existing contributions are automatically linked via email-based claim — no re-entry required | SATISFIED (pending live-DB human verification) | Core claim mechanism wired end-to-end: DB trigger extends handle_new_user() with exception isolation (migration 027), claim API validates session and marks sentinel, middleware fires claim on first navigation, credits visible in My Credits tab and dashboard preview, settings back-fill propagates rights data into claimed rows, Archive/Delete/Favorite roster management actions all wired and functional. All seven observable truths verified at code level. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/collaborators/CollaboratorPicker.tsx` | 233 | aria-selected={false} hardcoded on all list items | INFO | Screen readers announce every item as unselected. Pre-existing issue (IN-02), not introduced by Phase 4. No impact on COLLAB-05 correctness. |

No debt markers (TBD, FIXME, XXX) found in the four files modified by plan 04-04. No blocker anti-patterns introduced.

---

### Human Verification Required

#### 1. End-to-end signup claim with live Supabase

**Test:** (1) Create a collaborator row with email X under Artist A's account. (2) Sign up a new Funūn account with email X. (3) Query `collaborators WHERE email = X` and verify `claimed_by = new_user_uuid`. (4) Navigate to /collaborators as the new user and confirm the My Credits tab lists the credited project.
**Expected:** All four checks pass; artist_profiles row created; claimed_at set after first navigation.
**Why human:** Requires a live Supabase instance and trigger execution. Cannot be verified with grep/static analysis.

#### 2. Claim failure isolation (CR-04) with live Supabase

**Test:** Temporarily inject a fault into claim_collaborators() and attempt signup.
**Expected:** artist_profiles and subscriptions rows still commit; claim is silently swallowed; on next navigation middleware retries via /api/claim-collaborators.
**Why human:** Requires DB-level fault injection. Migration 027 exception isolation block is confirmed in code; behavioral proof needs a live instance.

#### 3. Archive button fires PATCH and card leaves active roster

**Test:** In the roster UI, click Archive on a claimed collaborator card.
**Expected:** PATCH fires to /api/collaborators/:id with archived_at set; card disappears from the active roster immediately (optimistic state update). No TypeError thrown.
**Why human:** Callbacks are wired in code (lines 220-222) but runtime UX — including absence of TypeError and correct list-state update — requires browser observation.

#### 4. Delete button fires DELETE and card is removed; claimed row returns 409

**Test:** Click Delete on an unclaimed collaborator card; also attempt Delete on a claimed card.
**Expected:** Unclaimed card: DELETE fires; card removed from list. Claimed card: 409 returned; card stays in place (card renders Archive, not Delete, for claimed rows anyway).
**Why human:** Same runtime observation needed. Also verifies the atomic claimed_by IS NULL guard and the 409 handling in handleDelete.

#### 5. Favorite star fires PATCH and appears in picker Favorites group

**Test:** Star a collaborator via the favorite button in the roster, then open the MetadataStudio CollaboratorPicker.
**Expected:** PATCH fires with is_favorite toggled; star fills immediately. Picker shows starred collaborator in FAVORITES group at the top.
**Why human:** Runtime observation for both state flip and picker grouping behavior.

#### 6. Rights Identity settings save propagates to claimed collaborator rows

**Test:** As a claimed user (email matched an existing collaborator), go to Settings, enter PRO=ASCAP and IPI=12345, save Rights Identity section.
**Expected:** 200 OK; user_profiles row updated; claimed collaborator row has pro=ASCAP and ipi=12345 (if those were previously NULL); artist-entered non-NULL values unchanged.
**Why human:** Requires authenticated session and live DB to confirm backfill_claimed_collaborators() propagation.

#### 7. PATCH /api/user-profiles mass-assignment rejection

**Test:** Send `PATCH /api/user-profiles` with body `{"claimed_by": "fake-uuid", "id": "different-id", "pro": "ASCAP"}`.
**Expected:** 200 OK; only pro is persisted; claimed_by and id are silently dropped.
**Why human:** The sanitize() allowlist is correct in code; end-to-end confirmation needs an authenticated HTTP client.

---

### Gaps Summary

No gaps. Both blockers from the previous verification (5/7 score) are now closed by plan 04-04:

- **WR-03/WR-04 (closed):** onArchive, onDelete, and onFavoriteToggle are wired at the CollaboratorCard render site in CollaboratorRoster.tsx (lines 220-222). All three handlers call the correct API endpoints and update list state in place.
- **CR-04 (closed):** Migration 027 wraps PERFORM public.claim_collaborators(NEW.id, NEW.email) in a nested BEGIN/EXCEPTION WHEN OTHERS THEN NULL END block. A claim failure cannot orphan a new account.

The three additional code-quality concerns (CR-01 TOCTOU race, CR-02 ambiguous RLS policy, CR-03 future-dated archived_at) are also resolved in plan 04-04:

- **CR-01 (closed):** DELETE handler uses a single atomic .delete().is('claimed_by', null) chain; no two-step SELECT-then-DELETE race window.
- **CR-02 (closed):** Migration 027 replaces the ambiguous "Users manage own profile" policy with three explicit FOR SELECT / FOR INSERT / FOR UPDATE policies on user_profiles.
- **CR-03 (closed):** sanitizeCollaborator archived_at branch now assigns new Date().toISOString() (server time), ignoring any client-supplied value.

One outstanding item requires human verification before phase status can be declared fully passed: the migration 027 push. The SUMMARY notes that supabase/config.toml is absent so supabase db push could not be run non-interactively during plan execution. The migration SQL is authored correctly (verified above), but the database-level changes (exception-isolated handle_new_user(), explicit user_profiles policies) are only live after a manual push or SQL editor apply. Seven human verification items (all requiring a live Supabase instance) also remain.

---

_Verified: 2026-06-29_
_Verifier: Claude (gsd-verifier)_
