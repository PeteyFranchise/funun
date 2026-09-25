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
