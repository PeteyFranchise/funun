# Midjourney art → hero banner slides, swappable from a marketing console

**Written:** 2026-09-27
**Owner decision, same day.** Supersedes the plan recorded in
`2026-09-26-differentiator-carousel-art.md`.

---

## The decision

The Midjourney briefs are **not** going into the differentiator carousel. That section
now carries **real product shots** of the shipped screens.

The briefs are still wanted — for **dedicated hero banner slides**, the kind already at
the top of the marketing page — and those slides should be **addable and swappable from
a marketing console**, once that console is built.

Owner's words: *"I decided to not go with the midjourney briefs for this section, but
will use them elsewhere in dedicated hero banner slides like the ones at the top, that
we can add and swap from the marketing console once that is built out."*

---

## What already changed because of it

- `private/bench/marketing.html` — the Antenna and PitchPlug carousel panels now point
  at real captures:
  - `img/tool-antenna-vault-to-brief.png` — Sound Vault → matched brief
  - `img/tool-pitchplug-pick-writes.png` — targets picked → email written
  Both are 1120×700 at 2× (16:10, the ratio `.dart` crops to), rendered from
  `private/bench/shot-antenna.html` and `private/bench/shot-pitchplug.html`. The source
  HTML is checked into the bench so either shot can be re-rendered after a design change
  rather than re-cropped by hand:
  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
    --hide-scrollbars --force-device-scale-factor=2 --window-size=1120,700 \
    --screenshot=out.png --virtual-time-budget=6000 "http://127.0.0.1:4321/shot-antenna.html"
  ```
- The section's "Placeholder art" flag was false once those landed and has been replaced
  with an honest one: **SampleClear is the only panel still without a shot.**

Everything above is in `private/`, which is gitignored. Nothing here is on the public
repo yet.

---

## Still to do

1. **SampleClear has no shot.** It is the one carousel panel still text-only. It needs
   either a product capture (does the screen exist yet?) or to be dropped from the
   carousel until it does.
2. **Design the hero banner slide format** — the Midjourney briefs in
   `2026-09-26-differentiator-carousel-art.md` were written for a 16:10 carousel panel,
   not a full-bleed hero. They will need re-scoping for the new aspect and crop.
3. **The marketing console does not exist.** Adding/swapping hero slides from an admin
   surface is a build, not a config change. Scope it before promising the swap workflow
   — at minimum it needs: slide CRUD, image upload to a bucket, ordering, an
   active/scheduled flag, and a preview. Worth checking whether it belongs inside the
   existing admin console (`components/admin/console-theme.ts` and siblings) rather than
   as a new room.
4. Until the console exists, hero slides are a code change like any other.

---

## Related

- `.planning/todos/pending/2026-09-26-differentiator-carousel-art.md` — the original
  Midjourney briefs. **Not cancelled, re-aimed.** Read this file first.
- `.planning/todos/pending/2026-09-27-composer-avatar-art.md` — the other pending
  Midjourney work (Gen-Z composer portraits for the testimonials), unaffected by this
  decision.
