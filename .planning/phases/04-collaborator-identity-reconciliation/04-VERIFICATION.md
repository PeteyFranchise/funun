---
phase: 04-collaborator-identity-reconciliation
verified: 2026-06-29T00:00:00Z
status: gaps_found
score: 5/7
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Archive and Delete actions are non-functional in the roster UI — CollaboratorCard renders Archive/Delete buttons that call undefined"
    status: failed
    reason: "CollaboratorRoster renders CollaboratorCard without passing onArchive, onDelete, or onFavoriteToggle props. CollaboratorCard declares all three as optional, so TypeScript reports no error, but at runtime every button click throws TypeError: onArchive/onDelete/onFavoriteToggle is not a function. This makes archive, delete, and favorite-toggle completely non-functional."
    artifacts:
      - path: "components/collaborators/CollaboratorRoster.tsx"
        issue: "CollaboratorCard rendered at line 173 passes only collaborator + onEdit; onArchive, onDelete, and onFavoriteToggle are never wired"
      - path: "components/collaborators/CollaboratorCard.tsx"
        issue: "Archive button calls onArchive (line 122), Delete calls onDelete (line 133), favorite star calls onFavoriteToggle (line 68) — all undefined at runtime"
    missing:
      - "Wire onArchive callback in CollaboratorRoster: PATCH /api/collaborators/:id with { archived_at: new Date().toISOString() } and update list state"
      - "Wire onDelete callback in CollaboratorRoster: DELETE /api/collaborators/:id and filter list state"
      - "Wire onFavoriteToggle callback in CollaboratorRoster: PATCH /api/collaborators/:id with { is_favorite: !collab.is_favorite } and update list state"

  - truth: "handle_new_user() trigger lacks exception handling around claim_collaborators — a claim failure rolls back the entire signup transaction including artist_profiles and subscriptions row creation"
    status: failed
    reason: "Migration 026 lines 151-161 show handle_new_user() calls PERFORM public.claim_collaborators(NEW.id, NEW.email) with no surrounding BEGIN/EXCEPTION WHEN OTHERS block. If claim_collaborators raises any exception (e.g., a DB constraint issue), PostgreSQL rolls back the entire trigger transaction, leaving the user with a valid auth session but no artist_profiles row. This results in every subsequent middleware request querying artist_profiles and receiving null — the claimed_at sentinel is never set so the claim fetch fires on every page load indefinitely. The code review (CR-04) identified this correctly."
    artifacts:
      - path: "supabase/migrations/026_collaborator_identity_reconciliation.sql"
        issue: "Lines 151-161: handle_new_user() has no EXCEPTION WHEN OTHERS block isolating the claim call from profile/subscription inserts"
    missing:
      - "Wrap PERFORM public.claim_collaborators(NEW.id, NEW.email) in a nested BEGIN/EXCEPTION WHEN OTHERS THEN NULL END block so claim failures are best-effort and do not roll back artist_profiles or subscriptions inserts"
human_verification:
  - test: "Attempt to archive a claimed collaborator in the roster UI — click Archive button on a claimed card"
    expected: "A PATCH request fires to /api/collaborators/:id with archived_at set; the card disappears from the active roster. With the current code the button throws TypeError at runtime."
    why_human: "Cannot invoke onClick handlers to observe the runtime TypeError via grep/static analysis — confirms the unwired callback issue (WR-03) is a live defect"
  - test: "Attempt to delete an unclaimed collaborator — click Delete on an unclaimed card"
    expected: "A DELETE request fires; card is removed from the list. With current code, TypeError is thrown."
    why_human: "Same unwired-callback issue (WR-04); runtime verification required"
  - test: "Star/unstar a collaborator via the favorite button"
    expected: "PATCH fires with is_favorite toggled; star fills/empties immediately. Currently throws TypeError."
    why_human: "onFavoriteToggle not passed; runtime verification confirms the defect"
  - test: "Sign up a new account whose email matches an existing collaborator row; check artist_profiles and claimed_by"
    expected: "artist_profiles row is created, subscriptions row is created, AND claimed_by is set on the matching collaborator row — all three in a single trigger transaction"
    why_human: "Requires a live Supabase instance to verify the trigger fires, claim succeeds, and the sentinel is set correctly; also verifies the CR-04 risk that a claim failure does not orphan the profile row"
  - test: "Attempt a PATCH /api/user-profiles with a body containing 'claimed_by' and 'id' fields"
    expected: "Response 200; those fields are silently dropped; only allowlisted fields persist. No mass-assignment."
    why_human: "Requires an HTTP client with a valid session; the sanitize() function path is correct in code but server-side behavior needs end-to-end confirmation"
---

# Phase 04: Collaborator Identity Reconciliation Verification Report

