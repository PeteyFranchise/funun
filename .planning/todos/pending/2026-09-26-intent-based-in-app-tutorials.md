# In-app tutorials, keyed to the intent someone arrived with

**Captured:** 2026-09-26 · **Status:** open — net-new surface, reusable primitive already exists
**Scope:** Member accounts only
**Owner:** *"once a user has been onboarded to a certain room with a certain intent — looking to
submit for sync, looking to write, looking to store masters, etc — we have to create tutorials
inside Funūn that bring them up to speed and tell them what to do and how things work."*

Pairs with `2026-09-26-pre-signup-onboarding-path.md` (the moment before signup) and
`2026-09-26-submit-a-song-onboarding-questionnaire.md` (the questionnaire that captures the intent).
**This is the third leg: what happens after they land.**

## What exists

**Nothing member-facing teaches the product.** Every `onboarding` component is staff-side —
`MemberOnboardingCRM`, `OnboardingTasksPanel`, `ClientWorkspace` — except `PayoutsOnboarding`,
which is Stripe.

**But the primitive is already built, and was built to be reused.**
`components/sync-library/SyncLibraryCoachMark.tsx`:

> *"Reusable 'newly-unlocked feature' highlight primitive… A per-user, localStorage-backed 'seen'
> flag that drives both a nav 'New' dot (ArtistNav.tsx) and a one-time coach-mark (this file).
> **Generalized so a future gated feature can reuse the same seen-flag mechanics with a different
> `feature`/copy** — this module is the ONLY place the read/write/broadcast logic lives."*

It also states its own boundary: *"the flag is cosmetic only: it clears a dot and dismisses a
tooltip, and carries no access-control meaning."* That is exactly the right property for a tutorial
— it must never become a gate.

**Naming caution: `/coach` is taken.** It is `RightsCoach` — direct-overlay eligibility and RDR
readiness, i.e. rights guidance, not product teaching. Do not call this feature "coach."

## The intents to key on

From the questionnaire's *"Where do you want this song to end up?"* and the four destination-neutral
doors, plus the reasons people arrive that have nothing to do with a single song:

| Intent | Room it lands in | What the tutorial has to answer |
|---|---|---|
| Submit for sync | The Crate, via Sound Vault | what gets in, what "submitted ≠ admitted" means, what the one staff gate is |
| Get it out | Release Report | what the readiness list is measuring, why a distributor is picked last |
| Write with people | Writer's Room | how a co-writer is invited, how sections get attributed, what the diary records |
| Store masters and keep them straight | Sound Vault | what belongs in it, versions and masters, what the Contract Locker holds |
| Register it properly | Registration guides | which registrations exist and which ones actually apply to them |
| Meet people / find work | Green Room, Antenna | what is public, what is private |

## Constraints

1. **Never a gate.** `docs/architecture/ACCOUNT-TYPES.md`: nothing is *"required before capturing an
   idea, entering a Writer's Room, uploading a take, writing lyrics, or leaving a note."* A tutorial
   is dismissible, resumable, and never blocks the work. The coach-mark primitive already behaves
   this way — keep that property.
2. **Intent highlights, it does not narrow.** Deliberation decision #10 keeps Crate, Release,
   Registration and Distribution first-class, with *"same guidance energy for the artist who never
   submits to it."* A sync-intent tutorial may lead with The Crate; it may not hide the other three.
3. **Teach with their song, not a demo.** The product already knows what this song is missing. A
   tutorial that points at *their* gaps beats a generic tour, and it is the same argument that made
   the onboarding questionnaire better than a static eligibility page.
4. **Intent is a starting guess, not a label.** People change their minds and one song can go to
   three destinations. Whatever is stored must be re-choosable, and must not become a hidden
   segment that changes what the product offers later.

## Open

Where intent is stored and whether it lives on the person or the song; whether this is coach-marks
in place, a checklist surface, or both; how it resumes if abandoned halfway; and whether the
Playbook's existing article model is reusable for the long-form half (it is internal-only today, so
that is a real question, not an assumption).
