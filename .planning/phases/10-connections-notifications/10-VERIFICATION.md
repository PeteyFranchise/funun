---
phase: 10-connections-notifications
verified: 2026-07-13T08:14:36Z
status: passed
score: 16/16 truths verified after UAT
behavior_unverified: 0
overrides_applied: 0
requirements_coverage:
  CONNECT-01: satisfied
  CONNECT-02: satisfied
  NOTIF-01: satisfied (phase-10 scope: 6 of 8 event types; message_request/new_dm are Phase 11)
  NOTIF-02: satisfied
  NOTIF-03: satisfied
behavior_unverified_items: []
human_verification: []
quality_signals:
  code_review: "CR-01 email HTML escaping is fixed. WR-04 duplicate accept notification is fixed with a pending-state PATCH guard and route regression test. UAT-specific failures (Follow visual weight, timestamp-tie pagination) are fixed and retested."
---

# Phase 10: Connections & Notifications Verification Report

**Phase Goal:** Members can build an explicit graph — follow one-way or send a mutual Connect request — and get told when something happens to them, via a bell with an accurate unread count.
**Verified:** 2026-07-13
**Status:** passed
**Re-verification:** Yes — live-backend UAT completed; two UAT failures fixed and retested

## Goal Achievement

The phase goal decomposes into three capabilities: (1) follow one-way, (2) send/accept/decline a mutual Connect request, (3) a notifications bell with an accurate unread count and a mark-all-read panel. Every supporting artifact exists, is substantive (no stubs), is wired, and — where it renders dynamic data — has a real data source flowing through it. The automated gate is green after the UAT fixes: `npm test -- --runInBand` 93/93, `npx tsc --noEmit` clean, and `npm run build` compiles successfully.

Live-backend browser UAT executed the 8 behavior-dependent truths that previously routed to human verification. Two failures were found: Follow used primary gradient styling and notification pagination skipped same-timestamp rows. Both were fixed, retested, and recorded in `10-UAT.md`. Phase 10 is now passed.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Pure per-type notification builders (6 phase-owned) return correctly-shaped payloads (title/link/actor) | ✓ VERIFIED | `lib/social/notifications.ts` (194 lines) + `__tests__/notification-triggers.test.ts` GREEN; titles/links match UI-SPEC verbatim |
| 2 | Connect request/respond/withdraw builders enforce transitions + 200-char note validation before any write | ✓ VERIFIED | `lib/social/connections.ts` + `__tests__/connections.test.ts` GREEN |
| 3 | createNotification() + Notification type carry actor_id/actor_name/actor_avatar_url | ✓ VERIFIED | `lib/notifications/index.ts` insert + `types/index.ts`; tsc clean |
| 4 | Migration 044 adds note CHECK(<=200), no_block() on connections INSERT, auto-follow-seed trigger | ✓ VERIFIED | `044_connections_note.sql` all three blocks present; pushed live + DB-smoke-verified (10-02-SUMMARY) |
| 5 | POST/PATCH /api/connections use session client for the transition (RLS split), service client only for cross-user notify | ✓ VERIFIED | `app/api/connections/route.ts`: `createApiClient()` for INSERT/UPDATE, `createServiceClient()` only inside notify try/catch; no follows INSERT |
| 6 | GET /api/notifications returns cursor-paginated list + fresh unread head-count; PATCH scopes mark-all-read to caller | ✓ VERIFIED | `app/api/notifications/route.ts`: `{count:'exact',head:true}`, compound `created_at`/`id` cursor, `.eq('user_id').eq('read',false)` |
| 7 | follows/wall/endorsements/release-comments each fire the correct notification best-effort (never blocking the mutation) | ✓ VERIFIED | All four routes import the right builder + `createServiceClient()` in try/catch AFTER the primary mutation; release-comments resolves `vault_projects.user_id` owner + self-suppress |
| 8 | Follow one-way works (CONNECT-01) | ✓ VERIFIED | `app/api/follows/route.ts` follow branch intact + `FollowButton` rendered in ProfileView visitor row |
| 9 | Accepting a Connect request seeds BOTH follow directions (D-05 trigger) | ✓ VERIFIED (UAT) | Live UAT accepted A→B and C→B requests; DB showed both mutual follow pairs, one connection_accepted per requester, and no new_follower from seeded follows |
| 10 | Bell renders app-wide with live, accurate, COUNT-derived unread badge (NOTIF-02) | ✓ VERIFIED (UAT) | Badge capped at 9+ for 28 unread rows; after mark-all-read, a live wall post incremented B's badge to 1 with no channel-leak console errors |
| 11 | Open panel does not clear badge; Mark all read clears it (D-09, NOTIF-03) | ✓ VERIFIED (UAT) | Opening panel preserved 9+; Mark all read cleared the badge and unread row treatment |
| 12 | Panel inline Accept/Decline on connection_request rows act in place (D-10) | ✓ VERIFIED (UAT) | B accepted C from the panel; row updated in place and panel stayed open |
| 13 | Panel loads 20 + auto-loads older on scroll (D-11) | ✓ VERIFIED (UAT) | Initial timestamp-tie failure fixed with compound cursor; retest loaded from 20 to 29 rows on scroll |
| 14 | ConnectButton three-state + order/skin + note composer + pending persistence + withdraw (D-01/D-03/D-04) | ✓ VERIFIED (UAT) | A sent a note, saw Pending persist after reload, withdrew back to Connect, and retest confirmed Connect gradient + Follow ghost |
| 15 | Addressee inline Accept/Decline on the profile while browsing (D-02) | ✓ VERIFIED (UAT) | B saw A's note callout with inline Accept/Decline and accepted in place |
| 16 | #wall / #endorsements anchors scroll so notification deep-links resolve | ✓ VERIFIED (UAT) | Browser checks confirmed both anchored sections visible below the sticky header |

