# Phase 50 — Slice Breakdown (CORRECTED, post-adversarial-review)

**Status: re-planned after an adversarial review returned NO-GO on the prior version of this
document.** The verdict, all findings, and two ratified owner contradictions are recorded in
`.planning/deliberations/2026-10-04-phase-50-adversarial-review-corrections.md` (branch
`phase-50-review-corrections`). This document supersedes the REJECTED version (preserved in git
history at `main`'s `b260c540`/`0230e1e1`). **Not discussed, not planned at the PLAN.md level** —
this still pre-identifies slice boundaries for `/gsd-discuss-phase 50` and `/gsd-plan-phase 50`.

**Source:** `.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md` (16
sections, owner-ratified 2026-10-04), its companion
`.planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md`, and the adversarial
review's corrections above.

**What this phase extends:** `/admin/sync-library` (`app/(admin)/admin/sync-library/page.tsx`) is
the staff review queue — admit/reject/remove, `LEGAL_TRANSITIONS`
(`lib/sync-library/submission.ts:31-41`), `logStaffAction` audit, `SyncReadinessWorklist`
(`lib/sync-library/worklist.ts`), `blanket_agreement_document_id`. Every slice below extends that
surface. None stand up a second one.

**What is ALREADY LIVE on `main`, verified directly this pass (re-ground before building, this
project has multiple parallel sessions in flight):**
- **A&R admit/quality-review/invite access (#147, MERGED).** `requireStaff(['leadership','anr'])`
  gates admit/reject (`app/api/sync-library/admin/[listingId]/route.ts:138`) and quality review;
  `requireStaff(['leadership','ae','anr'])` gates invite and the page view. **This is not a future
  exposure — it is live now**, with ZERO AI-provenance check anywhere in the admit path.
- **The Selects admission gap is CLOSED (#148, MERGED).** `addSelectsTrack()`
  (`lib/selects/persistence.ts`) now requires `sync_listings.status = 'admitted'` via
  `isTrackAdmittedToSyncLibrary()`, reusing `isAdmittedToSyncLibrary` (`lib/deals/catalog.ts:34-36`)
  — the same single admission authority `loadCatalogPage` already uses. **The old Slice 9 is
  pre-satisfied.** Nothing to build; CSUB-18 below keeps the cross-surface negative test that must
  outlive this one fix.
- **Migration 230 (`tracks.work_id`) + `resolveTrackAiProvenance()` are CODED, reviewed, open as
  PR #151 — NOT merged, and the migration is NOT applied.** `lib/catalogue/track-work-link.ts`
  (branch `work-track-direct-link-261004`) is null-safe by construction: a falsy `workId` returns
  `{status:'unresolved'}` before any entry is inspected — proven by test, not by convention. **The
  column does not exist in the database until the owner pushes it.** Treat this as a named,
  external, blocking dependency — never something an executor applies.
- **Today's admit gate (`evaluateInclusionGate`, `lib/sync-library/gate.ts:35-38`) BLOCKS admission
  on `rightsClear` (split_sheets + copyright + hire_right all `complete`,
  `lib/sync-library/readiness.ts:320-323`).** This is the mechanism-level reason the rejected plan's
  "badge, not lifecycle" defect is real: **no song can be admitted today while its splits are
  incomplete**, which makes CSUB-13 ("accepted but not rights-ready stays visible and pitchable")
  structurally impossible under the current gate. Fixing this gate IS Slice 3 below — not merely
  adding a new AI-provenance check alongside an unchanged one.
- **`handle_new_user()`'s live body is migration 214's**, not 098's or 099's. 214 is
  `HUMAN-GATED` (its own header: "do not apply automatically — production Auth confirmation must be
  enabled in the coordinated release window") — re-verify at execution time that 214 is actually the
  version running in production (not merely the latest file on disk) before any new edit assumes
  its body as a starting point. Full current body captured in this pass; reproduced verbatim (not
  paraphrased) wherever Slice 4 below edits it.

**What this phase does NOT build** (decided elsewhere, or explicitly deferred — do not re-derive):
- Bulk catalogue intake (§11) — `.planning/todos/pending/2026-10-04-bulk-catalogue-intake-for-the-crate.md`.
- SMS/iMessage outbound (§13) — `.planning/todos/pending/2026-10-04-sms-and-imessage-outbound.md`.
- Staff discovery/browse of public music (§13) —
  `.planning/todos/pending/2026-10-04-staff-discovery-of-public-music.md`.
- The "I'd like this looked at" lighter door — **CUT by the owner (§16).** Not built, not deferred.
- The split-document upload build (owner-decisions §1's "next" half) —
  `.planning/todos/pending/2026-10-04-split-document-upload-build.md` (new, filed this pass). Only
  the HONEST COPY LINE for that question (§1's "now" half) is in scope, inside Slice 5.
- Gate 0's "render both grounds, owner picks" bench test (owner-decisions §2) — **unrelated to this
  phase**, already tracked under its own `### Gate 0` roadmap entry. Not a Phase 50 gap.
- A&R permission widening on `/admin/sync-library` — already shipped (#147, see above). Nothing
  further proposed here.

---

## The two corrections that drive every reordering below

### Correction 1 — the valve gates SUBMISSION CREATION, not account creation

**The rejected plan's defect:** reading the valve inside `handle_new_user()` makes it an
account-creation gate. An account created while the valve is open keeps submitting forever after
it closes, because nothing re-checks the valve on the second, third, or fiftieth submission. The
cap (§9) is per-submission, never per-lifetime, so one account is an unlimited channel.

**The fix adopted here:** the valve lives in application code, consulted **fresh, on every attempt
to create a new unsolicited `sync_listings` row** — never inside the `SECURITY DEFINER` trigger.
Account creation for submission intent is **unconditional** (§12: "anyone may create an account for
the sole purpose of submitting a song — no invite required") and **never** confers a standing right
to submit later; that right is re-evaluated every time, by a single reusable predicate every
submission-creation path must call (mirrors `isValidTransition`/`isAdmittedToSyncLibrary`'s
single-authority discipline — never re-derived per route).

**The honored exception — the "cannot strand someone mid-upload" grant (§12):** when the valve is
open, beginning a submission issues a durable (DB-persisted, survives a redeploy — not an in-memory
flag), **short-TTL** grant for that person. After the valve closes, a request is still allowed if
either (a) the valve just happens to still be open, or (b) the requester holds a live, unexpired
grant issued while it was. No live grant and a closed valve = refused, routed to the waitlist. New
grants are **only ever minted while the valve is open** — closing it stops issuing new ones
immediately; it does not retroactively revoke ones already issued.

**A consequence of this redesign, stated plainly because it is a real simplification, not a
shortcut:** `handle_new_user()` no longer needs to know the valve exists at all. The trigger edit in
Slice 4 below answers only "may this account be created" (answer: yes, unconditionally, for this
one declared intent) — a materially smaller, more reviewable change than the rejected plan's
version, which conflated "who may sign up" with "is the door currently open."

**Scope of "unsolicited," grounded in the owner's own words (§12):** "real volume and real spam...
from people with **no relationship to Funūn**." The valve/grant mechanism gates every submission
attempt **except one explicitly marked as Crate-invite-attributed** (§13 — invites bypass by
design, verified by the submission-creation check reading an explicit invite marker, never by the
trigger). It is **not** scoped only to brand-new open-door accounts — an already-invited Member's
walk-up submission is just as "unsolicited" in the sense the owner used the word, and a leadership
member flipping the valve during a real incident should see it take effect on **today's existing
traffic immediately**, not on a population that does not exist yet. Flagged for confirmation at
discuss-phase, since the owner-decision text's own examples are all about the new public
population — but this reading gives the switch real, testable effect from its first commit
(resolving Finding 14 structurally, not just procedurally — see Slice 1).

### Correction 2 — four distinct things, not one badge

**The rejected plan's defect, verified directly this pass, not merely cited:**
`evaluateInclusionGate()` requires `rightsClear` (`isSyncRightsClear` — split_sheets + copyright +
hire_right **all** `complete`) to admit at all (`app/api/sync-library/admin/[listingId]/route.ts:283-302`).
This means **today, nothing can be admitted while its splits are incomplete** — the exact state
§5 says must stay visible and pitchable. Slice 6 of the rejected plan added an AI-provenance check
**on top of** this unchanged gate and called that "visible and pitchable, routed to contact" — it
could never be true, because the gate it extended still blocks admission on the very thing §5 says
should not block admission.

**The fix adopted here models four distinct things, not one:**

1. **Intake acceptance** — a NEW first-look decision: "is this submission entering review at all?"
   (§3/§4 step 8). New states `under_review` (accepted) / `declined` (intake-stage no). Built in
   Slice 7.
2. **Review outcome** — what happens to an `under_review` submission: it eventually reaches
   `admitted` or `rejected` (via the existing `agreement_pending`/`pending_admit` waypoints,
   unchanged). Built in Slice 7 (the states/transitions) and consumed by Slices 8–10 (the work that
   happens *during* `under_review`).
3. **Catalogue admission** — the `status = 'admitted'` transition itself: does this song appear in
   the catalogue, visible and pitchable, at all? **Corrected to require only:** staff `qualityOk`,
   `metadataComplete`, and project-type eligibility (unchanged, all pre-existing). **`rightsClear`
   is REMOVED as a precondition to this transition** — splits-incompleteness no longer blocks
   admission; it only affects (4). Built in Slice 3.
4. **Licensing readiness** — a separately computed, continuously-current tri-state
   (`rightsBadge()`, extended) over an **already-admitted** song: `'ready'` only when rights are
   clear AND AI-provenance resolves `'clear'`; `'contact'` when a sample blocks, OR rights are
   entirely absent, OR AI-provenance is `'disqualified'` or `'unresolved'` (**unresolved is routed
   exactly like a known disqualifier — the owner's own rule: null means "we do not know," never a
   confident negative, and gate.ts already treats an uncleared sample this same way — this is the
   SAME bucket, not a new one**); `'partial'` otherwise. Built in Slice 3; consumed everywhere a
   buyer-facing surface currently reads `rightsBadge`/`CatalogRights`.

**Confirmed, not assumed, by the same verification pass:** the owner-deliberation text does not say
whether an AI-provenance **disqualification** (as opposed to an **unresolved** verdict) should
block admission outright or only route to contact. This plan treats it identically to an uncleared
sample (routes to contact, never blocks admission) for consistency with the one existing precedent
this codebase already has for "known rights problem, still listed, never silently clean" — **flag
for explicit confirmation at discuss-phase**, since it is this replanning pass's inference, not a
verbatim owner instruction.

**An honest cost of this fix, stated rather than hidden:** until migration 230 is applied, EVERY
track's AI-provenance reads `'unresolved'` (no `work_id` column exists to read), which means every
admitted song — even ones with no AI involvement whatsoever and fully-signed splits — shows
`'contact'` instead of `'ready'` for the interim. This is **more conservative than today's actual
behavior** (today, an admitted song that passed the old `rightsClear` gate can show `'ready'`).
Softening this for the interim (e.g., treating `'unresolved'` as "don't touch the existing verdict"
rather than "force to contact") was considered and rejected — it would recreate the exact
label-integrity defect this project has already paid for twice (`owner_segment`,
`vault_documents.status='signed'`): a `'ready'` badge nothing actually checked. **The fastest way to
shorten this window is for the owner to push migration 230 soon; the plan does not attempt to route
around that by weakening the safe default.**

---

## Slice 1 — The submission-creation valve (the brake, not the gate)

**What it delivers:** a leadership-only kill switch for **unsolicited** `sync_listings` creation
(CSUB-04), consulted fresh on every creation attempt — reusing the D-56 pattern already proven in
this codebase (`lib/workspaces/access-kill-switch.ts`, `workspace_access_config` +
`workspace_access_enabled()`) rather than inventing a new on/off mechanism. The durable,
expiring submission-start grant honored after closure (CSUB-07, the non-strand guarantee). An
exemption input for Crate-invite-attributed creations (consumed for real starting Slice 6, plumbed
from this slice's first commit so the check function never needs a second signature later).

**Why this ships FIRST, and ships with REAL effect immediately (closes Finding 14 by
construction, not by procedure):** wired into the **existing, already-live**
`app/api/sync-library/submit/route.ts` from this slice's first commit. Default **OPEN** — matches
today's actual behavior (any invited Member can submit, unthrottled, right now), so shipping this
changes nothing for existing traffic until leadership deliberately flips it. The rejected plan's
Slice 3 shipped the valve **closed and read by nothing** — an operational switch leadership could
flip during a real incident with zero observable effect. This version is never inert: the moment it
ships, leadership has a genuine, testable, already-wired-to-real-traffic kill switch for all
unsolicited submission creation, months before the public door (Slice 4) exists to need it.

**Files/areas:** `sync_submission_valve` (new singleton table, mirrors `workspace_access_config`'s
exact shape: `id BOOLEAN PRIMARY KEY CHECK(id)`, `enabled`, `disabled_reason`, `disabled_by`,
`disabled_at`) + `sync_submissions_open()` (SQL function, `SECURITY DEFINER`,
`COALESCE((SELECT enabled FROM ... WHERE id), FALSE)` — **fails CLOSED if the row is ever missing**,
the safer default for a brake); `sync_submission_intake_grants` (new table: `id`, `user_id`,
`created_at`, `expires_at` — service-role-only, zero RLS, mirrors `staff_audit_log`'s posture);
`lib/sync-library/submission-valve.ts` exporting ONE `assertUnsolicitedSubmissionAllowed(service, {
userId, inviteAttributed })` — every submission-creation path, present (this slice) and future
(Slices 5, 6), calls this SAME function, never re-derives the check; a leadership-only toggle route
+ UI + `logStaffAction` audit on every flip.

**What proves it works:** leadership can flip the switch and see it audited; a non-leadership role
gets 403; with the valve open, the existing submit route behaves exactly as it does today; with it
closed, a NEW unsolicited submission attempt through that same existing route is refused with a
clear message; a submission begun while open (grant issued) still succeeds through completion after
the valve flips closed mid-session; an invite-attributed creation (parameter plumbed, not yet
produced by any real caller until Slice 6) is exempt regardless of valve state.

**Depends on:** nothing new.

**Migration:** yes — two small tables + one SQL function. Human-gated, owner pushes.

**Ships green because:** a real leadership member can flip a real switch today and watch it
actually gate real, already-existing submission traffic — not a switch waiting for a door that does
not exist yet.

---

## Slice 2 — Abuse & volume controls for open intake

**Why this gets its own slice (Finding 8 — §12's controls had no owner):** the owner-decision doc
states plainly "a valve is necessary but not sufficient," then never assigns rate limiting, file
validation, quotas, abuse suspension, or monitoring to anything. The rejected plan carried the
sentence forward without carrying an owner. This phase cannot open the public door (Slice 4) without
these existing first — not as a nice-to-have, as the literal precondition the owner's own words
state.

**What it delivers:**
1. **Rate limiting** on unsolicited submission-creation — reuses `lib/security/rate-limit.ts`
   (already the pattern behind the M-01 session's `failClosed: true` fix on five upload-intent
   routes; same fail-closed posture here, not a new one).
2. **File-type/size validation** on the wizard's audio upload, matching this codebase's existing
   `ALLOWED_AUDIO_TYPES`/`MAX_AUDIO_SIZE` convention (`.claude/CLAUDE.md` naming pattern,
   `lib/storage`) rather than a bespoke check.
3. **A quota** — distinct from §9's **per-submission** cap of 3 songs: a per-account,
   per-time-window ceiling on how many NEW unsolicited submissions may be created (exact numbers
   confirmed at discuss-phase), closing the gap the 3-song cap deliberately leaves open (§9: "three
   is a per-submission cap, not a lifetime one... nothing stops someone submitting again later" —
   true and intended for a prolific *writer*, but unbounded for an abuser).
4. **Orphan cleanup, scoped narrowly to this feature** — a submission draft abandoned mid-upload
   leaves a storage object nothing ever finalizes. **Not the same thing as the M-01 ledger-wide
   orphan sweeper** (`.planning/STATE.md`'s M-01 section, deferred against observable triggers, not
   a date) — that sweeper does not exist yet either, and this phase does not build it. This slice
   builds the narrow, submission-scoped case only: a TTL-based delete of storage objects tied to a
   `sync_submission_intake_grants` row that expired without a corresponding `sync_listings` row ever
   being created.
5. **Abuse suspension** — a new staff action marking a specific account ineligible for further
   self-serve submission creation (distinct from, and lighter-weight than, any existing account
   suspension — scoped to this one capability), audited via `logStaffAction`.
6. **Minimal monitoring** — a submission-volume counter surfaced somewhere staff already look
   (The Playbook's existing monitoring dashboard precedent, per `.claude/CLAUDE.md`'s IT-TEAM
   section, if that surface exists by plan-phase time; otherwise a simple admin-visible count is
   sufficient for v1).

**What proves it works:** rapid repeated submission-creation attempts from one account are
throttled; an oversized or wrong-type file is rejected with a clear message before upload begins;
an account past its quota is refused with a message distinct from "the valve is closed"; an
abandoned draft's storage object is gone after its grant expires; a staff member can suspend an
account's submission capability and see it take effect immediately, audited.

**Depends on:** Slice 1 (the grant table these controls key off).

**Migration:** likely yes — a quota-tracking column/table, a suspension flag. Confirm exact shape
at discuss-phase.

**Ships green because:** the ordinary protections an open upload path needs exist and are proven
before any stranger can reach them — not promised as a later cleanup.

---

## Slice 3 — Catalogue-admission eligibility enforcement (the four-state fix)

**Where this sits, stated as starkly as the correction demands:** A&R admit access is **already
live** (#147, merged). Every day this slice has not shipped is a day the admit button has zero
AI-provenance check **today, on main, in production** — independent of anything else in this phase.
**This slice must land before Slice 4 (the public door), Slice 5 (the wizard's new volume), and
Slice 6 (invites) go live in production** — not because those slices are unsafe in isolation, but
because each one increases the population reaching the same unenforced button. Their CODE may be
written and reviewed in parallel; their PRODUCTION DEPLOY is gated on this slice being live in
production first. This is the literal reading of the review's instruction: "enforcement is a
prerequisite for every intake-expanding slice... do not plan the public door... ahead of it."

**What it delivers — the full Correction 2 fix, not an addition on top of an unchanged gate:**
1. **Catalogue-admission precondition, corrected:** `evaluateInclusionGate()` (or its successor)
   drops `rightsClear` as a blocking input. Admission now requires only `qualityOk`,
   `metadataComplete`, and the existing project-type eligibility check — all three already
   pre-existing, already verified, unchanged.
2. **Licensing readiness, extended:** `rightsBadge()` (`lib/sync-library/gate.ts`) gains a fourth
   input — the AI-provenance verdict — folded into the SAME tri-state (`'ready'`/`'partial'`/
   `'contact'`) rather than a parallel, independently-drifting signal (the module's own header
   comment already warns against exactly that).
3. **The resolver wiring, self-adapting to the external migration dependency:** a small query layer
   checks whether `tracks.work_id` exists (an `information_schema.columns` introspection, cheap,
   cacheable) before ever selecting it. If absent (today, pre-migration-230), every track resolves
   `workId: null` → `resolveTrackAiProvenance()` returns `{status:'unresolved'}` by construction —
   the SAME safe path the module already guarantees, never faked, never skipped. If present
   (post-migration), the real column value is read and used. **This decouples this slice's CODE
   merge from the owner's migration-push timing** — the code can ship now, and the moment the owner
   applies migration 230, the resolver starts returning real `'clear'`/`'disqualified'` verdicts
   with no further deploy required.
4. **Catalogue-query behaviour for admitted-but-contact songs, verified not assumed:** every
   buyer-facing surface that already reads `rightsBadge`/`RIGHTS_BADGE_TO_CATALOG_RIGHTS`/
   `CatalogRights` (confirmed: `components/buyer/CatalogBrowserLight.tsx` and the catalogue-loading
   path in `lib/deals/catalog.ts`/`catalog-query.ts`) already includes `'contact'`/`'req'` songs in
   listings (proven true today for the sample-block case) — this slice's job is to confirm that
   same inclusion holds once `rightsClear`-incomplete songs can ALSO reach `'admitted'` for the
   first time, with an explicit test fixture for each of: incomplete splits, an uncleared sample,
   and an unresolved/disqualified AI-provenance verdict — three independent paths into the SAME
   `'contact'` bucket, each proven to still list (not hide) the song.

**Files/areas:** `lib/sync-library/gate.ts` (the two signal changes above), `app/api/sync-library/
admin/[listingId]/route.ts` (drop `rightsClear` from the admit precondition; add the provenance
query), a small new query module consuming `lib/catalogue/track-work-link.ts`'s
`resolveTrackAiProvenance()` and `lib/catalogue/ai-entries.ts`'s entry-fetching (per that module's
own documented read path), `SyncReadinessWorklist` display (surface "AI-provenance: cannot
determine, check by hand" as a worklist item per the existing authority, not a rival list).

**Hard external dependency:** migration 230, owner-pushed, tracked as PR #151 (unmerged). **This
slice's PR may be reviewed and merged to a feature branch at any time; it must not be merged to
`main`/deployed to production until the owner confirms migration 230 is live** — merging first
would not break anything (the introspection check keeps every query safe), but SHIPPING this
slice's intended behavior (real `'clear'`/`'disqualified'` verdicts, not perpetual `'unresolved'`)
cannot happen before the column exists regardless of code-merge timing.

**What proves it works:** a song with incomplete splits and no AI-provenance concern is now
ADMITTED (newly possible — proves the gate fix) and shows `'contact'` or `'partial'` (not `'ready'`,
proves readiness is unaffected by the gate fix); an uncleared sample still behaves exactly as today
(unchanged path, regression check); with migration 230 unapplied, a song with a clean AI history
STILL shows `'contact'` (proves the safe default, not a false "clean"); once migration 230 is
simulated as applied (test fixture with the column present), the SAME song now shows `'ready'`
(proves the resolver activates correctly without a second deploy).

**Migration:** none of its own beyond the external one it consumes (migration 230, not built here).

**Ships green because:** the admit action finally checks what the owner said must be checked at
that instant, the fix does not regress the existing sample-block precedent, and the code's own
correctness does not depend on when the owner gets to the migration — only the FULL benefit does,
honestly disclosed above.

---

## Slice 4 — Open the door (no-invite account creation + arrival-origin capture)

**What it delivers:** `handle_new_user()` gains ONE new branch (§12: anyone may create an account
for the sole purpose of submitting a song, no invite required) — reproducing migration 214's live
body **verbatim** (captured in full this pass; do not start from 098 or 099 — Finding 7, confirmed:
104/105 added the provision-intent exemption, 133 added `handle`-column identity, 214 replaced the
artist branch's email-allowlist with token+email admission and the `verified_signup_invite_claims`
ledger — ALL of that is already in the body this edit must reproduce exactly). **The new branch does
NOT read the Slice 1 valve at all** — that is the whole point of Correction 1: this trigger answers
"may an account be created," never "may a submission be created." Arrival-origin capture (CSUB-03,
carried in `user_metadata`, written to `user_profiles` by this same trigger edit — Finding 13:
not independently shippable, its schema half must land in this same migration) — purely a
display/provenance fact for the staff queue, with **no enforcement role** (the valve's enforcement
lives entirely in Slice 1's application-layer check, never derived from this field).

Also ships: both marketing "Submit a song" CTAs (hero + Crate section, both currently pointing at
a blind `/signup` waitlist) relabeled/relinked to the real flow; the `/signup` page's courtesy,
**non-authoritative** check of `sync_submissions_open()` to show the "paused, join the list, here's
an escape hatch" copy (CSUB-05) BEFORE a visitor starts the open-door signup — a UX layer only; the
real, authoritative, cannot-be-bypassed-by-a-direct-API-call check is Slice 1's, re-run at actual
submission-creation time regardless of what this page showed.

**Files/areas:** the `handle_new_user()` migration (new number, claimed at plan time — see
numbering note); the signup page/route passing the new `user_metadata` intent flag;
`assets/marketing/landing.html` + the gitignored `private/bench/marketing.html` re-freeze pipeline.

**What proves it works:** a brand-new anonymous visitor can create an account through this path
with no invite; the account's `user_profiles` row records arrival-origin as self-serve; the
EXISTING curator/buyer/industry/invited-artist branches migration 214 protects are unchanged
(regression suite over every branch, not just the new one — Finding 7's explicit ask); the signup
page shows the paused/escape-hatch copy when the valve is closed and the normal flow when open, but
account creation succeeds either way if attempted directly.

**Depends on:** Slice 1 (the courtesy check this page renders, and the mechanism CSUB-07's
mid-session guarantee is tested against), Slice 2 (abuse controls must exist before this is
reachable by the public), Slice 3 **in production** (see Slice 3's header — do not deploy this
slice's door-opening behavior to production before Slice 3 is live there).

**Migration:** yes — editing a live, `SECURITY DEFINER` trigger. Human-gated, reviewed with the
same weight this project gives migration 190's custody trigger.

**Cannot be sliced further:** `CREATE OR REPLACE FUNCTION` is one atomic statement.

**Ships green because:** the door opens exactly as designed, verified against the actual signup
endpoint directly (not just the UI), and — because the valve no longer lives in this trigger — the
single highest-regression-risk edit in this phase is now a strictly smaller, more reviewable change
than the rejected plan's version.

**Highest regression risk in this phase**, though smaller than before: a defect here is either (a)
a hole letting anyone sign up when they should not, or (b) breaking an EXISTING branch migration 214
protects — still a production outage for every signup path if wrong, but the blast radius of what
this edit touches is now confined to "may an account be created," not also "may a submission be
created."

---

## Slice 5 — The submission wizard: upload-first, mandatory intake, optional questionnaire

**What it delivers (CSUB-01, CSUB-02, plus Finding 9's receipt and the owner-decisions §1 copy
fix, both pulled forward into this slice because this IS the first slice that creates a
submission):**

1. Up to 3 songs per submission (§9), each its own independently reviewable `sync_listings` row —
   no parent-child grouping (explicitly rejected by the owner).
2. **Upload-first ordering, made testable (Finding 18):** the FIRST interactive step is selecting
   and uploading the audio file. **Acceptance criterion:** no name, contact, ownership, or
   questionnaire field may be presented, required, or even rendered, before the upload step
   completes. A conventional questionnaire-first wizard that merely *mentions* "upload first"
   in copy does not satisfy this — the ordering must be enforced by the component tree / route
   sequencing itself.
3. **Mandatory intake vs. optional questionnaire, as TWO separate things (Finding 10, RATIFIED):**
   immediately after upload, a SHORT, MANDATORY intake — who you are, how to reach you (contact
   info, captured once per person, not per song, per §5/§9), and the ownership question ("are these
   your songs, or do you represent them?", §11). Then, separately, an OPTIONAL questionnaire where
   **every question is genuinely skippable** — including the splits-agreed question. The song is
   already uploaded and in review before either intake or questionnaire begins, so *"nothing stands
   between a person and their work"* still holds; it simply cannot stay anonymous.
4. **The catalogue-scale flag (§11):** a signal, not a bulk queue, that routes a large-catalogue
   submitter to a human conversation.
5. **The §1 copy fix, landing here because this is where that question is first built:** the
   splits-agreed question's "Agreed and written down" answer reads *"Good — that's the hard part
   done. We'll note it on the song so nobody asks you twice."* — true today, no upload capability
   implied. (The upload-acceptance half of §1 is explicitly deferred; see the new todo.)
6. **Artist receipt (Finding 9):** immediately on submission, the artist sees "received, awaiting
   review" on the song itself — ships in THIS slice, not a later one. A product that takes a song
   and says nothing is the dishonest intermediate state this phase's own slicing discipline exists
   to prevent.
7. **Summary screen (§4 step 6), with its enumeration corrected rather than copied verbatim:** the
   owner-decision text says "all four doors on screen" — **this is now stale.** §16 cut the lighter
   intake door AFTER §4 was written, so a literal "four" cannot be reconciled against the two doors
   that remain (explicit submit, Crate invite) plus whatever else was being counted. **Flag this
   explicitly for discuss-phase** rather than guess at the count; what IS pinned down and testable
   now: the summary must show where the song lives, what (if anything) is still missing, and
   Crate-eligibility status so far — a precise enumeration of "how many things" is deferred to a
   human decision, not invented here.

**Files/areas:** a new submission wizard (artist-facing UI) and its creation endpoint — **calls
Slice 1's `assertUnsolicitedSubmissionAllowed()`**, never a second, route-local check; needs its own
minimal vault-project/track creation path for a submitter with nothing in the Vault yet (today's
`app/api/sync-library/submit/route.ts` assumes an existing project — this wizard's intake does not);
new columns (or a small sibling table) for the ownership-claim answer and the catalogue flag;
contact info on `user_profiles` (collected once per person).

**What proves it works:** a visitor (open-door or existing Member) can submit 1–3 songs in one
pass, upload strictly before any question; staff see each song as its own row with the ownership
answer and catalogue flag visible; the artist sees "received, awaiting review" immediately; every
questionnaire field (not the intake fields) can be skipped and the submission still completes.

**Depends on:** Slice 1 (the valve/grant check, reused not re-derived). Deliberately sequenced
AFTER Slice 3 (catalogue-admission enforcement) in this plan's production-deploy ordering, even
though this slice's own volume comes from a population no larger than today's — chosen for literal
compliance with "enforcement is a prerequisite for every intake-expanding slice," flagged here as a
real tradeoff (it costs the original plan's "de-risk the new UI against a bounded population
first" benefit) rather than silently decided.

**Migration:** yes — new columns, human-gated, owner pushes.

**Ships green because:** a real submitter can use this door end to end today, gets an honest
receipt immediately, and staff see the output in the existing queue — with no claim made anywhere
that rights or provenance have been checked yet (that is Slice 3/7's job, not this one's).

---

## Slice 6 — Crate-submission invites ("Submit THIS" and "Submit me something")

**What it delivers (§13, CSUB-08/09/10):**
- **"Submit THIS"** — staff finds a track an artist chose to share publicly (via that artist's
  public profile page — verified directly: `vault_projects.is_public`'s RLS policy has no `TO`
  clause and applies even to staff; no browse surface exists, roadmapped separately), points at it,
  the artist may swap it before submitting, with a reply-able email thread (riding the existing
  Resend send this invite already needs) open for the swap negotiation — the cheapest honest option
  given this project has no staff↔artist real-time channel today (Phase 11's DMs are Member-to-
  Member; staff identity is deliberately separate per `.claude/CLAUDE.md`'s account vocabulary).
  The artist answers every rights question themselves; the pre-fill is the song, never the answers.
- **"Submit me something"** — a single-use, non-shareable, email-bound invite to someone who may
  have no Funūn account yet.

**Both are exempt from the Slice 1 valve by construction, not by a second switch:** the
submission-creation check's `inviteAttributed` parameter (plumbed since Slice 1) is finally set
`true` by this slice's redemption flow — the SAME function, no new bypass path to audit separately.

**Mechanism:** a new invite-token type (new table, or `artist_invites.source` widened with its own
new CHECK value distinct from `'collaborator'|'staff'|'waitlist_conversion'|'owner_seed'`), Resend
send, the queue showing "invited by [name]" plus the inviter's note (making the inviter
accountable). `app/api/sync-library/invite/route.ts` is confirmed a DIFFERENT thing (a
`capability_grants` row, in-app notification only, never expires) and is not touched.

**What proves it works:** staff can send both invite shapes; "Submit THIS" survives the artist
swapping the song; "Submit me something" cannot be redeemed twice; both succeed with the Slice 1
valve closed; the queue shows who invited whom and why.

**Depends on:** Slice 1 (the exemption mechanism), Slice 5 (invited submissions land in the same
wizard), and — per this plan's literal-compliance choice above — Slice 3 in production (invites
bring in people with no prior Funūn relationship, exactly the population Correction 2's enforcement
exists to protect against reaching an unchecked admit button).

**Migration:** yes — new CHECK value and/or a new invite table.

**Ships green because:** a staff member can invite someone in today, end to end, independent of
whether the public door (Slice 4) has shipped.

---

## Slice 7 — Two-stage intake lifecycle + atomic claim

**What it delivers — states 1 and 2 of Correction 2's four, built together because claim/review
only makes sense once "under review" exists as a real state:**

1. **Intake decision (CSUB-19, new):** `applied`/`invited` gain two new legal edges —
   `under_review` (accepted for review) and `declined` (new terminal state, intake-stage no,
   DISTINCT from `rejected`, which remains the review-stage no). Added to `SYNC_LISTING_STATUSES`/
   `LEGAL_TRANSITIONS` (`lib/sync-library/submission.ts`) as the single authority, never
   re-derived. The queue can now show three distinguishable things it could not before: nobody has
   looked yet (`applied`/`invited`), we declined at the door (`declined`), we are reviewing it
   (`under_review`) — closing the exact gap Finding 4 named.
2. **Atomic claim-to-review (CSUB-11, corrected per Finding 5):** `claimed_by`/`claimed_at` columns
   on `sync_listings`. **Claim is an atomic compare-and-set**:
   `UPDATE ... SET claimed_by=:me, claimed_at=now() WHERE id=:id AND status='under_review' AND
   claimed_by IS NULL` — zero rows affected means someone else already claimed it (409, "already
   claimed by X"), never a race. **Release** is a second CAS the claimant alone can perform.
   **Reclaim** of a STALE claim (threshold confirmed at discuss-phase) is a leadership-gated,
   audited override, recording who reclaimed it and from whom. **A real two-session race test** —
   two concurrent service-role calls attempting to claim the same row — asserts exactly one
   succeeds, proving the CAS, not merely the function's shape. **The accountable claimant is
   structurally separate from Slice 10's invited reviewers:** `claimed_by` is ONE person who owns
   moving the review forward; Slice 10's share-grants are a different table entirely, and holding a
   grant never implies a claim.

**Files/areas:** `lib/sync-library/submission.ts` (new states/transitions), new intake-decision
route (`POST .../[listingId]/intake`), new claim/release/reclaim routes.

**What proves it works:** an intake decision moves a submission to `under_review` or `declined`,
visibly distinct in the queue; a claim attempt on an already-claimed row is refused with the
claimant's identity; the claimant (and only the claimant) can release; leadership can force-reclaim
a stale claim, audited; the two-session race test passes deterministically (not flaky).

**Depends on:** Slice 5 (submissions must exist to triage).

**Migration:** yes — new status values, new columns.

**Ships green because:** the queue can finally tell "nobody has looked" from "we said no" from
"we're on it," and two people cannot silently double-review the same song — proven by a real
concurrency test, not an adjective.

---

## Slice 8 — Rights-ready assist: contact capture, staff fallbacks, nudges

**What it delivers (§5's workflow for an `under_review`/`admitted` song that is not yet
rights-ready), with CSUB-14 corrected per Finding 11 (RATIFIED):**

1. **Default and strongly preferred — the artist acts, staff prompts.** Every rights-bearing entry
   is made by the artist or their collaborators.
2. **Staff draft-for-confirm** — a Funūn Team Member proposes a split/entry, state `proposed`.
   Nothing takes effect until the artist confirms it.
3. **Staff direct-fill — takes REAL EFFECT, heavily gated, NO confirmation step (the ratified
   correction):** available only when absolutely necessary. Gated by an elevated permission, a
   REQUIRED stated reason, an IMMUTABLE audit record (append-only, never editable after write —
   naming precedent: migration 228's `identity_source`/`identity_digest_at_approval` pattern,
   `'unknown'`-safe backfill discipline, same label-integrity care), a notification to the artist
   that this happened and what was entered, and an explicit correction route for the artist to fix
   it afterward. **Requiring confirmation here was the Finding-11 defect** — it would collapse
   direct-fill into a second draft path and delete the one exceptional fallback the owner explicitly
   asked to keep. The friction here is the permission+reason+audit+notification bundle, not a
   second artist sign-off.
4. **Nudges** — an automatic cadence, plus a manual "send a push" action.

Both fallbacks are visibly, permanently marked as staff-originated in the UI — never styled as the
easy path.

**Files/areas:** `lib/sync-library/worklist.ts`/`readiness.ts` (extend, do not duplicate), a new
entry-provenance field distinguishing `artist_entered`/`staff_proposed`/`staff_direct_filled`
(naming precedent: migration 228, label-integrity-aware), proposed/confirmed state columns, a
reminder-cadence mechanism (precedent: migration 227's storage-threshold cron) plus a
`last_nudged_at`-style column.

**What proves it works:** staff see outstanding items per song via the existing worklist; a
proposed entry does nothing until confirmed; a direct-filled entry requires a stated reason, is
immutably audited, notifies the artist immediately, and is visibly marked staff-entered forever; an
automatic nudge fires on schedule and a manual push works immediately.

**Depends on:** Slice 7 (the `under_review` state this workflow runs inside) and Slice 3 (the
licensing-readiness computation this workflow is trying to move toward `'ready'`).

**Migration:** likely yes — confirm exact shape at discuss-phase.

**Ships green because:** the existing worklist authority now drives real staff action and real
artist nudges, with the one exceptional fallback kept genuinely exceptional rather than quietly
turned into a second draft path.

---

## Slice 9 — Artist-facing outcome notification

**What it delivers:** the EVENTUAL decision — admitted, rejected, declined at intake — communicated
to the artist, including a plain decline, with zero internal review detail surfaced. (The
RECEIPT half of §4's "acknowledge now, outcome when there is one" already shipped in Slice 5 per
Finding 9 — this slice is purely the outcome half.) Reuses `LEGAL_TRANSITIONS` states
(`lib/sync-library/submission.ts`) as the single state authority — a read/display + notification
wiring job, not a new state machine.

**Files/areas:** the artist-facing song/work page, `lib/notifications`/`createNotification`, Resend
email on each artist-relevant `sync_listings.status` transition (including the NEW `declined`
state from Slice 7).

**What proves it works:** on any staff decision (admit, reject, decline-at-intake), the artist is
notified in-app and by email with the outcome, including a plain rejection; nothing from Slice 10's
internal discussion ever reaches this surface.

**Depends on:** Slice 7 (the `declined` state this must also notify on).

**Migration:** likely none.

**Ships green because:** the outcome half of the acknowledge-now/outcome-later promise is honest
and complete, independent of the rest of this phase.

**Needs a human in a browser:** confirming the rejection/decline copy reads as acknowledging and
not dismissive is a judgment call, not a thing a test can assert.

---

## Slice 10 — Multi-reviewer collaborative surface + the cross-surface licensability test

**What it delivers (§15, CSUB-16/17, plus Finding 15's correction and CSUB-18's broader test):**
- A general comment thread AND comments pinned to a moment in the track, staff-only, permanently —
  a SEPARATE store from the artist-facing `work_version_pins` table (confirmed table name this
  pass), same interaction shape, never the same data.
- Reactions.
- **Nudge** (no permission change) vs. **grant a look** (a permission grant dressed as a share),
  visually distinguished.
- **Finding 15's correction, built in — not just the grant, but the OPEN:** a grant record carries
  `opened_at`, set the FIRST time the recipient actually views the shared submission — a second,
  separately audited event from the grant itself. **The grant is scoped to exactly one submission,
  never the queue** — the recipient's access check is "do I hold a live grant for THIS submission
  id," never "am I generally staff with queue access." Opening a shared review must not, as a side
  effect, make the rest of the queue visible.
- **CSUB-18, verified as a cross-surface requirement, not a Selects-only one:** the Selects
  write-path gap is CLOSED already (#148, confirmed merged this pass). This slice's job is the
  broader negative test the review demanded: confirm the SAME "not-yet-admitted → not licensable,
  marked as such" discipline holds across every OTHER buyer-facing surface a shared, unadmitted
  submission could reach (deal catalogue browsing, any export/pitch surface an AE might use) — one
  cross-surface test suite, not a re-verification of the already-fixed Selects path alone.

**Files/areas:** new staff-only tables (comments, moment-pins, reactions, share-grants — all zero-
RLS/REVOKE-ALL, reachable only via `requireStaff`-gated service-role routes, mirroring migration
111's `selects_tracks` posture), staff-facing UI reusing Writer's Room take-player/waveform-pin
patterns, the share-grant's `logStaffAction` wiring (now on both grant AND open).

**What proves it works:** two staff members can comment on the same submission, one pinned to a
waveform moment; the artist-facing surface shows none of it; nudging changes no permission; granting
a look actually grants it, is audited, and a SECOND audit record appears the first time the
recipient opens it; that recipient sees the rest of the queue is still inaccessible to them; the
cross-surface test confirms no other buyer-facing path exposes an unadmitted submission either.

**Depends on:** Slice 5 (submissions exist), Slice 7 (`under_review`/claim exist — something to
collaborate on).

**Migration:** yes — new staff-only tables.

**Needs a human in a browser, unavoidably:** no jsdom in this repo — component tests cannot observe
interaction state. Every piece here (posting, pinning, reacting, nudge vs. grant, the open-audit
firing, the not-licensable mark, the scope boundary) is interaction state a human must click through
before this slice is done.

**Ships green because:** staff get a real collaborative review surface with the right audience
boundary and a provably narrow permission grant, with the already-fixed Selects boundary now
verified as one instance of a system-wide rule rather than the only enforced one — once a human has
verified every interaction by hand.

---

## Summary table

| Slice | Delivers | Migration? | Depends on | Human-in-browser? |
|---|---|---|---|---|
| 1 | Submission-creation valve (the brake) | Yes | — | Yes (toggle UI) |
| 2 | Abuse & volume controls | Likely yes | 1 | Partial (rate-limit/quota messaging) |
| 3 | Catalogue-admission eligibility (4-state fix) | No (consumes ext. migration 230) | — (production-deploy gates 4/5/6) | Yes (admit decisions) |
| 4 | Open the door (trigger edit, no valve inside) | Yes (security-critical) | 1, 2, 3 (prod) | Yes (both valve states, live) |
| 5 | Submission wizard (upload-first, intake, receipt) | Yes | 1; 3 (prod, by choice) | Yes (new UI) |
| 6 | Crate-submission invites | Yes | 1, 5; 3 (prod, by choice) | Yes (both invite shapes) |
| 7 | Two-stage lifecycle + atomic claim | Yes | 5 | Yes (race test is automated; UI is not) |
| 8 | Rights-ready assist (draft vs. direct-fill) | Likely yes | 7, 3 | Yes |
| 9 | Artist-facing outcome notification | Likely none | 7 | Yes (copy tone) |
| 10 | Multi-reviewer + cross-surface licensability test | Yes | 5, 7 | Yes, extensively — no jsdom |

**Cannot be sliced further (atomic by nature):** Slice 4's `handle_new_user()` edit; Slice 7's
claim CAS (a single conditional `UPDATE` is the atomic unit, not something to split further).

**Highest regression risk:** Slice 4 — still edits the one trigger protecting every other signup
branch, though narrower in scope than the rejected plan's version since it no longer also carries
valve logic.

**Where the eligibility-enforcement exposure sits, corrected:** it is open TODAY, independent of
this phase (#147 merged). Slice 3 closes it. **Slices 4, 5, and 6 must not go live in production
before Slice 3 is live in production** — their code may be written in parallel, but this plan does
not let the population reaching the unenforced button grow before the button is enforced.

## Migration-numbering note

Re-verify at execution time, against `main` AND every active worktree — this project has collided
on migration numbers before. As of this replanning pass: **229 is applied** (`229_team_tier_leads.sql`,
#146). **230 is claimed, unmerged, unapplied** — PR #151 / quick task `261004-wtl`
(`tracks.work_id`), external to this phase, consumed not built here. **This phase's own new
migrations (Slices 1, 2, 4, 5, 6, 7, 8, 10) start claiming numbers at 231**, in slice order, each
re-checked immediately before writing it.
