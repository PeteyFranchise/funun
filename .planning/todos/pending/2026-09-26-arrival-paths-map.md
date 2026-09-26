# The arrival paths — one map, because they are now four

**Captured:** 2026-09-26 · **Status:** map + one newly-orphaned gap
**Why this exists:** the onboarding work is spread across four todos and a roadmap phase, and
relocating one of them opened a hole in another. This is the single view.

> Owner: *"We still need an onboarding process with the other CTA buttons that we saved the
> questionnaires for."*

## Four different people arrive, and they need four different things

| Arrival | CTA on the page | What they need | State |
|---|---|---|---|
| **Invited co-writer** | *(a link from a friend, not a CTA)* | Join the room, contribute, then sign up | **Designed.** Entry point exists and is public; guests suggest rather than author. `2026-09-26-pre-signup-onboarding-path.md` |
| **Solo writer, cold** | Start a song ×2 · Start free | A reason to begin with no collaborators and no song | **DECIDED: capture.** Built — `private/bench/solo.html` |
| **Invited collaborator, no song** | *(a link from someone's Collaborators screen)* | Check the details someone recorded about them; claim the identity | **Real today, unaddressed.** See below |
| **Has a finished song, wants sync** | Submit a song ×2 | Land the song privately, route it to the right room, learn the Crate bar | Question set drafted and owner-reviewed; **no flow around it.** `2026-09-26-submit-a-song-onboarding-questionnaire.md` |
| **A team or label** | See if Team fits | Qualify, then self-serve or reach a person | Question set drafted; **no flow around it.** `2026-09-26-team-tier-qualification-questionnaire.md` |

Plus, after all four: **what happens once they land in a room** —
`2026-09-26-intent-based-in-app-tutorials.md`.

## Fifth arrival: invited collaborator with no song at all (owner, 2026-09-26)

> *"People can invite collaborators from the collaborators screen without having started a
> Writer's Room session."*

**Verified, and it is shipped.** `collaborator_invites` (`018_collaborators_split_sheets.sql:109`)
references `collaborator_id` and `inviting_user_id` — **no `work_id`, no `project_id`.** The invite
is person-to-person, not room-scoped. There is a route for it
(`/api/collaborators/[id]/invite`) and the signup flow already falls back to this token machinery
(`/api/signup/invite/[token]`, D-09).

So someone can receive a Funūn link because an artist saved their details, with **no song, no room
and nothing to write in.** They land on `/join/[inviteToken]`, which today shows them a view-only
copy of what was recorded about them.

**This may be the highest-motivation arrival of the five**, and it is the one nobody has designed.
The person is already in someone's roster, possibly already on a split sheet — the marketing FAQ
says so outright: *"You can save a collaborator's details and put them on a split sheet before
they ever sign up."* The value proposition arrives from the other side of the telescope:

> Someone you work with put your details on file so they would never have to chase you for them
> again. Here is what they wrote down. Is it right?

And the conversion is concrete rather than aspirational — claiming it gets them an `@handle`, keeps
their PRO and IPI current wherever they are credited, and means the next person who adds them gets
the right details automatically.

**What is missing:** the page is view-only by design (*"self-edit is deferred (D-09)"*), so the
person can see an error and not fix it. That is the obvious first thing to want, and the obvious
thing to get wrong — letting an unauthenticated token-holder edit identity fields is a different
security question from letting them read them.

## ⚠️ The gap the relocation opened — RESOLVED 2026-09-26: capture

The "join a Writer's Room and watch the splits write themselves" moment was built for the
homepage, then correctly relocated to the **invited** path — because a stranger joining a
fabricated room with two invented co-writers is theatre.

**That leaves "Start a song" and "Start free" with nothing.** They are the top-of-page CTAs, they
are aimed at the largest audience, and the audience is precisely the one that cannot be shown the
best demo: a solo writer with nobody to collaborate with and nothing written yet.

**Owner ruled: capture.** Built as `private/bench/solo.html`. The hook is not splits — a solo
writer has nobody to split with — it is that *something exists now that did not sixty seconds ago,
and it is already keeping a record*. Type the line in your head, and the diary writes two entries:
**Room opened** and **First line added**, both stamped and attributed.

That is faithful rather than invented: `opened` and `lyric` are real diary kinds, and so is
**`hum`**, which is why the copy can promise humming. The mic is deliberately **not** in the
pre-signup moment — asking a stranger for microphone permission before they know the site is a
far bigger ask than typing, and it would gate the one thing that must not be gated.

The three candidates considered, for the record:

1. **Let them watch the invited version anyway**, labelled as a demo. Cheap, honest if labelled,
   weaker — the emotional force came from *being asked by someone*.
2. **A different first moment for solo writers.** The strongest solo hook is probably not splits
   at all but *capture*: hum it, type a line, it exists, it has a diary. The product's own first
   step already says this — `/vault/new`'s Writer's Room door reads *"Hum it, write lyrics, upload
   a take."*
3. **No pre-signup moment for this CTA.** Send them to `/signup` and put the effort into the
   post-signup first-run instead. Defensible during an invite-only beta, where most of them hit
   the gate anyway.

**Unresolved.** Worth deciding before either questionnaire is built, because it changes whether
"pre-signup onboarding" is one system or two.

## The two questionnaires are question sets, not flows

Both have owner-reviewed questions and neither has a flow around them. What is missing is the same
list for each:

- Where it lives, and whether it runs before or after account creation
- What the first screen promises, and how someone leaves without losing anything
- What happens to the answers — routing only, or stored against the person
- The ending for each branch, including the unglamorous ones (*not Crate-eligible*, *fewer than ten
  seats, go self-serve*)
- How it degrades on a phone

**The Submit flow has a hard constraint the Team one does not:** nothing may be gated behind the
questions. `docs/architecture/ACCOUNT-TYPES.md` — profile completion *"is never required before
capturing an idea, entering a Writer's Room, uploading a take, writing lyrics, or leaving a
note."* The song goes in first; the questions come after, and every one is skippable.

## Suggested order

1. **Decide the solo-writer gap** — it is one decision and it shapes the rest.
2. **Submit flow**, because its question set is the most complete and it answers two CTAs.
3. **Team flow**, which is smaller and mostly routing.
4. **Invited path**, which is the most valuable but needs guest-capable suggestions — real
   engineering, not a bench mock.