**Score:** 16/16 truths VERIFIED. No FAILED truths.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `lib/social/notifications.ts` | catalog + 6 builders + mark-all-read filter + compound cursor helper | ✓ VERIFIED | 194 lines; catalog has 8 entries; only connection_request has inlineAction |
| `lib/social/connections.ts` | pure request/transition builders | ✓ VERIFIED | 63 lines; pure (no supabase import) |
| `lib/notifications/index.ts` | createNotification() + actor fields | ✓ VERIFIED | actor_id/name/avatar_url in insert |
| `types/index.ts` | Notification type + actor fields | ✓ VERIFIED | string\|null actor columns |
| `supabase/migrations/044_connections_note.sql` | note + no_block + trigger | ✓ VERIFIED | all three additive blocks; live |
| `app/api/connections/route.ts` | POST + PATCH | ✓ VERIFIED | 160 lines; correct client split |
| `app/api/notifications/route.ts` | GET + PATCH | ✓ VERIFIED | 76 lines; fresh COUNT + compound cursor |
| `app/api/{follows,wall,endorsements,release-comments}/route.ts` | notify side effects | ✓ VERIFIED | all four wired best-effort |
| `components/nav/NotificationBell.tsx` | Realtime + poll + badge | ✓ VERIFIED | 128 lines; stable channel + removeChannel |
| `components/nav/NotificationPanel.tsx` | list + mark-all + inline + pagination | ✓ VERIFIED | 339 lines; timeAgo, no date-fns |
| `components/profile/ConnectButton.tsx` | three-state + composer | ✓ VERIFIED | 298 lines; all states |
| `components/profile/ProfileView.tsx` | mounts ConnectButton + anchors | ✓ VERIFIED | ConnectButton before Follow; #wall/#endorsements |
| `app/u/[handle]/page.tsx` | derives ConnectState | ✓ VERIFIED | pending_out/in/connected derivation from connections |
| `app/(artist)/layout.tsx` | sticky header + bell mounted once | ✓ VERIFIED | `sticky top-0 z-40` header; single mount |

### Key Link Verification

