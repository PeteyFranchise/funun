# Pre-signup onboarding: a first moment that lands, then the ask, then a tutorial

**Captured:** 2026-09-26 · **Status:** open — product design, net-new
**Blocks:** marketing CTA #2 ("Start a song" ×2, "Start free"), and therefore the port
**Owner:** *"we need to develop a quick onboarding path that drives emotional engagement, then
ask for a signup and take them to a quick tutorial afterward."*

## Scope: Members only

**Owner, 2026-09-26: "DO NOT confuse Team Member (staff) or Client Partner accounts with what we
are doing now. WE ARE ONLY talking about user accounts for Members."**

Everything here is the **Member** account class — the umbrella in `docs/architecture/
ACCOUNT-TYPES.md` covering artists, writers, producers, managers, publishers, attorneys,
engineers and label executives. Not Funūn Team Members (`funun_staff`), not Client Partners
(`buyer_members` → `buyer_orgs`).

The staff-side onboarding components named below appear **only as evidence that nothing
member-facing exists**. They are not a starting point and not a pattern to copy.

This replaces the CTA question rather than answering it. "Start a song" was going to point at
`/signup`; it now points at a path that does not exist yet.

## What exists and what does not

- **No member-facing onboarding or tutorial anywhere.** Every `onboarding` hit in `components/`
  is staff-side — `MemberOnboardingCRM`, `OnboardingTasksPanel`, `ClientWorkspace` — except
  `PayoutsOnboarding`, which is Stripe. The post-signup tutorial is net-new.
- **A seeded demo app already exists**, and is the nearest thing to reusable content:
  `lib/vault/demo.ts`, `lib/profile/demo-profile.ts`, `lib/antenna/demo.ts`, with relation shapes
  that "match the live query so readiness counts render the same."
- **But the switch is not reusable.** `NEXT_PUBLIC_VAULT_DEMO` is read at module scope
  (`app/(artist)/vault/page.tsx:28`) and in `middleware.ts:66` — it is a whole-app environment
  flag, not something that can be turned on for one anonymous route in production. The seed is an
  asset; the mechanism is not.
- `/vault/new` is already the door, titled **"🎵 Start a song"** and aria-labelled *"Enter the
  Writer's Room"* — the natural landing for the post-signup tutorial's first step.

## The constraint that shapes the whole thing

**In a rights product, letting an unidentified visitor author content is not a neutral UX
choice.** `lyric_blocks.author_user_id` is documented in migration 135 as *"the fact that MOVES
SPLITS."* A pre-signup sandbox must not write real authorship records, and "claim it later" is a
provenance problem, not a convenience feature.

That collides with emotional engagement in a specific way worth naming up front:

> **Do not let a stranger start something they would then lose.** An evaporated draft feels worse
> than never having started. So the first moment should be a *demonstration they drive*, not a
> *draft they invest in* — complete in itself, nothing to save, nothing to migrate. The signup ask
> then becomes "do this for real," not "rescue your work."

## ⚠️ RELOCATED — this belongs on the invited path, not the homepage (2026-09-26)

Owner, after driving the mock: *"When do they see this onboarding sequence? This makes sense if
they are invited to join and write inside someone's Writer's Room."* And before that: *"I would
like them to actually be able to join the room via a link. Actually feel the product before
signing up."*

He is right, and it reframes the feature. A cold marketing visitor joining a fabricated room with
two invented co-writers is theatre. **A real co-writer sending you a link is a shipped, intended
path** — and it has genuine motivation behind it, because someone you know asked.

### Three facts that decide how this gets built

1. **The entry point exists and is deliberately public.** `/join/[inviteToken]`, exempt from
   `middleware.ts`'s `isProtected`: *"collaborators access approval and invite pages without a
   Funūn account (D-15, D-08)."*
2. **It is view-only today.** `app/join/[inviteToken]/page.tsx`: *"View-only collaborator profile
   page. Renders the data an artist recorded for this collaborator so they can verify it and flag
   corrections. **No edit controls — self-edit is deferred (D-09).**"* Writing in the room before
   signup does not exist.
3. **A guest cannot author a block — by schema, not by policy.**
   `lyric_blocks.author_user_id UUID REFERENCES auth.users` (`135_works_core.sql:219`), described
   at `:201` as *"the ✍ writer badge; it is set automatically."* No account means no user id means
   no authorship. That is a foreign key, and no amount of UI works around it.

