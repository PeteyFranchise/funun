# Owner decisions, 2026-10-04 — splits copy, Gate 0, and the submissions room

**Status:** DECIDED by the owner, 2026-10-04. Recorded the same session.
**Why this file exists:** three decisions were taken in one pass, two of them create new builds
that do not yet have plans, and one of them carries a privacy constraint that is easy to get wrong.

---

## 1. Splits copy — ship the honest line now, build the upload after

Question 3 of the submit-a-song questionnaire asks *"Are the splits agreed?"*. The answer
*"Agreed and written down"* had the draft reply *"Nice. Bring it in and it rides with the song from
here."*

**That line promised something the product cannot do.** There is no `work_documents` table and no
upload route — nowhere to put a split sheet somebody already signed.

**Decided: both halves.**

- **Now:** the reply becomes *"Good — that's the hard part done. We'll note it on the song so
  nobody asks you twice."* True today, no build, and it still records something useful.
- **Next, as its own build:** accept the existing signed document. **It must land with the song's
  splits, not in a generic documents pile** — the owner was explicit about placement. When it
  ships, the copy can become *"Bring it in and it rides with the song from here,"* because by then
  it will be true.

This is the `label-integrity-funun` discipline applied to copy: say the true thing now, change the
words when the capability changes, never the other way round.

---

## 2. Gate 0 — render both grounds at twelve-up, owner picks

**Phase 42 was never in collision with the Writer's Room tabs — it was blocked by their absence.**
Its own sequencing note reads *"the shipped room has no replacement tabs — the tabs are a bench
invention."* PRs #141-#144 built them, so **that sentence is now stale and must be corrected in
`.planning/ROADMAP.md`.**

Phase 42 remains blocked by **Gate 0**, which is a visual judgement and not a coding task: cards
sit at `#0a0a0c` on a true-black `#000` page, roughly 4% separation. Does that hold when twelve
cards tile, or do the hairlines end up carrying the grid and turn it into a spreadsheet? The
alternative is lifting `--card` so cards separate by surface instead of by hairline.

It is a gate because the answer changes token values every phase below inherits — getting it wrong
means re-skinning twice. It is cheap to answer: one token swap, and 1,753 token usages re-skin from
two files.

**Decided:** render both grounds as a twelve-card grid on the bench, side by side, and the owner
chooses. Phase 42 proceeds after.

---

## 3. The public CTA, and a submissions room for Funūn Team Members

### The door

"Submit a song" sends a stranger to a waitlist, because Funūn is invite-only. Same shape as the
Team card's *"Talk to us"*, which the owner already corrected to *"See if Team fits"* because it
promised a conversation most people would never get.

**Decided, both:** change the label so it is true today, **and** make the waitlist carry the
intent — someone arriving from this path lands on a waitlist that names what they came to do and
captures it, so the arrival is not wasted. Invite-only is unchanged.

### The Crate Submissions Screen — a new build

**Name, confirmed by the owner:** *The Crate Submissions Screen*, on the Funūn Team Member side.
It does **not** exist today — it is the thing being built, not an existing surface to add to.

**Its job, in the owner's words:** to *accept these submissions for a review*, and then *build in a
review process*. That is **two stages, not one**:

1. **Acceptance** — an intake decision a Funūn Team Member makes: is this coming in for review at
   all? A submission arrives, someone accepts or declines it.
2. **Review** — what then happens to everything accepted.

Keeping them separate matters: it is the difference between "nobody has looked at this yet" and
"we looked and said no," and a queue that cannot tell those apart loses both the backlog and the
decision.

### Arrival provenance — Member vs marketing CTA

**The owner requires the screen to show whether a submission came from an existing Funūn Member or
from someone who arrived through the marketing "Submit a song" CTA.**

**The trap, flagged before planning:** signup happens *before* upload (owner decision, same day),
so **both groups are Members by the time they submit**. Asking "is this a Member?" returns yes for
everyone and distinguishes nothing.

What is actually wanted is **how they arrived** — an origin captured at the door and carried
through to the submission. It cannot be derived afterwards from account state, because by then the
two look identical. If nothing persists arrival origin today, capturing it is part of this build
and must happen at signup, not at submission.


**Decided:** a Funūn Team Member room holding submitted songs, with a review process. Visible to
**leadership and A&R** (`anr` is a real `StaffRole`); the wider visibility list is explicitly
deferred until the owner determines it.

