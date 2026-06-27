---
phase: 01-collaborator-profiles
plan: "04"
subsystem: split-sheet-approval-invite
tags: [split-sheets, approval-loop, tokens, invite, public-pages, email, collaborators]
status: complete

dependency_graph:
  requires:
    - split-sheets-table
    - split-sheet-parties-table
    - collaborators-table
    - collaborator-invites-table
    - generateApprovalToken
    - validateApprovalTotal
    - APPROVAL_TOKEN_EXPIRY_DAYS
    - sendEmail
    - createServiceClient
  provides:
    - POST-api-split-sheets-id-send-for-approval
    - POST-api-approve-token
    - GET-approve-token-page
    - SplitApprovalView-component
    - POST-api-collaborators-id-invite
    - GET-join-inviteToken-page
  affects:
    - split_sheet_parties (approval_token, token_expires_at, approval_status, counter_proposal columns written)
    - split_sheets (status, all_approved_at columns written)
    - collaborator_invites (new rows inserted per invite)

tech_stack:
  added: []
  patterns:
    - Public pages (approve, join) use createServiceClient — ownership verified BEFORE any service-client write
    - Token as sole authenticator for account-less flows — 256-bit hex from generateApprovalToken (Node crypto, zero new deps)
    - Expired/used token state rendered server-side — no redirect to /signin
    - approve POST: only acting party's status mutated, sibling parties preserved (Open Question 3)
    - All-parties-approved check triggers sheet status='approved' and all_approved_at=NOW() atomically
    - 24h cooldown enforced via collaborator_invites table query before insert (Pitfall 4)
    - Educational IPI email pattern: PRO registration links + /signup?invite= CTA

key_files:
  created:
    - app/api/split-sheets/[id]/send-for-approval/route.ts
    - app/api/approve/[token]/route.ts
    - app/approve/[token]/page.tsx
    - components/split-sheets/SplitApprovalView.tsx
    - app/api/collaborators/[id]/invite/route.ts
    - app/join/[inviteToken]/page.tsx
  modified: []

decisions:
  - "Service client is only used AFTER ownership is verified via .eq('initiator_user_id', user.id) — ownership-then-service-client pattern enforced (T-01-12)"
  - "Only the acting party's approval_status changes on counter/approve — other already-approved parties are not reset (D-16 / Open Question 3)"
  - "All-approved check runs inside the approve POST handler immediately after the update, not via a DB trigger — simpler for Phase 1"
  - "24h cooldown for invites checked via collaborator_invites query before insert — returns { ok: true, skipped: true } (not 4xx) to avoid leaking invite state (T-01-15)"
  - "Invite tokens reuse generateApprovalToken from lib/split-sheets/approval.ts — no new token library needed (RESEARCH.md zero-dep constraint)"

metrics:
  duration: "~50 minutes"
  completed: "2026-06-27"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 0
---

# Phase 01 Plan 04: Split-Sheet Approval Loop & Collaborator Invite Summary

**One-liner:** Token-based, account-less split-sheet approval loop (send-for-approval → approve/counter → all-approved auto-status → initiator notification) plus an educational IPI collaborator invite email landing on a public view-only /join profile page, with 24h cooldown and graceful expired-token states throughout.

---

## What Was Built

This plan completes the approval-and-invite slice of COLLAB-03/COLLAB-04 (D-08, D-09, D-15, D-16, D-19). Named parties can now approve or counter a split from a public URL with no Funūn account; an artist can send a collaborator an educational invite that lands on a read-only profile card. Both flows use 256-bit tokens as the sole secret and degrade gracefully when tokens are expired or already used.

### send-for-approval route (`POST /api/split-sheets/[id]/send-for-approval`)

Auth-gated with `createApiClient` + `getUser` (401). Ownership check — `.eq('initiator_user_id', user.id)` — precedes any `createServiceClient` call (T-01-12). `validateApprovalTotal` re-run before sending (T-01-11). For each party row: `generateApprovalToken()` written to `approval_token`, expiry written to `token_expires_at`, status reset to `'pending'`. Sheet status set to `'pending_approval'`. `sendEmail` called per party with the split breakdown and an absolute `/approve/${token}` link. `sendEmail` errors are collected but do not abort the request — returns `{ ok: true, sent: N, failed: [...] }` (email is best-effort; `sendEmail` no-ops safely when unconfigured).

### Public approve page (`/approve/[token]`)

`export const dynamic = 'force-dynamic'`. No auth gate, no redirect to `/signin`. `createServiceClient` looks up the party by `approval_token`. Missing token, `token_expires_at < now`, or `approval_status !== 'pending'` all render the graceful expired-state UI ("This link has expired or has already been used") — not an error page (T-01-13, Pitfall 1). On valid token: fetches all sibling parties (name + split % only — no extra PII per T-01-14) and renders `<SplitApprovalView />`.

### approve POST handler (`POST /api/approve/[token]`)

