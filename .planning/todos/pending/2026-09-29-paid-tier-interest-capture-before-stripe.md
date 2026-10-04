# Paid tiers gauge interest until Stripe is live

**Captured:** 2026-09-29 · **Status:** open — small; the list already exists
**Owner decision, same day.** Unblocks shipping the marketing page to production.

---

## The decision

Stripe is not set up. Rather than hide the paid tiers or route them to a dead
"Talk to us", **let people pick one and go through that tier's onboarding.** At the end,
tell them plainly: paid tiers are coming, we will reach out, and a free profile is
available right now.

Owner's words: *"it's ok if someone clicks on a paid plan like the middle tier, they
still go through the onboarding for that specific slide, but at the end of the
onboarding let them know we will reach out to them because paid tiers are coming soon
but for now they can create a free profile. I would still like to use this to gauge
interest and start building a list of interested people."*

The interest **is** the product of this flow. Which tier someone chose before there was
anything to buy is the cleanest demand signal available pre-launch.

## The prices, locked the same day

Writer free · Studio **$19/mo** ($15 annual) · Team **$49/mo** ($39 annual).
Good as they stand; revisit on user feedback, not before launch.

---

## Why this is small — the list is already built

Verified 2026-09-29:

- **`artist_waitlist`** (migration `097_artist_invites_and_waitlist.sql`) — `email`,
  `name`, `note`, `unsubscribed_at`, `unsubscribe_token`, `notified_reopen_at`.
- **`upsert_artist_waitlist(p_email, p_name, p_note) RETURNS UUID`** (migration
  `100_waitlist_atomic_upsert.sql`) — atomic, with rejoin-auto-resubscribe behaviour.
- **`POST /api/waitlist`**, plus `/api/waitlist/resubscribe` and
  `/api/waitlist/unsubscribe` — all three have tests.
- **`/unsubscribe`** page exists.

So capture, dedupe and opt-out are done. This is a plumbing job, not a new feature.

## What actually needs building

1. **Carry the chosen tier through.** `app/(auth)/signup/page.tsx:70-71` reads `next`
   and `invite` from `searchParams`; there is **no** `plan`/`tier` param. Add one, and
   have the pricing CTAs pass it.
2. **Record which tier.** Either put it in the existing `note` field or add an
   `interested_plan` column. **Prefer a column** — `note` reads as free text the person
   wrote, and a machine-set value living there is the kind of overloading that makes a
   field mean two things. If a column is added, the RPC signature changes; check every
   caller and its tests.
3. **The closing message.** At the end of onboarding: paid tiers are coming, we will
   reach out, here is your free profile. Must not read as a rejection — they picked the
   tier they wanted and that is useful to us.
4. **Bench:** the pricing CTAs currently read `Start free` / `Start a trial` /
   `See if Team fits`, and the cards render "Talk to us" / "Contact". Those need to
   match whatever this flow becomes.

## Constraints

- **Do not imply a completed purchase.** No card fields, no "subscribe", no invoice
  language. The tier is an expression of interest until Stripe exists.
- **"Start a trial" is currently a false CTA** — there is no trial. Fix or remove it
  with this work.
- **This is a marketing list, so consent must be explicit.** Someone completing
  onboarding for a free profile has not thereby asked to be emailed about paid tiers.
  Say what they are joining at the moment they join it. The unsubscribe path already
  exists — use it rather than inventing a second one.
- **Do not auto-enrol every free signup.** Only people who chose a paid tier are the
  signal; polluting the list with everyone destroys the thing it is for.

## Related

- `.planning/todos/pending/2026-09-26-stripe-subscriptions-setup-and-phase.md` — the
  work this is standing in for.
- Phase 24 self-serve is on hold pending the business-model discussion; this flow is
  explicitly the interim, not a substitute for that decision.
- `.planning/todos/pending/2026-09-26-submit-a-song-onboarding-questionnaire.md` and
  `2026-09-26-team-tier-qualification-questionnaire.md` — the per-tier onboarding this
  hooks into. **Read both before building**: the Team questionnaire may already be the
  "onboarding for that specific slide" this decision refers to.

---

## ⏪ CTA history, and the options for post-beta

