# Team tier "Talk to us" → a short questionnaire that routes

**Captured:** 2026-09-26 · **Status:** approach owner-set, question set in review
**Answers:** marketing CTA #5, the Team tier's "Talk to us"
**Scope:** Member accounts only — a Team or Entourage customer is a **Member** buying a larger
Member workspace. Nothing here creates a Client Partner.

## The owner's shape of it

> *"For Team tier, we also need a short questionnaire after they click. I want to find out how many
> team members they have, how large the catalogue is, and what a couple of their pain points are.
> Then we can route them to a team member if they have more than 10 possible team users that want
> to work together — we can then work out an Entourage team account. If they have less than 10
> teammates, they can sign up for Team tier on their own and we can follow up later about
> onboarding if they need help."*

**The rule: more than 10 seats → a Funūn Team Member picks it up as an Entourage conversation.
10 or fewer → self-serve Team, with onboarding help offered afterwards.**

## ⚠️ The label breaks under this

If most people answering "ten or fewer" are sent to sign themselves up, then **"Talk to us"
promised a conversation that does not happen.** Two honest ways out:

- change the Team button to something that covers both outcomes — *"See if Team fits"*, *"Tell us
  about your team"* — and keep "Talk to us" for Entourage, where a person genuinely replies; or
- keep the label and make sure the small-team ending still *offers* the conversation rather than
  just closing the door with a signup link.

Worth deciding before the questionnaire is built, because it changes the first screen's promise.

## What exists, and what does not

- **No contact route, no lead capture, no confirmed mailbox.** `hello@`, `bd@` and `ae@funun.studio`
  appear only in test fixtures. `/admin/lead-engine` is retired and redirects to
  `/admin/crate-requests`, which is the **buyer** room, not member sales.
- **`bd` is a real staff role.** `StaffRole` has nine values — `leadership`, `ae`, `bd`, `anr`,
  `it`, `legal`, `tms`, `accounting`, `marketing`. Business development is the natural owner of an
  Entourage conversation. (There is still no Talent Services / member-success role; `tms` is HR.)
- **The assignment model is buyer-side only.** `isAssignedToOrg(orgRow, staffUserId)` and
  `assignedAeId` (`lib/client-partners/room-data.ts`) attach an AE to a **`buyer_orgs`** row.
  **Routing a Member lead to staff has no model.** ⚠️ Whatever is built must not reuse `buyer_orgs`
  or turn a prospective Team customer into a Client Partner — that is precisely the account-class
  confusion the owner ruled on this same day.
- **Self-serve Team signup does not exist** (Phase 47). So the "ten or fewer" branch cannot complete
  today. During invite-only beta it lands at the gate regardless, which makes this a good time to
  design it rather than a bad time to ship it.

## Draft question set — IN REVIEW

Three questions, as specified. Short enough that a busy manager finishes it.

1. **"How many people would be in here with you?"** *(routing)*
   - Just me and one or two others
   - A small team — three to ten
   - More than ten
   - Not sure yet, it changes

   → *More than ten* routes to BD. **Open: where does "not sure" go?** Recommend BD — a missed
   Entourage lead costs more than a conversation that turns out to be small.

2. **"How much music are we talking about?"** *(sizing)*
   - Under 25 songs
   - 25 to 200
   - 200 to 1,000
   - More than 1,000

   **Bands are a guess — owner to set them.** The right cut depends on what actually changes the
   deal: a manager with three artists and 60 songs is a different customer from a label with a
   2,000-song back catalogue, and only you know where the line sits.

3. **"What keeps going wrong?"** *(pick the two biggest, plus a free-text box)*
   - Chasing people for their details
   - Splits that never get signed
   - Not knowing what's actually ready to release
   - Masters and files scattered across drives
   - Registrations nobody is sure got done
   - Finding sync and placement opportunities
   - Something else →

   Capping it at two forces a real answer instead of every box ticked, and the free text is where
   the useful sentence usually lives.

## The two endings

**More than ten (or unsure) →** *"This is bigger than Team. Someone from Funūn will come back to
you."* The answers travel with the lead so the first reply is not "so tell me about your team."
Needs: somewhere to put the lead, and a BD person attached to it.

**Ten or fewer →** *"You don't need us for this — Team does it."* Straight to Team signup, with the
onboarding offer kept open rather than dropped. Honesty matters more than the upsell here; a small
team told to buy the cheaper thing is a customer who trusts the next thing we say.

## And then the part the owner named as its own build

> *"we have to build out that entire onboarding experience"*

Covered by `2026-09-26-intent-based-in-app-tutorials.md`, but a **team** arriving is different from
a solo writer: seats to invite, roles to set, an existing catalogue to bring in, and a shared vault
to organize before anyone writes anything. Worth treating as its own arrival path rather than the
solo one with extra steps.