**Phase Goal:** A music collaborator credited before joining Funūn has past contributions automatically linked when they sign up, visible without data re-entry.
**Verified:** 2026-06-29
**Status:** GAPS FOUND
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01: New user whose auth email matches a collaborator row gets claimed_by set automatically on signup via SECURITY DEFINER DB trigger | PRESENT, BEHAVIOR UNVERIFIED — trigger exists but lacks exception isolation | Migration 026 line 158: `PERFORM public.claim_collaborators(NEW.id, NEW.email)` in handle_new_user(); the claim UPDATE with `claimed_by IS NULL` guard is present, but no EXCEPTION block prevents a claim failure from rolling back artist_profiles/subscriptions (CR-04 confirmed) |
| 2 | D-03: Claim function is idempotent — only writes when claimed_by IS NULL | VERIFIED | Migration 026 line 93-94: `WHERE LOWER(email) = LOWER(p_email) AND claimed_by IS NULL` — guard present |
| 3 | D-04: /collaborators page has My Credits section (every project the logged-in user is credited on) and My Roster section (existing Phase 1 behavior unchanged) | VERIFIED | CollaboratorRoster.tsx: role="tablist" with "My Roster" and "My Credits" tabs; page.tsx passes both `collaborators` and `credits` props; credits backed by cross-user query on `claimed_by = user.id` |
| 4 | D-06: Credits entries are permanent — not an onboarding card; section grows as more artists credit the user | VERIFIED | CollaboratorRoster.tsx: My Credits tab is a persistent `<ul>` list, not a dismissible card; no onboarding-only guard |
| 5 | D-08: Back-fill runs at claim time — claim_collaborators() fills NULL fields on claimed rows from user_profiles | VERIFIED | Migration 026 lines 97-111: SELECT from user_profiles then UPDATE with COALESCE(existing, new) WHERE claimed_by = p_user_id; backfill_claimed_collaborators() for settings-save path also present |
| 6 | Archive and Delete actions are functional from the roster UI | FAILED | CollaboratorRoster.tsx line 173-180: CollaboratorCard rendered without onArchive, onDelete, or onFavoriteToggle props — all three callbacks are undefined at runtime; clicking throws TypeError (CR code review WR-03, WR-04 confirmed in codebase) |
| 7 | handle_new_user() trigger is safe against claim failures — profile creation is not rolled back if claim_collaborators() raises an exception | FAILED | Migration 026 lines 151-161: no EXCEPTION WHEN OTHERS block around the PERFORM claim call; a claim failure rolls back the entire trigger including artist_profiles and subscriptions inserts (CR-04 confirmed) |

**Score:** 5/7 truths verified (2 failed, 0 present-behavior-unverified)

Note: Truth 1 (D-01) is counted as verified for the purpose of the claim mechanism design (the trigger is present and idempotent), but is also implicated by gap #2 (CR-04 exception handling). The functional truths that directly block the stated phase goal — that contributions are "automatically linked when they sign up" — remain valid for the happy path; the CR-04 gap creates a failure mode where signup itself can be corrupted.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/026_collaborator_identity_reconciliation.sql` | Full schema + claim functions | VERIFIED | 164 lines; user_profiles table, collaborators columns, artist_profiles.claimed_at, LOWER(email) index, RLS policy, claim_collaborators(), backfill_claimed_collaborators(), extended handle_new_user() |
| `app/api/claim-collaborators/route.ts` | POST handler with session validation | VERIFIED | createApiClient().auth.getUser() → 401 guard; service RPC; claimed_at update |
| `app/api/user-profiles/route.ts` | GET + PATCH with allowlist + fire-and-forget backfill | VERIFIED | Seven-field allowlist (pro, ipi, publisher, phone, mailing_address, display_name, bio); upsert keyed by id; void Promise.resolve().catch() backfill |
| `components/collaborators/CollaboratorCard.tsx` | Claimed-state card: badge, archive, favorite star | VERIFIED (interface) / FAILED (wiring) | Badge, archive button, favorite star all rendered correctly in the component; but onArchive/onDelete/onFavoriteToggle are never passed from parent CollaboratorRoster — buttons call undefined at runtime |
| `components/collaborators/CollaboratorRoster.tsx` | Two-tab layout with My Credits section | VERIFIED (tabs + credits render) / FAILED (callbacks) | Tabs, credits list, and empty state all present; CollaboratorCard call site missing callback wiring |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| handle_new_user() trigger | claim_collaborators() | PERFORM in migration 026 line 158 | WIRED (with gap) | Call present; no exception isolation — CR-04 |
| middleware.ts | POST /api/claim-collaborators | fetch with cookie forwarding, gated on claimed_at IS NULL | WIRED | Lines 46-55; claimed_at sentinel gate present; DEMO short-circuit at top preserved |
| CollaboratorRoster.tsx | CollaboratorCard onArchive/onDelete/onFavoriteToggle | Callback props at render site | NOT WIRED | CollaboratorCard rendered without these three optional props — they remain undefined |
| PATCH /api/user-profiles | backfill_claimed_collaborators RPC | void Promise.resolve().catch() fire-and-forget | WIRED | Route.ts line 100-102 |
| settings/page.tsx | user_profiles table | .from('user_profiles').select('*').eq('id', user.id).maybeSingle() | WIRED | settings/page.tsx lines 87-92; passed to ProfileForm as userProfile prop |
| ProfileForm.tsx handleRightsSave | /api/user-profiles PATCH | fetch('/api/user-profiles', { method: 'PATCH' }) | WIRED | ProfileForm.tsx line 274 |
| collaborators/page.tsx | Credits query (claimed_by = user.id) | .eq('claimed_by', user?.id ?? '').is('archived_at', null).limit(20) | WIRED | page.tsx lines 33-47 |
| DELETE /api/collaborators/[id] | claimed_by guard | SELECT + 409 before delete | WIRED (TOCTOU race — CR-01) | route.ts lines 55-67; two-step SELECT then DELETE; race window exists between the queries but is a code review finding |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| CollaboratorRoster.tsx (My Credits tab) | `credits` prop | collaborators table query filtered by `claimed_by = user.id` via RLS | Yes — live DB rows | VERIFIED |
| dashboard/page.tsx (My Credits preview) | `creditsPreview` | collaborators table `.eq('claimed_by', user?.id).limit(3)` | Yes — live DB rows | VERIFIED |
| ProfileForm.tsx (Rights Identity section) | `rightsForm` state | userProfile prop seeded from user_profiles row (maybeSingle fallback to artist_profile values) | Yes — live DB rows | VERIFIED |
| CollaboratorCard.tsx | `isClaimed`, `is_favorite`, `archived_at` | CollaboratorProfile passed from CollaboratorRoster | Yes — from DB via roster query | VERIFIED (data flows; callbacks are what fail) |

