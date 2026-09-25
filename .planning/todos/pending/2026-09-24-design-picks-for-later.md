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
