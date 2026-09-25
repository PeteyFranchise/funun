---
created: 2026-09-24T00:00:00Z
title: Design picks saved for later — destination undecided (marketing site vs everywhere)
area: design
severity: low
status: pending
kind: collection
---

## What this is

A running list of component designs the owner liked but did not want built yet. Collected
2026-09-24 onward, after the bench-01 Writer's Room session.

**Why they are parked:** most of these suit a **marketing site**, and Funūn does not have one —
`app/page.tsx` redirects logged-out visitors straight to `/signin`. See
`.planning/todos/pending/2026-09-24-marketing-site-needed.md`. The open question for each pick is
whether it belongs only on that future site, or everywhere in the product.

**Read the Traps column before building any of these.** Funūn runs **Tailwind 3.4**, and almost
everything published on 21st.dev now targets **Tailwind 4**. Unmatched utility classes **fail
silently** — no error, no CI signal, just a style that does not apply. That is the single most
expensive gotcha in this whole collection.

---

## 1. Illuminated glow hero

**Source:** 21st.dev, `illuminated-hero.tsx`. A full-screen dark hero where the headline glows as
if lit from within, with two soft light blooms above and below, fading in on load.

**Liked for:** the headline treatment. A genuine "this is a product launch" moment.

**Candidate home:** marketing site hero. Could also carry an in-app announcement moment
(a launch, a new room type) — undecided.

**Dependencies: none.** No framer-motion, no lucide, no icon library. The glow is a pure **SVG
filter** (four `feGaussianBlur` passes, eight `feColorMatrix` tints, offsets, merged) — it works
anywhere and costs nothing to install. That makes it unusually cheap for how striking it is.

**Traps:**

- **Three Tailwind 4 classes that silently do nothing on 3.4:**
  - `translate-[0_-70%]` — the arbitrary-shorthand `translate-*` is v4. On v3 write
    `[translate:0_-70%]` or `translate-y-[-70%]`.
  - `filter-[url(#glow-4)]` — v4. On v3 write `[filter:url(#glow-4)]`. **If this one silently
    fails the entire glow disappears** and the hero looks like plain white text.
  - `-z-1` — not in v3's z-index scale (0/10/20/…). Use `-z-10` or `[z-index:-1]`.
- **Two classes are referenced but never defined** in the paste: `.shadow-bgt` and `.shadow-bgb`,
  the two light blooms. Without them the background is flat black. They need writing from scratch.
- **The glow colour is baked into the SVG filter**, not into a CSS variable. The published values
  are warm (`#fffaf6`, `#e7dfd6`, amber/orange `feColorMatrix` rows). Re-tinting to Funūn's
  indigo→fuchsia means editing eight colour matrices by hand — doable, fiddly, and easy to get
  muddy. Budget real time for it, or accept a warm hero that does not match the app.
- Needs three `@keyframes` (`onloadopacity`, `onloadbgt`, `onloadbgb`) added to `globals.css`.
  Plain CSS, so no version problem there.

**Also worth noting:** it spends a lot of visual weight on one headline. That is right for a
marketing hero and wrong inside a working tool — which is an argument for "marketing only."

---

## 2. Voice testimonials

**Source:** 21st.dev, `voice-testimonial.tsx`. A grid of testimonial cards, each with a photo,
a quote, and a small audio player with an animated waveform. "Load more" fades in the rest.

**Liked for:** testimonials you can *hear*. On a music platform that is more on-brand than a wall
of text quotes.

**Candidate home:** marketing site (social proof section). A second use worth considering: artist
spotlights on a public profile or release page.

**Dependencies:** `react-icons` (new — one X/Twitter icon, replaceable with inline SVG) and
`framer-motion` (new — drives the waveform bars only).

**Funūn could do this better than the original.** The published version animates **random** bars
that have nothing to do with the audio. Funūn already extracts real waveform peaks
(`peaksFromBuffer`, `PEAKS_BAR_COUNT = 200` in `lib/catalogue/waveform.ts`) and renders them in the
Writer's Room. Feeding real peaks in would make the bars actually match the voice — and would
remove the need for framer-motion entirely, since a played-progress fill is a CSS transition.

**Traps — this one has genuine defects, not just version drift:**

- **Hydration mismatch (the serious one).** `WaveVariants()` runs `Math.random()` at **module
  scope**, and bar heights use `Math.random()` inline during render. In Next.js the server and the
  client generate different numbers, so React will warn and re-render — the classic
  "text content did not match" hydration error. Must be seeded, or moved into `useEffect`, or
  replaced with real peaks (preferred).
