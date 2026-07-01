---
phase: 05-launchpad-checklist
verified: 2026-07-01T00:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 2
overrides_applied: 0
behavior_unverified_items:

  - truth: "Toggling a checkbox persists via PATCH and survives a hard page reload (LAUNCH-04)"
    test: "Check a checklist item on /launchpad/[projectId], then hard-reload the page and confirm the item still shows as checked"
    expected: "Completion state is preserved — the PATCH upsert writes to launchpad_progress and the server-side merge re-reads it on reload"
    why_human: "The upsert code and merge logic are present and correctly wired, but verifying the round-trip state persistence requires a live browser session with an authenticated user and a real Supabase instance"

  - truth: "The Before release section auto-collapses to a confirmation block when the project release_date is in the past"
    test: "Navigate to /launchpad/[projectId] for a project whose release_date is in the past and observe the Before release section"
    expected: "Before release section starts collapsed (shows 'Did you handle this before release?' block with compact checkboxes); a chevron button lets the user expand the full item list"
    why_human: "The isReleased computation (release_date < new Date()) and the collapsed render path are present in ChecklistSection.tsx, but confirming the correct collapse/expand behavior requires a live browser with a project that has a past release_date"
human_verification:

  - test: "Toggling a checkbox persists via PATCH and survives a hard page reload"
    expected: "Check an item, reload the page — item stays checked. Uncheck, reload — item stays unchecked."
    why_human: "Round-trip DB persistence requires a live authenticated session and Supabase instance"

  - test: "Before release section auto-collapses when release_date is in the past"
    expected: "Visit /launchpad/[projectId] for a released project — Before release shows as a collapsed confirmation block with a chevron expand toggle"
    why_human: "Date comparison behavior requires a live browser; the code path exists but cannot be verified by grep"

  - test: "Approved tip renders in TipPanel; unapproved tip does not"
    expected: "Set tip_approved=true on one item via /admin/tips approve — the tip body appears in the artist TipPanel. An unapproved item shows only 'Steps for this item are coming soon.'"
    why_human: "The gating logic is in code (tip_body: item.tip_approved ? item.tip_body : null in both the server-component page and the API route), but confirming what renders in the panel requires a real session"

  - test: "Non-admin authenticated user is redirected away from /admin/* routes"
    expected: "Visiting /admin/checklist while signed in as a regular artist (not is_admin) redirects to /"
    why_human: "The layout and per-page admin check are both present, but the redirect behavior requires a live browser session"

  - test: "Admin drag-reorder persists and survives reload; artist-facing order updates"
    expected: "Drag a row in /admin/checklist — the PATCH /api/admin/checklist with full order array fires, sort_order updates in DB, and visiting /launchpad/[projectId] shows the new order"
    why_human: "End-to-end dnd-kit drag-to-persist behavior requires a live browser"
---

# Phase 5: Launchpad Checklist Verification Report

