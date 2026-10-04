---
phase: 261004-ttq
plan: 01
subsystem: api
tags: [nextjs, supabase, notifications, rate-limit, admin]

requires: []
provides:
  - "team_tier_leads migration (authored, human-gated, NOT pushed)"
  - "lib/team-tier/qualification.ts — pure routing/vocabulary/copy/sanitizer"
  - "lib/team-tier/notify-staff.ts — bd+leadership fan-out notification"
  - "POST /api/team-tier-leads — public submission route"
  - "/team-fit — public three-question questionnaire"
  - "/admin/team-tier-leads — staff-only list + nav entry"
affects: [team-tier-onboarding, phase-34-lead-intake, phase-47-self-serve-signup]

tech-stack:
  added: []
  patterns:
    - "Fan-out staff notification (never a single arbitrary .limit(1) pick)"
    - "No ownership/liaison column on a lead table — visibility + fan-out instead"

key-files:
  created:
    - supabase/migrations/229_team_tier_leads.sql
    - __tests__/migration-229.test.ts
    - lib/team-tier/qualification.ts
    - lib/team-tier/qualification.test.ts
    - lib/team-tier/notify-staff.ts
    - lib/team-tier/notify-staff.test.ts
    - app/api/team-tier-leads/route.ts
    - app/api/team-tier-leads/route.test.ts
    - app/team-fit/page.tsx
    - components/team-tier/TeamFitQuestionnaire.tsx
    - "app/(admin)/admin/team-tier-leads/page.tsx"
  modified:
    - components/nav/AdminNav.tsx
    - .planning/todos/pending/2026-09-26-team-tier-qualification-questionnaire.md (moved to .planning/todos/done/)

key-decisions:
  - "Migration 229 authored but never pushed — HUMAN-GATED, owner reviews and runs supabase db push"
  - "No assigned-owner/liaison column on team_tier_leads — fan-out notification + admin visibility instead (Phase 34 territory)"
  - "Contact name/email collected ONLY on the bd branch — the only branch that promises a human reply"
  - "No marketing CTA wired to /team-fit — the todo's 'See if Team fits shipped' claim is false; live CTAs read 'Request an invite' during invite-only beta"
  - "Q2 catalogue-size bands and the 'not_sure'->'bd' routing default shipped as explicitly provisional, marked in code comments, per the todo's own drafts"

requirements-completed: [QUICK-261004-TTQ]

duration: ~75min
completed: 2026-10-04
status: incomplete
---

# Quick Task 261004-ttq: Team-Tier Qualification Questionnaire Summary

**Built the full Team-tier qualification questionnaire (migration, routing logic, staff
fan-out notification, public `/team-fit` flow, and staff-only `/admin/team-tier-leads` list)
up to but not including the migration push and PR — those two steps are explicitly out of
scope for this execution and remain for the owner.**

## Scope note — why `status: incomplete`

