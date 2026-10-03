---
phase: quick-261002-wtl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - middleware.ts
  - __tests__/marketing-root-route.test.ts
  - app/(auth)/signup/waitlist-gate.ts
  - app/(auth)/signup/waitlist-gate.test.ts
  - app/(auth)/signup/page.tsx
  - __tests__/waitlist-turnstile-coherence.test.ts
  - lib/security/turnstile.ts
  - lib/security/turnstile.test.ts
  - app/api/waitlist/route.ts
  - app/api/waitlist/route.test.ts
  - .planning/todos/pending/2026-08-27-configure-turnstile-production.md
autonomous: true
requirements: [261002-wtl]
user_setup:
  - service: cloudflare-turnstile
    why: "The waitlist cannot accept a single submission until both keys exist. This plan makes the code capable; the keys are the owner's step AFTER merge."
    env_vars:
      - name: NEXT_PUBLIC_TURNSTILE_SITE_KEY
        source: "Cloudflare dashboard -> Turnstile -> (site for funun.studio) -> Site Key. Must be set in Vercel Production; NEXT_PUBLIC_* is baked at build time, so a redeploy is required."
      - name: TURNSTILE_SECRET
        source: "Cloudflare dashboard -> Turnstile -> (same site) -> Secret Key. Server-only. Must NEVER carry a NEXT_PUBLIC_ prefix."
    dashboard_config:
      - task: "Create a Turnstile widget for funun.studio + www.funun.studio"
        location: "Cloudflare Dashboard -> Turnstile -> Add site"
      - task: "After setting both vars in Vercel, fully overwrite the `Funūn .env.local` Dashlane note"
        location: "Dashlane"

must_haves:
  truths:
    - "The Turnstile challenge iframe is permitted by the CSP the middleware emits (frame-src names challenges.cloudflare.com)."
    - "The waitlist submit button is never enabled in a state the server's token precondition would reject."
    - "When NEXT_PUBLIC_TURNSTILE_SITE_KEY is absent, the waitlist form states plainly that verification is unavailable instead of promising verification that never arrives."
    - "A half-configured Turnstile (site key set, secret missing) produces an operator-visible server-side signal distinct from a failed bot challenge, with a byte-identical client response."
    - "lib/security/turnstile.ts verifyTurnstileToken still returns false for every missing-config / missing-token / network-failure / non-success path (fail-closed unchanged)."
    - "A test fails if the client submit gate and the real server verifier ever disagree again."
  artifacts:
    - "__tests__/waitlist-turnstile-coherence.test.ts"
    - "app/(auth)/signup/waitlist-gate.ts (rewritten to a state-returning pure function)"
    - "lib/security/turnstile.ts (turnstileConfigStatus added; verifyTurnstileToken body unchanged)"
  key_links:
    - "middleware.ts CSP string <-> the pinned literals in __tests__/marketing-root-route.test.ts (an existing test asserts the exact script-src source text and WILL fail if not updated in the same commit)."
    - "waitlistSubmitState() in waitlist-gate.ts <-> verifyTurnstileToken() in lib/security/turnstile.ts, bound together by the coherence test importing BOTH real implementations (no copied predicate)."
    - "jest.mock('@/lib/security/turnstile') in app/api/waitlist/route.test.ts <-> the new turnstileConfigStatus export (the wholesale module mock must also provide it or every existing waitlist route test throws)."
---

<objective>
Make the production waitlist capable of working: permit the Cloudflare Turnstile iframe through the middleware CSP, and stop the client and the server disagreeing about whether a verification token is required.

Purpose: `/` is a live public marketing page whose seven CTAs all point at `/signup`, and every waitlist submission there returns 400 today. Nothing has ever been captured. Setting the Vercel env vars alone would not fix it — the CSP blocks the widget's iframe, and the client gate deliberately enables a submit the server always refuses.

Output: a CSP that admits exactly one new vendor host in exactly two directives; a client submit gate that mirrors the server's precondition; an honest "verification unavailable" state; an operator-visible signal for the half-configured case; and a regression test that binds the real client gate to the real server verifier so the two cannot silently drift again.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@./.claude/CLAUDE.md