**What lands in it — both opt-in, and this is the constraint that must not be relaxed:**

1. songs the artist **explicitly submitted** (the existing deliberate action, recorded in
   `sync_listings`), and
2. a lighter **"I'd like this looked at"** signal someone can give during the questionnaire without
   going through full Crate submission — a new signal still to be designed and named.

**Nothing arrives in this room merely by being uploaded.** The owner's own framing of the
marketing CTA is that it *"does not submit anything"* and that the artist is told *"this is a
private vault and not yet a submission our staff can determine for The Crate."* A room showing
songs that only passed through that path would break that promise outright.

> This is the same defect class as PR #139, shipped the same day: a service-role query that
> deliberately bypassed RLS exposed private ideas to collaborators who were never meant to see
> them, and it went unnoticed for five weeks because nobody asked who was allowed to look. Ask it
> here, before the room exists.

**Shape: queue first, discovery second.** States a reviewer moves a submission through — new,
listening, passed, advanced — with who did it and when, so nothing is lost or reviewed twice.
Browsing and filtering layer on later, once there is enough volume for browsing to mean anything.

### Constraints carried from `.claude/CLAUDE.md`

- This is **staff** surface, gated by `funun_staff` and server-verified roles. It must fail closed.
- **Nothing here creates a Client Partner**, reuses `buyer_orgs`/`buyer_members`, or routes through
  the buyer rooms. `/admin/crate-requests` is the **buyer** room and is not this.
- Never write "Team Member" meaning staff without "Funūn".

---

## What this unblocks, and what it does not

**Ready to plan:** the split-document upload; the CTA label and waitlist intent; the submissions
room (large enough to want its own phase, not a quick task).

**Still parked, unchanged:** self-serve Team signup (Phase 47) and full account data export
(Phase 49).

**Still open:** question 2's catalogue-size bands in the Team-tier questionnaire — the owner has
not set them, and the todo is explicit that only he can.

---

## 4. The submission flow, end to end (DECIDED, owner 2026-10-04)

### Artist side

1. Marketing page → **"Submit a song"**, relabelled so it is true while Funūn is invite-only.
2. Invite-only gate → a waitlist that **carries the arrival intent**, or straight through if invited.
3. Signup → first-run. **Arrival origin is captured here** — see the provenance trap above.
4. **The song uploads first.** Nothing is asked before it is in.
5. Questionnaire; every question skippable.
6. Summary: where the song lives, what it is missing, Crate eligibility — **all four doors on screen**.

Only two things then make a song visible to staff, and **both are opt-in**:

- **Explicit submit** — the existing deliberate action.
- **"I'd like this looked at"** — a lighter signal, new, still to be designed and named.

### Funūn Team Member side

7. The submission lands on **The Crate Submissions Screen**.
8. **Accept or decline** — the intake decision.
9. Accepted submissions enter the **review process**.
10. A positive outcome **advances the song into The Crate**.

### Ownership: shared pool, claim to review

Everyone with access sees everything; claiming a submission marks it yours so two people do not
review the same song. **The claim is the assignment** — no routing step to stall on, and it scales
without anyone administering a queue.

### What the artist hears: acknowledge now, outcome when there is one

They see that the song was received and is awaiting review, and they hear when a decision lands —
**including a no**. The status lives on the song, where they will look for it.

Rejected: acknowledging receipt and keeping outcomes internal, and deferring artist-facing status
entirely. A product that takes something from people and then tells them nothing is hard to walk
back, and silence is the thing this product exists to replace.

### Step 10 is rights-bearing — enforce at the moment, do not trust the reviewer

Advancing into The Crate makes a song **visible to buyers and licensable**. Eligibility
(`resolveCrateConsequence` — AI provenance, independent of readiness), splits state, and sample
clearance (`sampleBlock`, which gates `canContinue`) must be **correct at that instant, not
approximately correct**. The advance action enforces them; it does not assume the reviewer checked.

### The consent gap between the two intake doors — RESOLVED

The two doors carry **different consent**, and conflating them would license a song on a permission
the artist never gave:

| Arrived via | Consented to | May be advanced? |
|---|---|---|
| Explicit submit | Crate consideration | **Yes** — it is what they asked for |
| "I'd like this looked at" | Being *reviewed* | **No, not directly** |