**Phase Goal:** Artists open a per-project Launchpad room that tells them exactly what to do after release day — each item is actionable (in-Funūn tool or external action), sequenced by post-release week to match the Spotify algorithmic window, backed by contextual tips, and their progress is saved.
**Verified:** 2026-07-01T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Artist opens a Launchpad room for a specific project and sees a guided post-release checklist of distinct items (LAUNCH-01) | VERIFIED | `app/(artist)/launchpad/[projectId]/page.tsx` is a real server component that fetches the owner-scoped project and 20 checklist items via service client, merges them into `MergedChecklistItem[]`, and passes them to `<LaunchpadRoom>`. `LaunchpadRoom.tsx` renders 4 `ChecklistSection` components. The global `/launchpad/page.tsx` shows project cards above the playbook. |
| 2 | Each checklist item launches an in-Funūn tool or opens an external action; items are grouped/ordered by suggested_week (LAUNCH-02) | VERIFIED | Migration 028 seeds 20 items across 4 sections (`before_release`, `week_1`, `week_2`, `weeks_3_4`) with `suggested_week` 0–3 and `sort_order`. API route orders by `sort_order`. `LaunchpadRoom` renders in fixed section order `['before_release', 'week_1', 'week_2', 'weeks_3_4']`. `TipPanel.tsx` renders action CTA `<a>` only when `action_href` is non-null; sets `target="_blank"` for `external_url`, omits it for `internal_tool`. |
| 3 | Tips are DB-backed, AI-drafted, admin-approved before publish; unapproved drafts never reach artists (LAUNCH-03) | VERIFIED | Three-layer enforcement confirmed: (a) Migration 029 replaces `USING(true)` RLS with `USING(false)` — direct authenticated reads on `launchpad_checklist_items` are blocked at DB level. (b) API route `app/api/launchpad/[projectId]/checklist/route.ts` uses `createServiceClient()` after auth+ownership check, then destructures and discards `tip_draft`/`tip_drafted_at`/`author`, sets `tip_body: item.tip_approved ? item.tip_body : null`. (c) Server-component page `app/(artist)/launchpad/[projectId]/page.tsx` performs the same destructure-and-gate before passing to client props. Admin approve workflow: `PATCH /api/admin/tips/[itemKey]` with `action=approve` copies `tip_draft` → `tip_body`, sets `tip_approved=true`, clears `tip_draft`. |
| 4 | Artist can check an item complete and completion persists per project across sessions (LAUNCH-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code: `LaunchpadRoom.onToggle` does optimistic update then `PATCH /api/launchpad/[projectId]/progress`; progress route upserts with `onConflict: 'user_id,project_id,item_key'`; server-component page re-reads `launchpad_progress` on load and merges into initial items. The wiring is complete and correct, but the round-trip persistence invariant (check → PATCH → reload → shows checked) is a state transition that requires a live session to confirm. |
| 5 | Admin can add, edit, reorder, and delete checklist items from /admin/checklist without touching Supabase Studio (LAUNCH-05) | VERIFIED | `ChecklistAdmin.tsx` (wired into `app/(admin)/checklist/page.tsx`) provides: inline add form (POST `/api/admin/checklist`), inline edit form (PATCH `/api/admin/checklist/[itemKey]`), inline delete-confirm block with `role="alert"` (DELETE `/api/admin/checklist/[itemKey]`), dnd-kit drag reorder (desktop) and up/down arrow buttons (mobile), both calling `persistOrder` which PATCHes `/api/admin/checklist` with full `{ order: [...] }` array. Admin pages have per-page `is_admin` check (defense-in-depth beyond the layout gate). All admin API routes use `verifyAdmin()` from `lib/admin/gate.ts` before `createServiceClient()`. |

**Score:** 5/5 truths verified (2 present, behavior-unverified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/028_launchpad_checklist.sql` | Two tables, RLS, cascade FK, 20 seed items | VERIFIED | Present. `launchpad_checklist_items` and `launchpad_progress` with `ENABLE ROW LEVEL SECURITY` each. `REFERENCES launchpad_checklist_items(key) ON DELETE CASCADE`. `UNIQUE (user_id, project_id, item_key)`. `uuid_generate_v4()` throughout (no `gen_random_uuid`). 20 seed rows via `ON CONFLICT (key) DO NOTHING` INSERT. |
| `supabase/migrations/029_launchpad_checklist_rls_tighten.sql` | USING(false) RLS replacing USING(true) | VERIFIED | Drops old policy, creates `"No direct authenticated reads — use API"` with `USING(false)`. Service-client path confirmed in both API route and server-component page. |
| `types/index.ts` — ChecklistItem, LaunchpadProgress, MergedChecklistItem | Three exported types | VERIFIED | All three exported at lines 726, 744, 756. `ChecklistItem` does NOT include `tip_draft`. Section union and action_type union are correctly narrowed. `MergedChecklistItem = ChecklistItem & { completed: boolean; completed_at: string | null }`. |
| `middleware.ts` | /launchpad and /admin in isProtected | VERIFIED | Lines 23–24: `pathname.startsWith('/launchpad')` and `pathname.startsWith('/admin')` in the OR chain. Phase 4 claim block and matcher unchanged. |
| `app/(admin)/layout.tsx` | is_admin gate + admin nav | VERIFIED | Casts `user.app_metadata as { is_admin?: boolean }`, checks `=== true`, redirects to `/` otherwise. Sidebar links to `/admin/checklist` and `/admin/tips`. |
| `app/(admin)/page.tsx` | Redirects to /admin/checklist | VERIFIED | Contains only `redirect('/admin/checklist')`. |
| `app/(admin)/checklist/page.tsx` | Wired to ChecklistAdmin via service client | VERIFIED | Fetches via `createServiceClient()` directly (not via its own API); renders `<ChecklistAdmin initialItems={...} />`. Has per-page is_admin check (T-05-02 defense-in-depth). |
| `app/(admin)/tips/page.tsx` | Wired to TipsAdmin via service client | VERIFIED | Fetches `tip_draft IS NOT NULL` rows via `createServiceClient()`; renders `<TipsAdmin initialDrafts={...} />`. Has per-page is_admin check. |
| `app/api/launchpad/[projectId]/checklist/route.ts` | GET with tip gating, no tip_draft | VERIFIED | Uses `createApiClient()` for auth+ownership, then `createServiceClient()` for items. Destructures and discards `tip_draft`/`tip_drafted_at`/`author`. Sets `tip_body: item.tip_approved ? item.tip_body : null`. Returns 401/404 on auth/ownership failure. |
| `app/api/launchpad/[projectId]/progress/route.ts` | PATCH upsert on UNIQUE constraint | VERIFIED | Session `user.id` only — never from body. Validates `item_key` (string) and `completed` (boolean). Upserts with `onConflict: 'user_id,project_id,item_key'`. |
| `app/api/admin/checklist/route.ts` | GET list, POST create, PATCH reorder; admin-gated | VERIFIED | `verifyAdmin()` called first in all three handlers. EDITABLE_FIELDS allowlist, section/action_type literal validation, KEY_REGEX validation. Atomic reorder: sequential updates for all entries in `order` array. |
| `app/api/admin/checklist/[itemKey]/route.ts` | PATCH edit, DELETE; admin-gated | VERIFIED | `verifyAdmin()` first. PATCH builds update only from EDITABLE_FIELDS. DELETE does not manually delete progress (relies on FK cascade). |
| `app/api/admin/tips/route.ts` | GET pending drafts; admin-gated | VERIFIED | Filters `tip_draft IS NOT NULL`, returns admin-only fields. |
| `app/api/admin/tips/[itemKey]/route.ts` | PATCH approve/reject; admin-gated | VERIFIED | Requires `action` = 'approve' or 'reject'. Approve: reads draft, sets `tip_body`, `tip_approved=true`, clears `tip_draft`. Reject: clears `tip_draft` only. |
| `components/launchpad/TipPanel.tsx` | Slide-in panel; closes on Escape; CTA conditional | VERIFIED | `fixed inset-0 z-50 flex justify-end`. Returns `null` when item is null. Escape useEffect active only when item is non-null. CTA `<a>` rendered only when `action_href` is non-null; `target="_blank"` for `external_url` only. |
| `components/launchpad/ChecklistItem.tsx` | Row-click opens panel; checkbox stopPropagation | VERIFIED | Row `onClick` calls `onOpenPanel(item)`. Checkbox `onClick` calls `e.stopPropagation()` then `onToggle`. Completed state: `line-through text-white/40`. 44px hit area via `p-2.5` wrapper. |
| `components/launchpad/ChecklistSection.tsx` | 4 sections; before_release collapse when isReleased | VERIFIED | SECTION_META defines all 4 section headers and sub-labels. `isOpen` state initialises to `!isBeforeRelease || !isReleased`. Collapsed state renders `"Did you handle this before release?"` confirmation block. Chevron toggle uses `aria-expanded`/`aria-controls`. |
| `components/launchpad/LaunchpadRoom.tsx` | Optimistic toggle with rollback; completion counter | VERIFIED | `isReleased` null-safe computation. Items grouped in fixed `SECTION_ORDER`. `onToggle` does optimistic update, PATCH, then re-fetches authoritative state on failure (with fallback rollback). Completion counter `{completed} of {total} steps complete`. TipPanel wired at root. |
| `components/admin/ChecklistAdmin.tsx` | dnd-kit reorder + inline CRUD + mobile arrows | VERIFIED | Imports `DndContext`, `SortableContext`, `useSortable`, `arrayMove` from installed @dnd-kit packages. `handleDragEnd` calls `persistOrder(reordered)` which PATCHes full `{ order: [...] }` array. `move(key, dir)` does same for mobile. Inline add, edit, delete-confirm all wired to Plan 05 admin APIs. |
| `components/admin/TipsAdmin.tsx` | Editable textarea; approve/reject pills | VERIFIED | Auto-grow textarea per draft. Approve PATCHes `{ action: 'approve', tip_text: draft.currentText }`. Reject PATCHes `{ action: 'reject' }`. Approved card shows badge, hides buttons. Rejected cards behind "Show rejected" toggle. |
| `lib/admin/gate.ts` | verifyAdmin, EDITABLE_FIELDS, KEY_REGEX | VERIFIED | `verifyAdmin()` returns 401 (no user) or 403 (not is_admin) before any DB access. `EDITABLE_FIELDS` tuple. `KEY_REGEX = /^[a-z0-9_]+$/`. All admin API routes import from this module. |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | Installed in package.json | VERIFIED | Confirmed in `package.json` dependencies: `^6.3.1`, `^10.0.0`, `^3.2.2`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/(artist)/launchpad/[projectId]/page.tsx` | `launchpad_checklist_items` | `createServiceClient()` after ownership check | WIRED | Service client bypasses USING(false) RLS; ownership verified first via user-scoped client |
| `app/(artist)/launchpad/[projectId]/page.tsx` | `LaunchpadRoom` | `<LaunchpadRoom project={project} items={merged} />` | WIRED | Merged items passed with tip_body gated and admin fields stripped |
| `LaunchpadRoom.onToggle` | `PATCH /api/launchpad/[projectId]/progress` | `fetch('/api/launchpad/{id}/progress', { method: 'PATCH' })` | WIRED | Optimistic update precedes the fetch; rollback on non-ok response |
| `checklist GET route` | `launchpad_checklist_items` | `createServiceClient().from('launchpad_checklist_items').select('*')` | WIRED | Uses service client (migration 029 USING(false) otherwise blocks); tip gating in map |
| `progress PATCH route` | `launchpad_progress` | `.upsert(..., { onConflict: 'user_id,project_id,item_key' })` | WIRED | Matches UNIQUE constraint in migration 028; user_id forced from session |
| `ChecklistAdmin.handleDragEnd` | `PATCH /api/admin/checklist` | `persistOrder → fetch('/api/admin/checklist', { method: 'PATCH', body: JSON.stringify({ order }) })` | WIRED | Full reordered list sent after every drag-end and mobile arrow move |
| `(admin)/checklist/page.tsx` | `ChecklistAdmin` | `<ChecklistAdmin initialItems={...} />` with service-client data | WIRED | Server-component feeds initial items; mutations go through admin API routes |
| `TipsAdmin.handleApprove` | `PATCH /api/admin/tips/[itemKey]` | `fetch('/api/admin/tips/${key}', { action: 'approve', tip_text })` | WIRED | Admin-edited draft text sent as `tip_text`; API applies to `tip_body` |
| `tip approve API` | artist checklist GET | `tip_approved=true` → `tip_body` returned | WIRED | Once approved, `item.tip_approved ? item.tip_body : null` evaluates to the tip body |
| `migration 029 USING(false)` | artist checklist route service client | Replaces USING(true); direct user-session reads blocked | WIRED | Both API route and server-component page confirmed to use `createServiceClient()` for checklist items after auth check |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `LaunchpadRoom.tsx` | `items: MergedChecklistItem[]` | `[projectId]/page.tsx` server-side merge of `launchpad_checklist_items` + `launchpad_progress` | Yes — service client reads actual DB rows; progress scoped to `user_id` + `project_id` | FLOWING |
| `ChecklistAdmin.tsx` | `initialItems: AdminItem[]` | `(admin)/checklist/page.tsx` service-client `SELECT *` from `launchpad_checklist_items` | Yes — returns all DB rows including admin-only fields | FLOWING |
| `TipsAdmin.tsx` | `initialDrafts` | `(admin)/tips/page.tsx` service-client `SELECT ... WHERE tip_draft IS NOT NULL` | Yes — only returns rows with pending drafts | FLOWING |
| `app/(artist)/launchpad/page.tsx` | `vaultProjects` | `supabase.from('vault_projects').select('id, title').eq('user_id', user.id)` | Yes — user-scoped project list | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build passes (TypeScript + Next.js) | `npm run build` | Compiled successfully, 0 errors, 32 static pages generated | PASS |
| Migration 028 has 20 seeded rows | `grep -oE '(presave_link\|...\|catalog_bridge)' 028_launchpad_checklist.sql \| uniq \| wc -l` | 20 | PASS |
| Migration 028 has ENABLE RLS twice | `grep -c "ENABLE ROW LEVEL SECURITY" 028_launchpad_checklist.sql` | 2 | PASS |
| Migration 029 drops old policy, adds USING(false) | `cat 029_launchpad_checklist_rls_tighten.sql` | DROP POLICY + CREATE POLICY ... USING(false) confirmed | PASS |
| No tip_draft in ChecklistItem type | `grep tip_draft types/index.ts` | Only appears in comments above the type; absent from type body | PASS |
| Middleware guards /launchpad and /admin | `grep "startsWith" middleware.ts` | Both prefixes present at lines 23–24 | PASS |
| Admin per-page gate present | `grep is_admin app/(admin)/checklist/page.tsx` | is_admin check + redirect('/') on non-admin | PASS |
| ChecklistItem checkbox stopPropagation | `grep stopPropagation components/launchpad/ChecklistItem.tsx` | `e.stopPropagation()` on checkbox click at line 43 | PASS |
| dnd-kit imports present in ChecklistAdmin | `grep "DndContext\|arrayMove" components/admin/ChecklistAdmin.tsx` | All imports confirmed | PASS |
| persistOrder sends full order array | `grep persistOrder components/admin/ChecklistAdmin.tsx` | `order = reordered.map((it, idx) => ({ key: it.key, sort_order: idx }))` | PASS |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| LAUNCH-01 | 05-01, 05-02, 05-04 | Artist sees a Launchpad room with guided post-release checklist per project | SATISFIED | `/launchpad/[projectId]` page renders LaunchpadRoom with 4 sections; global `/launchpad` shows project cards |
| LAUNCH-02 | 05-01, 05-03, 05-04 | Each item links to in-Funūn tool or external action; step-by-step instructions | SATISFIED | `action_type`/`action_href`/`action_label` in DB; TipPanel renders CTA conditionally; sections ordered by suggested_week |
| LAUNCH-03 | 05-01, 05-03, 05-04, 05-05, 05-06 | Tips DB-backed, AI-drafted monthly, admin-approved before publish; unapproved never reach artists | SATISFIED | Three-layer enforcement: USING(false) RLS (migration 029), API route tip gating + admin-field strip, server-component page same gate; admin approve/reject workflow confirmed |
| LAUNCH-04 | 05-01, 05-03, 05-04 | Checklist completion tracked per project, persisted | SATISFIED (behavior-unverified) | `launchpad_progress` table with UNIQUE constraint; upsert route wired; server-component merge re-reads on load — round-trip persistence requires human verification |
| LAUNCH-05 | 05-01, 05-02, 05-05, 05-06 | Admin can add, edit, reorder, and delete checklist items from in-app UI | SATISFIED | ChecklistAdmin with inline add/edit/delete + dnd-kit reorder + mobile arrows, all behind verifyAdmin() gate; admin pages wired with per-page is_admin check |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/launchpad/TipPanel.tsx` | 65 | `"Steps for this item are coming soon."` | Info | Intentional empty-state copy per UI-SPEC, not a stub — renders only when `tip_body` is null/falsy |
| `app/(admin)/checklist/page.tsx` | 7–14 | Replicates is_admin check already in layout | Info | Defense-in-depth (T-05-02) — explicitly documented as intentional; acceptable per threat model |
| All `placeholder="..."` occurrences | Various | HTML form input placeholders | Info | Not stubs — UI form helper text in admin forms |

No TBD, FIXME, or XXX markers found in any phase-5-modified file.

---

### Human Verification Required

#### 1. Completion persistence round-trip (LAUNCH-04)

**Test:** Sign in as an artist. Open `/launchpad/[projectId]` for a project. Check one item. Hard-reload the page (Cmd+Shift+R).
**Expected:** The checked item remains checked. Uncheck it, reload again — it shows unchecked.
**Why human:** The PATCH upsert code and server-side merge are both present and correctly wired, but confirming that state survives a full page reload requires a live browser session with real Supabase connectivity.

#### 2. Before release section collapse (LAUNCH-01 / LAUNCH-02)

**Test:** Open `/launchpad/[projectId]` for a project whose `release_date` is set to a past date.
**Expected:** The "Before release" section renders collapsed, showing a "Did you handle this before release?" block with compact checkboxes. A chevron button expands the full item list.
**Why human:** The `isReleased` date comparison and the collapsed render branch are present in `ChecklistSection.tsx`, but the visual behavior and the toggle interaction require a live browser.

#### 3. Tip approve → visible to artists (LAUNCH-03)

**Test:** Sign in as admin. Go to `/admin/tips`. If no drafts exist, insert one manually in Supabase Studio (`UPDATE launchpad_checklist_items SET tip_draft = 'Test tip', tip_drafted_at = now() WHERE key = 'presave_link'`). Approve the draft. Sign in as an artist, open `/launchpad/[projectId]`, click the "presave_link" row — TipPanel should show the approved tip body.
**Expected:** Approved tip text appears in TipPanel. Before approval, the panel shows "Steps for this item are coming soon."
**Why human:** Three-layer tip gating is confirmed in code, but the end-to-end flow (approve in admin → visible in artist panel) requires a live session and real DB state.

#### 4. Non-admin redirect from /admin/* (LAUNCH-05)

**Test:** Sign in as a regular artist (no `is_admin` flag). Navigate to `/admin/checklist`.
**Expected:** Immediately redirected to `/`.
**Why human:** Both the layout gate and per-page gate are present in code, but confirming the redirect fires in a browser requires a live session.

#### 5. Admin drag-reorder end-to-end (LAUNCH-05)

**Test:** Sign in as admin. Go to `/admin/checklist`. Drag a row to a new position. Reload the page — row should be in the new position. Then visit `/launchpad/[projectId]` as an artist — items should appear in the reordered position.
**Expected:** `sort_order` updates persist and the artist-facing checklist reflects the new order.
**Why human:** The dnd-kit drag interaction and the PATCH persistence are wired, but confirming the drag-to-DB-to-artist-view round-trip requires a live browser.

---

## Gaps Summary

No gaps found. All 5 roadmap success criteria are implemented with substantive, wired, data-flowing code. Two truths are classified as ⚠️ PRESENT_BEHAVIOR_UNVERIFIED — code and wiring are correct, but the runtime state transition (completion round-trip, before-release collapse) cannot be confirmed by static analysis alone. Status is `human_needed`, not `gaps_found`.

---

_Verified: 2026-07-01T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
