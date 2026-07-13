---
phase: 10-connections-notifications
verified: 2026-07-12T00:00:00Z
status: human_needed
score: 11/11 must-haves verified (structural); 8 behavior-dependent truths route to human UAT
behavior_unverified: 8
overrides_applied: 0
requirements_coverage:
  CONNECT-01: satisfied
  CONNECT-02: satisfied
  NOTIF-01: satisfied (phase-10 scope: 6 of 8 event types; message_request/new_dm are Phase 11)
  NOTIF-02: satisfied (structural — live badge accuracy routes to UAT)
  NOTIF-03: satisfied (structural — panel + mark-all-read behavior routes to UAT)
behavior_unverified_items:
  - truth: "Accepting a Connect request seeds BOTH follow directions atomically via the migration-044 SECURITY DEFINER trigger (D-05)"
    test: "With two accounts A and B: A sends B a Connect request, B accepts. Then check follower/following on both profiles."
    expected: "A follows B AND B follows A (two follows rows seeded by connections_on_accept), and exactly one connection_accepted notification reaches A. No new_follower notifications fire for the seeded rows."
    why_human: "The trigger is a DB-level state-transition invariant; no Jest test exercises it (pure-builder tests only). Migration is live + DB-smoke-verified during 10-02 execution, but the end-to-end app path (route UPDATE -> trigger -> follows) is not covered by any automated test."
  - truth: "The notification bell renders app-wide with a live, accurate unread badge via Realtime + poll (NOTIF-02)"
    test: "Sign in; navigate dashboard/vault/a profile. From a second account, follow / send a connect request / post on the wall. Watch the bell."
    expected: "Header row + bell render on every authenticated route; badge increments within ~25s (or instantly via Realtime) to the correct count, capped 9+ at >=10; browser console shows NO TooManyChannels error after navigating."
    why_human: "Browser + Supabase Realtime behavior; no E2E runner exists (VALIDATION.md). Presence of stable channel name + removeChannel cleanup is confirmed in code, but live subscription behavior is not machine-verifiable here."
  - truth: "Opening the bell panel does NOT clear the badge; Mark all read is the explicit clear (D-09, NOTIF-03)"
    test: "Click the bell to open the panel, observe the badge; then click Mark all read."
    expected: "Badge persists on open; clicking Mark all read clears the badge to nothing and rows lose the unread treatment."
    why_human: "Interactive state behavior; no E2E runner."
  - truth: "connection_request rows carry inline Accept/Decline that act in place (D-10)"
    test: "On a connection-request row in the panel, click Accept."
    expected: "Row updates in place (inline buttons gone, title reflects accepted) without closing the panel or navigating; requester's Connect button reads Connected."
    why_human: "Interactive panel behavior; no E2E runner."
  - truth: "The panel loads 20 recent notifications and auto-loads older ones on scroll (created_at-cursor, D-11)"
    test: "Seed >20 notifications; scroll the panel list to the bottom."
    expected: "Older notifications auto-load (Loading… briefly) with no duplicates or skips."
    why_human: "IntersectionObserver scroll behavior against a live paginated endpoint; no E2E runner."
  - truth: "ConnectButton shows three visible actions in order Connect/Follow/Message with Connect as primary CTA and reflects real DB state incl. pending persistence and withdraw (D-01/D-03)"
    test: "On B's profile as A: confirm order + skin; click Connect, add a note (n/200 counter), Send request -> Pending; reload -> Pending persists; hover -> reads Withdraw (neutral); click -> reverts to Connect."
    expected: "Order Connect/Follow/Message; Connect gradient, Follow ghost; Pending persists across reload (state from DB); Withdraw reverts; no rose styling."
    why_human: "Interactive lifecycle + DB-derived state persistence; no E2E runner."
  - truth: "The addressee sees inline Accept/Decline on the profile (with the note above them) while browsing (D-02)"
    test: "As B (addressee of a pending inbound request), open A's profile."
    expected: "Inline Accept/Decline render in place with the requester's note shown above them when present; Accept establishes the connection."
    why_human: "Interactive addressee path + DB state derivation; no E2E runner."
  - truth: "The #wall and #endorsements deep-link anchors scroll to their sections so notification links resolve"
    test: "Visit /u/{handle}#wall and /u/{handle}#endorsements."
    expected: "The page scrolls to the Wall and Endorsements sections respectively (scroll-mt offset keeps them clear of the sticky header)."
    why_human: "Browser anchor-scroll behavior; no automated check."