**Decided:** a song from the lighter door can be accepted, reviewed and loved, but advancing stops
there. The artist is told *"we want this in The Crate — submit it and it's in"* and makes the
licensing decision themselves, because it is theirs to make.

Rejected: folding Crate consent into the lighter signal (which would collapse the two doors and
destroy the point of a lighter one), and letting staff advance anything regardless of origin
(which licenses a song on absent consent, in a product whose pitch is that the artist keeps the
record).

**This is the third consent-or-visibility defect caught in one day** — after #139's service-role
idea exposure and the submissions-room intake question. The pattern is consistent enough to state
plainly: whenever a surface shows one person's material to someone else, establish who consented
to what *before* the surface exists, because afterwards it looks like working software.

---

## 5. Getting an accepted song rights-ready (DECIDED, owner 2026-10-04)

### The contradiction this resolves

Step 10 advances a song into The Crate (licensable), but documents are chased *after* acceptance.
Between those two points a buyer could license a song whose splits nobody has signed.

**Decided: visible and pitchable, but routed to "contact" until rights-ready.** The song appears in
the catalogue and can be pitched; it cannot be instantly licensed until the paperwork is in. This
is **an existing pattern, not a new concept** — `lib/sync-library/gate.ts` already routes a song
with an uncleared sample to `'contact'` rather than a clean licence.

Rejected: hiding accepted songs until rights-ready (A&R could not pitch what they love while
paperwork catches up), and full licensability on acceptance (a buyer licensing unsigned splits is
the defect that costs real money).

### Who does the work: the artist, with staff able to help

**Decided, in priority order:**

1. **Default and strongly preferred — staff see and prompt, the artist acts.** Every rights-bearing
   entry (splits, signatures, ownership claims) is made by the artist or their collaborators.
   **Staff always encourage the artist to handle it first.**
2. **Staff may draft for the artist to confirm** — available when necessary, with a
   proposed-vs-confirmed state so nothing takes effect until the rightsholder agrees.
3. **Staff may fill in directly** — available only when *absolutely* necessary.

Both fallbacks must exist, and both must be visibly exceptional rather than the easy path. The
reason for the ordering is unchanged: a Funūn Team Member entering a split is asserting who owns
what, and that is a claim nobody at Funūn is positioned to make.

**Transparency is a requirement of the design, on both sides.** The artist can see what staff see
about their song's outstanding items, and anything staff did on their behalf is visible to them.

### Contact information — a new requirement

Reaching the artist is now part of the flow, so **contact details must be captured** and available
to staff when something is outstanding. This is new data about a person: capture it deliberately,
state why it is being collected, and scope who can see it.

### Chasing: the system nudges, staff can step in

Automatic reminders on a cadence, with a Funūn Team Member able to send a personal push when it
matters. Does not depend on anyone remembering, and reserves the personal touch for where it counts.

### One definition of done

There are already at least three readiness notions — vault readiness (`lib/vault/readiness.ts`),
CWR readiness (`assessCwrReadiness`), and the sync gate (`lib/sync-library/gate.ts`) — plus an
existing `SyncReadinessWorklist` built on `lib/sync-library/worklist.ts`. **A fourth "rights-ready"
bar that disagrees with the others is worse than no bar.** One list behind one authority; extend
what exists rather than adding a rival.

---

## 6. CORRECTION — the screen is substantially already built

Recorded because this document previously asserted the opposite, and the error would have produced
a duplicate surface.

**`/admin/sync-library` already exists** (`app/(admin)/admin/sync-library/page.tsx`) and is the
staff review queue over song submissions — the supply side. It already has:

- admit / reject / remove, with a status enum whose single authority is `LEGAL_TRANSITIONS`
  (`lib/sync-library/submission.ts:31-41`): `applied | invited | agreement_pending | pending_admit
  | admitted | rejected | withdrawn | removed`
- actor and timestamp columns (`decided_by`/`decided_at`, `removed_by`/`removed_at`) and a
  universal `logStaffAction` audit into `staff_audit_log` on every staff write
- **`SyncReadinessWorklist`** / `buildWorklist()` — the outstanding-items surface
- **`blanket_agreement_document_id`**, plus SQL functions that move a listing to `pending_admit`
  when the agreement completes — the artist→Funūn agreement is real and wired
