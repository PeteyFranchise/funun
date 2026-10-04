# Phase 50 — Slice Breakdown

**Source:** `.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md` (16
sections, owner-ratified 2026-10-04) and its companion
`.planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md`.

**Status:** Roadmapped. Not discussed, not planned. This document pre-identifies slice
boundaries for `/gsd-discuss-phase 50` and `/gsd-plan-phase 50` — it is not itself a PLAN.md and
authorizes no code or migration.

**What this phase extends:** `/admin/sync-library` (`app/(admin)/admin/sync-library/page.tsx`) is
already the staff review queue — admit/reject/remove, `LEGAL_TRANSITIONS`
(`lib/sync-library/submission.ts:31-41`), `logStaffAction` audit, `SyncReadinessWorklist`
(`lib/sync-library/worklist.ts`), `blanket_agreement_document_id`. Every slice below adds to that
surface. None of them stand up a second one.

**What this phase does NOT build** (decided elsewhere, or explicitly deferred — do not re-derive
these while planning):
- Migration 230 (`tracks.work_id` direct link) and `resolveTrackAiProvenance()` — already built by
  quick task `261004-wtl` (`.planning/quick/261004-wtl-work-track-direct-link/`), migration
  unapplied. Slice 6 below *consumes* this; it does not re-plan it.
- A&R visibility/admit/quality-review permissions on `/admin/sync-library` — in flight on branch
  `anr-sync-library-visibility` (unmerged at roadmap time; touches
  `app/api/sync-library/admin/[listingId]/route.ts`, the SAME route Slice 6 edits — see the merge-
  order note under Slice 6).
- Bulk catalogue intake (§11) — explicitly deferred to its own future phase.
- SMS/iMessage outbound (§13) — roadmapped separately
  (`2026-10-04-sms-and-imessage-outbound.md`).
- Staff discovery/browse of public music (§13) — roadmapped separately
  (`2026-10-04-staff-discovery-of-public-music.md`). The invite in Slice 5 works from an artist's
  public profile page in the meantime, per the owner's own settlement.
- The "I'd like this looked at" lighter door — CUT by the owner (§16). Not built, not deferred.

---

## The hard sequencing constraint, stated once so every slice below can point back at it

§12: anyone may create an account for the sole purpose of submitting a song — no invite required.
§12 also requires a valve: a deliberate switch that stops unsolicited intake when the team is
overwhelmed. **The door and the valve ship in the same slice, or the valve ships first. Never the
door first.**

Verified while grounding this breakdown (`supabase/migrations/098_artist_signup_gate.sql:14-15,53-
69`): invite-only is enforced **inside the `handle_new_user()` Postgres trigger itself** — it reads
`NEW.raw_app_meta_data->>'role'` for the curator/buyer/industry branches, and the default (artist)
branch raises `'not_invited'` and rolls back the whole `auth.users` insert when neither a matching
`collaborators` row nor a pending `artist_invites` row exists. **Opening the door is therefore a
migration that edits this exact trigger**, not an app-layer check — the Supabase
`/auth/v1/signup` REST endpoint can be called directly, bypassing any Next.js route, so the gate
has to live where the account is actually provisioned (this is migration 098's own documented
reasoning, and it still holds for this phase).

That trigger can only see `NEW.raw_app_meta_data` and `NEW.raw_user_meta_data` at INSERT time —
**not** `app_metadata` set by a separate call, which lands after INSERT. This project has already
paid for getting that wrong twice (two prior cutover failures, per project memory); the existing
precedent that got it right is migration 105's single-use intent-id, carried in `user_metadata`
set at the client's own `supabase.auth.signUp({ options: { data: {...} } })` call. Every slice
below that needs the trigger to know *why* someone is signing up carries that fact the same way.

---

## Slice 1 — The submission door, built for the population that already exists