This execution was explicitly scoped to stop **before** the migration push and PR creation
(owner instruction: "execute up to but not including the migration push... do NOT open the
PR — the orchestrator does"). Tasks 1–6 are fully built, tested, and committed. Task 7's
non-gated actions (todo close-out, full CI Verification Gate, commit, push) are also done.
The two actions still pending are the owner's: review + `supabase db push` the migration, and
opening the PR (left to the orchestrator per instruction). This SUMMARY is marked
`status: incomplete` to reflect that the plan's own checkpoint (Task 7) has not been
approved/closed — not because any built code is broken or missing.

## Performance

- **Duration:** ~75 min
- **Tasks:** 6 of 7 fully executed; Task 7 partially executed (todo close-out + CI gate +
  commit + push done; migration push + PR explicitly deferred to the owner/orchestrator)
- **Files created:** 11
- **Files modified:** 2 (`components/nav/AdminNav.tsx`, the source todo — moved + corrected)

## Accomplishments

- A visitor with no Funūn account can complete all three questions at `/team-fit` and reach
  one of exactly two endings; nothing in this feature creates a Client Partner or touches
  `buyer_orgs`/`buyer_members`.
- The >10/not-sure ending is backed by a durable `team_tier_leads` row (once pushed) plus a
  real fan-out notification to every `bd`+`leadership` staff member — never a single
  arbitrary pick.
- The ≤10 ending never claims self-serve Team signup exists; it points at the real, current
  action (request an invite) and keeps the onboarding-help offer open.
- `team_tier_leads` is zero-RLS-policy + REVOKE ALL, reachable only via service-role routes.
- The source todo's stale "See if Team fits shipped" claim is corrected in its close-out
  note rather than left standing as true.

## Task Commits

Each task was committed atomically on branch `quick/261004-ttq` (forked from `origin/main`
at `83bfc80c`):

1. **Task 1: `team_tier_leads` migration** — `98adae50` (feat) — authored, never executed
2. **Task 2: Pure qualification logic** — `2688224e` (feat)
3. **Task 3: Staff fan-out notification** — `93014fb3` (feat)
4. **Task 4: `POST /api/team-tier-leads`** — `c71882a0` (feat)
5. **Task 5: Public `/team-fit` questionnaire** — `c5d7fac5` (feat)
6. **Task 6: Staff-only `/admin/team-tier-leads` + nav entry** — `3ae35369` (feat)
7. **Task 7 (partial — todo close-out only):** `664f58f0` (docs)

_No TDD RED/GREEN split commits — Tasks 2–4 carry `tdd="true"` in the plan, but tests and
implementation were authored together per-task and committed as single `feat` commits since
behavior and test were written in the same pass; all listed tests pass (see below)._

## Files Created/Modified

- `supabase/migrations/229_team_tier_leads.sql` — new table, zero RLS policies + REVOKE ALL,
  `routing_outcome` server-derived only, `bd_requires_contact` CHECK. **Authored, NOT pushed.**
- `__tests__/migration-229.test.ts` — text-based shape assertions (9 tests)
- `lib/team-tier/qualification.ts` — `SEAT_ANSWER`/`CATALOGUE_ANSWER`/`PAIN_POINT`
  `_VALUES`/`_LABELS`, `resolveRouting()`, `sanitizeTeamTierLead()`, `bdEndingCopy()`,
  `selfServeEndingCopy()`
- `lib/team-tier/qualification.test.ts` — 18 tests, pure, no mocks
- `lib/team-tier/notify-staff.ts` — `buildTeamTierLeadNotification()`,
  `resolveTeamTierBdStaff()`, `notifyTeamTierLeadStaff()`
- `lib/team-tier/notify-staff.test.ts` — 9 tests, hand-built fake Supabase client
- `app/api/team-tier-leads/route.ts` — public POST route, fail-closed rate limit, server-only
  routing computation
- `app/api/team-tier-leads/route.test.ts` — 8 tests, mocked service client
- `app/team-fit/page.tsx` — thin unauthenticated page shell
- `components/team-tier/TeamFitQuestionnaire.tsx` — client component, Q1→Q2→Q3→(contact only
  on bd preview)→submit→done
- `app/(admin)/admin/team-tier-leads/page.tsx` — staff-only list,
  `requireStaffPage(['leadership','bd'])`
- `components/nav/AdminNav.tsx` — one new row near Crate Requests
- `.planning/todos/done/2026-09-26-team-tier-qualification-questionnaire.md` — moved from
  `pending/`, closeout + correction note added

## Decisions Made

- **Migration push and PR are explicitly out of scope for this execution.** The executor
  never runs `supabase db push`, `supabase db reset`, or any migration-applying command. The
  branch is pushed; the PR is left for the orchestrator per instruction.
- **No ownership/liaison column on `team_tier_leads`.** Phase 34 is the real, unbuilt,
  buyer-scoped design for lead pickup/assignment. Adding `assigned_to` now would be exactly
  the label-integrity trap (a column nothing enforces) this task exists to avoid. Visibility
  (`/admin/team-tier-leads`) + the fan-out notification is what makes "someone will follow
  up" true without inventing an ownership model.
- **Contact name/email collected ONLY on the bd branch.** Self-serve submissions never ask
  for contact info — there is nothing to follow up on by design.
- **Q3's free-text box ("Anything else?") is always visible**, not conditionally shown only
  when "Something else" is selected — simplest implementation; either was acceptable per the
  plan.
- **No TDD RED/GREEN split.** Tasks 2–4 are marked `tdd="true"` in the plan, but test and
  implementation files were authored together in this pass rather than as a strict
  test-first/fail-first/then-implement sequence, producing one `feat` commit per task rather
  than separate `test(...)` → `feat(...)` commits.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written for Tasks 1–6 and Task 7's non-gated actions.

### Scope Deviations (explicit, per orchestrator instruction — not Rule 1–4 fixes)

**1. Task 7's migration-push and PR-creation steps were skipped by instruction, not by
discovery.** The orchestrator's own scoping explicitly excludes `supabase db push` and PR
creation from this execution. These steps remain for the owner/orchestrator. No code or test
was stubbed, faked, or worked around to simulate the table's existence — any code that reads
or writes `team_tier_leads` will not function at runtime until the migration is pushed, and
no test asserts otherwise.

## Known Stubs

None. Every function built is fully implemented; the only "stub-like" condition is the table
itself not existing in any live database yet, which is the intended, documented, human-gated
state — not a code stub.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-261004-ttq-01 through -05,
-SC) — no new trust boundary was introduced beyond those already registered in the plan.