- **Every audio file is loaded on mount.** `new Audio()` is constructed for all testimonials in a
  `useEffect`, so eight clips begin fetching before anyone presses play. Should be lazy.
- **`window.open(url, "_blank")` with no `noopener`** — reverse-tabnabbing risk on the social link.
- **Not keyboard accessible.** Play, pause and the social link are `onClick` on `<span>`/`<div>`
  with no button semantics, no focus, no Enter/Space.
- **Undefined class** `testimonial-partially-visible` is referenced but never written.
- **Placeholder image** points at `via.placeholder.com`, and `next/image` needs any external domain
  declared in `next.config.mjs`.
- **Its own theming system.** A `mode: "light" | "dark"` prop with ternaries on every element. Funūn
  themes with CSS tokens; adopting this as-is would create a second, parallel way to do theming.

**Effort read:** the layout and the idea are worth taking; the implementation mostly is not. Rebuilt
on Funūn's existing waveform code it would be smaller, correct, and have one fewer dependency.

---

## 3. Onboarding card

**Source:** 21st.dev, `onboarding.tsx`. A centred card: hero image, a photo-upload row, a name
field with an `@` icon, and a Continue button. Contents fade in one after another.

**Liked for:** the welcome moment. A calm, single-card first impression.

**NOT a marketing component.** This is in-app onboarding, so it belongs in a different bucket
from picks 1 and 2 — and Funūn **already has this screen.**

- `components/handles/ChooseHandleGate.tsx` — the hard gate a signed-in account with no handle sees
  *instead of* the app, mounted in `app/(artist)/layout.tsx`.
- `components/onboarding/FirstSignInWelcome.tsx` and `RightsSetupReminder.tsx`.

So this is a **restyle candidate for `ChooseHandleGate`**, not a new screen.

**Two doctrine conflicts if used as-is:**

1. **It conflates display name with handle.** The field is labelled "Display Name" but behaves like
   a username — an `@` icon, and the demo strips input to letters, numbers and underscores. Funūn
   keeps these **deliberately separate** (Phase 36: "mandatory @handle for user accounts, artist
   display name separate"). Merging them in the UI would undo that.
2. **A "Continue" button implies you can move on.** `ChooseHandleGate`'s header is explicit that a
   skip, a dismiss, a close control, a "later" link and an escape-key handler are *"deliberately
   absent, and not to be added back."* There is exactly one way past it — pick a handle — plus
   sign-out, which is an exit rather than a skip. Any restyle has to preserve that.

**Dependencies: four, and it is the full shadcn stack** — `lucide-react`, `framer-motion`,
`@radix-ui/react-slot`, `class-variance-authority`, plus shadcn's `Button` and `Input` primitives.
It is also written against shadcn's semantic tokens (`bg-card`, `text-muted-foreground`,
`border-input`, `bg-background`), none of which exist in Funūn. **This is the "adopt shadcn"
decision in component form** — see the top of this session's discussion.

**Smaller traps:**

- `AnimatePresence` wraps an element that is always mounted, so it does nothing. `AnimatePresence`
  only animates children entering and leaving conditionally. Harmless, but it signals the code was
  not carefully reviewed.
- "PNG or JPEG, up to 5MB" is hardcoded copy, not tied to any real limit.

**Effort read:** the layout is worth copying by eye. The code is not — taking it would pull in four
dependencies and a parallel token system to restyle a screen that already exists and already works.

---

## 4. Radial glow background

**Source:** 21st.dev, `tailwind-css-background-snippet.tsx`. Despite the wrapper, the whole thing
is **one CSS gradient**:

```
radial-gradient(125% 125% at 50% 10%, #000 40%, #63e 100%)
```

Black through the top and middle, blooming to a blue-purple at the bottom corners. A "lit from
below" page ground.

**Liked for:** the background itself.

**Dependencies: none. Traps: none.** The only pick in this collection with a clean bill. The
arbitrary-property syntax `[background:…]` works on Tailwind 3.4 as written. The `cn()` import is
unnecessary (one static string) and the two nested wrapper divs are redundant — the gradient could
be one line on `body`.

**Candidate home: anywhere — and that is the point.** This is not really a component, it is a
**proposal about the app's ground colour**, which lands directly on an unresolved decision.

**It conflicts with the current ground choice.** The owner selected **neutral black** on
2026-09-24 — flat `#000` page, neutral card surfaces. This gradient is the opposite instinct: the
page is not flat, it glows. Both cannot be true.

