---
phase: 15-account-capability-model
plan: "04"
subsystem: admin-approval-queue
tags: [admin, capabilities, d-03, d-11]
status: complete
dependency_graph:
  requires:
    - "Plan 02 — POST /api/capabilities/approve/[grantId] (admin-gated approve/deny with badge auto-attach)"
  provides:
    - "/admin/capability-requests — in-app admin approval queue completing the D-01/D-03 request-to-approve loop"
  affects: []
tech_stack:
  added: []
  patterns:
    - "Per-page is_admin re-verification copied verbatim from admin/members/page.tsx (T-05-02 doctrine — layout gating alone is never the authority decision)"
    - "Optimistic list removal + actionError banner pattern from MembersAdmin.tsx"
    - "role_slugs rendered via industryRoleLabel() as read-only chips — no toggle picker in the admin queue (D-11: badge already chosen at request time)"
key_files:
  created:
    - "app/(admin)/admin/capability-requests/page.tsx"
    - "components/admin/CapabilityRequestsAdmin.tsx"
  modified: []
decisions:
  - "Requester identity (artist_name, email) is attached per-row exactly like admin/members/page.tsx — artist_profiles.artist_name via createServiceClient plus service.auth.admin.getUserById() for email, since capability_grants itself carries neither."
  - "No role-edit chip picker in the queue — role_slugs display only, matching the plan's explicit instruction (D-11 / RESEARCH Open Question 3): the badge was already chosen at request time by CapabilityCta (Plan 03), so admin override UI is out of scope."
metrics:
  duration: "~10 minutes"
  completed_date: "2026-07-12"
  tasks_completed: 2
  files_changed: 2
---

# Phase 15 Plan 04: Admin Capability-Request Approval Queue Summary

`/admin/capability-requests` gives admins an in-app queue of pending artist→industry capability requests, closing the D-01/D-03 loop that Plan 02's routes and Plan 03's `CapabilityCta` opened. The page re-verifies `is_admin` server-side (mirroring `/admin/members` exactly) and loads pending grants with the requester's identity and pre-picked role badges attached; the client component renders each as a card with read-only badges and Approve/Deny buttons wired to Plan 02's approve route, removing the row optimistically on success.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Admin capability-requests page (server, admin-gated) | `8e00a5a` | `app/(admin)/admin/capability-requests/page.tsx` |
| 2 | CapabilityRequestsAdmin component (approve/deny queue) | `8e00a5a` | `components/admin/CapabilityRequestsAdmin.tsx` |

Both tasks landed in a single commit — the page and its client component were built together and verified as one changeset before committing.

## Key Artifacts

### `app/(admin)/admin/capability-requests/page.tsx`

Per-page admin gate copied verbatim from `admin/members/page.tsx`:

```typescript
if (!user) redirect('/signin')
const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
if (!isAdmin) redirect('/')
```

Loads only pending grants, oldest first:

```typescript
const { data: grants } = await service
  .from('capability_grants')
  .select('id, profile_id, capability, role_slugs, requested_at')
  .eq('status', 'pending')
  .order('requested_at', { ascending: true })
```

Attaches `artist_name` (from `artist_profiles`) and `email` (via `service.auth.admin.getUserById`) per row, shaping each into a `CapabilityRequest`.

### `components/admin/CapabilityRequestsAdmin.tsx`

```typescript
export type CapabilityRequest = {
  grantId: string; profileId: string; artistName: string | null
  email: string; capability: 'artist' | 'industry'
  roleSlugs: string[]; requestedAt: string
}
```

Each card shows the requester, requested date, requested capability, and read-only role badges (`industryRoleLabel(slug)`). Approve/Deny POST `{ decision }` to `/api/capabilities/approve/${grantId}`; success removes the row from local state, failure surfaces `actionError` via a dismissible banner. Empty state: "No pending capability requests."

## Verification Status

| Check | Status | Notes |
|-------|--------|-------|
| Page re-verifies `is_admin`, redirects non-admins | PASS | |
| Page loads only `status = 'pending'`, ordered by `requested_at` ascending | PASS | |
| Component POSTs `{ decision }` to `/api/capabilities/approve/[grantId]` | PASS | |
| role_slugs render read-only (no chip-toggle picker) | PASS | Confirmed via grep — zero `toggleRole` calls in this component |
| Empty state renders when list is empty | PASS | |
| `npx tsc --noEmit` | PASS | Zero errors project-wide |

## Deviations from Plan

None — both tasks executed exactly as specified.

## Manual-Only Verifications (per 15-VALIDATION.md)

- [ ] As an admin, load `/admin/capability-requests`, approve a pending artist→industry request, and confirm: (a) the row disappears from the queue, (b) the target account's industry capability becomes `'approved'` in `capability_grants`, and (c) the pre-picked role badge attaches to their `artist_profiles.roles`.
- [ ] Deny a pending request and confirm it disappears from the queue with no badge attached and `status` set to `'denied'`.
- [ ] As a non-admin, attempt to load `/admin/capability-requests` directly and confirm redirect to `/`.

## Known Stubs

None — both files are fully wired to Plan 02's live approve route and `capability_grants` table.

## Threat Flags

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-15-13: non-admin loading the approval queue page | Per-page `is_admin` re-verification with `redirect('/')`, copied verbatim from `admin/members/page.tsx` | MITIGATED |
| T-15-14: non-admin calling the approve route directly, bypassing this UI | `verifyAdmin()` is the approve route's first line (Plan 02) — this UI is not the security boundary | MITIGATED (by Plan 02) |
| T-15-15: requester email/identity exposed to a non-admin | Email attached server-side via `service.auth.admin.getUserById` behind the `is_admin` gate; a non-admin never reaches the page load | MITIGATED |

## Self-Check: PASSED

- [x] `app/(admin)/admin/capability-requests/page.tsx` — found, admin-gated, loads pending grants
- [x] `components/admin/CapabilityRequestsAdmin.tsx` — found, POSTs to approve route, read-only badges, empty state
- [x] Commit `8e00a5a` — found in git log
- [x] `npx tsc --noEmit` — zero errors project-wide