| From | To | Via | Status |
| ---- | --- | --- | ------ |
| connections PATCH | connections table | session client UPDATE (RLS two-policy split) | ✓ WIRED |
| connections accept UPDATE | follows table | migration-044 SECURITY DEFINER trigger (both directions) | ✓ WIRED + UAT VERIFIED |
| NotificationBell | notifications table | Realtime `notifications-${userId}` channel + removeChannel | ✓ WIRED + UAT VERIFIED |
| NotificationBell/Panel | /api/notifications | fetch GET (list+count), PATCH (mark-all) | ✓ WIRED |
| Panel inline actions | /api/connections | PATCH accept/decline | ✓ WIRED |
| ConnectButton | /api/connections | POST request + PATCH withdraw/accept/decline | ✓ WIRED |
| app/u/[handle]/page | ProfileView | derived `connect: ConnectState` prop | ✓ WIRED |
| 4 mutation routes | notifications table | createServiceClient() + createNotification() try/catch | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
| -------- | ------------- | ------ | --------- | ------ |
| NotificationBell | unreadCount | GET /api/notifications fresh COUNT | Yes (live query) | ✓ FLOWING |
| NotificationPanel | list | GET /api/notifications (`select('*')`) | Yes | ✓ FLOWING |
| ConnectButton | state | app/u/[handle]/page `connections` query | Yes (DB-derived) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full unit suite | `npm test -- --runInBand` | 93/93 passing, 14 suites | ✓ PASS |
| Type check | `npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| Production build | `npm run build` | ✓ Compiled successfully | ✓ PASS |
| Notification cursor contract | `npm test -- --runInBand __tests__/notifications-api.test.ts` | 4/4 passing | ✓ PASS |
| Auto-follow-seed trigger (D-05) | Live UAT + DB verification | Two mutual follow pairs, one connection_accepted per requester, no new_follower | ✓ PASS |
| Bell/panel Realtime + interactive | Live browser UAT | Badge, mark-all-read, realtime increment, inline accept, pagination, anchors passed after fixes | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or discovered for this phase. Not a probe-based phase. N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CONNECT-01 | 10-01, 10-04, 10-06 | Follow another member (one-way) | ✓ SATISFIED | follows route + FollowButton intact |
| CONNECT-02 | 10-01, 10-02, 10-03, 10-06 | Send Connect request; accept/decline -> mutual | ✓ SATISFIED | connections route + migration 044 + ConnectButton; UAT accepted via profile and panel |
| NOTIF-01 | 10-01, 10-04 | Notification for follower/connect-req/accepted/comment/endorsement/wall | ✓ SATISFIED (phase scope) | 6 of 8 event types wired; message_request/new_dm are Phase 11 (CONNECT-03/DM) |
| NOTIF-02 | 10-03, 10-05 | Unread bell badge, separate from messages badge | ✓ SATISFIED | NotificationBell is distinct from DmWidget; live count and Realtime badge verified in UAT |
| NOTIF-03 | 10-01, 10-03, 10-05 | View notification panel + mark all read | ✓ SATISFIED | Panel, pagination, inline actions, and mark-all-read verified in UAT |

All 5 declared requirement IDs (CONNECT-01, CONNECT-02, NOTIF-01, NOTIF-02, NOTIF-03) map to phase 10 in REQUIREMENTS.md traceability (all marked Complete) and are accounted for across the 6 plans. No orphaned requirements. No plan declares a requirement absent from REQUIREMENTS.md.

**Scope note on NOTIF-01:** REQUIREMENTS.md NOTIF-01 lists 8 event types including "message request" and "new DM". Those two depend on the messaging feature (CONNECT-03/CONNECT-05/PRESENCE), which REQUIREMENTS.md maps to Phase 11. Phase 10 correctly delivers the 6 event types it owns (new_follower, connection_request, connection_accepted, release_comment, endorsement, wall_post) and the extensible catalog is documented to append message_request/new_dm in Phase 11. This is scope-correct, not a gap. ROADMAP Success Criterion 2 lists the same 8 — its message_request/new_dm portion is deferred to Phase 11 by design.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| ProfileView.tsx | 262/284/291 | `title="… coming soon"` on disabled fallback buttons | ℹ️ Info | NOT phase-10 stubs: Analytics is owner-side + explicitly out-of-scope (REQUIREMENTS.md); Follow/Message "coming soon" render only as `!follow`/`!dm` fallbacks (e.g. signed-out). The real ConnectButton/FollowButton/DmWidget render in the visitor branch. No debt marker (TBD/FIXME/XXX) in any phase-modified file. |

No `TBD`/`FIXME`/`XXX` debt markers in any of the 16 phase-modified files. No stub returns, no hardcoded-empty rendered data, no orphaned artifacts.

### Human Verification

Complete. See `10-UAT.md` for the full 8-test live-backend UAT record. No behavior-dependent truths remain unverified.

### Quality Signal (10-REVIEW.md)

The code review originally found 1 Critical + 6 Warning + 4 Info. The two highest-priority notification accuracy/security items are now fixed:
- **CR-01 (Critical):** HTML injection into notification emails — fixed in `lib/notifications/index.ts` by escaping user-controlled title/body content before templating email HTML.
- **WR-04 (Warning):** Repeat accept PATCH can emit a duplicate `connection_accepted` notification — fixed in `app/api/connections/route.ts` by adding `.eq('status', 'pending')` to the transition update; covered by `__tests__/connections-route.test.ts`.

No open Phase 10 review item blocks merging this PR.

### Gaps Summary

No gaps. Every must-have artifact exists, is substantive, is wired, and (for dynamic-data artifacts) has real data flowing. The automated gate is fully green (93/93 tests, clean tsc, successful build). Migration 044 is live, was DB-smoke-verified during execution, and the end-to-end accept path passed live UAT. Requirement coverage is complete for the phase's scope, with the message_request/new_dm portion of NOTIF-01 correctly deferred to Phase 11.

Status: **passed**.

---

_Verified: 2026-07-13_
_Verifier: Claude (gsd-verifier)_
