# Team tier "Talk to us" → a short questionnaire that routes

**Captured:** 2026-09-26 · **Status:** BUILT 2026-10-04 (quick task 261004-ttq) — closed out
**Answers:** marketing CTA #5, the Team tier's "Talk to us"
**Scope:** Member accounts only — a Team or Entourage customer is a **Member** buying a larger
Member workspace. Nothing here creates a Client Partner.

## Closed out 2026-10-04 — see `.planning/quick/261004-ttq-team-tier-questionnaire/`

Built: a new `team_tier_leads` migration (authored, human-gated — never pushed by the
executor), pure routing/copy/sanitizing logic (`lib/team-tier/qualification.ts`), a fan-out
staff notification to every `bd`+`leadership` staff member (`lib/team-tier/notify-staff.ts`,
never a single arbitrary pick), the public three-question flow at `/team-fit`
(`app/team-fit/page.tsx` + `components/team-tier/TeamFitQuestionnaire.tsx`), and a minimal
staff-only list at `/admin/team-tier-leads`. Full detail, verified facts, and the threat
model live in `261004-ttq-PLAN.md` and `261004-ttq-SUMMARY.md` in that directory.

**Correction to this todo's own "RESOLVED 2026-09-26" section below: it is false as of
2026-10-04.** The commit that claimed the Team-tier CTA shipped as "See if Team fits" and was
"verified in the rendered DOM" (`c2b1ec23`) touched only this todo file — zero lines of any
marketing source. The actual production artifact (`assets/marketing/landing.html`) reads
`cta:'Request an invite'` for the Team tier, identical to Writer and Studio. A later owner
decision (2026-09-29, reconstructed via `git log -S` across `assets/marketing/landing.html`'s
tracked history — the authoring comment was later stripped as internal-decision cruft)
explicitly supersedes the "See if Team fits" wording: during invite-only beta nobody can open
an account, so all three Member-tier pricing CTAs read "Request an invite"; Entourage alone
keeps "Talk to us," because there a person genuinely replies. The section below is left as
written for the historical record, but its claim did not and does not hold — do not treat it
as true. Consequently, 261004-ttq does **not** wire any marketing-site CTA to `/team-fit`;
`/team-fit` ships as a complete, directly-linkable surface, and wiring a real CTA to it is a
separate follow-up requiring the gitignored `private/bench/marketing.html` re-freeze pipeline.

## The owner's shape of it

> *"For Team tier, we also need a short questionnaire after they click. I want to find out how many
> team members they have, how large the catalogue is, and what a couple of their pain points are.
> Then we can route them to a team member if they have more than 10 possible team users that want
> to work together — we can then work out an Entourage team account. If they have less than 10
> teammates, they can sign up for Team tier on their own and we can follow up later about
> onboarding if they need help."*

**The rule: more than 10 seats → a Funūn Team Member picks it up as an Entourage conversation.
10 or fewer → self-serve Team, with onboarding help offered afterwards.**

## The label — RESOLVED 2026-09-26

"Talk to us" on the Team card promised a conversation that, under this rule, most people never get:
answer *ten or fewer* and you are sent to sign yourself up. **Owner changed it to "See if Team
fits"** — a label that is true in both outcomes, and one that reads as an invitation to find out
rather than a sales gate.

**Entourage keeps "Talk to us."** There, a person genuinely does reply, so the promise holds.
Applied to the bench: `cta:'See if Team fits'` on the team tier; the Entourage band's
`.tscta` is unchanged. Verified in the rendered DOM — the four pricing CTAs now read
`Start free · Start a trial · See if Team fits · Talk to us`.

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