**What it delivers:** the one-song-at-a-time wizard itself (§9): up to 3 songs per submission,
title per song, one contact-info capture for the person (not per song), the ownership question
("are these your songs, or do you represent them?"), and a catalogue-size flag that routes to a
human conversation rather than a bulk queue (§11). Each of the up to 3 songs lands as its **own**
independently admit/reject/claim-able review item (§9) — no parent-child grouping.

**Why it ships first, to this population:** nothing in the deliberation requires this wizard to be
public-only. Building and proving it against the **existing invite-only Member population** means
the riskiest new UI on the artist side gets real usage with zero new account-creation exposure,
before Slice 4 opens the door that makes it reachable by anyone. This is a sequencing choice this
breakdown is making to de-risk Slice 4, not a literal requirement of the deliberation — confirm at
discuss-phase whether the owner wants it gated to the marketing path from day one instead.

**Files/areas:** a new submission wizard (artist-facing UI) and its API route, most likely sitting
alongside `app/api/sync-library/submit/route.ts` (today's route takes `{projectId, trackIds[]}`
and assumes each track already has a `vault_project`; this wizard's intake is different enough —
songs arriving with no project yet — that it may need its own route rather than reusing that one
verbatim; confirm at plan-phase). `sync_listings` gains new columns (or a small sibling table) for
the ownership-claim answer and the catalogue flag. Contact info most naturally lands once per
person — likely a new field on `user_profiles` rather than duplicated per submission, since §5
frames it as "collected once for the person."

**What proves it works:** a current Member can submit 1–3 songs in one pass; staff see that many
separate rows in the existing `/admin/sync-library` queue, each independently actionable; the
ownership answer and catalogue flag are visible to staff on each row.

**Depends on:** nothing new — existing auth, existing `sync_listings` table and queue.

**Migration:** yes — new columns, human-gated, owner pushes.

**Ships green because:** a real Member can use this door end to end today, and staff already see
the output, with no change yet to who may create an account.

---

## Slice 2 — Arrival-origin capture at signup

**What it delivers:** the fact of *how* someone arrived — self-serve submission intent, a
Crate-submission invite, or ordinary signup — captured at the one moment it is knowable (§3, §6).
Confirmed absent: no signup source, referrer, or arrival intent exists anywhere today;
`entry_source` (migration 096) is a narrower, different fact — it records whether a user currently
holds an `admin_invited` sync-library *capability grant* at submission time, not how their account
was created, and §13 explicitly warns against folding a new meaning into it. This slice adds its
own field; it does not touch `entry_source`.

**Mechanism:** carried in `user_metadata` at the client's `signUp()` call (per the trigger
constraint above), written into `user_profiles` by the same trigger edit, in the SAME migration as
Slice 4 below — see the merge note there. This slice's app-code half (the signup form passing the
right `options.data`) can ship and be reviewed independently; its schema half cannot land before
Slice 4's trigger edit without editing `handle_new_user()` twice for no reason.

**What proves it works:** a signup carrying the submission-intent metadata shows "arrived via:
submit a song" on the review queue row once Slice 4 lands; an ordinary invited signup shows the
existing path; nothing defaults silently to a wrong label.

**Depends on:** nothing to design; its migration lands bundled with Slice 4 (see there).

**Migration:** yes, bundled into Slice 4's trigger edit — not a separate push.

**Ships green because:** the capture mechanism and its queue display are built and reviewable on
their own; only the actual schema write waits for Slice 4's single trigger edit.

---

## Slice 3 — The valve, default closed, shipped inert