Worth noting the two are *not* far apart in spirit. Funūn's original `ink` (`#0a0a0f`) is black
with an indigo undertone, and this gradient is black with an indigo bloom — a more dramatic version
of the same idea. `#63e` (`#6633ee`) is in the same family as Funūn's `--indigo` (`#818cf8`), just
deeper and more saturated.

**Tie this to Gate 0.** The Sound Vault grid test is meant to settle whether flat neutral black
survives at density. This gradient belongs in that same test as a third option:

1. Ink (`#0a0a0f`, indigo undertone)
2. Neutral black (flat `#000`) ← current choice
3. **Radial glow** (`#000` → indigo bloom) ← this pick

One caution to check there: a gradient ground behind **twelve tiled cards** behaves differently
from a gradient behind one hero. Cards at the bottom of the grid would sit on purple while cards at
the top sit on black — the same card could read as two different weights depending on where it
lands. That is exactly the kind of thing only the density test will show.

---

## 5. Image stream hero (the corridor)

**Source:** 21st.dev, `image-stream-hero.tsx`. Two rails of image cards fly out of a vanishing
point toward the viewer, opening into a diagonal corridor, with your headline sitting on top.

**Liked for:** a hero that leads with images rather than describing them.

**Candidate home:** marketing site hero.

**Dependencies: none** beyond a `cn()` helper. No framer-motion, no icon library. It is CSS
keyframes generated in JS plus CSS 3D transforms.

### This is the best-built component in the collection

Worth recording, because it sets the bar for what "good" looks like when judging the others:

- **Every parameter is documented with the artefact it prevents.** Depth is authored as *apparent
  size*, geometrically, because spacing z evenly makes near cards tear apart. The rails open early
  and hold (`fan > 1`) because parallel rails project to a cone with no bend.
- **Cards are born *across* the centre line** (`railBirth` is negative), so the vanishing point is
  never uncovered. Born on their own side, a hole blinks open at dead centre once per cycle.
- **Negative `animationDelay`** drops each card mid-flight, so the corridor is already full on the
  first frame rather than filling up after you arrive.
- **`prefers-reduced-motion` pauses rather than disables.** Because each card is already mid-flight,
  pausing freezes a finished composition; disabling would collapse everything onto the axis. That
  is a genuinely thoughtful accessibility decision, not a checkbox.
- **`React.useId()` namespaces the keyframes**, so two instances on one page cannot collide.
- Decorative layer is `aria-hidden`; every length is `cqw` so it scales at any size.

### Traps

- **Container queries are load-bearing.** `containerType: inline-size` plus `cqw` on *every* length.
  Fine on current browsers (Chrome 105+, Safari 16+), but on anything older the entire corridor
  collapses — there is no fallback. Worth a support floor decision before shipping it publicly.
- **Performance.** 18 cards by default (9 × 2 rails), each a full image, all animating in 3D
  continuously. `backfaceVisibility: hidden` helps. Test on a low-end phone before committing.
- **`loading="lazy"` on cards that are visible immediately** — may delay the corridor's first paint.
  Should be `eager` for the first few.
- Demo images come from an external R2 CDN and would all need replacing.

### The question that actually matters for Funūn

**The images would be cover art — and that is other people's work.**

A corridor of record covers flying at the viewer is a strong, on-brand hero for a music platform.
But Funūn is a *rights* company, and putting artists' artwork on a marketing page needs their
permission. Options, in rough order of safety:

1. Funūn's own releases, or art the company commissioned.
2. Opt-in — artists tick a box to be featured. Slower, but it becomes a *benefit* rather than a
   liability, and it is the answer most consistent with what Funūn sells.
3. Abstract gradients instead of covers (the demo mixes both). Safe, and loses most of the point.

Getting this wrong on the marketing page of a rights platform would be a bad look in a way it
would not be for most products.

### ✅ OWNER DECISION 2026-09-24 — option 2, artists opt in

Featuring an artist's cover art on Funūn's marketing becomes **a perk they choose**, not a use
Funūn assumes. This is the answer most consistent with what the product sells.

**Do not build a fresh consent mechanism — Funūn already has two, and they carry doctrine.**

**1. Sync-library inclusion (Phase 26) is the closest pattern.** `lib/sync-library/` is exactly
this shape: an artist opts a work into a Funūn-facing surface, gated properly —
`eligibility.ts`, `readiness.ts`, `gate.ts`, `submission.ts`, and crucially `agreement.ts` /
`mint-agreement.ts`, so the opt-in produces a **record of what was agreed**, not just a boolean.