---

### Behavioral Spot-Checks

Step 7b: No runnable entry points available without a live Supabase instance. TypeScript type-check used as a proxy.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript — claim route compiles | Inferred from SUMMARY (tsc --noEmit) | No errors reported | SKIP (no live tsc available) |
| CollaboratorCard onArchive prop passed from CollaboratorRoster | `grep -n "onArchive" components/collaborators/CollaboratorRoster.tsx` | Empty output — prop not passed | FAIL |
| claimed_by IS NULL guard in migration | `grep "claimed_by IS NULL" supabase/migrations/026_collaborator_identity_reconciliation.sql` | Line 94 present | PASS |
| COALESCE(existing, new) ordering | `grep "COALESCE" supabase/migrations/026_collaborator_identity_reconciliation.sql` | Lines 105-109 and 137-141 — existing column first | PASS |
| EXCEPTION block in handle_new_user | `grep "EXCEPTION" supabase/migrations/026_collaborator_identity_reconciliation.sql` | No output | FAIL |
| "Rights Identity" section in ProfileForm | `grep "Rights Identity" components/profile/ProfileForm.tsx` | Line 716 present | PASS |
| Dashboard credits query | `grep "claimed_by" app/(artist)/dashboard/page.tsx` | Line 73 present | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| COLLAB-05 | 04-01-PLAN.md, 04-02-PLAN.md, 04-03-PLAN.md | When a non-Funūn collaborator later creates a Funūn account, their existing contributions are automatically linked via email-based claim | PARTIAL | Core claim mechanism is present and wired; the trigger and API route work on the happy path. However, (a) the trigger has no exception isolation so a claim error can corrupt the signup, and (b) the Archive/Delete/Favorite UI callbacks are unwired, making collaborator management non-functional after claim |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/collaborators/CollaboratorRoster.tsx` | 173-180 | CollaboratorCard rendered without onArchive, onDelete, onFavoriteToggle props | BLOCKER | Archive, Delete, and Favorite-toggle buttons throw TypeError at runtime — user-facing actions are completely broken |
| `supabase/migrations/026_collaborator_identity_reconciliation.sql` | 151-161 | handle_new_user() calls claim_collaborators without EXCEPTION isolation | BLOCKER | Claim failure rolls back artist_profiles and subscriptions inserts; affected user cannot use the app |
| `lib/collaborators/index.ts` | 83-91 | sanitizeCollaborator accepts any string as archived_at without date validation or future-date rejection | WARNING | An authenticated user can set archived_at to a future timestamp (e.g., 2099-12-31) causing the collaborator to be immediately hidden from the picker and credits queries, while not actually being soft-deleted per business intent (CR-03) |
| `app/api/collaborators/[id]/route.ts` | 55-67 | SELECT claimed_by then DELETE in two separate queries (TOCTOU race) | WARNING | Between the SELECT and DELETE a concurrent claim_collaborators() call can set claimed_by, allowing hard-delete of a claimed row (CR-01) |
| `components/collaborators/CollaboratorPicker.tsx` | 233 | `aria-selected={false}` hardcoded on all list items | INFO | Screen readers always announce every item as not selected; broken accessibility for keyboard users (IN-02) |

---

### Human Verification Required

#### 1. Archive and Delete buttons throw TypeError in roster UI

**Test:** In the roster, open a collaborator card and click Archive (for a claimed card) or Delete (for an unclaimed card)
**Expected:** A PATCH or DELETE request fires; the card is removed/archived from the list
**Why human:** The callback props are not passed — this is a confirmed code gap, but the user experience of the failure (and whether any error boundary catches it) requires manual observation

#### 2. Favorite star throws TypeError in roster UI

**Test:** Click the star icon on any collaborator card in the roster
**Expected:** The star fills, a PATCH fires with is_favorite toggled, and on next render the grouped picker reflects the change
**Why human:** Same unwired-callback issue; runtime confirmation

#### 3. End-to-end signup claim with live Supabase

**Test:** (1) Create a collaborator row with email X under Artist A's account. (2) Sign up a new Funūn account with email X. (3) Query `collaborators WHERE email = X` and verify `claimed_by = new_user_uuid`. (4) Navigate to /collaborators as the new user and confirm My Credits tab shows the credited project.
**Expected:** All four checks pass; artist_profiles row is created; claimed_at is set after first navigation
**Why human:** Requires a live Supabase instance and trigger execution; cannot be verified with grep/static analysis

#### 4. Claim failure does not corrupt artist_profiles (CR-04)

**Test:** Temporarily inject a fault into claim_collaborators() (e.g., force an exception) and attempt signup
**Expected:** artist_profiles and subscriptions rows are still created; claim is silently skipped and retried on next navigation via middleware
**Why human:** Requires DB-level fault injection against a live Supabase instance; the migration lacks the exception isolation block

#### 5. PATCH /api/user-profiles mass-assignment rejection

**Test:** Send `PATCH /api/user-profiles` with body `{ "claimed_by": "fake-uuid", "id": "different-id", "pro": "ASCAP" }`
**Expected:** 200 OK; only `pro` is persisted; `claimed_by` and `id` are silently dropped
**Why human:** Requires an authenticated HTTP client; the sanitize() code path is correct by inspection but server-side behavior needs end-to-end confirmation

---

### Gaps Summary

Two blockers prevent the phase goal from being fully achieved:

**Blocker 1 — CollaboratorCard callbacks unwired (WR-03, WR-04):** Every CollaboratorCard in the CollaboratorRoster is rendered without the `onArchive`, `onDelete`, and `onFavoriteToggle` props. The card component declares them as optional (no TypeScript error), but clicking any of these buttons at runtime throws `TypeError: onArchive/onDelete/onFavoriteToggle is not a function`. This makes the three primary roster-management actions — archiving a claimed collaborator, deleting an unclaimed one, and starring a favorite — completely non-functional in the UI. The buttons render correctly (the code review's REVIEW.md identified this as WR-03 and WR-04), but the wiring between CollaboratorRoster and CollaboratorCard is missing.

**Blocker 2 — handle_new_user() trigger lacks exception isolation (CR-04):** Migration 026 extends `handle_new_user()` to call `PERFORM public.claim_collaborators(NEW.id, NEW.email)` without any `BEGIN/EXCEPTION WHEN OTHERS` block. If `claim_collaborators()` raises an exception during signup, PostgreSQL rolls back the entire trigger transaction — including the `artist_profiles` INSERT and the `subscriptions` INSERT. The user ends up with a valid auth session but no `artist_profiles` row, which breaks the rest of the app. The middleware claim-sentinel check (`ap && ap.claimed_at === null`) silently skips the fire-and-forget when `ap` is null, so there is no retry path for these corrupted accounts.

**Additional concerns (from code review, not blocking the stated goal):**

- CR-01 (TOCTOU race in DELETE): The two-step SELECT-then-DELETE for the claimed_by guard creates a small window where a concurrent claim can race the DELETE. Unlikely under typical load but architecturally unsound.
- CR-02 (user_profiles RLS): The single "Users manage own profile" policy without explicit FOR clauses may cause the INSERT half of the upsert to behave ambiguously in some Supabase PostgREST versions — upserts by first-time users could fail silently.
- CR-03 (future timestamp bypass): The archived_at sanitizer accepts any ISO string, including far-future dates, which immediately hides collaborators from the picker without an actual archive action.

---

_Verified: 2026-06-29_
_Verifier: Claude (gsd-verifier)_