Public — no auth. Parses `{ action: 'approve' | 'counter', counter_split? }`. Party looked up via service client; rejected if missing, expired, or already-final (T-01-13). On `'approve'`: sets `approval_status='approved'`, `approved_at=NOW()`. On `'counter'`: validates `counter_split ∈ [0, 100]` (400 otherwise, T-01-11), sets `approval_status='countered'`, `counter_proposal=counter_split`. Only the acting party's row is updated — sibling parties are untouched (Open Question 3 / D-16). After approve: checks if ALL parties are now `'approved'`; if so, sets `split_sheets.status='approved'` and `all_approved_at=NOW()`. On counter, sets sheet `status='countered'`. Initiator notified via `sendEmail` in both cases. Returns `{ ok: true, status }`.

### SplitApprovalView component (`components/split-sheets/SplitApprovalView.tsx`)

`'use client'`. Renders: Funūn wordmark, "Split approval request from [Artist]", content card with song name and each party's name/role/% (current party highlighted), running total. Action section: "Approve this split" (bg-grad) — POSTs `{ action:'approve' }`; "Propose a different split" toggle reveals a counter input with "%" suffix and "Submit counter-proposal" button — POSTs `{ action:'counter', counter_split }`. Client-side validates `counter_split` is 0–100 before submit. Button labels are distinct and descriptive per accessibility contract (no generic "Submit"). Server-rendered shell degrades without JS. Error strings match the Copywriting Contract.

### Collaborator invite route (`POST /api/collaborators/[id]/invite`)

Auth-gated. Loads collaborator scoped to `.eq('user_id', user.id)` (404 if not owned). Requires `collaborator.email` (400 if absent). Cooldown check: queries `collaborator_invites` for a row with this `collaborator_id + inviting_user_id` sent within 24h — returns `{ ok: true, skipped: true }` without a new insert or email (T-01-15, Pitfall 4). Otherwise: `generateApprovalToken()`, inserts a `collaborator_invites` row (`status: 'pending'`, `token_expires_at` defaults 30 days via DB), sends the educational IPI email explaining what IPI is, why it matters for royalties, how to register with ASCAP/BMI/SESAC/SOCAN, and includes `/signup?invite=${invite_token}` (D-04, D-08). Returns `{ ok: true }`.

### Public /join page (`/join/[inviteToken]`)

`export const dynamic = 'force-dynamic'`. No auth gate. `createServiceClient` looks up the invite joined to the collaborator record. Missing token or `token_expires_at < now` renders an expired state (T-01-13). Otherwise renders the view-only profile per UI-SPEC: Funūn wordmark, "Your collaborator profile — added by [Artist Name]", content card with name/email/phone/PRO/IPI/publisher as read-only label+value pairs ("—" for absent values). Footer: "Flag a correction" `mailto:` to the inviting artist's email (subject/body per UI-SPEC) and a "Create your Funūn account" link to `/signup` (D-09). No edit controls (self-edit deferred).

---

## Deviations from Plan

None — plan executed exactly as written. Both tasks committed individually and Task 3 checkpoint approved by developer on 2026-06-27:

- `0abfb17`: feat(01-04): send-for-approval route + public approve page + SplitApprovalView
- `c360266`: feat(01-04): collaborator invite route + public /join view-only profile page

---

## Known Stubs

None. All routes, pages, and components are fully wired to live Supabase tables. Email delivery is best-effort (no-ops when Resend is unconfigured) — this is intentional behavior, not a stub.

---

## Threat Surface Scan

All security surfaces were in the plan's threat model. Mitigations applied:

| T-ID | File | Status |
|------|------|--------|
| T-01-10 (Spoofing) | /approve/[token], /join/[inviteToken] | Mitigated — 256-bit `crypto.randomBytes(32)` tokens; token is CSRF defense for account-less forms |
| T-01-11 (Tampering) | POST /api/approve/[token] | Mitigated — server re-validates `counter_split ∈ [0,100]`; already-final tokens rejected |
| T-01-12 (Elevation) | send-for-approval service-client writes | Mitigated — `.eq('initiator_user_id', user.id)` BEFORE any `createServiceClient` call |
| T-01-13 (Stale reuse) | approve + join public pages | Mitigated — `token_expires_at` checked on every render and POST; used/final tokens render expired state |
| T-01-14 (Info Disclosure) | /approve page | Mitigated — exposes only name + split % of other parties; no extra PII |
| T-01-15 (DoS) | collaborator invite route | Mitigated — 24h cooldown per collaborator+artist pair |

No new security surfaces beyond the plan's threat model.

---

## Self-Check: PASSED

**Files exist:**
- app/api/split-sheets/[id]/send-for-approval/route.ts: FOUND
- app/api/approve/[token]/route.ts: FOUND
- app/approve/[token]/page.tsx: FOUND
- components/split-sheets/SplitApprovalView.tsx: FOUND
- app/api/collaborators/[id]/invite/route.ts: FOUND
- app/join/[inviteToken]/page.tsx: FOUND

**Commits exist:**
- 0abfb17: feat(01-04): send-for-approval route + public approve page + SplitApprovalView
- c360266: feat(01-04): collaborator invite route + public /join view-only profile page

**Task 3 checkpoint:** Approved by developer on 2026-06-27.

**Build:** green (TypeScript and lint clean after both tasks)
**Acceptance checks:** all criteria passed per plan (token generation, ownership-before-service-client, expired-state rendering, counter re-validation, all-approved auto-flip, invite 24h cooldown, view-only /join)
