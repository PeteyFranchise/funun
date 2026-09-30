---
phase: quick-260930-ibp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/build-marketing-artifact.ts
  - scripts/verify-marketing-artifact.ts
  - scripts/marketing-artifact.test.ts
  - scripts/__fixtures__/marketing-sanitizer/*
  - assets/marketing/landing.html
  - assets/marketing/manifest.json
  - public/marketing/img/**
  - public/marketing/fonts/**
  - app/marketing-document/route.ts
  - __tests__/marketing-root-route.test.ts
  - middleware.ts
  - next.config.mjs
  - package.json
autonomous: false
requirements: [UNIT-2, UNIT-3, UNIT-4, UNIT-5]
user_setup: []

must_haves:
  truths:
    - "An anonymous GET of / returns 200 with the marketing document — no redirect to /signin."
    - "An authenticated GET of / still resolves by role: staff to /admin/client-partners, buyer to /sync/catalog, everyone else to /dashboard."
    - "The collaborator-claim completion still fires for authenticated non-auth requests (middleware.ts:159-180 is still reached)."
    - "Every asset the rendered page requests resolves 200 from the same origin; zero requests leave for fonts.googleapis.com or fonts.gstatic.com."
    - "The served document contains no bench chrome, no placeholder labels, and no internal decision commentary."
    - "The one surviving inline script executes under the app CSP — carousel, collaborator sphere and pricing toggle all work."
    - "A direct request to /marketing-document does not serve a second indexable copy of the page."
  artifacts:
    - assets/marketing/landing.html
    - assets/marketing/manifest.json
    - public/marketing/fonts/ (7 woff2)
    - public/marketing/img/ (manifest-listed images only)
    - scripts/build-marketing-artifact.ts
    - scripts/verify-marketing-artifact.ts
    - scripts/marketing-artifact.test.ts
    - app/marketing-document/route.ts
    - __tests__/marketing-root-route.test.ts
  key_links:
    - "middleware rewrite sits AFTER supabase.auth.getUser() and fires only when user is null — it must not shadow the `user && !isAuthRoute` claim block."
    - "the rewrite response must carry the same forwarded request headers that createPassThroughResponse builds (x-nonce + CSP) or the handler fails closed and / returns 500."
    - "the sanitizer's relative-path rewrite must match the public/marketing/ layout exactly — a mismatch is a broken image on the homepage."
    - "the nonce placeholder count baked into the artifact must equal the count the handler asserts."
    - "the middleware matcher must exclude /marketing or every image and font request runs supabase.auth.getUser()."
---

<objective>
Serve the approved marketing document at `/` for anonymous visitors, as a raw HTML
document produced by a reproducible sanitizer script and returned by a Next.js Route
Handler, with middleware rewriting only when there is no user.

Purpose: an anonymous visitor to `www.funun.studio` is currently redirected to `/signin`
and never learns what the product is.

Output: a committed, regenerable artifact plus the routing, assets, verifier and tests
that keep it honest.

**Work units 2–5 of the scope. Unit 1 (self-hosted fonts) is DONE — do not redo it.**
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260930-ibp-ship-the-marketing-page-at-the-root-rout/260930-ibp-CONTEXT.md
@.planning/todos/pending/2026-09-30-ship-marketing-page-at-root-scope.md
@.planning/reviews/CODEX-RESPONSE-260930-marketing-page-port-to-root-route.md
@middleware.ts
@app/page.tsx
@next.config.mjs
@scripts/break-glass.ts
@.claude/CLAUDE.md
</context>

<verified_facts>
## Source verification performed during planning (2026-09-30)

Every claim below was checked against the actual file. `file:line` given. Anything the
source artifacts got wrong is listed under CORRECTIONS and **the plan uses the verified
value, not the quoted one.**

### Confirmed

| Claim | Result |
|---|---|
| frozen sha256 `faf382a9…c61157` | **MATCHES** `private/bench/marketing.html` as of planning |
| branch `marketing-page-at-root` checked out | TRUE |
| `middleware.ts:44` sets `x-nonce` | TRUE |
| collaborator-claim block `if (user && !isAuthRoute)` | TRUE — `middleware.ts:159-180` |
| role redirects to preserve | TRUE — `app/page.tsx:18-26` |
| `outputFileTracingIncludes` pattern | TRUE — `next.config.mjs:37-52` |
| `data-authopen` × 2 | TRUE — `marketing.html:907` (the nav link) and `:2061` (the handler) |
| nav Sign in already points at `/signin` | TRUE — `marketing.html:907` |
| four `.flag` notes | TRUE — `:998 :1072 :1086 :1135` |
| `Bench 02` × 1 | TRUE — `:826` |
| zero Google font references | TRUE — 0 hits for `fonts.googleapis.com` / `fonts.gstatic.com` |
| 10 `@font-face` rules, `:11-20` | TRUE; only 7 load (no `data-signfont` on `<body>`) |
| `APP_ORIGIN = 'https://funun.studio'` | TRUE — `lib/auth/postSignInPath.ts:22` |
| hardcoded host in email preview | TRUE — `app/email-preview/page.tsx:10` |
| `tsx` runner available | TRUE — `node_modules/.bin/tsx` |
| testable-script precedent | TRUE — `scripts/break-glass.ts` + `scripts/break-glass.test.ts` |

### CORRECTIONS — the scope document is measured against the PRE-unit-1 revision

The scope's figures all predate the font self-hosting, which added exactly 12 lines.
**Every line number in the scope is 12 low.**

1. **Line count.** Scope says 2133. Actual frozen file is **2145**. CONTEXT's 2145 is
   the correct one.
2. **`main{padding-top:44px}`** is at **`marketing.html:60`**, not line 48. (48 + 12 = 60.)
   Codex's verification table repeats the stale 48.
3. **"The four woff2 URLs in the frozen render are recorded in the inventory"** — obsolete.
   `FROZEN-INVENTORY.txt` now lists 10 **local** font files and no URLs.

### CORRECTION — "3 inline scripts" is a PRE-sanitization count

The frozen file has 3 inline `<script>` blocks: `:798-821`, `:1243-2132`, `:2135-2143`.

- `:798-821` is the **wrong-origin dev guard** — the strip list names "dev warnings". It goes.
- `:2135-2143` is the **ship-preview toggle** — the strip list names "the toggle script". It goes.

**Exactly one inline script survives sanitization.** The scope's instruction to "insert
`nonce="__CSP_NONCE__"` on each of the 3" and its fail-closed rule "the replacement count
is not exactly 3" are both wrong for the production artifact. **The number is 1.** The
handler and the verifier must both assert **1**, and the plan derives that number from the
artifact rather than hardcoding a guess (see Task 2).

### CORRECTION — the asset-count story, with the actual mechanism

- literal `img/…` paths in the frozen source: **40** (this reproduces the scope's number)
- `marketing.html:1735` builds `img/art/<slug>.jpg` from the `SEL` array at `:1721-1726`
  (`paper`, `moonlight`, `midnight-ride`, `golden-hour`). Three of those four are not
  literals anywhere. Static analysis therefore yields **43**.
- the scope's rendered count is "~45". **43 ≠ 45.** Static analysis does not close the gap.
  This is the direct evidence that the manifest must come from a browser, and it is why
  Task 1 treats the browser set as authoritative and the static set as a cross-check only.
- `private/bench/img/` holds 217 files / 14MB. The 43 known ones total 4.2MB.
  **Copy only what the manifest lists.**

### NEW FINDINGS — not in CONTEXT, not in the scope, not caught by Codex

**F1 — All asset paths are relative and MUST be rewritten.** Every reference is
`img/…`, `img/art/…` or `fonts/…` (`:11-20`, `:1040`, `:1376-1382`, `:1735`, `:1748-1780`,
`:2011-2022`). The rewrite displays at `/`, so those resolve to `/img/…` and `/fonts/…`,
but the files are going to `public/marketing/`. Without a prefix rewrite **every image and
every font 404s.** Neither source document mentions this. Do not solve it with a `<base>`
tag — the page has 6 `href="#"` controls and several `#anchor` nav links that a `<base>`
would re-target.

**F2 — Two inline event-handler attributes are blocked by the app CSP.**
`onerror="this.remove()"` at `:1411` and `:2035`. `script-src` has a nonce and
`'strict-dynamic'` but no `'unsafe-inline'`, and **a nonce does not cover inline event
attributes.** These will be refused and reported as CSP violations on the homepage. They
only *do* anything when an image fails, so this is not a render defect — but it is a real
behavioural difference and a console error. **Do not silently rewrite approved markup and
do not widen the CSP.** Surface it at the checkpoint (Task 4).

**F3 — The middleware matcher does not exclude `public/`.** Matcher is
`'/((?!_next/static|_next/image|favicon.ico|api).*)'` (`middleware.ts:187`). Requests for
`public/` files do run middleware, and middleware calls `supabase.auth.getUser()`. Shipping
~43 images + 7 fonts under `/marketing/` would add ~50 Supabase auth round-trips per
anonymous homepage load. Task 3 verifies this against the dev server and excludes
`/marketing` from the matcher.

**F4 — Bench toolbar wiring lives inside the SURVIVING script.** `:1252`, `:1254` and
`:1273` query `.bench [data-…]`. Removing the `<div class="bench">` does not remove this
code. Task 2 requires reading `:1249-1300` in full before deciding whether it is an inert
no-op or whether it also initialises `document.body.dataset` / the carousel.

**F5 — There is no favicon or icon file anywhere in the repo**, and no OG image has been
chosen. Do not emit `<link rel="icon">` or `og:image` pointing at a file that does not
exist; see Task 2.

**F6 — A negative grep for the bare word "bench" is unusable.** It appears in *visible
marketing copy* at `:1504` ("the AI tool bench") and `:1562` ("The whole AI tool bench").
The verifier must use the precise literals listed in Task 2, never a bare `bench` match.

### Explicitly OUT OF SCOPE
- Aligning `APP_ORIGIN` / `app/email-preview/page.tsx` to the www host. Settled but not a
  work unit, and `postSignInPath`'s same-origin check is self-consistent either way.
- Any CSP change in `middleware.ts:26-41`.
- Unused-CSS cleanup (`.bench{…}`, `.flag{…}`, `.authdlg{…}`, `body[data-signfont=…]`).
  Deferred until parity is proven, per the scope.
</verified_facts>

<task_count_justification>
Four tasks, three of them automated. The constraint allows up to four with justification.

The scope is five work units compressed into one plan. The split is by subsystem, not by
convenience — each task owns a disjoint file set, has its own automated gate, and cannot
be merged without producing a task whose failure mode is ambiguous:

1. **Assets** — binary files into `public/`, gated by a browser-derived manifest. Nothing
   else in the plan can be verified until this exists.
2. **Artifact** — pure string transformation of one input file into one output file, plus
   its verifier and its unit tests. Only task that touches the approved document.
3. **Routing** — `middleware.ts`, the route handler, `next.config.mjs`. Only task that
   touches live application request handling, and the only one that can break
   authenticated users.
4. **Checkpoint** — human parity comparison and two owner decisions. Not an
   implementation task.
</task_count_justification>

<package_legitimacy>
**No package-manager installs in this plan.** `tsx` is already a dependency
(`node_modules/.bin/tsx`, used by three existing npm scripts). No Playwright, Puppeteer or
jsdom is installed and none is to be installed — Task 1 uses an already-installed browser
on the machine, not a new dependency. If any task finds itself reaching for
`npm install`, STOP and report instead: the RESEARCH package-legitimacy gate has not been
run for this work.
</package_legitimacy>

<tasks>

<task type="auto">
  <name>Task 1: Freeze gate, browser-derived asset manifest, copy assets</name>
  <files>scripts/marketing-assets.ts, scripts/marketing-artifact.test.ts, assets/marketing/manifest.json, public/marketing/fonts/, public/marketing/img/</files>
  <action>
**STEP 0 — THE GATE. Do this before touching anything else.**
Run sha256 over `private/bench/marketing.html` and compare to
`faf382a95319b2c304de57a0bc8c3c894997ab33619c96b754f5821d34c61157`, and compare the line
count to 2145. If either differs, **STOP immediately and report**. Do not re-freeze, do not
adapt, do not proceed against a different revision. This baseline has already been
invalidated twice by post-freeze edits, and parallel sessions can change the file between
planning and execution. Also confirm `git branch --show-current` is `marketing-page-at-root`.

**STEP 1 — static candidate set.** Write `scripts/marketing-assets.ts` exporting pure,
testable functions. One extracts every literal asset reference from the frozen HTML.
Another extracts the slug list from the `SEL` array declaration and expands it into
`img/art/<slug>.jpg`. Union them. Expect 43; do not hardcode 43 — assert the function
returns the union and let the test pin the shape, not the number.

**STEP 2 — the browser set.** Serve `private/bench/` over HTTP (a plain static server on
127.0.0.1; the bench does not work from a file:// or data: URL and there is a guard in the
document that says so). Open the served page in a real browser with the Network panel
recording, then exercise: every carousel tab, every popover, the pricing toggle, and scroll
the full page so lazy images fetch. Export the HAR to
`private/bench/baseline/manifest.har`.

If the Chrome MCP is available, drive this yourself. If it is not, produce **one** clear
instruction for the owner — which URL to open, what to click, where to save the HAR — and
STOP until the file exists. Do not substitute a grep, do not install a headless browser,
and do not guess.

**STEP 3 — reconcile.** A third exported function parses the HAR, keeps same-origin
requests for image and font content types, strips query strings (the document appends
`?v=` from the `ASSET_V` constant), and returns the observed set. Then assert:
observed ⊆ (static ∪ fonts). **Any observed path not derivable from static analysis is a
hard finding — print it and STOP**, because it means there is a construction site in the
JS this plan has not accounted for.

**STEP 4 — copy.** Copy only manifest-listed images from `private/bench/img/` into
`public/marketing/img/` preserving the `art/` subdirectory, and copy exactly the seven
production woff2 (`grand-hotel-400`, `inter-400/500/600/700/800/900`) from
`private/bench/fonts/` into `public/marketing/fonts/`. **Do not copy the directory** —
`private/bench/img/` is 217 files and 14MB; the manifest set is ~4.2MB. **Do not copy
`lobster-400`, `monoton-400` or `yellowtail-400`** — they back the bench-only type switcher
and their `@font-face` rules are removed in Task 2. Do not re-download or re-subset any
font; re-subsetting moves line breaks, which is the drift this whole approach exists to
prevent.

Write the resolved manifest to `assets/marketing/manifest.json` (public paths, sorted,
with a recorded source sha256 and HAR timestamp). Add a `marketing:assets` npm script.

Stage files individually. **Never `git add -A`.**
  </action>
  <verify>
    <automated>npx tsx scripts/marketing-assets.ts --check &amp;&amp; node -e "const m=require('./assets/marketing/manifest.json');const fs=require('fs');const miss=m.assets.filter(p=>!fs.existsSync('public'+p));if(miss.length){console.error('MISSING',miss);process.exit(1)};console.log('assets ok',m.assets.length)"</automated>
  </verify>
  <done>
Frozen hash and line count re-verified and matching. `private/bench/baseline/manifest.har`
exists and was produced in a browser. `assets/marketing/manifest.json` lists every asset
the rendered page requested. Every listed path exists under `public/`. Exactly 7 woff2 in
`public/marketing/fonts/`. No unreferenced image was copied.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Reproducible sanitizer, the artifact, and the verifier</name>
  <files>scripts/build-marketing-artifact.ts, scripts/verify-marketing-artifact.ts, scripts/marketing-artifact.test.ts, scripts/__fixtures__/marketing-sanitizer/, assets/marketing/landing.html</files>
  <behavior>
Tests run under `testEnvironment: 'node'` with ts-jest. No jsdom exists, so **no test may
pretend to observe rendering.** Test the string transformation only, against small hand-built
fixtures in `scripts/__fixtures__/marketing-sanitizer/` — plus assertions run over the real
generated artifact.

- Given a fixture containing the bench toolbar div, the sanitizer removes it and leaves the
  surrounding markup byte-identical.
- Given a fixture containing `main{padding-top:44px}`, that rule **survives** toolbar removal.
- Given a fixture with `<body data-bg="black" data-hero="stream">`, both attributes survive.
- Given a fixture with the nav sign-in anchor, `data-authopen` is removed and
  `href="/signin"` plus the class attribute are unchanged.
- Given a fixture with a relative `src="img/x.jpg"`, it becomes `/marketing/img/x.jpg`;
  `url(fonts/inter-400.woff2)` becomes `url(/marketing/fonts/inter-400.woff2)`; an already
  absolute `/signin` and a `#anchor` are untouched.
- Given a fixture with an anchored block whose end marker is absent, the sanitizer
  **throws** rather than removing to end-of-file.
- Given a fixture where a target block appears twice, the sanitizer **throws** rather than
  removing an arbitrary one.
- Running the sanitizer twice over the same input produces byte-identical output.
- The verifier, run over a deliberately-dirty fixture, fails for each prohibited literal
  independently (one assertion per literal, so a failure names the offender).
  </behavior>
  <action>
Write `scripts/build-marketing-artifact.ts`: reads `private/bench/marketing.html`, emits
`assets/marketing/landing.html`. It is the deliverable as much as the artifact is — the
bench page changes constantly and a hand-edited artifact cannot be regenerated.

**Re-assert the frozen hash inside the script and refuse to run against any other input.**

**Do not parse and reserialize.** No DOM library, no HTML parser, no formatter. Anchored
string replacement only; a serializer introduces drift on its own. Every removal must be
anchored on both ends, must assert exactly one match, and must throw on zero or many.

**Strip (do not toggle) — the production document IS the shipped state.** CSS-hidden text
still ships and is still readable. Remove:
- the ship-gate CSS rules keyed on the ship-preview body attribute, and the `.shipexit` rule
- the wrong-origin dev-guard script block
- the `<div class="bench">` toolbar and everything inside it, including the `Bench 02` label
  and both preview buttons
- the `.shipexit` exit button and the ship-preview toggle script block at the end of `<body>`
- the four `.flag` notes
- the two `.ph-art` paragraphs and the one `.phnote` paragraph, **and** the CSS rules and
  the explanatory comment that name those two class names (the verifier greps for the bare
  class names, so the rules must go too)
- the sign-in `<dialog>` element in its entirety, and the sign-in IIFE inside the surviving
  script (it is the last statement in that script and the sparks helper is defined inside
  it, so the whole function goes as one block — verify that before cutting)
- the `data-authopen` attribute on the nav anchor, keeping the anchor, its class and its
  `href="/signin"` exactly as they are
- internal commentary: the comments containing `.planning/` paths, the `OWNER DECISION` /
  `owner-approved` comments, and the `Bench mock` string. **Scope it to those.** Do not strip
  the design-rationale comments throughout the CSS — that is a large uncontrolled diff with
  no internal decision content in it, and it is not what the strip list asks for.

**Preserve, explicitly:**
- `main{padding-top:44px}` — it exists for the toolbar but survives its removal. Removing
  the toolbar does **not** authorize correcting it.
- `<body data-bg="black" data-hero="stream">` — these drive CSS selectors and encode the
  frozen hero and background choice.
- all remaining CSS, including now-dead rules. Deferred cleanup until parity is proven.

**Read `marketing.html:1249-1300` in full before deciding anything about it.** The bench
toolbar's control wiring lives in the *surviving* script and queries `.bench [data-…]`.
If it only attaches listeners to elements that no longer exist, leave it — inert, no-op,
zero render effect. If it also initialises `document.body.dataset` or nudges the carousel,
**preserve the initialisation** and remove only the listener attachment. Do not assume;
read it.

**Remove the three bench-only `@font-face` rules** (Lobster, Monoton, Yellowtail) so no
`@font-face` points at a file that was not copied. Leave the seven production rules
byte-identical, `unicode-range` and `font-display: swap` included.

**Rewrite relative asset prefixes** (finding F1): `img/` becomes `/marketing/img/`,
`fonts/` becomes `/marketing/fonts/`, in markup attributes, in CSS `url()`, and in the JS
string literals the document builds `src` values from. Leave absolute paths and `#` anchors
alone. Then assert every rewritten path is present in `assets/marketing/manifest.json`.

**Head metadata** (there is no Metadata API on this route): replace the bench `<title>`
with the production title, add a description, `<link rel="canonical">` to
`https://www.funun.studio/`, Open Graph and Twitter card tags. `lang="en"`, charset and
viewport are already present at `:2-5` — leave them. **No favicon or icon file exists in
this repo and no OG image has been chosen (F5): omit `<link rel="icon">` and `og:image`
rather than pointing them at files that do not exist, and note the omission for the
checkpoint.** Do not add JSON-LD.

**Nonce placeholder:** insert a unique literal placeholder on the opening tag of each
surviving inline script. **Count them programmatically and write the count into
`assets/marketing/manifest.json`** — do not hardcode it. Per the verification above the
number is **1**, not the 3 the scope states, because two of the three script blocks are
being removed. Assert the count is greater than zero and that no `<script` tag lacks a
placeholder.

Write `scripts/verify-marketing-artifact.ts` asserting over the generated artifact:
zero occurrences of each of `data-ship`, `class="flag"`, `ph-art`, `phnote`,
`data-authopen`, `Bench 02`, `shipexit`, `shipOn`, `shipOff`, `Bench mock`, `authdlg`,
`127.0.0.1:4321`, `.planning/`, `OWNER DECISION`, `fonts.googleapis.com`,
`fonts.gstatic.com`; the placeholder count equals the manifest's recorded count; every
`<script` tag carries a placeholder; `main{padding-top:44px}` is still present; both body
data attributes are still present; every asset path referenced is in the manifest.
**Use those precise literals — never a bare `bench` match (F6): the words "AI tool bench"
appear in visible marketing copy at `:1504` and `:1562`.**

Add `marketing:build` and `marketing:verify` npm scripts. Both scripts are `.ts` rather
than `.mjs` (the scope suggested `.mjs`) for a hard technical reason: ts-jest only
transforms `.ts`/`.tsx`, so a `.mjs` sanitizer could not be unit-tested without changing
`transformIgnorePatterns`, and `.mjs` is outside `npm run lint`'s `--ext` list and
`tsconfig`'s include. `scripts/break-glass.ts` + `scripts/break-glass.test.ts` is the
existing precedent.
  </action>
  <verify>
    <automated>npm test -- --runInBand scripts/marketing-artifact.test.ts &amp;&amp; npx tsx scripts/build-marketing-artifact.ts &amp;&amp; npx tsx scripts/verify-marketing-artifact.ts</automated>
  </verify>
  <done>
`assets/marketing/landing.html` exists, is regenerable byte-identically from the frozen
source, and passes the verifier. Unit tests cover strip, preserve, path-rewrite,
idempotence and every fail-closed branch. The nonce placeholder count is recorded in the
manifest rather than assumed. No HTML parser was used.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Route handler, anonymous-only rewrite, file tracing</name>
  <files>app/marketing-document/route.ts, middleware.ts, next.config.mjs, __tests__/marketing-root-route.test.ts</files>
  <behavior>
Node test environment, no jsdom. Test the pure decision logic, not rendering:

- nonce replacement: given document text and a nonce, every placeholder is replaced and the
  returned count is correct.
- fail-closed: missing nonce throws; a surviving placeholder throws; a `<script` tag without
  a nonce throws; a replacement count different from the expected count throws.
- the injected nonce value is the one supplied, and nothing else in the document changed
  (compare the two strings outside the replaced spans).
- routing predicate: anonymous + `/` yields rewrite; authenticated + `/` yields
  fall-through; anonymous + any protected path is unchanged; direct `/marketing-document`
  yields redirect to `/`.
- **a regression test that authenticated, non-auth-route requests still reach the
  collaborator-claim branch** — the failure this test exists to catch is silent and
  otherwise invisible.
  </behavior>
  <action>
**`app/marketing-document/route.ts`** — a GET handler. Read `assets/marketing/landing.html`
from a path built off `process.cwd()`, read `x-nonce` from the request headers, replace the
placeholders by **string replacement only** (no parse, no reserialize), and return
`text/html; charset=utf-8` with `Cache-Control: private, no-store` (a nonce-bearing
response cannot be shared). Read the expected placeholder count from
`assets/marketing/manifest.json` rather than hardcoding a literal — the source documents
say 3 and the verified answer is 1, so a hardcoded number here is a loaded gun.

**Fail closed, loudly**, on: absent `x-nonce`, any surviving placeholder, any `<script` tag
without a nonce, or a replacement count that is not the expected count. Prefer caching the
file read in module scope, but **never** cache the nonce-substituted output.

**`middleware.ts` — three surgical changes.**

1. **Anonymous-only rewrite.** After `supabase.auth.getUser()` and after the existing
   `isProtected && !user` block, add: when `pathname === '/'` and `user` is null, return a
   rewrite to `/marketing-document`. **Do not move role routing into middleware** — the
   `user && !isAuthRoute` block at `:159-180` fires collaborator-claim completion, and an
   authenticated redirect inserted above it silently skips the side effect: a collaborator
   never gets linked and no test sees it. Authenticated `/` must keep falling through to
   `app/page.tsx:18-26`.

   **The rewrite response must carry the forwarded request headers** that
   `createPassThroughResponse` builds — `x-nonce` and the `Content-Security-Policy` request
   header. Those headers are currently constructed inside that closure; hoist them or build
   them once so the rewrite can reuse the exact same object. If the rewrite forwards the
   raw client headers instead, `x-nonce` is absent, the handler fails closed and the
   homepage returns 500. Wrap the rewrite in `respondWithAuthState` so refreshed auth
   cookies and cache headers ride along, exactly as the existing redirects do.

   Note for local work: the demo-mode early return at `:64-67` fires before `getUser()`, so
   with `NEXT_PUBLIC_VAULT_DEMO=true` the rewrite never runs and `/` still goes to
   `/signin`. That is expected — do not chase it.

2. **Close the duplicate URL.** When `pathname === '/marketing-document'`, redirect to `/`.
   Doing it in middleware — which sees the real path even though a rewrite does not re-enter
   middleware — is why this plan uses **no marker header**: a header-based gate would be
   client-spoofable, and this is not.

3. **Exclude the static assets from the matcher (F3).** First *verify* the claim against the
   running dev server: request a file under `/marketing/` and confirm middleware executes
   (a temporary log line, removed afterwards). If it does, add `marketing` to the matcher's
   negative lookahead alongside `_next/static`, `_next/image`, `favicon.ico` and `api`.
   Without it, ~50 image and font requests per anonymous homepage load each call
   `supabase.auth.getUser()`. If the verification shows middleware does *not* run for those
   paths, say so and leave the matcher alone. **Do not change the CSP at `:26-41`.**

**`next.config.mjs`** — add `'/marketing-document': ['./assets/marketing/landing.html',
'./assets/marketing/manifest.json']` to `outputFileTracingIncludes`, following the existing
route-keyed entries at `:37-52`. Without it the artifact resolves in local dev (where
`process.cwd()` is the repo root) and then 404s in the deployed serverless bundle — the
identical failure class the existing comment documents for the PDF fonts.

Then run the **full Verification Gate** from `.claude/CLAUDE.md`. Not build + test:
`npm run build` is forbidden here and `npm run lint` is load-bearing at `--max-warnings=0`.
  </action>
  <verify>
    <automated>npm run security:migrations:verify &amp;&amp; npm run typecheck:strict &amp;&amp; npm run lint &amp;&amp; npm test -- --runInBand &amp;&amp; npm audit --omit=dev --audit-level=moderate &amp;&amp; npm audit --audit-level=high</automated>
  </verify>
  <done>
Full CI `validate` gate green. Anonymous `/` on the dev server returns 200 with the
marketing document and every asset resolves 200. Authenticated `/` still role-routes.
`/marketing-document` redirects to `/`. The claim-completion regression test passes.
The matcher question is resolved by observation, not assumption.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Checkpoint — parity comparison, two owner decisions, PR</name>
  <files>(no code changes — human verification and PR)</files>
  <action>
Stop automated work. Present the parity comparison and the two decisions below to the
owner and wait. Do not open the PR, and do not adjust the document to close a parity
difference, until the owner has answered. Give one instruction at a time for the
hands-on steps rather than handing over a batched runbook.
  </action>
  <what-built>
Anonymous `/` now serves the sanitized marketing document. `assets/marketing/landing.html`
is regenerated by `scripts/build-marketing-artifact.ts` from the frozen bench source and
checked by `scripts/verify-marketing-artifact.ts`. Assets are in `public/marketing/`,
derived from a browser HAR. Middleware rewrites only when there is no user; authenticated
role routing and the collaborator-claim side effect are untouched.
  </what-built>
  <how-to-verify>
**1. Parity — no test can do this.** Open the frozen bench in its shipped state and the
locally served `/` side by side at 1440px, 1024px, 768px and 430px. Compare hero type and
line breaks, the carousel at every tab, the collaborator sphere, the pricing table with the
toggle in both positions, and the footer. Confirm the top spacing is unchanged. Report any
difference rather than adjusting the document.

**2. Confirm the four corrections to the source documents.** The executor should have
reported: the frozen file is 2145 lines (the scope's 2133 is pre-unit-1, so every scope
line number is 12 low, including `main{padding-top:44px}` which is at line 60, not 48);
exactly **1** inline script survives, not 3; static analysis finds 43 asset paths where the
scope quotes 40 grep / ~45 rendered; and relative asset paths had to be rewritten, which
neither document mentions.

**3. DECISION — the two `onerror="this.remove()"` attributes (F2).** At `:1411` and `:2035`.
The app CSP has a nonce and `'strict-dynamic'` but no `'unsafe-inline'`, and a nonce does
not cover inline event attributes, so these are refused and logged as CSP violations. They
only act when an image fails, and every image is present. Pick one:
(a) leave the approved markup byte-identical and accept the console violation — consistent
with how the sign-in interaction exception was handled;
(b) convert both to listeners attached after insertion — a small, reviewable change to
approved JS that removes the violation.
**Widening the CSP is not an option.**

**4. DECISION — head metadata gaps (F5).** No favicon or icon file exists in the repo and no
OG image has been chosen, so `<link rel="icon">` and `og:image` were omitted rather than
pointed at nothing. Choose an image now or ship without and file a follow-up.

**5. Then the PR.** `main` is protected — ship through a PR, never by pushing `main`. Never
`git add -A`. The PR body must state: that `/` becomes public during invite-only beta; the
sign-in interaction-fidelity exception (clicking Sign in navigates instead of opening the
approved mock dialog); how the asset manifest was produced (browser HAR, with the grep/static/
rendered counts); the `onerror` CSP decision from step 3; and that a human still has to
compare the deployed page against the frozen bench render, because no test can.
  </how-to-verify>
  <resume-signal>Type "approved" with your answers to decisions 3 and 4, or describe the parity differences you found.</resume-signal>
  <verify>
    <automated>MISSING — human verification by design. No jsdom exists and no automated check can compare a rendered page against a frozen design render. The automated half already ran in Task 3's full Verification Gate.</automated>
    <human-check>Side-by-side parity at 1440/1024/768/430px; the four source-document corrections acknowledged; decisions 3 and 4 answered.</human-check>
  </verify>
  <done>
Owner has compared the deployed page against the frozen bench render and either approved
or listed differences. Decisions 3 (inline `onerror` under CSP) and 4 (icon / OG image)
are answered and recorded. PR is open against `main` with all five required statements in
its body.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| anonymous internet → `/` | fully untrusted, unauthenticated, now reaching a new handler |
| client headers → middleware → route handler | client-supplied headers are forwarded; only middleware-set values are trustworthy |
| frozen bench source → committed public artifact | internal working document crossing into a public, permanently readable repository and a public URL |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ibp-01 | Information disclosure | `assets/marketing/landing.html` | high | mitigate | Strip, do not toggle. `scripts/verify-marketing-artifact.ts` asserts zero occurrences of each enumerated internal literal, using precise strings not a bare `bench` match (F6). CSS-hidden text still ships and is still readable, and this repo is public. |
| T-ibp-02 | Spoofing / Tampering | direct `/marketing-document` access | medium | mitigate | No marker header is used, because a client can set one. Middleware sees the real pathname and redirects `/marketing-document` to `/`, which is not spoofable. |
| T-ibp-03 | Elevation / control-flow bypass | `middleware.ts:159-180` | high | mitigate | Rewrite only when `user` is null, placed after `getUser()` and below the protected-route block; authenticated `/` falls through to `app/page.tsx:18-26`. A regression test asserts authenticated non-auth requests still reach the claim branch — the failure is otherwise silent. |
| T-ibp-04 | Tampering (policy weakening) | `middleware.ts:26-41` CSP | high | mitigate | CSP edits are out of scope. The one surviving inline script is nonced; the two inline event attributes (F2) are surfaced for an explicit decision, and `'unsafe-inline'` is not on the menu. |
| T-ibp-05 | Denial of service | middleware matcher vs `public/marketing/` | medium | mitigate | ~50 static asset requests per homepage load would each call `supabase.auth.getUser()`. Verify against the dev server, then exclude `marketing` from the matcher's negative lookahead. |
| T-ibp-06 | Information disclosure | nonce reuse across responses | medium | mitigate | `Cache-Control: private, no-store` on the HTML response only; `x-nonce` is never echoed into a response header; the nonce-substituted body is never cached in module scope. |
| T-ibp-07 | Repudiation / integrity | building against a drifted source | high | mitigate | sha256 + line-count gate in Task 1 step 0 and re-asserted inside the build script, which refuses to run against any other input. This baseline has already been invalidated twice. |
| T-ibp-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs nothing. `tsx` is already a dependency. Any task reaching for `npm install` must STOP and report — the package legitimacy gate has not been run for this work. |
</threat_model>

<verification>
- Frozen sha256 and line count re-verified at execution start; build script refuses any other input.
- `npx tsx scripts/verify-marketing-artifact.ts` green.
- `npm test -- --runInBand` green, including the sanitizer unit tests, the nonce fail-closed cases, the manifest check and the collaborator-claim regression test.
- Full Verification Gate from `.claude/CLAUDE.md`: `security:migrations:verify`, `typecheck:strict`, `lint` (`--max-warnings=0`), `test --runInBand`, both `npm audit` levels. `npm run build` is forbidden.
- Dev server: anonymous `/` returns 200 with the document; every asset returns 200; zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`; zero CSP violations other than the two `onerror` attributes under decision 3.
- Authenticated `/` still role-routes; `/marketing-document` redirects to `/`.
- Human parity comparison at four widths (Task 4). No automated check substitutes for it.
</verification>

<success_criteria>
- An anonymous visitor to `/` sees the approved marketing page instead of `/signin`.
- The artifact is regenerable byte-identically by re-running the build script.
- Authenticated role routing and the collaborator-claim side effect are demonstrably unchanged.
- No bench chrome, placeholder label or internal decision commentary is present in the served document.
- No new npm dependency, no CSP change, no HTML parse/reserialize, no `git add -A`.
- The four source-document corrections and the six new findings are reported to the owner, not silently absorbed.
</success_criteria>

<output>
Quick task — record the outcome in
`.planning/quick/260930-ibp-ship-the-marketing-page-at-the-root-rout/260930-ibp-SUMMARY.md`
when done, including the resolved asset count, the actual surviving script count, and the
owner's answers to decisions 3 and 4.
</output>
