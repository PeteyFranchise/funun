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
