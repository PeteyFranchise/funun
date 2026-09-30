# Quick Task 260930-ibp: Ship the marketing page at `/` - Context

**Gathered:** 2026-09-30
**Full scope:** `.planning/todos/pending/2026-09-30-ship-marketing-page-at-root-scope.md` — **read it first and in full.** This file does not repeat it.
**Architecture decision:** `.planning/reviews/CODEX-RESPONSE-260930-marketing-page-port-to-root-route.md`
**Governing requirement:** the shipped page is an **exact replica** of the frozen bench render.

<domain>
## Task Boundary

Work units **2–5** of the scope. Unit 1 (fonts) is **DONE** — see below.

An anonymous visitor to `www.funun.studio` is redirected to `/signin` and never learns
what the product is. Serve the approved marketing page there instead, as a raw document
through a Route Handler, with middleware rewriting only anonymous traffic.

</domain>

<decisions>
## Unit 1 is already done — do not redo it

`private/bench/marketing.html` now **self-hosts its fonts**. Verified in a browser:
7 woff2 served from origin, **0 requests to Google**, and a before/after pixel diff of
14 changed pixels at 1440px and 0 at 430px against a control that showed 12 pixels of
capture noise.

The 10 woff2 files are in `private/bench/fonts/` (gitignored) and must be **copied** to
`public/marketing/fonts/`. Only 7 load on the current hero setting; the other three
(Yellowtail, Monoton, Lobster) back the bench-only type switcher — **their `@font-face`
rules must be removed during sanitization**, along with the switcher itself.

Do not re-download or re-subset the fonts. The `@font-face` rules were generated from
the exact CSS Google served, preserving `unicode-range` and `font-display: swap`
byte-for-byte. Re-subsetting moves line breaks, which is the drift this whole approach
exists to prevent.

## THE FROZEN BASELINE

```
source : private/bench/marketing.html
sha256 : faf382a95319b2c304de57a0bc8c3c894997ab33619c96b754f5821d34c61157
lines  : 2145
inventory: private/bench/baseline/FROZEN-INVENTORY.txt
```

**Verify this hash before you start.** It has already been invalidated twice by edits
made after freezing. If it does not match, STOP and report — do not proceed against a
different revision than the one approved.

## The five things most likely to go wrong

1. **The asset manifest cannot be grepped.** Literal grep finds 40 paths; the rendered
   page loads ~45. Paths are built in JS and carousel panels fetch only when their tab
   is selected. **Build the manifest from a browser** with every tab clicked, every
   popover opened and the pricing toggle flipped, then assert every entry exists in
   `public/`. A miss is a broken image on the homepage.
2. **Strip bench chrome, do not toggle it.** The artifact must not contain
   `body[data-ship]`, the toolbar, either preview button, the toggle script, the four
   `.flag` notes, `.ph-art`/`.phnote` labels, or internal commentary. CSS-hidden text
   still ships and is still readable.
3. **Preserve CSS that affects visible geometry.** `main{padding-top:44px}` exists for
   the toolbar but survives its removal. Removing the toolbar does NOT authorize
   "correcting" that. Defer unused-CSS cleanup until parity is proven.
4. **Do not move role routing into middleware.** `middleware.ts` fires collaborator-claim
   completion for `user && !isAuthRoute`. An authenticated redirect above that block
   silently skips it — a collaborator never gets linked and no test sees it. Rewrite
   `/` **only when `user` is null**; authenticated traffic falls through to
   `app/page.tsx` with its role redirects untouched.
5. **Do not parse and reserialize the HTML.** A serializer introduces drift on its own.
   String replacement only, for the nonce.

## The sign-in ruling (decided, with its cost accepted)

One credential surface at `/signin`. Keep the nav treatment, make it a plain link,
remove `data-authopen` and its handler, remove the mock dialog and its password field.
Resting appearance is unchanged; clicking Sign in navigates rather than opening the
mock. That interaction difference is accepted.

## Owner decisions already settled — do not reopen

- Canonical host **`https://www.funun.studio`** (`NEXT_PUBLIC_APP_URL` set and deployed
  2026-09-30). Canonical/OG URLs use it.
- `/` is **public during invite-only beta**.
- All three pricing CTAs read **"Request an invite"** — signup is invite-gated, so
  nobody can open an account, free or paid.
- Prices locked: Writer free · Studio $19/$15 · Team $49/$39.

</decisions>

<specifics>
## Specific Ideas

**Branch `marketing-page-at-root` is already created and checked out** from `origin/main`.

**Sanitization must be reproducible, not hand-done.** Write it as a script
(`scripts/build-marketing-artifact.mjs` or similar) that takes the frozen bench file and
emits `assets/marketing/landing.html`. A hand-edited artifact cannot be regenerated when
the bench page changes, and the bench page changes constantly. The script is the
deliverable as much as the artifact is.

**Tests.** No jsdom, so nothing can observe the page rendering. Test what is testable:
the sanitizer (given input HTML, does it strip exactly what it should and keep what it
should), the nonce replacement (count, fail-closed cases), and the manifest check. Do
not write a component test that pretends to see a page.

**Verification Gate** per `.claude/CLAUDE.md` — every step CI's `validate` job runs:

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

`npm run build` is FORBIDDEN (live dev server on :3000). `main` is protected — ship
through a PR. Never `git add -A`.

**14MB of images live in `private/bench/img/`, but only ~45 are used.** Copy only what
the manifest lists. Do not copy the directory.

**PR body must state:** that `/` becomes public; the interaction-fidelity exception on
sign-in; how the manifest was produced; and that a human still needs to compare the
deployed page against the frozen bench render, because no test can.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/todos/pending/2026-09-30-ship-marketing-page-at-root-scope.md` — **the scope**
- `.planning/reviews/CODEX-RESPONSE-260930-marketing-page-port-to-root-route.md` — architecture + residual-risk analysis
- `private/bench/marketing.html` — the frozen source (gitignored)
- `private/bench/baseline/` — hash and inventory
- `middleware.ts` — CSP/nonce (`:44` sets `x-nonce`), the claim side effect, `isProtected`
- `app/page.tsx` — role redirects to preserve
- `next.config.mjs:37-51` — `outputFileTracingIncludes` pattern for runtime-read files

</canonical_refs>