### The resolution: guests suggest, members author

There is already a contribution shape that is **not** authorship: **lyric suggestions** —
`app/api/works/[workId]/blocks/[blockId]/suggestions/route.ts`, with its own normalisation
(`normalizeSuggestedText`), rate limiting and notifications. A suggestion is a proposal on someone
else's block. It moves nothing and it needs no writer badge.

So the honest shape of what the owner described:

> An invited guest opens the link, sees the **real** room, and can **suggest** lines. Mike and Cece
> see the suggestions attributed to the name the guest typed. Nothing the guest writes creates
> authorship — and **signing up acquires a concrete job**: an account turns a suggestion into a
> contribution, a typed name into an `@handle`, and a guest into someone who can be on the sheet
> at all.

That keeps provenance intact, invents no new authorship concept, and makes the signup ask a door
rather than a wall. The suggestions route is authenticated today (`createApiClient` +
`resolveWorkAccess`), so a guest-capable path is the actual work.

### What this makes the bench mock

`private/bench/onboarding.html` is now a **simulation** of the invited experience, for cold
visitors who were never invited. Still worth having — it is the only way someone who has not been
sent a link can feel this — but it is the weaker sibling and should not pretend otherwise. The
real thing is the invited path.

## Built as a bench mock, 2026-09-26 — `private/bench/onboarding.html`

Shape 1 built and driveable. Two seeded co-writers have a line each; the visitor types one line,
presses Enter, and **their line attributes to "You" while the split sheet beside it goes from two
writers at 50% to three at 33.3 / 33.3 / 33.4.** Then the payoff appears.

Verified by actually typing into it, not by reading the code: the block re-attributes, the sheet
rewrites, the totals sum to 100.0, and the payoff reveals.

**It obeys the two rules that made this design non-obvious:**

- **Nothing is authored.** No record is written, nothing persists past the tab. The sandbox cannot
  create authorship because `lyric_blocks.author_user_id` is *"the fact that MOVES SPLITS"*.
- **Even shares, never derived.** The sheet adds the visitor at an equal share and the footer says
  so out loud: *"Funūn never proposes a split from who wrote what — the diary is evidence you can
  look at; the numbers are yours to set."* A demo that inferred a split from who typed most would
  be a doctrine violation dressed up as cleverness, and it is the obvious thing to build.

**One bug found by building it.** The copy read *"watch what happens on the right"* — but the sheet
stacks **below** the room under 900px, so the instruction was false on a phone, which is where most
first visits land. Directional language is out; it now names the thing (*"watch what happens to the
split sheet"*) rather than its position.

Still open: where it lives, whether the ask interrupts or follows, and the post-signup tutorial.

## Three shapes for the first moment

1. **"Type a line, watch the sheet write itself."** A mini Writer's Room, two seeded co-writers
   already in it. The visitor types one lyric line; it attributes to *You* on that block; the
   split panel beside it updates to include them. That is the entire argument of the marketing
   page — *the paperwork assembles itself behind you* — performed by the visitor in about twenty
   seconds. Client-side only, no records written, nothing lost on exit. **Recommended.**
2. **"Hum it."** Browser mic, eight seconds, the take appears on a room timeline with a timestamp.
   Emotionally the strongest, and the worst fit for the rule above — it is exactly the thing
   someone would want to keep. Also asks a stranger for microphone permission before they know
   what the site is.
3. **Supervisor's-eye view of The Crate.** Truer to the B2B half of the business, much colder as a
   first moment. Wrong audience for this CTA.

## Then

- **The ask.** Placed after the payoff lands, not before it. Worth deciding whether it interrupts
  (modal over the demo, which the new sign-in dialog already gives us a pattern for) or follows on.
- **The tutorial.** First-run on `/vault/new`, since it is already the Writer's Room door and
  already carries the words the CTA promised.

## Open

Where the path lives (a marketing route, or the first screen of `/signup`), whether it is one
screen or three, how it degrades on mobile, and whether the demo seed's people become the seeded
co-writers or a separate cast written for this.

## Interim

Until it exists, the three buttons point at **`/signup`** — a new member lands on `/vault`, where
`CatalogueShelf.tsx:45` renders `🎵 Start a song` as the primary action. Honest, one click longer,
and no code change. **This is a placeholder, not the decision.**