Project skill: `Skill("label-integrity-funun")` — load before writing the coherence test. The failure mode this plan closes is precisely a label that asserted more than the data carried: a client gate whose comment said a missing token "must NOT permanently disable submit" while the server it talks to rejects exactly that. Do not replace it with a second such label — see the HARD CONSTRAINT in Task 2.

Verified source facts this plan rests on (each read this session; re-verify anything you change):

- `middleware.ts:33` — `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`
- `middleware.ts:39` — `frame-src https://js.stripe.com https://*.docuseal.com` (no Cloudflare; `default-src 'self'` does not apply because frame-src is explicitly set)
- `middleware.ts:38` — `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://api.stripe.com`
- `__tests__/marketing-root-route.test.ts:239-246` — a test titled `'never changed the CSP directives (out of scope for this task)'` pins the **exact** script-src source text including its closing backtick. **This test will fail the moment Task 1 lands.** It is a leftover scope-pin from quick task 260930-ibp, not a security invariant.
- `app/(auth)/signup/waitlist-gate.ts:17` — `return wlSubmitting || (!!siteKey && !turnstileToken)` → with no site key, submit is **enabled**.
- `app/api/waitlist/route.ts:54-59` — empty token → `verifyTurnstileToken` returns false → hard 400, before any DB call.
- `lib/security/turnstile.ts:13-14` — `const secret = process.env.TURNSTILE_SECRET; if (!secret || !token) return false`.
- `app/(auth)/signup/page.tsx:106` siteKey read; `:691-698` the Turnstile slot and the faint `Verification will appear here.` line; `:706` the gate call; `:713-722` the `next/script` tag.
- `app/api/waitlist/route.ts` is the **only** importer of `verifyTurnstileToken` in app code (`app/api/waitlist/resubscribe/route.ts` does not use it). Blast radius is one route.
- `app/api/waitlist/route.test.ts:20-22` mocks `@/lib/security/turnstile` **wholesale** with only `verifyTurnstileToken`.
- `.env.example:64,67` already declare both vars. Do not add them again.
- Sentry pattern in API routes: `import * as Sentry from '@sentry/nextjs'`, `Sentry.captureException(error, { tags: { ... } })` — see `app/api/works/[workId]/passport/route.ts:3,302`.
- `jest.config.js` — `testEnvironment: 'node'`, no jsdom. The gate must stay a pure module.

Verified vendor requirement (Cloudflare Turnstile CSP reference, fetched this session): required directives are **script-src: `https://challenges.cloudflare.com`** and **frame-src: `https://challenges.cloudflare.com`**. `connect-src` is mentioned only for *pre-clearance* mode and only to require `'self'`, which is already present. Cloudflare states Turnstile works with `'strict-dynamic'` and nonce propagation.

Verified runtime fact (read from the installed `node_modules/next/dist/client/script.js`, Next 15.5.24) — this corrects the hypothesis in the task description, do not plan around the old assumption:
- For `strategy="afterInteractive"`, the real `<script>` element is created in a `useEffect` by `loadScript(props)` (line ~215) — note it passes `props`, **not** `{...props, nonce}`. The automatic `HeadManagerContext` nonce is merged in only on the `beforeInteractive` / `worker` branch and in the `ReactDOM.preload` hint. `setAttributesFromProps(el, props)` therefore sets a `nonce` attribute **only if one was passed explicitly as a prop**. So the Turnstile script tag is **not** automatically nonced.
- It is nevertheless expected to load, because `loadScript` does `document.createElement('script')` + `document.body.appendChild(el)` from inside Next's already-trusted nonced runtime bundle. Under `'strict-dynamic'` a non-parser-inserted script created by an allowed script is permitted regardless of host or nonce — that is the propagation mechanism `'strict-dynamic'` exists for, and it is why Cloudflare says Turnstile works with it.
- Consequence for `script-src`: adding `https://challenges.cloudflare.com` is **inert in any CSP3 browser** (host-source expressions are ignored when `'strict-dynamic'` is present). It is still the right change — it is the vendor-documented requirement, it is the operative allowance in a CSP2-only browser that ignores the unknown `'strict-dynamic'` keyword and enforces the host list, and it keeps the policy correct if `'strict-dynamic'` is ever removed. State this reasoning in the comment; do not claim it is what unblocks the widget today.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Admit the Turnstile iframe through the CSP, and re-pin the test that guards it</name>
  <files>middleware.ts, __tests__/marketing-root-route.test.ts</files>
  <action>