- quality-review fields (`quality_ok`, `quality_note`, `quality_reviewed_by`, `staff_notes`)

**What is genuinely missing:**

1. **Arrival provenance** — confirmed absent. No signup source, referrer, campaign or arrival
   intent exists anywhere. `entry_source` is only `admin_invited | self_applied`, derived from a
   `capability_grants` row. Migration 105's intent-id is a single-use auth token, deleted at
   consumption, and cannot carry this.
2. **A&R cannot see the screen** — it is gated to `leadership` and `ae`. `anr` is a real
   `StaffRole` and is not on the list. The owner wants leadership and A&R.
3. **No pre-decision assignment** — only post-decision actor columns exist, so shared-pool
   "claim to review" needs a new field.
4. **No artist-facing status and no nudges.**
5. **The lighter "I'd like this looked at" door** does not exist.

### The one real structural problem

**Per-track Crate eligibility cannot be resolved today.** `ai_entries` keys off `work_id`
(`135_works_core.sql:273-288`); `sync_listings` keys off `track_id` / `vault_project_id`. The only
bridge is `works.graduated_project_id → vault_projects.id`, and because a project may hold several
tracks, that join **cannot resolve to one specific submitted track**. `/admin/sync-library` never
queries `ai_entries` today.

This needs designing, not wiring — and it matters because step 10 is rights-bearing and eligibility
is one of the things the advance action must enforce.

---

## 7. The work→track eligibility gap (DECIDED, owner 2026-10-04)

**The problem in plain terms.** Funūn stores a song in two places: the writing side (a `work`) and
the release side (a `track` on a `vault_project`). The AI disclosure lives on the writing side; a
sync submission lives on the release side. The only connection points at the whole release, so on
a single it resolves fine and **on an EP it cannot say which disclosure belongs to which song.**

This blocks the owner's own decision that advancing a song into The Crate is rights-bearing: the
advance must enforce eligibility, and it cannot enforce what it cannot resolve per track.

### Decided

1. **When the system cannot be certain, it says so and asks for a manual check.** Not a best guess,
   not a marked guess — an explicit "cannot determine, check this by hand." A labelled guess is
   still the thing a busy person clicks past, and the cost of being wrong here is a licensed song
   that should not have been licensable.
2. **Model it properly — make the real connection between a song and its released track.** Accepted
   as worth a migration, because registration, the song passport and provenance will all want the
   same link; this is not a fix for one screen.

**A migration is therefore expected. It is human-gated — the owner pushes it. An executor must
NEVER run `supabase db push`.**

### Still to confirm before any migration is written

A deliberation is in flight on two questions that could change the shape or remove the need:

- **Is the absence deliberate?** Migration 135 carries a comment listing what was intentionally
  left out of the works↔vault link. If a work→track link is among the refusals, adding one
  reverses a considered decision and must be argued, not assumed. Precedent: that same migration's
  `author_user_id` is documented as *"the fact that MOVES SPLITS,"* and a 2026-09-24 plan nearly
  attributed a writing credit to whoever added an instrumental break.
- **Does the link already exist?** `song_passport_master_designations` is append-only and
  identifies a designated master. If graduation already carries that to a specific track, there may
  be nothing to migrate.

---

## 8. CORRECTION — "See if Team fits" never shipped

This document and the source todo both treated the Team card's relabel as done. **It is not.**

The commit claiming it (`c2b1ec23`) touched only the todo file — zero marketing source lines. It
was then **superseded by the owner on 2026-09-29**: during invite-only beta nobody can open an
account, so **all three pricing CTAs read "Request an invite"** (verified live in
`assets/marketing/landing.html`, three occurrences). Entourage keeps "Talk to us." That comment was
later stripped from the artifact as internal cruft, but the behaviour it describes is what ships.

**So the pricing CTAs are already honest, and the precedent cited earlier in this document was not
a precedent at all.**

**What is still wrong: "Submit a song" appears twice** — the hero and The Crate section — and
**both link to `/signup`**, which shows a waitlist to anyone without an invite. One sits directly
under the line *"Submitting is free; getting in is earned."* The owner's decision to fix this
stands and is still needed; it is the only dishonest CTA left on the page.

