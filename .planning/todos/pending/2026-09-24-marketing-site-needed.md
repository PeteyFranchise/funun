
> **Hub:** `.planning/todos/pending/2026-09-24-marketing-page-ideas.md` — idea board, Midjourney
> asset list, and the tagline-removal record all live there.
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

---

## Hero slide 1 — the neon sign (2026-09-24)

**Decision: the building is a Midjourney job, the words are not.**

The CSS build (`private/bench/marketing.html`, `#neon-tube` filter + `.cabinet` panel) gets the
*glow* right — five stacked `feGaussianBlur` passes, white core → indigo sheath → fuchsia haze, a
lit fuchsia pinstripe on a dark cabinet, mount rail and drop rods. What it cannot do is the part
that was actually asked for: **"connected to a building that blends into the blackness."** There is
no building. The wall is a radial gradient with a noise mask. CSS has no glass, no tube ends, no
electrodes, no transformer box, and no real light falloff across brick.

So split it:

| Layer | Made by | Why |
|---|---|---|
| Facade — brick/plaster wall, the cabinet housing, mounting hardware, edges dissolving to black | Midjourney → PNG/WebP plate | Photoreal materials and light falloff. MJ's strength. |
| The words "Writer's Room" | Live CSS neon, on top | Stays real text |

**Why the words stay live text, not baked into the render:**

- It is the `<h1>`. Baked into a JPEG it is invisible to SEO and to screen readers.
- MJ garbles typography. An apostrophe in "Writer's Room" is a near-guaranteed reroll loop.
- The copy can change — a campaign, a second slide, a renamed room — without a regeneration.
- The `warmup` ignition stutter and the apostrophe `flick` are CSS keyframes. A still loses both.
- A hero plate at 2× retina is 300KB–1MB. Keeping it to the wall (and not the text) lets it
  compress harder, since there is no fine lettering to preserve.

**Reusable:** a blank-cabinet plate can carry slides 2 and 3, or any future wording.

### Prompt A — the facade plate (the one to run)

```text
night photograph of a small Nashville bar facade, weathered painted brick wall,
an empty dark rectangular neon sign cabinet mounted on the wall with visible steel
mounting rail and two drop rods, conduit and a small transformer box, the cabinet
interior unlit and empty, the building dissolving into pure black at the edges of
frame, no other signage, no people, no street, deep black background, faint cool
purple ambient light on the brick, cinematic, shallow depth of field, shot on 35mm
--ar 16:9 --style raw --no text, letters, words, typography, lettering, logo
```

Run it, then in the page: absolutely position the existing `.neon` span inside the rendered
cabinet's rectangle and drop the CSS `.cabinet` background (keep the pinstripe `::before`, or let
the render supply it). Keep `.spill` — the light the live text throws onto the photographed brick
is what will sell the composite.

### Prompt B — full sign with text (fallback only)

Only if A's composite refuses to sit right. Expect to fight the lettering.

```text
night photograph of a neon bar sign reading "Writer's Room" in warm 1930s connected
script, glowing white-hot glass tubes with a violet and magenta halo, mounted in a
dark metal cabinet on a weathered brick wall, steel rail and drop rods, the building
dissolving into pure black, deep black background, cinematic, shot on 35mm
--ar 16:9 --style raw
```

### Open risks

- **MJ will try to put text in an empty cabinet.** `--no text` helps and is not reliable. If it
  keeps doing it, generate the cabinet dark/unlit and crop, or mask the interior.
- **Colour match.** The plate's ambient has to land near `#818cf8` / `#d946ef` or the live text
  will read as pasted on. Ask for "cool purple ambient" and colour-grade the plate if needed.
- **Dark only.** A photographic hero cannot follow a light theme. Fine for a marketing hero;
  worth knowing before it is reused anywhere in-app.
- **LCP.** Preload it, serve WebP/AVIF, and give the cabinet a CSS fallback so the text is legible
  before the plate lands.

### Font candidates, pending an eye check

Bench toggle wired at `[data-signfont]` — `Grand Hotel` (1930s connected script, closest to the
Milshire reference), `Yellowtail` (brush script, more honky-tonk), `Monoton` (deco double-stroke,
reads literally as tube but Vegas not Nashville), `Lobster` (bold, common on the web). All four
verified loading. If Prompt B is used instead, this choice goes away.