First, re-confirm the premise against production and record the literal result for the PR body — one request, to an obviously synthetic address, which the route rejects at line 56 before `createServiceClient()` is ever reached, so it cannot write a row:
`curl -s -o /dev/null -w '%{http_code}\n' -X POST https://www.funun.studio/api/waitlist -H 'Content-Type: application/json' -d '{"email":"probe-261002-wtl@example.test","name":"Probe","note":""}'` and the same without `-o /dev/null -w` to capture the body. Keep the exact status and body text; the PR body must quote it. If it does NOT return 400, stop and report — the premise has changed and the rest of this plan needs rethinking.

Then edit `middleware.ts`, changing exactly two of the fourteen CSP entries and nothing else:

1. `script-src` (line 33) — append the Cloudflare challenges host after `https://js.stripe.com`, inside the same template literal, leaving `'self'`, the nonce, and `'strict-dynamic'` in place and in order.
2. `frame-src` (line 39) — append the same host after `https://*.docuseal.com`. This is the directive that actually unblocks the widget: Turnstile renders its challenge in a cross-origin iframe, the current list names only Stripe and DocuSeal, and because `frame-src` is explicitly set, `default-src 'self'` does not back it up.

Do **not** change `connect-src`. Cloudflare's CSP reference requires only `'self'` there (pre-clearance `cdn-cgi` calls), which is already present; the widget's own network traffic to Cloudflare originates inside the cross-origin iframe and is governed by that iframe's policy, not this one. Add the host only if you observe a real `connect-src` violation during the empirical check below, and say so explicitly in the PR if you do. Do not touch `default-src`, `base-uri`, `object-src`, `frame-ancestors`, `form-action`, `style-src`, `img-src`, `font-src`, `media-src`, `worker-src`, or `upgrade-insecure-requests`.

Above the CSP array, extend the existing comment block with a short note recording why each of the two directives names this host, and specifically that the `script-src` entry is inert while `'strict-dynamic'` is present (host sources are ignored in CSP3) and is carried for vendor-documented correctness, CSP2-only clients, and survivability if `'strict-dynamic'` is ever dropped. Do not overstate it as the fix.

Then repair `__tests__/marketing-root-route.test.ts:239-246`. Its title, `never changed the CSP directives (out of scope for this task)`, is now false — rename it to describe what it actually asserts (that script-src stays nonce-based and that both source lists are pinned exactly), update the pinned `script-src` literal to the new full string including the appended host, keep the existing `style-src` assertion and the existing adjacency assertion untouched, and add a pinned assertion for the new full `frame-src` line. Leave every other test in the file alone.

Empirical check (do not skip, and do not substitute reasoning for it): with the dev server already running on :3000, put Cloudflare's published test keys in `.env.local` — site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` — restart the dev server, load `http://localhost:3000/signup`, click through to the waiting-list state, and confirm the widget renders with no CSP violation in the browser console. Record what you observed, including any directive that was reported as violated. Afterwards remove those test keys from `.env.local` again and say so; do not leave them behind and do not commit `.env.local`.
  </action>
  <verify>
    <automated>npx jest marketing-root-route --runInBand</automated>
  </verify>
  <done>Both CSP entries name the Cloudflare challenges host; no other directive differs from `git diff` baseline; the renamed CSP test passes with the new pinned literals; the production probe result and the local widget-render observation are both recorded verbatim for the PR body.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Make the client gate mirror the server's precondition, and bind them with a test</name>
  <files>app/(auth)/signup/waitlist-gate.ts, app/(auth)/signup/waitlist-gate.test.ts, __tests__/waitlist-turnstile-coherence.test.ts, app/(auth)/signup/page.tsx</files>
  <behavior>
    - With no site key configured, the submit gate reports disabled with a reason meaning verification is unavailable (today it reports enabled — this is the defect).
    - With a site key but no token yet, disabled, reason meaning awaiting verification.
    - While a request is in flight, disabled, reason meaning submitting, regardless of key or token.
    - With a site key and a token, enabled.
    - Coherence invariant: for every combination of (siteKey present/absent) x (token empty / whitespace-only / real), if the gate reports enabled then the REAL `verifyTurnstileToken` must resolve true for that same token. This must fail against today's `isWaitlistSubmitDisabled`.
  </behavior>
  <action>