**Owner instruction 2026-09-30.** The CTAs have now changed twice, for two *different*
reasons that unblock independently. Do not restore anything until you know which
constraint has actually lifted.

### The two constraints, and what each one gates

| constraint | while it holds | lifts when |
|---|---|---|
| **Signup is invite-only** | nobody can open an account, free *or* paid | beta opens to self-serve signup |
| **Stripe is not wired** | nobody can pay | payments ship (`2026-09-26-stripe-subscriptions-setup-and-phase.md`) |

**Today both hold**, so all three tiers read **`Request an invite`**.

### The history, verbatim

| Tier | original | 2026-09-30 a.m. | 2026-09-30 p.m. (current) |
|---|---|---|---|
| Writer (free) | `Start free` | `Start free` | `Request an invite` |
| Studio ($19/$15) | `Start a trial` | `Start free` | `Request an invite` |
| Team ($49/$39) | `See if Team fits` | `Start free` | `Request an invite` |

### Options for post-beta, by which constraint lifted

**If signup opens but Stripe is still not live** — back to the morning's position:
`Start free` on all three, with the `beta:` note on the paid tiers explaining that the
tier is recorded and we will be in touch. Everyone really can open a free account then,
so `Start free` becomes true.

**If both lift — signup open AND Stripe live** — the tiers can finally differ:

- **Writer** — `Start free`. True, and the strongest word on the page.
- **Studio** — options, roughly strongest first:
  - `Get Studio` / `Choose Studio` — plain, no promise beyond what happens next
  - `Start a trial` — **only if a trial actually exists.** It did not when originally
    written; that was the false CTA that started all of this. Do not restore it by
    reflex.
  - `Upgrade to Studio` — only correct if the reader is already a member; wrong for a
    cold visitor on a public page.
- **Team** — `See if Team fits` (the original) still has the best reasoning behind it,
  recorded 2026-09-26: most teams answering the qualifying questionnaire have ten seats
  or fewer and are sent to sign themselves up, so `Talk to us` would promise a
  conversation that never happens. Alternatives: `Choose Team`, `Set up your team`.
  **Entourage keeps `Talk to us`** — there a person genuinely replies.

### Whatever is chosen, the test is the same

A CTA must describe **what actually happens when it is clicked**. Three have failed that
test so far and each was caught only by asking it:

- `Start a trial` — no trial existed
- `Start free` (a.m.) — signup was invite-gated, so nobody could start
- `Start free` in the pricing subhead and a FAQ answer — same problem, missed on the
  first pass because they are prose rather than buttons

Also remove the `beta:` field from `TIERS` and the `.pbeta` paragraph the card renders
from it, and re-check the pricing subhead (`The free plan stays free…`) and the Crate
FAQ answer — both were reworded on 2026-09-30 for the same reason and will read oddly
once signup is open.

---

## ⏪ Original revert note (superseded by the section above)

## ⏪ Revert the CTAs when Stripe is live

**Owner instruction 2026-09-30.** The current "everyone starts free" CTAs are an
interim for beta. When payments are wired up, restore the originals rather than
inventing new ones — they were owner-chosen and carry their own reasoning.

**What they were, verbatim, before 2026-09-30:**

| Tier | CTA before | CTA now (beta) |
|---|---|---|
| Writer (free) | `Start free` | `Start free` — unchanged |
| Studio ($19/$15) | `Start a trial` | `Start free` + beta note |
| Team ($49/$39) | `See if Team fits` | `Start free` + beta note |

Also remove the `beta:` field from the two paid tiers in `TIERS`, and the `.pbeta`
paragraph the card renders from it.

**Two cautions when reverting:**

1. **`Start a trial` was already a false CTA** — there is no trial, and there was none
   when it was written. Do not restore it unless a trial actually exists by then.
   If there is no trial, it needs a different word regardless of Stripe.
2. **`See if Team fits`** has a recorded reason (owner 2026-09-26): most teams answering
   the qualifying questionnaire have ten seats or fewer and are sent to sign themselves
   up, so "Talk to us" would promise a conversation that never happens. Entourage keeps
   "Talk to us" because there a person genuinely replies. That reasoning still holds —
   it is preserved as a comment above the `TIERS` array in `private/bench/marketing.html`.