## What Cannot Be Verified Until the Owner Pushes the Migration

- The migration itself has never been executed against any database (local or production) —
  its SQL has only been verified via `__tests__/migration-229.test.ts`'s text-based
  assertions (`readFileSync` + `toContain`/`toMatch`), never by running it.
- `POST /api/team-tier-leads`'s actual insert behavior against a real `team_tier_leads`
  table — covered today only by a mocked Supabase client in
  `app/api/team-tier-leads/route.test.ts`.
- `/admin/team-tier-leads`'s actual query against a real table — the page code is
  typechecked and lint-clean, but has not executed against live data.
- The full end-to-end walkthrough in the plan's Task 7 `<how-to-verify>` (submitting through
  `/team-fit`, confirming the admin list shows the row, confirming the staff notification
  bell/email fires on the bd branch and does not fire on the self-serve branch, confirming
  the `ae`-only staff redirect) — all of this requires the migration to be live first.
- Whether `resend`/email delivery actually fires for a notified staff member in this
  environment — `sendEmail()` no-ops with `{ok:false}` when `RESEND_API_KEY`/
  `RESEND_FROM_EMAIL` are unset; this plan's own in-app notification path does not depend on
  that succeeding to be considered "delivered," but the email leg itself is unverified here.

## How Clear of `buyer_orgs`/`buyer_members` Was Confirmed

Ran, after all files were written:

```
grep -rln "buyer_orgs\|buyer_members" lib/team-tier app/api/team-tier-leads app/team-fit \
  components/team-tier "app/(admin)/admin/team-tier-leads"
```

Zero matches. Also confirmed no file in this plan imports from `lib/client-partners/` or
`lib/buyers/` (`grep -rln "client-partners\|lib/buyers" lib/team-tier app/api/team-tier-leads
app/team-fit components/team-tier "app/(admin)/admin/team-tier-leads"` — zero matches).

## Notification Fan-Out Behavior on a Failed Staff Lookup

`notifyTeamTierLeadStaff()` wraps each recipient's `getUserById()` call AND
`createNotification()` call inside that same recipient's own `try/catch`. Verified in
`lib/team-tier/notify-staff.test.ts`:

- `getUserById` failure for one recipient → that recipient still gets a notification, with
  `email: null` / `sendEmailCopy: false` (so the in-app row lands even though the email leg
  degrades); the OTHER recipient's `getUserById` and notification proceed unaffected.