**What it delivers:** a leadership-only kill switch (§12) for unsolicited public submissions,
reusing the D-56 pattern already proven in this codebase (`lib/workspaces/access-kill-switch.ts`)
rather than inventing a new on/off mechanism. Default state is **closed** — today's actual reality
(invite-only) stays true the moment this ships, so flipping it open is a deliberate, later,
separately-audited act. Also ships: the waitlist-with-reason copy ("submissions are paused while
we catch up — join the list and we'll say when they reopen") and the catalogue-scale escape hatch
(§11/§12) on the EXISTING `/signup` waitlist experience, exercised now even though nothing reads
the switch's state yet.

**Why this must be a SQL-readable table, not an app-only flag:** the artist-branch trigger edited
in Slice 4 runs inside Postgres and has no access to application runtime — it can only check a
plain table via `SELECT`. A feature-flag service, an environment variable, or an in-memory cache
would all be invisible to the one place that actually has to enforce it.

**Files/areas:** a new singleton settings table (e.g. a one-row `sync_submission_settings`, or
however discuss-phase names it), a leadership-only toggle route + UI, `logStaffAction` audit on
every flip, and copy changes to the existing `/signup` waitlist page.

**What proves it works:** leadership can flip the switch and see the change audited; a non-
leadership staff role gets a 403 attempting to flip it; the waitlist page renders the
paused/escape-hatch copy. None of this yet gates a real signup, because Slice 4 hasn't shipped.

**Depends on:** nothing. Can ship in parallel with Slice 1.

**Migration:** yes — the settings table. Human-gated.

**Ships green because:** the switch exists, is testable, is audited, and is harmless — nothing
public depends on it yet.

**Hard constraint carried forward:** Slice 4 must not ship, and must not even be mergeable in a
reachable state, before this slice is live in production. This is the literal enforcement of
"never the door first."

---

## Slice 4 — Open the door (gated by the valve, from the first commit that can reach it)

**What it delivers:** the actual bypass — anyone may create an account for the sole purpose of
submitting a song, no invite required (§12). Both marketing "Submit a song" placements (hero + The
Crate section, both currently pointing at a blind `/signup` waitlist per §8's still-open item) are
relabeled/relinked to the real flow. In-flight submissions complete even if the valve closes mid-
session (§12's explicit "cannot strand someone mid-upload").

**Mechanism, concretely:** a `CREATE OR REPLACE FUNCTION public.handle_new_user()` migration that
reproduces migration 098's current live body verbatim (re-check which migration is actually live
at plan time — 098 drafted the shape; confirm nothing between then and now touched this function
again) with one surgical addition to the default/artist branch: before the existing `v_is_invited`
gate, check for the submission-intent flag in `NEW.raw_user_meta_data` AND the Slice 3 valve table
reading open; if both hold, treat as admitted regardless of the invite-allowlist check, and record
the Slice 2 origin field in the same `user_profiles` INSERT this branch already performs. Mirrors
exactly the "verbatim reproduction, two surgical lines" discipline migration 230 already uses for
`graduate_song_passport_to_release()`.

**Files/areas:** the `handle_new_user()` migration (new number, claim at plan time — see migration-
numbering note below); the signup page/route passing the new `user_metadata` intent flag;
`assets/marketing/landing.html` + the gitignored `private/bench/marketing.html` re-freeze pipeline
(§8's noted mechanism — editing the committed artifact directly does not work).

**What proves it works:** with the valve open, a brand-new anonymous visitor can create an account
through this path with no invite and land in Slice 1's wizard; with the valve closed, the same
visitor sees Slice 3's waitlist copy and no account is created; a submission already mid-upload
when the valve flips closed still completes.

**Depends on, as a hard ordering constraint (not a suggestion):** Slice 3 (the valve must exist and
read as closed before this migration can even be written against it) and Slice 2 (the metadata
contract this trigger edit consumes). Also touches the same security-critical function Slice 2's
own capture mechanism needs — ship them as ONE migration, not two sequential edits to
`handle_new_user()`, to avoid the "re-verify the live version before writing a second patch" risk
this codebase already knows about from parallel-migration collisions.

**Migration:** yes — editing a live, security-critical `SECURITY DEFINER` trigger. Human-gated,
and reviewed with the same weight this project gives migration 190's `BEFORE UPDATE` custody
trigger.

**Cannot be sliced further:** a `CREATE OR REPLACE FUNCTION` is one atomic statement — there is no
way to ship "half" of this trigger edit. The atomic unit is the whole function body.

**Ships green because:** the door opens exactly as wide as the valve allows, verified by directly
exercising both valve states against the actual signup endpoint (not just the UI) — and the escape
hatch and provenance capture it depends on are already proven in Slices 2/3.

**Highest regression risk in this phase.** This edits the one trigger standing between Funūn and
open public signup. A defect here is not a UI bug — it is either (a) a hole that lets anyone sign
up regardless of valve state, or (b) breaking the EXISTING curator/buyer/industry/invited-artist
branches that migration 098 already protects, which would be a production outage for every signup
path, not just this new one.

---

## Slice 5 — Crate-submission invites ("Submit THIS" and "Submit me something")

**What it delivers:** the third door (§13): a Funūn Team Member invites a specific person, two
shapes —
- **"Submit THIS"** — staff finds a track an artist chose to share publicly (via that artist's
  public profile page — the one place staff can find it today; a browse surface is explicitly
  out of scope, roadmapped separately), points at it, the artist may swap it for something else
  before submitting, with a line open for staff to make the case for the original pick. The
  artist answers every rights question themselves; the pre-fill is the song, never the answers.
- **"Submit me something"** — a single-use, non-shareable, email-bound invite to someone who may
  have no Funūn account yet. **Not a shareable link** — a link that works for whoever holds it
  would be an uncapped way around the valve.

**Both bypass the valve by design** — the valve throttles strangers walking up, not the team
bringing someone in (§13). The queue shows "invited by [name]" plus their note.

**Correction carried in from the deliberation:** the existing `app/api/sync-library/invite/route.ts`
invite is a DIFFERENT thing — it grants an existing artist a `sync_library` capability, fires an
in-app notification only, and never expires. It cannot do either job here and is not touched by
this slice. `artist_invites` (migration 097) is the better-fitting precedent (atomic mint/rotate,
Resend send, 30-day token) but its `source` CHECK (`'collaborator' | 'staff' | 'waitlist_conversion'
| 'owner_seed'`) does not have a value for this and its rows terminate in a plain account, not a
submission.

**Files/areas:** a new invite-token mechanism (new table or a widened `artist_invites`, decided at
plan-phase — needs its own CHECK values, distinct from both `entry_source` and `artist_invites.source`),
a staff-facing "Invite to submit" action on the public profile page view, Resend send, and the
queue-row display of inviter + note.

**The underspecified part, flagged honestly:** the deliberation says a "communication line" stays
open for the swap negotiation on "Submit THIS" but does not say what that line IS. This phase has
no existing staff↔artist real-time channel to reuse (Phase 11's DMs are Member-to-Member, and staff
identity is deliberately separate from Member identity per `.claude/CLAUDE.md`'s account
vocabulary). The cheapest honest option is a reply-able email thread riding the same Resend send
this invite already needs — not a new chat feature. Needs an explicit decision at discuss-phase;
this breakdown does not assume one.

**What proves it works:** a staff member can send both invite shapes; "Submit THIS" survives the
artist swapping the song; "Submit me something" cannot be reused by a second person after
redemption; both work with the Slice 3 valve closed; the queue shows who invited whom and why.

**Depends on:** Slice 2's provenance field (to record the invite-driven origin distinctly from
marketing self-serve) and Slice 1 (invited submissions land in the same wizard/queue). Does NOT
depend on Slice 4 — invites must work even if the public door stays shut forever.

**Migration:** yes — new CHECK values and/or a new invite table.

**Ships green because:** a staff member can invite someone in today, end to end, independent of
whether the public door (Slice 4) has shipped yet.

---

## Slice 6 — Rights-enforced advance: AI-provenance eligibility at the moment of admit

**Where the eligibility-enforcement exposure sits before this slice ships:** every slice above
this one (1–5) makes MORE submissions reachable, by MORE paths, without changing the fact that
`/admin/sync-library`'s admit action still never checks `ai_entries` at all. §14 (already
decided, separate branch) widens admit from leadership-only to **leadership + A&R**. Put together:
by the time Slices 1–5 ship, more people can create more submissions through more doors, and more
staff can click "admit" on them, and the thing the owner called rights-bearing and demanded be
enforced "at that instant, not approximately correct" is still unenforced. **This slice is where
that exposure finally closes — everything before it ships with the exposure open, by necessity,
because this slice's own external dependency (migration 230) is not this phase's to build.**

**What it delivers:** wires the already-built, already-tested `resolveTrackAiProvenance()`
(`lib/catalogue/track-work-link.ts`, from quick task `261004-wtl`) into the admit route
(`app/api/sync-library/admin/[listingId]/route.ts`) as a **new, independent precondition** — NOT
folded into the existing `GateSignal`/`evaluateInclusionGate()` readiness check. Verified directly
(`lib/sync-library/gate.ts:1-16`'s own header comment): that module is explicit that readiness
signals must never become "a fourth, independently-drifting readiness signal," and AI-provenance
eligibility is a different axis from readiness entirely — whether a song CAN be licensed at all,
independent of whether its paperwork is done. An unresolved verdict (no work→track link, e.g. every
legacy-upload track) routes to the SAME existing `'contact'` tri-state `lib/sync-library/gate.ts`
already uses for an uncleared sample (`rightsBadge()`) — never a confident "clean," per the owner's
own rule that null means "we do not know."

**Files/areas:** `app/api/sync-library/admin/[listingId]/route.ts` (the admit handler), a small new
query (fetch `tracks.work_id`, then that work's `ai_entries`, then call the resolver — the resolver
itself does no I/O by design), and the `SyncReadinessWorklist` display (surface "AI-provenance:
cannot determine, check by hand" as a worklist item, extending the one existing authority rather
than adding a rival list, per §5's explicit instruction).

**Hard external dependency:** migration 230 must be reviewed and pushed by the owner (quick task
`261004-wtl`, unapplied as of this roadmap pass) before this slice can query `tracks.work_id` at
all. This phase does not re-plan or re-push that migration; it only consumes it.

**Merge-order risk, flagged explicitly:** this slice edits the SAME file
(`app/api/sync-library/admin/[listingId]/route.ts`) that branch `anr-sync-library-visibility`
already edits (unmerged at roadmap time — confirmed via `git diff main...anr-sync-library-
visibility --stat`). Whichever lands second must rebase against the other; do not plan this slice
assuming today's copy of that file is what it will actually touch.

**What proves it works:** admitting a track with a resolvable, clean work→track link succeeds
unchanged; admitting a track with a resolvable, disqualifying AI entry is blocked or routed to
`'contact'` (confirm which, at discuss-phase — the deliberation does not say whether disqualified
blocks admit outright or routes it, only that unresolved must never read as clean); admitting a
legacy track with no resolvable work shows "cannot determine, check by hand" and does NOT silently
proceed as clean.

**Migration:** none of its own — pure app-code wiring against migration 230's already-built schema
and already-built resolver.

**Ships green because:** the admit action finally checks the one thing the owner said must be
checked at that instant, using a resolver that is already built and already proven null-safe by
its own test.

---

## Slice 7 — Rights-ready assist: contact capture, staff fallbacks, nudges

**What it delivers:** the §5 workflow for getting an accepted-but-not-yet-rights-ready song to
rights-ready —
1. **Contact details**, captured deliberately (new PII — state why it's collected, scope who can
   see it), available to staff when something is outstanding.
2. **Staff draft-for-confirm**: a Funūn Team Member can propose a split/entry on the artist's
   behalf, visible as PROPOSED until the artist confirms — nothing takes effect until they do.
3. **Staff direct-fill**: available only when absolutely necessary, and visibly marked as staff-
   entered, distinct from an artist's own entry, permanently.
4. **Nudges**: an automatic cadence, plus a manual "send a push" action for a specific Funūn Team
   Member to use when it matters.

Both fallbacks must be **visibly exceptional**, never styled as the easy path — the ordering in
§5 (artist acts by default; staff prompts; draft-for-confirm; direct-fill, rarest) should read as
visually true in the UI, not just true in the copy.

**One definition of done, reused:** this slice layers onto the EXISTING `SyncReadinessWorklist`
(`lib/sync-library/worklist.ts`) and its missing-item derivation
(`lib/sync-library/readiness.ts`'s `syncReadinessForTrack()`/`missingSyncItems()`) — it does not
invent a new "rights-ready" bar alongside vault readiness, CWR readiness, and the sync gate. The
proposed-vs-confirmed states are a NEW capability on top of that worklist, not a rival to it.

**Files/areas:** `lib/sync-library/worklist.ts` and `readiness.ts` (extend, don't duplicate), a new
contact-info field (confirm whether this reuses Slice 1's per-person contact capture or is a
separate concept — likely the same field, read by staff here), proposed/confirmed state columns on
whichever rights record this touches (most likely split-sheet-adjacent — confirm the exact target
at discuss-phase rather than assuming), and a reminder-cadence mechanism (likely a cron similar to
the existing storage-threshold cron, per migration 227's precedent, plus a `last_nudged_at`-style
column for the manual-push action).

**What proves it works:** staff see exactly what's outstanding per song via the existing worklist;
a staff-drafted entry shows as proposed and does nothing until the artist confirms it; a staff
direct-fill entry is permanently marked as staff-entered; an automatic nudge fires on schedule and
a staff member can also send one immediately.

**Depends on:** Slice 6 (this is the workflow that runs AFTER a song is accepted but found not
rights-ready by Slice 6's enforcement) and Slice 1 (contact info capture).

**Migration:** likely yes (proposed/confirmed state columns, nudge-cadence tracking) — confirm
exact shape at discuss-phase rather than assuming a specific table here.

**Ships green because:** the existing worklist authority now also drives real staff action and
real artist nudges, without becoming a second "done" definition.

---

## Slice 8 — Artist-facing status and outcome

**What it delivers:** the artist's half of §4's "acknowledge now, outcome when there is one" —
received/awaiting-review status visible on the song itself, and the eventual decision communicated
**including a decline**, with zero internal review detail (comments, who reviewed it, why)
surfaced. Status lives where the artist will actually look: on the song, reusing the existing
`LEGAL_TRANSITIONS` states (`lib/sync-library/submission.ts:31-41`) that already model exactly this
progression — this slice is a read/display + notification wiring job over states that already
exist, not a new state machine.

**Files/areas:** the artist-facing song/work page (wherever a Member currently views their own
submitted track), the existing notification pipeline (`lib/notifications`, `createNotification`)
and Resend email on each `sync_listings.status` transition relevant to the artist (admitted,
rejected, removed).

**What proves it works:** a submitting artist sees "received, awaiting review" immediately after
submitting; on a staff decision, they are notified (in-app and email) with the outcome, including
a plain rejection; nothing from Slice 10's internal staff discussion ever reaches this surface.

**Depends on:** Slice 1 (there must be a submission to show status for). Does not depend on Slices
4–7 — this can ship against the existing invite-only population exactly as well as the opened one.

**Migration:** likely none — confirm at discuss-phase whether notification templates alone suffice
or a new "artist-visible status" projection is needed.

**Ships green because:** an artist who submits today already gets an honest acknowledgment and an
honest outcome, with no dependency on anything else in this phase.

**Needs a human in a browser:** confirming the rejection-notification copy reads as acknowledging
and not dismissive is a judgment call, not a thing a test can assert.

---

## Slice 9 — Close the Selects admission gap (small, and arguably should not wait for this phase)

**What this slice exists to fix, found while verifying §15's own "to verify before building"
instruction:** the deliberation assumes "Selects is believed to be catalogue-only and gated to
rights-ready Crate tracks" and says to confirm that gate holds before building Slice 10's sharing
feature. **Verified directly and it does NOT hold.** Read in full:
`app/api/admin/selects/[id]/tracks/route.ts`'s `POST` handler validates only that `trackId` is a
well-formed UUID (`AddTrackBodySchema`) and that the caller is staff
(`requireStaff(['leadership','ae','bd'])`); it then calls `addSelectsTrack()`
(`lib/selects/persistence.ts:196-235`), which inserts into `selects_tracks` with **zero** check
against `sync_listings.status` or any rights-ready computation. The only enforcement is a bare FK
(`track_id REFERENCES tracks(id)`) — any track that exists at all can be added. `resolveTracksWith
RightsReady()` (`lib/selects/tracks-query.ts`) computes `rights_ready` **only at read time**, as a
display flag; it never gates the write. The UI that normally drives this route may only ever offer
admitted tracks to pick from, but that is client trust, not server enforcement.

**Why this matters more than the deliberation assumed:** §15's own fallback, if the gate didn't
hold, was "a shared, unadmitted song should at minimum be visibly marked as not licensable
wherever an AE encounters it." That is not enough on its own — today, any staff member with `ae`,
`bd`, or `leadership` can already mechanically `POST` ANY track id (admitted or not, even one never
submitted at all) into a Selects, which is reachable by an unauthenticated public token
(`/selects/[token]`). **This is a pre-existing production exposure, independent of Phase 50** —
the owner may want this fixed as its own quick task immediately rather than waiting for this
phase.

**What it delivers:** a server-side check in `addSelectsTrack()` (or the route calling it) that a
`track_id` being added corresponds to an `admitted` `sync_listings` row before the insert succeeds.

**What proves it works:** `POST /api/admin/selects/[id]/tracks` with a non-admitted or non-existent-
in-Crate `trackId` is rejected; the existing happy path (adding an admitted track) is unchanged.

**Depends on:** nothing in this phase. Can and arguably should ship standalone, now.

**Migration:** none — pure app-code validation.

**Ships green because:** it closes a real, already-exploitable hole with a one-function change and
no schema risk.

---

## Slice 10 — Multi-reviewer: the collaborative review surface

**What it delivers (§15):** staff-only collaborative review over a submission —
- A general comment thread AND comments pinned to a moment in the track.
- Reactions.
- Two distinguished share actions: **nudge** a colleague who already has access (no permission
  change) vs **grant a look** to someone who does not (a permission grant, audited via the
  existing `logStaffAction` → `staff_audit_log` pattern).
- A submission shared with someone who cannot normally see the queue (the owner's example: A&R
  sharing with an AE) is visibly marked as not licensable wherever that person encounters it, and —
  per Slice 9 — cannot be mechanically added to a Selects before admission regardless.

**Internal only, permanently:** the artist sees none of this — only the outcome (Slice 8). The
store is **staff-only and separate** from the artist-facing collaborator-comment pattern
(timestamped notes on a take) — same shape may be reused, the data must not be, per the owner's
explicit instruction. Reusing the artist-facing table would put a team's blunt internal verdict in
the same place as a co-writer's note to the artist.

**The explicit design bar:** the owner named three references directly — The Crate, The Selects
Player, and the Writer's Room redesign. This is not an admin table with a comment box; it is a
listening surface held to that same bar. This is the largest, most design-heavy slice in the
phase, and should be expected to decompose into several PLAN.md files at plan-phase, not one.

**Files/areas:** new staff-only tables (comments, moment-pins, reactions, share-grants — all
`FOR ALL` zero-policy / full REVOKE from `authenticated`/`anon`, reachable only via
`requireStaff`-gated service-role routes, mirroring migration 111's `selects_tracks` posture
exactly), new staff-facing UI components reusing Writer's Room take-player/waveform-pin patterns
where they already exist rather than rebuilding them, and the share-grant's `logStaffAction` wiring.

**What proves it works:** two staff members can comment on the same submission, one pinned to a
specific moment in the waveform, and see each other's comments and reactions; the artist-facing
surface shows none of it; nudging a colleague changes nothing permission-wise; granting a look to
someone without queue access actually grants it, is recorded in `staff_audit_log`, and is visually
distinct from a nudge in the UI; an AE who has been granted a look at an unadmitted submission sees
it marked as not licensable everywhere it appears to them.

**Depends on:** Slice 1 (submissions to review exist), Slice 9 (closing the Selects gap — this
should land no later than this slice, since this slice is what makes "AE sees something they
shouldn't act on yet" a normal, designed-for case rather than an edge case).

**Migration:** yes — new staff-only tables.

**Needs a human in a browser, unavoidably:** this repo has no jsdom, so component tests cannot
observe interaction state at all. Every piece of this slice — posting a comment, pinning one to a
waveform moment, reacting, nudging vs granting, seeing the not-licensable mark — is interaction
state. None of it can be verified by an automated test in this codebase; all of it needs a human
clicking through it in an actual browser before this slice can be called done.

**Ships green because:** staff get a real collaborative review surface with the right audience
boundary and the right audit trail, built to the standard the owner actually asked for rather than
an admin-table stand-in — but only once a human has verified every interaction by hand.

---

## Summary table

| Slice | Delivers | Migration? | Depends on | Human-in-browser needed? |
|---|---|---|---|---|
| 1 | Submission wizard (existing Members) | Yes | — | Yes (new UI) |
| 2 | Arrival-origin capture (app-code half) | Bundled into 4 | — | No |
| 3 | The valve (default closed) | Yes | — | Yes (toggle UI) |
| 4 | Open the door (trigger edit) | Yes (security-critical) | 2, 3 | Yes (both valve states, live) |
| 5 | Crate-submission invites | Yes | 1, 2 | Yes (both invite shapes) |
| 6 | Rights-enforced advance (AI provenance) | No (consumes ext. migration 230) | External: migration 230; merge-order risk with `anr-sync-library-visibility` | Yes (admit decisions) |
| 7 | Rights-ready assist (contact, drafts, nudges) | Likely yes | 1, 6 | Yes |
| 8 | Artist-facing status/outcome | Likely none | 1 | Yes (copy tone) |
| 9 | Close the Selects admission gap | No | — (ship standalone now) | No |
| 10 | Multi-reviewer collaborative surface | Yes | 1, 9 | Yes, extensively — no jsdom |

**Cannot be sliced further (atomic by nature):** Slice 4's `handle_new_user()` edit (one
`CREATE OR REPLACE FUNCTION`, no partial version); the valve-before-door ordering between Slices 3
and 4 (not reorderable, per the owner's own framing — "never the door first").

**Highest regression risk:** Slice 4 — it edits the one trigger currently preventing unsolicited
public signup, and a defect there risks either an open hole or breaking every existing signup
branch (curator/buyer/industry/invited-artist) migration 098 already protects.

**Where the eligibility-enforcement exposure sits, slice by slice:**
- After Slice 1: unchanged from today — more songs can arrive, nothing enforces AI provenance at
  admit, same as it is in production right now.
- After Slices 3–5: MORE paths bring MORE submissions in (public door + invites), still with no
  enforcement at admit.
- Concurrently, the separate `anr-sync-library-visibility` branch widens WHO can admit, which
  widens the population next to the same unenforced button.
- Only after Slice 6 does the admit action actually check eligibility. Sequencing Slice 6 any later
  than necessary — relative to Slices 1–5 — maximizes the window where more people, through more
  doors, can click an unenforced "admit."

## Migration-numbering note

Production ceiling is 227 applied. `228_split_sheet_party_identity_provenance.sql` already exists
on disk on `main` (unapplied as of this check) — distinct from `STATE.md`'s own narrative
description of "migration 228" as the M-01 `owner_segment` fix, which appears stale against the
actual file; do not assume STATE.md's number without checking the file. `229_team_tier_leads.sql`
is claimed by quick task `261004-ttq` (its own worktree, unmerged). `230_track_work_direct_link.sql`
is claimed by quick task `261004-wtl` (unmerged). **Do not claim a number for this phase's own
migrations (Slices 1, 3, 4, 5, 7, 10) until discuss/plan time**, and re-run the check against main
AND every active worktree immediately before writing each one — this project has multiple parallel
sessions in flight and has collided on migration numbers before.