Write the failing coherence test first, then change the gate to make it pass.

Create `__tests__/waitlist-turnstile-coherence.test.ts`. It imports the real gate from `@/app/(auth)/signup/waitlist-gate` and the real `verifyTurnstileToken` from `@/lib/security/turnstile` — **both real implementations, nothing copied**. Set `TURNSTILE_SECRET` to a stub and stub `global.fetch` to resolve `{ ok: true, json: async () => ({ success: true }) }` so Cloudflare always says yes; that isolates the test to the *token precondition*, which is the thing the two sides can disagree about. Iterate the cross product of site key `undefined | 'a-site-key'` and token `'' | '   ' | 'a-real-token'`, with submitting false, and assert the one-directional invariant: gate enabled implies `await verifyTurnstileToken(token)` is true. Add the converse spot-check that the known-bad historical combination (no site key, empty token) is now reported disabled. Restore `process.env` and `global.fetch` in teardown, following the pattern already in `lib/security/turnstile.test.ts`.

HARD CONSTRAINT (`label-integrity-funun`): the test must call the two real functions the application calls. Do **not** introduce a third module that *describes* the server's rule — a predicate named for a contract that the server does not actually execute is the same class of defect as the comment this change is removing, and it would pass while the real server diverged.

Rewrite `app/(auth)/signup/waitlist-gate.ts`. Keep it a pure, dependency-free, directly unit-testable module (no jsdom in this repo). Replace `isWaitlistSubmitDisabled` with a state-returning function — `waitlistSubmitState` taking an object of `{ submitting, siteKey, turnstileToken }` and returning `{ disabled: boolean; reason: 'submitting' | 'verification-unavailable' | 'awaiting-verification' | null }`. Order the branches submitting, then absent site key, then absent token. Replace the existing header comment entirely: its current claim — that a missing token must not disable submit because the widget never renders — is the bug, and leaving it would re-justify the regression. The new comment should state that the gate exists to never offer a submit the server will refuse, name `app/api/waitlist/route.ts` and `lib/security/turnstile.ts` as the authority it mirrors, and point at the coherence test as the thing that enforces it.

Update `app/(auth)/signup/waitlist-gate.test.ts` to the new signature. Its fourth case currently asserts the defect (no site key, no token, enabled) — invert it to assert disabled with the unavailable reason, and rewrite the file header comment, which currently repeats the same wrong justification.

Update `app/(auth)/signup/page.tsx` in two places only. At line 706, call the new function and pass `.disabled`. At lines 691-694, replace the faint grey `text-white/30` line that tells the visitor verification is coming: when the gate reports verification unavailable, render a legible notice in the same slot saying plainly that verification is not available right now so waiting-list sign-ups cannot be taken, and to try again later. Use a visible muted tone consistent with the surrounding auth surface rather than the near-invisible `/30`; keep the existing `min-h-[65px]` slot and the existing site-key-plus-script-error branch below it as they are. Leave the rest of the 735-line file untouched — read only the regions you are editing.
  </action>
  <verify>
    <automated>npx jest waitlist-gate waitlist-turnstile-coherence --runInBand</automated>
  </verify>
  <done>Both suites run and pass, and the run output shows two suites (see the jest path trap in `<verification>` — a zero-match pattern must not be read as success). `grep -rn "isWaitlistSubmitDisabled" app lib __tests__` returns no hits. The coherence test, run against a stashed copy of the old gate, fails — confirm this once before finalising.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Make a half-configured Turnstile visible to operators without telling an attacker anything</name>
  <files>lib/security/turnstile.ts, lib/security/turnstile.test.ts, app/api/waitlist/route.ts, app/api/waitlist/route.test.ts, .planning/todos/pending/2026-08-27-configure-turnstile-production.md</files>
  <behavior>
    - `turnstileConfigStatus()` returns a distinct value for each of: both vars set; secret missing; site key missing; neither set.
    - `verifyTurnstileToken` behaviour is byte-for-byte unchanged on every existing path (all seven existing tests still pass untouched).
    - POST /api/waitlist with a token but no configured secret reports once to Sentry and still returns the identical 400 body and status it returns for a genuine verification failure.
    - POST /api/waitlist with Turnstile fully configured reports nothing to Sentry.
  </behavior>
  <action>