Note the mechanism: changing it requires the gitignored `private/bench/marketing.html` re-freeze
pipeline, not an edit to the committed artifact.

---

## 9. Marketing-path upload: one song at a time (DECIDED, owner 2026-10-04)

**Songs arrive individually, not as a release.** Someone coming from the marketing page attaches
songs **one by one**, up to **three per submission**, with simple questions alongside: the song
title, and the person's name and contact details.

Contact details are collected **once for the person**, not per song. They exist because the flow
now promises a human may reach out — see §5's contact requirement.

### Decided

- **Three songs become three separate review items.** Each is accepted, declined and advanced on
  its own. This matches the fact that entering The Crate is **per song and rights-bearing per
  song**: one strong track alongside two weak ones is an ordinary outcome, and the team should be
  able to take the one. Rejected: a single all-or-nothing decision over the set, and a
  parent-child grouping (real extra structure to keep in sync, for a grouping nobody needs yet).
- **Three is a per-submission cap, not a lifetime one.** Nothing stops someone submitting again
  later. Keeps any one submission digestible without turning away a prolific writer. Rejected: a
  hard lifetime cap, and a "no more until these are reviewed" slot system — the latter makes a slow
  review directly block someone from sending their next song, which punishes the artist for the
  team's backlog.

### This materially shrinks the work→track problem

§7's ambiguity exists **only because several songs can arrive in one release**. On this path they
cannot: one song, one submission, one set of answers, no ambiguity about which disclosure belongs
to which song.

It does **not** remove the problem — an existing Member can still submit a whole EP through the
in-app path — but it takes the messiest case out of the newcomer flow, which is exactly where a
Funūn Team Member would otherwise be guessing with the least context.

**Worth re-weighing §7's scope once the in-flight deliberation reports.** The migration may be
smaller than it looked, and the "say I cannot determine" fallback may cover a much narrower set of
cases than first assumed.

---

## 10. work→track link: DECIDED — add the direct link (owner, 2026-10-04)

### What the deliberation found

`.planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md` (branch
`work-track-eligibility-deliberation-2026-10-04`) established three things:

1. **The link was never deliberately refused.** Migration 135's "deliberately absent" comment
   (`135_works_core.sql:99-121`) refuses exactly two things: a reverse pointer from `works` to
   `split_sheets`, and an artist-labels column. **Track linkage is not among them** — an
   unaddressed gap, not a reversed decision. The worry that prompted this investigation is cleared.
2. **The correspondence already exists** for Song-Passport-graduated tracks:
   `track_id → master_designation_id → work_version_id`, and separately
   `→ passport_id → song_passports.work_id` (UNIQUE). FK-enforced, append-only, written atomically
   at graduation (migration 154). It is queried today **only forwards**
   (`lib/song-passport/repository.ts:32`); nothing reads it track→work.
3. **It does not cover legacy uploads.** The still-live legacy route
   (`app/api/vault/[projectId]/tracks/route.ts`) creates tracks with **zero** connection to
   `works`, and no `tracks.work_id` column exists anywhere.

**Correction carried from that document:** the earlier claim that Crate eligibility "is stored on
the `ai_entries` row" is true only of the **citation text**. The eligibility verdict itself is
computed transiently and **never persisted**. This makes "denormalise the answer at graduation" a
considerably larger step than first framed.

### Decided

**Add the direct link**, on top of the existing chain. Recommended alternative — read the chain
backwards with no migration — was **put to the owner and declined**; he chose the permanent model.

**A migration is required and is human-gated. The owner pushes it. An executor must NEVER run
`supabase db push`.**

### Three constraints that make this safe

1. **Null means "we do not know" — never "no work."** Legacy tracks have no relationship to
   recover, so the column stays empty for them, and empty must route to the owner's §7 rule
   (*"cannot determine, check by hand"*) rather than to a confident negative. A nullable column
   read as a negative is precisely the label-integrity defect this project keeps finding.
2. **Written in the same transaction as graduation, derived from the same facts as the chain.**
   Two records of one truth can drift; written atomically from one source they cannot. The chain
   stays authoritative; a disagreement between them is a bug worth detecting, not a tie to break.
3. **The back-fill is partial and must say so.** Song-Passport-graduated tracks can be filled from
   the existing chain. Legacy uploads cannot be filled honestly and must be left null — not
   guessed at, not defaulted.