human_verification:
  - test: "Auto-follow-seed on accept (D-05): A requests, B accepts; check both follow directions + single connection_accepted notification"
    expected: "Two follows rows (A->B and B->A) seeded by the trigger; exactly one connection_accepted notification to A; no new_follower for the seeded rows"
    why_human: "DB-level trigger invariant, no automated end-to-end test; migration live + DB-smoke-verified in 10-02"
  - test: "Bell renders app-wide, badge live + accurate, no TooManyChannels after navigating"
    expected: "Header row + bell on every authenticated route; correct count within ~25s or instant via Realtime; no console channel-leak error"
    why_human: "Browser + Realtime, no E2E runner (VALIDATION.md)"
  - test: "Open panel does not clear badge; Mark all read clears it"
    expected: "Badge persists on open; Mark all read clears badge + unread row treatment"
    why_human: "Interactive behavior, no E2E runner"
  - test: "Panel inline Accept/Decline on connection_request rows act in place"
    expected: "Row updates in place, panel stays open, no navigation"
    why_human: "Interactive behavior, no E2E runner"
  - test: "Panel loads 20 + cursor-paginates older on scroll"
    expected: "Older notifications auto-load without duplicates/skips"
    why_human: "IntersectionObserver + live pagination, no E2E runner"
  - test: "ConnectButton order/skin, note composer, Pending persistence, Withdraw"
    expected: "Order Connect/Follow/Message; Connect gradient, Follow ghost; note composer with n/200; Pending persists on reload; Withdraw reverts (neutral)"
    why_human: "Interactive lifecycle + DB-derived state, no E2E runner"
  - test: "Addressee inline Accept/Decline on the profile (D-02) with note callout"
    expected: "Inline actions render in place with note shown; Accept establishes connection"
    why_human: "Interactive addressee path, no E2E runner"
  - test: "#wall / #endorsements anchors scroll to sections"
    expected: "Page scrolls to Wall / Endorsements sections"
    why_human: "Browser anchor-scroll, no automated check"
quality_signals:
  code_review: "10-REVIEW.md — 1 Critical (CR-01 HTML injection into notification emails, lib/notifications/index.ts), 6 Warning, 4 Info. Advisory; does not by itself fail phase-goal verification. Recommend closing CR-01 (email HTML escaping) and WR-04 (double-accept fires a second connection_accepted notification) before ship."
---

# Phase 10: Connections & Notifications Verification Report

**Phase Goal:** Members can build an explicit graph — follow one-way or send a mutual Connect request — and get told when something happens to them, via a bell with an accurate unread count.
**Verified:** 2026-07-12
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal decomposes into three capabilities: (1) follow one-way, (2) send/accept/decline a mutual Connect request, (3) a notifications bell with an accurate unread count and a mark-all-read panel. Every supporting artifact exists, is substantive (no stubs), is wired, and — where it renders dynamic data — has a real data source flowing through it. The full automated gate is green: `npm test` 80/80, `npx tsc --noEmit` clean (exit 0), `npm run build` compiles successfully.