Add to `lib/security/turnstile.ts` an exported `TurnstileConfigStatus` union and an exported `turnstileConfigStatus()` that reads `TURNSTILE_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` **inside the function body** (never at module top level — same discipline the file's existing header comment sets out) and returns which of the two is missing. Both are readable server-side; a `NEXT_PUBLIC_` prefix only means the value is additionally inlined into the client bundle, it does not make it unreadable on the server. Return the status only — never the values. Make **no change to `verifyTurnstileToken`'s body**: it stays fail-closed on missing secret, missing token, non-ok response, malformed body, explicit `success: false`, and thrown fetch.

Wire it into `app/api/waitlist/route.ts`. Import Sentry as `* as Sentry from '@sentry/nextjs'`, matching `app/api/works/[workId]/passport/route.ts`. In the rejection branch at lines 56-59, before returning, call `turnstileConfigStatus()`; when it is anything other than fully configured, `Sentry.captureMessage` at level `'error'` with a message naming the waitlist and the status, plus tags identifying the feature and the status. Return **the same `errorResponse` with the same string and the same 400** on every path — the client-visible response must not vary by configuration state, or the signal becomes an oracle an attacker can use to learn whether the gate is live. Extend the route's header comment to record that the signal exists and why its payload is deliberately server-side only.

Scope note to state in the comment and the PR: this catches the case that was genuinely invisible — site key set, secret missing, so the widget renders, the visitor completes a challenge, believes they succeeded, and the server silently refuses. It deliberately does not fire when *neither* key is set, because Task 2 now disables submit in that state so no request arrives; that case is made visible in the UI to the human instead. Adding Turnstile status to a health endpoint would cover it too and is explicitly out of scope here.

Update `app/api/waitlist/route.test.ts`. Its `jest.mock('@/lib/security/turnstile', ...)` factory at lines 20-22 replaces the whole module and currently supplies only `verifyTurnstileToken` — it **must** also supply `turnstileConfigStatus` or every existing test in the file throws on the new call. Add a `jest.mock('@sentry/nextjs')`. Add two cases: verification fails with the status reporting a missing secret → Sentry called once AND the status/body identical to the existing captcha-fail expectation; verification fails with the status reporting fully configured → Sentry not called, same response. Do not alter the existing seven cases.

Add cases to `lib/security/turnstile.test.ts` for all four `turnstileConfigStatus()` results, using the `process.env` save/restore already set up at the top of that file. Leave the existing `verifyTurnstileToken` cases untouched — they are the proof that fail-closed did not move.

Finally correct `.planning/todos/pending/2026-08-27-configure-turnstile-production.md`. It is a tracked file whose central claim is now known to be false: it says "Production degrades gracefully ... real people can still join. This is a missing protection, not a broken form." It is a broken form — nobody has ever joined. Rewrite that section to state the verified 400, answer its own open question ("Does the server actually reject a missing token when the key is unset?" — yes, at `app/api/waitlist/route.ts:56`), note that this branch adds the CSP allowance and the coherence fix so that setting the keys is now sufficient, and keep its provisioning steps including the Dashlane note refresh. Do not delete the todo — the keys are still unset.
  </action>
  <verify>
    <automated>npx jest lib/security/turnstile api/waitlist/route --runInBand</automated>
  </verify>
  <done>All four config statuses covered; the seven pre-existing `verifyTurnstileToken` cases pass unmodified; the waitlist route returns an identical 400 body and status whether or not Turnstile is configured, with Sentry called only in the misconfigured case; the todo no longer claims production degrades gracefully.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| anonymous browser → `middleware.ts` CSP | The policy that constrains every script and frame on every page in the matcher, including the public marketing root. |
| anonymous browser → `POST /api/waitlist` | The only unauthenticated write path on a live public marketing funnel. No session, no auth. |
| server → Cloudflare siteverify | Outbound dependency whose failure must not open the gate. |
| server → Sentry | New egress of a configuration-state string. Must carry no secret and no visitor data. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-wtl-01 | Elevation of Privilege | `middleware.ts` CSP widening | high | mitigate | Exactly two directives change, each gaining exactly one vendor host that Cloudflare's CSP reference names as required. No directive is removed, no keyword is relaxed, `connect-src` is untouched. The pinned source-text assertions in `__tests__/marketing-root-route.test.ts` are updated to the new exact strings so any further drift fails CI. |
| T-wtl-02 | Spoofing | Bot abuse of `POST /api/waitlist` | high | mitigate | `verifyTurnstileToken` body is unchanged and still fails closed on missing secret, missing token, non-ok, malformed, `success:false`, and thrown fetch. Task 2 makes the client *stricter*, never the server weaker. The IP and email rate limiters are untouched. |
| T-wtl-03 | Information Disclosure | New Sentry config signal becoming an attacker oracle | medium | mitigate | The client-visible status and body are identical on every rejection path; the distinction exists only in the server-side report. The report carries a status enum, never either key's value. |
| T-wtl-04 | Information Disclosure | `TURNSTILE_SECRET` leaking via the new config check | high | mitigate | `turnstileConfigStatus()` reads both vars inside the function body and returns a four-valued enum only. No value is returned, logged, or sent. No `NEXT_PUBLIC_` prefix is introduced. |
| T-wtl-05 | Denial of Service | Sentry quota exhaustion from a flood against an unconfigured waitlist | low | accept | The IP limiter runs first, and the only state that triggers the report (site key present, secret absent) is one where the waitlist is 100% broken — an alarm is the desired outcome. Fully-unconfigured no longer reaches the server at all. |
| T-wtl-06 | Tampering | Dependency supply chain | low | accept | No package is added or upgraded. `@sentry/nextjs` is already a direct dependency and already imported by four files. No `npm install` runs in this plan, so no package legitimacy gate applies. |
</threat_model>

<verification>
## Jest path trap — read before running anything

Per `.claude/CLAUDE.md` and `reference_jest_harness_constraints`: a jest positional arg is a **regex** against the full path. `app/(auth)/signup/waitlist-gate.test.ts` parses `(auth)` as a capture group matching the literal text `auth` with no parentheses, so that pattern matches **zero** files while still looking plausible. Every targeted run in this plan therefore uses bracket-free, paren-free substrings. After each targeted run, confirm from the output that the expected number of suites actually ran — a green run of zero tests is the exact false-confidence failure this repo has already been bitten by.

## Full Verification Gate — all six, no substitutions

Run every step the CI `validate` job runs (`.github/workflows/quality.yml`). Anything less is not a green build.

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

Do **not** run `npm run build` — a dev server is live on :3000 and the build clobbers `.next`. `typecheck:strict` is the type-safety gate here.

`npm run lint` runs with `--max-warnings=0`. The `page.tsx` edit touches a component with several hooks; a `react-hooks/exhaustive-deps` warning is a build failure and usually a real defect — fix it, do not suppress it.

## Out of scope — confirm untouched

`git diff --stat` must show no changes under `scripts/`, no marketing artifact, no bench files, and no re-freeze. The third-step UX work (leading with the waitlist rather than the "A secure invitation link is required" wall) is a separate task and must not appear in this diff.

## Staging

Never `git add -A`. Stage only the files listed in `files_modified`. These five pre-existing untracked files must remain untracked:
`.planning/reviews/CODEX-PROMPT-260930-marketing-page-port-FOLLOWUP.md`,
`.planning/reviews/CODEX-PROMPT-260930-marketing-page-port-to-root-route.md`,
`.planning/reviews/CODEX-RESPONSE-260930-marketing-page-port-to-root-route.md`,
`.planning/todos/pending/2026-09-29-paid-tier-interest-capture-before-stripe.md`,
`.planning/todos/pending/2026-09-30-ship-marketing-page-at-root-scope.md`.
`.env.local` must not be staged, and the Cloudflare test keys used for the local check in Task 1 must be removed from it before finishing.
</verification>

<pr_body_requirements>
`main` is protected — open a PR from `waitlist-turnstile-coherence`, never push `main`. The PR body must contain all six of the following:

1. **The waitlist is live and returning 400 for everyone today.** Quote the production probe verbatim — the `POST https://www.funun.studio/api/waitlist` call, its `400`, and its `{"error":"Verification failed. Please try again."}` body — and state that `/` is public, its seven CTAs all point at `/signup`, and nothing has ever been captured.
2. **Env vars alone would not have fixed it.** Name both code-level blockers: the CSP had no `frame-src` allowance for the Turnstile iframe, and the client gate deliberately enabled a submit the server always refuses.
3. **Exactly which CSP directives changed and why.** `frame-src` gains `https://challenges.cloudflare.com` — this is what unblocks the challenge iframe. `script-src` gains the same host — vendor-documented, inert while `'strict-dynamic'` is present because CSP3 ignores host sources then, carried for CSP2-only clients and for correctness if `'strict-dynamic'` is ever removed. `connect-src` deliberately unchanged (Cloudflare requires only `'self'` there, already present); say so explicitly, and if the local check forced you to add it, say that instead and why. No other directive changed.
4. **The client/server coherence fix.** The gate now mirrors the server's precondition, the form states plainly that verification is unavailable rather than promising a widget that never appears, and `__tests__/waitlist-turnstile-coherence.test.ts` binds the real gate to the real `verifyTurnstileToken` so the two cannot silently diverge again. Note that the server was **not** weakened — `verifyTurnstileToken` is unchanged and still fails closed.
5. **Follow-up the owner must do:** set `TURNSTILE_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel Production and redeploy (`NEXT_PUBLIC_*` is baked at build time, so the variable alone does nothing). The waitlist does not work until then — that is intended, and it is now honest in the UI instead of silent. Reference `.planning/todos/pending/2026-08-27-configure-turnstile-production.md`.
6. **Dashlane reminder:** after changing `.env.local`, fully overwrite the `Funūn .env.local` Dashlane note.
</pr_body_requirements>

<success_criteria>
- `frame-src` and `script-src` each name `https://challenges.cloudflare.com`; the other twelve CSP entries are byte-identical to `main`.
- The Turnstile widget renders locally against Cloudflare's test keys with no CSP violation in the browser console, and the observation is recorded.
- `waitlistSubmitState` reports disabled for every input for which `verifyTurnstileToken` would resolve false, proven by `__tests__/waitlist-turnstile-coherence.test.ts` importing both real implementations.
- That coherence test fails against the pre-change gate (verified once, explicitly).
- `verifyTurnstileToken`'s seven existing tests pass unmodified — fail-closed did not move.
- `POST /api/waitlist` returns an identical status and body whether Turnstile is configured, half-configured, or unconfigured; only the server-side Sentry signal differs.
- All six Verification Gate commands pass, with `npm run lint` clean at `--max-warnings=0`.
- No changes under `scripts/`, no marketing artifact or bench changes, no re-freeze, and the five pre-existing untracked planning files still untracked.
- PR opened against `main` with all six required body elements.
</success_criteria>

<output>
Create `.planning/quick/261002-wtl-waitlist-turnstile-coherence/261002-wtl-SUMMARY.md` when done, recording: the production probe result verbatim, the local widget-render observation (including any CSP directive reported as violated), the final CSP diff, and the exact Vercel + Dashlane follow-up handed to the owner.
</output>