**2. The workspace consent doctrine says how to store it.** Migration 195 is emphatic that a
consent record and the permission it grants are **separate things**: *"Approval is RECORDED here
and ISSUED elsewhere … Deleting every row in this table changes nobody's access."*
`issueMemberConsent()` in `lib/workspaces/consent-service.ts` is the sole writer of the actual
grant. Applied here: a `featured_consent` row is evidence; whatever the marketing page reads should
be a separate, revocable permission — not the consent row itself.

**Three questions to settle before building:**

- **Who is entitled to consent?** A release has multiple rights holders. One writer ticking a box
  must not commit three co-writers' and a label's artwork. The sync-library gate already reasons
  about eligibility across a work's members — reuse that reasoning rather than checking
  `user_id == owner`.
- **What exactly is being agreed to?** "Cover art on the funun.studio home page" is a different
  permission from "cover art in any Funūn marketing, anywhere, forever." Mint the narrower one and
  name the surface.
- **Revocation has to actually work.** A marketing site is typically statically generated —
  GitHub Pages serves `www.funun.studio` from `main`. If an artist withdraws consent and the page
  is a prebuilt artifact, **their artwork stays live until someone rebuilds.** That is the exact
  failure this whole feature exists to avoid. Either the corridor loads its images at runtime from
  a live endpoint that honours revocation, or withdrawal must trigger a rebuild automatically.
  Decide which before the site's architecture is chosen — this constrains it.

**Upside worth noting:** done this way the corridor becomes a reason to use Funūn rather than a
liability. "Get your cover on the front page" is a benefit a rights platform can credibly offer,
and the opt-in itself demonstrates the product's whole thesis.

---

## 6. Pricing table

**Source:** 21st.dev, `studiova-luxury-pricing-table.tsx`. Three tiers, a monthly/annual toggle with
a −20% badge, a highlighted "Most popular" middle card, gold accents on near-black.

**Liked for:** the pricing layout.

**Candidate home:** marketing site.

**Dependencies: none.** Plain React, Tailwind and inline SVG.

### Two things that must be removed before it is ever shown to anyone

1. **It ships the author's advertising.** `brandBacklink` defaults to `https://scriptly.store/`,
   **every tier's CTA defaults to that same URL**, and there is a hardcoded
   *"Powered by Scriptly.Store ↗"* link in the footer. This is not a bug — it is a deliberate
   backlink placed in the component. Left in, Funūn's pricing page would send buying customers to
   a third party's store.
2. **It ships fabricated social proof.** *"Trusted by 320+ founders and studios worldwide"* is
   hardcoded, not a prop. On a pricing page that is a factual claim about the business. Publishing
   it unedited would be a straightforward lie.

### Traps

- **Two classes that silently do nothing on Tailwind 3.4:** `py-0.2` (the spacing scale has no
  `0.2` — it goes 0, 0.5, 1, 1.5…) and `active:scale-98` (the scale scale has no `98`). Both fail
  with no error, so the annual badge padding and the button press effect just would not happen.
- **A whole parallel palette in hardcoded hex** — `#090a0f` ground, `#E2B774` gold, `#0e0f17` cards.
  Gold, not Funūn's indigo→fuchsia. Re-tinting is straightforward but touches every element.
- Default tier copy is a web-design agency's ("WebGL effects", "dedicated Slack channel"). Props,
  so trivially replaced — but a reminder that nothing in the defaults is reusable.
- Credit where due: `target="_blank"` **does** carry `rel="noopener noreferrer"` here, unlike the
  voice-testimonials pick.

### The real blocker is not the component

**Funūn has no pricing to put in it.**

- Phase 24 self-serve is **ON HOLD pending a business-model discussion**.
- Every paid-tier artefact in the repo is **buyer-side** (`docs/buyer-paid-tiers-and-content-protection.md`,
  `24-RESEARCH-paid-tiers.md`, `post-beta-ai-pricing-and-governance.md`).
- The one artist-facing tier candidate — studio-quality vocal capture — has an open tier question
  (`2026-09-24-studio-quality-vocal-capture.md`).

So this is the same shape as the footer: **the presentation of a decision that has not been made.**
Worth keeping, worthless until the business model is settled. Whatever that discussion concludes
should drive the number of tiers and what separates them — not this component's three-tier shape.

---