Because the goal's correctness hinges on runtime behaviors that no automated test in this project can exercise (a DB trigger's state-transition invariant, and Realtime/interactive UI behaviors — VALIDATION.md confirms no E2E runner exists), 8 behavior-dependent truths are PRESENT_BEHAVIOR_UNVERIFIED and route to human UAT. The code is present and wired for every one of them; the runtime invariant is what needs a human. This is the intended `workflow.human_verify_mode = end-of-phase` path: plans 10-02, 10-05, and 10-06 each deferred a `checkpoint:human-verify` into their SUMMARY, harvested here.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Pure per-type notification builders (6 phase-owned) return correctly-shaped payloads (title/link/actor) | ✓ VERIFIED | `lib/social/notifications.ts` (181 lines) + `__tests__/notification-triggers.test.ts` GREEN; titles/links match UI-SPEC verbatim |
| 2 | Connect request/respond/withdraw builders enforce transitions + 200-char note validation before any write | ✓ VERIFIED | `lib/social/connections.ts` + `__tests__/connections.test.ts` GREEN |
| 3 | createNotification() + Notification type carry actor_id/actor_name/actor_avatar_url | ✓ VERIFIED | `lib/notifications/index.ts` insert + `types/index.ts`; tsc clean |
| 4 | Migration 044 adds note CHECK(<=200), no_block() on connections INSERT, auto-follow-seed trigger | ✓ VERIFIED | `044_connections_note.sql` all three blocks present; pushed live + DB-smoke-verified (10-02-SUMMARY) |
| 5 | POST/PATCH /api/connections use session client for the transition (RLS split), service client only for cross-user notify | ✓ VERIFIED | `app/api/connections/route.ts`: `createApiClient()` for INSERT/UPDATE, `createServiceClient()` only inside notify try/catch; no follows INSERT |
| 6 | GET /api/notifications returns cursor-paginated list + fresh unread head-count; PATCH scopes mark-all-read to caller | ✓ VERIFIED | `app/api/notifications/route.ts`: `{count:'exact',head:true}`, `.lt('created_at',before)`, `.eq('user_id').eq('read',false)` |
| 7 | follows/wall/endorsements/release-comments each fire the correct notification best-effort (never blocking the mutation) | ✓ VERIFIED | All four routes import the right builder + `createServiceClient()` in try/catch AFTER the primary mutation; release-comments resolves `vault_projects.user_id` owner + self-suppress |
| 8 | Follow one-way works (CONNECT-01) | ✓ VERIFIED | `app/api/follows/route.ts` follow branch intact + `FollowButton` rendered in ProfileView visitor row |
| 9 | Accepting a Connect request seeds BOTH follow directions (D-05 trigger) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Trigger present + live; route drives the UPDATE that fires it; no automated end-to-end test of the transition -> see Human Verification |
| 10 | Bell renders app-wide with live, accurate, COUNT-derived unread badge (NOTIF-02) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `NotificationBell` mounted once in layout header; stable channel + removeChannel + fresh-COUNT confirmed in code; Realtime behavior needs human -> UAT |
| 11 | Open panel does not clear badge; Mark all read clears it (D-09, NOTIF-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Panel wires PATCH + onMarkedAllRead; interactive clear needs human -> UAT |
| 12 | Panel inline Accept/Decline on connection_request rows act in place (D-10) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `inlineAction === 'connection_respond'` gate + PATCH /api/connections + stopPropagation present; interactive behavior -> UAT |
| 13 | Panel loads 20 + auto-loads older on scroll (D-11) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | IntersectionObserver + `before=` cursor present; scroll behavior -> UAT |
| 14 | ConnectButton three-state + order/skin + note composer + pending persistence + withdraw (D-01/D-03/D-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | ConnectButton before FollowButton; all states + composer maxLength=200 present; state derived from `connections` in page; interactive lifecycle -> UAT |
| 15 | Addressee inline Accept/Decline on the profile while browsing (D-02) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `pending_in` branch renders inline actions + note callout; interactive -> UAT |
| 16 | #wall / #endorsements anchors scroll so notification deep-links resolve | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `<section id="wall"/endorsements" scroll-mt-[88px]>` present in ProfileView; anchor-scroll -> UAT |

**Score:** 8/8 structural/pure truths VERIFIED; 8 behavior-dependent truths PRESENT_BEHAVIOR_UNVERIFIED (present + wired, routed to UAT). No FAILED truths.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `lib/social/notifications.ts` | catalog + 6 builders + mark-all-read filter | ✓ VERIFIED | 181 lines; catalog has 8 entries; only connection_request has inlineAction |
| `lib/social/connections.ts` | pure request/transition builders | ✓ VERIFIED | 63 lines; pure (no supabase import) |
| `lib/notifications/index.ts` | createNotification() + actor fields | ✓ VERIFIED | actor_id/name/avatar_url in insert |
| `types/index.ts` | Notification type + actor fields | ✓ VERIFIED | string\|null actor columns |
| `supabase/migrations/044_connections_note.sql` | note + no_block + trigger | ✓ VERIFIED | all three additive blocks; live |
| `app/api/connections/route.ts` | POST + PATCH | ✓ VERIFIED | 160 lines; correct client split |
| `app/api/notifications/route.ts` | GET + PATCH | ✓ VERIFIED | 69 lines; fresh COUNT + cursor |
| `app/api/{follows,wall,endorsements,release-comments}/route.ts` | notify side effects | ✓ VERIFIED | all four wired best-effort |
| `components/nav/NotificationBell.tsx` | Realtime + poll + badge | ✓ VERIFIED | 128 lines; stable channel + removeChannel |
| `components/nav/NotificationPanel.tsx` | list + mark-all + inline + pagination | ✓ VERIFIED | 338 lines; timeAgo, no date-fns |
| `components/profile/ConnectButton.tsx` | three-state + composer | ✓ VERIFIED | 298 lines; all states |
| `components/profile/ProfileView.tsx` | mounts ConnectButton + anchors | ✓ VERIFIED | ConnectButton before Follow; #wall/#endorsements |
| `app/u/[handle]/page.tsx` | derives ConnectState | ✓ VERIFIED | pending_out/in/connected derivation from connections |
| `app/(artist)/layout.tsx` | sticky header + bell mounted once | ✓ VERIFIED | `sticky top-0 z-40` header; single mount |

### Key Link Verification

| From | To | Via | Status |
| ---- | --- | --- | ------ |
| connections PATCH | connections table | session client UPDATE (RLS two-policy split) | ✓ WIRED |
| connections accept UPDATE | follows table | migration-044 SECURITY DEFINER trigger (both directions) | ✓ WIRED (behavior -> UAT) |
| NotificationBell | notifications table | Realtime `notifications-${userId}` channel + removeChannel | ✓ WIRED (behavior -> UAT) |
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
| Full unit suite | `npm test` | 80/80 passing, 11 suites | ✓ PASS |
| Type check | `npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| Production build | `npm run build` | ✓ Compiled successfully | ✓ PASS |
| Notification catalog contract | `npx jest -t "NOTIFICATION_TYPES"` | 2 passing | ✓ PASS |
| Auto-follow-seed trigger (D-05) | (no automated test exists) | DB-smoke-verified in 10-02 execution | ? SKIP -> UAT |
| Bell/panel Realtime + interactive | (no E2E runner — VALIDATION.md) | — | ? SKIP -> UAT |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or discovered for this phase. Not a probe-based phase. N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CONNECT-01 | 10-01, 10-04, 10-06 | Follow another member (one-way) | ✓ SATISFIED | follows route + FollowButton intact |
| CONNECT-02 | 10-01, 10-02, 10-03, 10-06 | Send Connect request; accept/decline -> mutual | ✓ SATISFIED | connections route + migration 044 + ConnectButton (accept/decline behavior -> UAT) |
| NOTIF-01 | 10-01, 10-04 | Notification for follower/connect-req/accepted/comment/endorsement/wall | ✓ SATISFIED (phase scope) | 6 of 8 event types wired; message_request/new_dm are Phase 11 (CONNECT-03/DM) |
| NOTIF-02 | 10-03, 10-05 | Unread bell badge, separate from messages badge | ✓ SATISFIED (structural) | NotificationBell (bell) is a distinct component from DmWidget (messages); live accuracy -> UAT |
| NOTIF-03 | 10-01, 10-03, 10-05 | View notification panel + mark all read | ✓ SATISFIED (structural) | panel + mark-all-read route + PATCH; interactive clear -> UAT |

All 5 declared requirement IDs (CONNECT-01, CONNECT-02, NOTIF-01, NOTIF-02, NOTIF-03) map to phase 10 in REQUIREMENTS.md traceability (all marked Complete) and are accounted for across the 6 plans. No orphaned requirements. No plan declares a requirement absent from REQUIREMENTS.md.

**Scope note on NOTIF-01:** REQUIREMENTS.md NOTIF-01 lists 8 event types including "message request" and "new DM". Those two depend on the messaging feature (CONNECT-03/CONNECT-05/PRESENCE), which REQUIREMENTS.md maps to Phase 11. Phase 10 correctly delivers the 6 event types it owns (new_follower, connection_request, connection_accepted, release_comment, endorsement, wall_post) and the extensible catalog is documented to append message_request/new_dm in Phase 11. This is scope-correct, not a gap. ROADMAP Success Criterion 2 lists the same 8 — its message_request/new_dm portion is deferred to Phase 11 by design.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| ProfileView.tsx | 262/284/291 | `title="… coming soon"` on disabled fallback buttons | ℹ️ Info | NOT phase-10 stubs: Analytics is owner-side + explicitly out-of-scope (REQUIREMENTS.md); Follow/Message "coming soon" render only as `!follow`/`!dm` fallbacks (e.g. signed-out). The real ConnectButton/FollowButton/DmWidget render in the visitor branch. No debt marker (TBD/FIXME/XXX) in any phase-modified file. |

No `TBD`/`FIXME`/`XXX` debt markers in any of the 16 phase-modified files. No stub returns, no hardcoded-empty rendered data, no orphaned artifacts.

### Human Verification Required

8 items (all present + wired in code; runtime behavior needs a human because there is no E2E runner and the D-05 seed is a DB-trigger invariant). See `human_verification` and `behavior_unverified_items` frontmatter for the full trigger/expected/why for each:

1. **Auto-follow-seed on accept (D-05)** — A requests, B accepts; verify both follow directions seeded + exactly one connection_accepted notification, no new_follower for seeded rows.
2. **Bell app-wide + live accurate badge + no TooManyChannels** across navigation.
3. **Open panel does not clear badge; Mark all read clears it.**
4. **Panel inline Accept/Decline act in place** (no navigation, panel stays open).
5. **Panel loads 20 + cursor-paginates older on scroll** (no dupes/skips).
6. **ConnectButton order/skin + note composer + Pending persistence + Withdraw.**
7. **Addressee inline Accept/Decline on the profile** (D-02) with note callout.
8. **#wall / #endorsements anchors scroll** to their sections.

### Quality Signal (advisory — 10-REVIEW.md)

The code review found 1 Critical + 6 Warning + 4 Info. These are advisory and do not by themselves fail phase-goal verification, but two are worth closing before ship:
- **CR-01 (Critical):** HTML injection into notification emails — `createNotification()` interpolates attacker-influenced `title`/`body`/`link` (e.g. the connect-request note, actorName) into an HTML email string with no escaping (`lib/notifications/index.ts`). Recommend the escaper fix from the review before this ships to real inboxes.
- **WR-04 (Warning):** A repeat `accept` PATCH on an already-accepted row is not guarded by `status = 'pending'` in the UPDATE, so a double-click can fire a second `connection_accepted` notification (the trigger's `OLD.status='pending'` guard correctly suppresses duplicate follows, but the route's notify has no equivalent guard). Worth closing since it directly affects the "accurate notifications" goal.

These are tracked separately for gap closure or `--fix`; they are recorded here as a quality signal, not as phase-goal gaps.

### Gaps Summary

No gaps. Every must-have artifact exists, is substantive, is wired, and (for dynamic-data artifacts) has real data flowing. The automated gate is fully green (80/80 tests, clean tsc, successful build). Migration 044 is live and was DB-smoke-verified during execution. Requirement coverage is complete for the phase's scope, with the message_request/new_dm portion of NOTIF-01 correctly deferred to Phase 11.

The phase is not `passed` only because 8 behavior-dependent truths (one DB-trigger invariant + seven Realtime/interactive UI behaviors) cannot be machine-verified in this project — no E2E runner exists (VALIDATION.md) — and the `end-of-phase` human-verify workflow deliberately deferred these to UAT. They are surfaced above so the orchestrator can persist them into a UAT file. Status: **human_needed**.

---

_Verified: 2026-07-12_
_Verifier: Claude (gsd-verifier)_
