---
created: 2026-09-24T00:00:00Z
title: Funūn needs a marketing site — no public page explains the product yet
area: marketing
severity: low
status: pending
kind: idea
---

## The gap

**There is no marketing site.** `app/page.tsx` is a redirect: a logged-out visitor is sent
straight to `/signin`. Someone who has never heard of Funūn has nowhere to land and nothing
to read.

A `CNAME` for `www.funun.studio` exists at the repo root, but no HTML is served from there —
`docs/marketing/` holds only copy drafts (`funun-launch-campaign-copy-draft.md`,
`funun-launch-copy-brief.md`). The launch copy exists; the site does not.

Owner confirmed 2026-09-24: *"There is no marketing site yet, but we will need one."*

## What prompted the note

A footer design the owner liked (21st.dev, `footer-section.tsx` — a four-column link footer with
social icons and a blur-in-on-scroll). Parked rather than built, because **a footer is mostly links
to other pages**, and those pages do not exist. It is the last piece of a site, not the first.

## Two gotchas if that footer gets used later

- **It is written for Tailwind 4; Funūn is on 3.4.** `rounded-t-4xl` and `md:rounded-t-6xl` do not
  exist in v3 (the radius scale stops at `3xl`), and `theme(backgroundColor.white/8%)` inside an
  arbitrary value is v4-flavoured. Unmatched utility classes **fail silently** — square corners, no
  error, nothing in CI to catch it. This is the nastiest failure mode of the ten components
  reviewed on 2026-09-24.
- It pulls in `motion` and `lucide-react`. The animation is a blur-in on scroll — achievable with
  `IntersectionObserver` plus a CSS transition, no dependency. Its `useReducedMotion()` branch also
  returns `children` where a `JSX.Element` is expected, which `typecheck:strict` will reject.

## What already exists to build on

Public, logged-out routes in the Next app — these are the closest thing to a public face today, and
**none of them share a footer**: `app/r` (releases), `app/u` (profiles), `app/selects`,
`app/curators`, `app/help`, `app/join`, `app/pitch`.

Deciding whether the marketing site is part of this Next app or a separate static site is the
first question, and it has a constraint attached: GitHub Pages serves `www.funun.studio` from
`main`, and Pages on a private repo needs a paid plan — see
`.planning/todos/pending/2026-09-20-make-repo-private-when-affordable.md`.

## Related

- `docs/marketing/funun-launch-copy-brief.md` — the copy already written
- `docs/pitch-deck-copy-bank.md` — more existing language to draw on