- `createNotification` failure (rejected promise) for one recipient → swallowed; the other
  recipient's `createNotification` call still fires.
- A `funun_staff` query error resolves the whole roster to `[]` (fail-closed) and
  `notifyTeamTierLeadStaff()` resolves without throwing and without calling
  `createNotification` at all.

## Both Endings' Final Shipped Wording

**Bigger than Team (bd):**
- Headline: `This is bigger than Team.`
- Body: `Entourage is built for groups like yours. We've got your answers on file — someone
  from Funūn will follow up by email.`
- No CTA (nothing to click through to).

**Fits Team (self_serve):**
- Headline: `Team's built for a group your size.`
- Body: `We're invite-only right now, so the next step is requesting an invite — mention your
  team when you do, and we'll follow up about onboarding once you're in.`
- CTA: `Request an invite` → `/signup` (plain, unmodified link — no `?next=`/`?intent=` param,
  to avoid colliding with the sibling 261004-sas plan's concurrent edits to that page).

Both strings live in `lib/team-tier/qualification.ts`'s `bdEndingCopy()`/
`selfServeEndingCopy()` and are rendered verbatim (not re-typed) by
`components/team-tier/TeamFitQuestionnaire.tsx`'s `'done'` step, keyed off the **server's**
`routingOutcome` response field, never the client's local preview.

## Where the Two Provisional Items Are Marked

1. **Q2's catalogue-size bands** (`CATALOGUE_ANSWER_VALUES`) — marked provisional in a code
   comment directly above the const in `lib/team-tier/qualification.ts`, and again in
   migration 229's column comment above `catalogue_answer` and in the table-level
   `COMMENT ON TABLE`.
2. **The `'not_sure'` → `'bd'` routing default** — marked provisional in a code comment
   directly above `resolveRouting()` in `lib/team-tier/qualification.ts`, and again in
   migration 229's `COMMENT ON TABLE`.

Neither is silently presented as settled anywhere in the UI, API responses, or admin list.

## `resolveLeadershipFallback` — Not Touched

This plan's fan-out (`lib/team-tier/notify-staff.ts`) is fully independent of
`lib/staff/leadershipFallback.ts`'s `resolveLeadershipFallback()` — it is never imported or
called. The existing `.limit(1)` un-ordered-arbitrary-pick bug in that helper was **not**
fixed here (out of scope — this plan does not touch that file), and is reported as a known,
separate, unfixed issue per the orchestrator's instruction not to expand scope to fix a bug
not otherwise being touched.

## Verification Gate (run on this branch, in CI order)

1. `npm run security:migrations:verify` — PASS (migration 229 is invisible to this script's
   hardcoded 214–218 candidate list, as the plan's verified-facts table predicted)
2. `npm run typecheck:strict` — PASS, zero output
3. `npm run lint` (`--max-warnings=0`) — PASS, zero warnings
4. `npm test -- --runInBand` — PASS, 646 suites / 8090 tests (baseline was 642 suites / 8046
   tests; this plan added exactly 4 test files / 44 tests, zero regressions)
5. `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities
6. `npm run audit:gate` — PASS, clean (1 active deferral, earliest expiry 2026-11-02 —
   pre-existing, unrelated to this plan)

`npm run build` was deliberately NOT run (a dev server is live on :3000, and it is not part
of CI's validate job).

## Working-Tree Counts

- **Before any code (baseline, this worktree, immediately after `npm ci`):** 0 modified/
  untracked paths (`git status --short` empty) — this worktree was created fresh off
  `origin/main` specifically to avoid the ~21 modified/untracked paths present in the main
  checkout from concurrent parallel sessions.
- **After all commits (final state before push):** 0 modified/untracked paths — every
  change across all 7 commits was staged by explicit file path; `git add -A`/`git add .` was
  never used.

## Self-Check: PASSED

Verified every file this SUMMARY claims to have created exists on disk, and every commit
hash cited above exists in `git log --oneline quick/261004-ttq`.
