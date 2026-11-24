---
phase: 261118-ryb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/security/csp.ts
  - lib/security/csp.test.ts
  - middleware.ts
  - __tests__/marketing-root-route.test.ts
autonomous: false
requirements: [261118-ryb]
quick: true

must_haves:
  truths:
    - "With `npm run dev` on localhost:3000, the Content-Security-Policy response header's script-src carries 'unsafe-eval', and the browser console no longer logs EvalError from /_next/static/chunks/main-app.js"
    - "React hydrates in local dev: the /signin form submits through its client handler instead of falling back to a native HTML form POST that visibly reloads the page"
    - "The production-mode CSP string is byte-for-byte identical to the policy the app emitted before this change"
    - "The dev-mode CSP string differs from the production-mode CSP string by exactly one appended source expression and in no other byte"
    - "A future edit cannot hardcode the relaxation on without failing a test"
  artifacts:
    - lib/security/csp.ts
    - lib/security/csp.test.ts
  key_links:
    - "middleware.ts passes `allowUnsafeEval: process.env.NODE_ENV !== 'production'` — this single call site is the whole gate; a hardcoded `true` here would relax the production policy with no other signal"
    - "__tests__/marketing-root-route.test.ts:'keeps script-src nonce-based and pins the exact script-src and frame-src source lists' reads middleware.ts source and pins the script-src template literal verbatim — it WILL fail once the literal moves, and must be retargeted, not deleted"
---

<objective>
Let React hydrate in local dev by appending `'unsafe-eval'` to `script-src` only when
`process.env.NODE_ENV !== 'production'`, while proving the production policy is byte-for-byte
unchanged.

Purpose: `middleware.ts:60` emits a `script-src` with a nonce and `'strict-dynamic'` but no
`'unsafe-eval'`. Next's webpack dev server evaluates every client module through `eval`, so on
localhost the policy refuses `/_next/static/chunks/main-app.js`, React never hydrates (confirmed by
DOM probe: zero `__react*` fiber keys on the /signin `<form>` or on `document.body`), and every
client component in the app is inert. The sign-in form falls back to a native HTML submit, which
reads to the user as "the page just refreshes when I enter my password". Production is unaffected
because a production build does not eval modules — which is why this went unnoticed.

Output: a pure `lib/security/csp.ts` policy builder with one visible dev-only gate, a behavioural
test that pins the production policy byte-for-byte against the string captured from the running app,
and a retargeted source-text lock.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@./.claude/CLAUDE.md
@middleware.ts
@__tests__/marketing-root-route.test.ts
@lib/security/turnstile.ts
</context>

<design_notes>
These three decisions are already made. Do not relitigate them mid-execution.

**1. Extract the policy into `lib/security/csp.ts` rather than inlining a ternary in `middleware.ts`.**
The binding constraint is behavioural verification: the fix must be proven by asserting the actual
emitted policy for both modes, not by asserting that the code compiles. `middleware.ts` imports
`@supabase/ssr` and `next/server` primitives, and this repo has already concluded in writing that
those need substantial mocking to invoke directly — see the header comment at
`__tests__/marketing-root-route.test.ts:1-10`, which also records that `lib/marketing/rootRewrite.ts`
and `lib/marketing/nonceInjection.ts` were extracted "for exactly this purpose". Extraction is the
established in-repo precedent and the lighter of the two routes. `lib/security/` already exists and
every module in it ships a colocated `*.test.ts`.

The extraction is literals moved verbatim plus one conditional. It is not an invitation to redesign
the policy. Do not reformat the directive strings, reorder them, split them into token arrays, or
"improve" any of them.

**2. A single gate, at the call site, pure function.**
`buildContentSecurityPolicy` takes `allowUnsafeEval` as an explicit parameter and reads no
environment variable. `middleware.ts` supplies `process.env.NODE_ENV !== 'production'`. Rejected
alternative: also re-checking `NODE_ENV` inside the builder as belt-and-braces. It was rejected for
two reasons — it makes the function impure and the production branch untestable without mutating
`process.env`, and it would leave a parameter named `allowUnsafeEval` that does not actually decide
the outcome, which is precisely the label-integrity defect class this project has been bitten by
twice (`owner_segment`, document status `'signed'`). One gate, in one readable place, locked by a
test.

**3. Comment ownership splits along what each comment is about.**
`middleware.ts:30-34` explains why CSP lives in middleware at all (per-request nonce forwarding) —
that is about middleware's role and stays in `middleware.ts`. `middleware.ts:35-53` explains the
Turnstile `frame-src`/`script-src`/`connect-src` reasoning — that is about the directive contents
and moves to `lib/security/csp.ts` with them. Preserve both verbatim; the Turnstile block's
reasoning about avoiding `'unsafe-inline'` in `script-src` must not be undermined, and this change
does not touch `'unsafe-inline'`.
</design_notes>

<tasks>

<task type="auto">
  <name>Task 1: Capture the ground-truth policy, then extract it behind a dev-only gate</name>
  <files>lib/security/csp.ts, middleware.ts</files>
  <action>
FIRST, before editing anything, capture the policy the app emits today. The dev server is already
running on port 3000 and currently emits the production policy verbatim (there is no NODE_ENV branch
yet), so this capture IS the production ground truth. Run:
`mkdir -p "$SCRATCH" && curl -sI http://localhost:3000/signin | tr -d '\r' | grep -i '^content-security-policy:' | sed -E "s/'nonce-[0-9a-f]{32}'/'nonce-NONCE'/" > "$SCRATCH/csp-before.txt"`
(substitute the session scratchpad path for `$SCRATCH`). Confirm the file is non-empty and contains
`'nonce-NONCE'` before proceeding. This file is the independent source for Task 2's frozen literal
and Task 3's diff — do not skip it and do not reconstruct it by hand later. The repo's own lesson
applies: resolve by identity, reuse the canonical predicate, never retype it.

THEN create `lib/security/csp.ts` exporting a single named pure function
`buildContentSecurityPolicy({ nonce, allowUnsafeEval }: { nonce: string; allowUnsafeEval: boolean }): string`.
Move the fourteen directive strings from `middleware.ts:54-69` into it verbatim — same strings, same
order, same `.join('; ')` — and move the Turnstile comment block (`middleware.ts:35-53`) above the
directive array. Follow the file-header style of `lib/security/turnstile.ts`: a dashed section header
naming the module and why it exists.

Build `script-src` as the existing template literal, unchanged, concatenated with
`(allowUnsafeEval ? " 'unsafe-eval'" : '')`. Keeping the existing literal intact and appending is
deliberate: it makes the production bytes obviously identical on sight, and the appended token is a
single leading-space-plus-source-expression that Task 2 can strip to prove the delta. CSP source
expressions are order-independent and `'strict-dynamic'` does not suppress `'unsafe-eval'`, so
appending at the end is correct as well as clearest.

Above that conditional, write a comment that says plainly: the relaxation is development-only; Next's
webpack dev server evaluates client modules through `eval`, so without it the browser refuses
`/_next/static/chunks/main-app.js`, React never hydrates on localhost and every client component is
inert; and the production policy is unchanged. Name the sign-in symptom, because that is how this
will be recognised if it ever regresses.

FINALLY in `middleware.ts`: keep the nonce generation and the comment at lines 30-34, import
`buildContentSecurityPolicy` from `@/lib/security/csp` (absolute `@/` import — relative imports are
forbidden in shared code), and replace the `csp` array with
`const csp = buildContentSecurityPolicy({ nonce, allowUnsafeEval: process.env.NODE_ENV !== 'production' })`.
Everything downstream of `csp` — `buildForwardedRequestHeaders`, `createPassThroughResponse`,
`respondWithAuthState`, the matcher — is untouched. Note that `middleware.ts:112` already uses
`process.env.NODE_ENV !== 'production'`, so this is the same expression the file already relies on in
the Edge runtime.
  </action>
  <verify>
    <automated>test -s "$SCRATCH/csp-before.txt" &amp;&amp; grep -q "nonce-NONCE" "$SCRATCH/csp-before.txt" &amp;&amp; npm run typecheck:strict</automated>
  </verify>
  <done>
`$SCRATCH/csp-before.txt` holds the pre-change policy with the nonce value normalised.
`lib/security/csp.ts` exports `buildContentSecurityPolicy`, carries all fourteen directives verbatim,
and appends `'unsafe-eval'` to `script-src` only when `allowUnsafeEval` is true.
`middleware.ts` builds `csp` by delegating with `allowUnsafeEval: process.env.NODE_ENV !== 'production'`
and still sets the header on every response path it did before. `typecheck:strict` passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Assert the emitted policy for both modes; retarget the stale source-text pin</name>
  <files>lib/security/csp.test.ts, __tests__/marketing-root-route.test.ts</files>
  <behavior>
    - `buildContentSecurityPolicy({ nonce: 'testnonce', allowUnsafeEval: false })` equals the frozen production policy exactly — full string equality, all fourteen directives, not a substring check
    - `buildContentSecurityPolicy({ nonce: 'testnonce', allowUnsafeEval: true })` contains `'unsafe-eval'` inside its script-src directive
    - The production-mode string does NOT contain `'unsafe-eval'`
    - Stripping the single token `" 'unsafe-eval'"` from the dev-mode string yields the production-mode string exactly — proving no other directive drifted
    - The nonce is interpolated into script-src and nowhere else
  </behavior>
  <action>
Create `lib/security/csp.test.ts` covering the five behaviours above, colocated per the
`lib/security/` convention. Jest discovers it: `jest.config.js` restricts only `node_modules`,
`.next` and sibling worktrees.

Build the frozen production literal from `$SCRATCH/csp-before.txt`: strip the
`content-security-policy: ` header name and replace `'nonce-NONCE'` with `'nonce-testnonce'`. That
is a mechanical two-token substitution on a captured string, not a retyping. For reference, the
captured policy was `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-testnonce' 'strict-dynamic' https://js.stripe.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://api.stripe.com; frame-src https://js.stripe.com https://*.docuseal.com https://challenges.cloudflare.com; worker-src 'self' blob:; upgrade-insecure-requests`
— but trust the file you captured over this transcription, and if the two disagree, stop and report
the disagreement rather than picking one.

IMPORTANT, and the whole point of the task: if the equality assertion fails, the production policy
changed. That failure is the mechanism working. The ONLY correct response is to fix
`lib/security/csp.ts` until it matches the captured string. Editing the expected literal to match
whatever the function now returns is forbidden — it converts a real guard into a check that prints
green while covering nothing.

Then retarget the now-stale lock in `__tests__/marketing-root-route.test.ts`. The test named
`keeps script-src nonce-based and pins the exact script-src and frame-src source lists` reads
`middleware.ts` source and asserts the script-src template literal, the style-src string and the
frame-src string are present there. Those literals now live in `lib/security/csp.ts`, so that test
fails. Keep its purpose — a reviewer-visible lock that the policy stays nonce-based — by pointing its
three positive source assertions at `lib/security/csp.ts` instead, and add two assertions against
`middleware.ts` source: that it calls `buildContentSecurityPolicy({` and that it passes
`allowUnsafeEval: process.env.NODE_ENV !== 'production'`. That second assertion is what stops a later
edit from hardcoding the relaxation on. Rename the test to say it also pins the dev-only gate.

Do not add negative `not.toContain` assertions against `middleware.ts` or `lib/security/csp.ts` for
any token that appears in the comments those files now carry — the explanatory comment names
`script-src` and `'unsafe-eval'` in prose, so a file-wide negative grep on either would be
self-invalidating. The three other tests in that describe block, and every test in
`__tests__/middleware-auth.test.ts`, `__tests__/supabase-ssr-clients.test.ts` and
`__tests__/profile-preview-route.test.ts`, assert nothing about CSP and must be left untouched and
passing.
  </action>
  <verify>
    <automated>npx jest lib/security/csp.test.ts __tests__/marketing-root-route.test.ts __tests__/middleware-auth.test.ts __tests__/supabase-ssr-clients.test.ts --runInBand</automated>
  </verify>
  <done>
`lib/security/csp.test.ts` proves the production string equals the captured pre-change policy
byte-for-byte, that the dev string adds `'unsafe-eval'`, and that stripping that one token returns
the production string exactly. The retargeted test in `__tests__/marketing-root-route.test.ts`
passes and now also pins the NODE_ENV gate at the middleware call site. No previously-passing test
was edited to accommodate the change.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Run the Verification Gate, prove the emitted header, confirm hydration in the browser</name>
  <files>(no file changes — verification only)</files>
  <action>
Run the full gate and the emitted-header proof below, and report each result. Then hand over for the
browser confirmation — only a browser can confirm the symptom the user actually reported, so do not
self-approve this checkpoint.

Do NOT run `npm run build`: it is not part of CI's validate job and it clobbers `.next` under the
dev server that is live on port 3000.
  </action>
  <what-built>
The dev-only `'unsafe-eval'` relaxation, plus the full project Verification Gate. Run every command
below and report each result before handing over.

Automated gate (the CI `validate` job's checks that bear on this change):
  npm run typecheck:strict
  npm run lint
  npm test -- --runInBand
  npm run security:migrations:verify

Emitted-header proof — the machine-checkable half of the behavioural claim. Next recompiles
middleware on save, but if the header comes back unchanged, ask the owner before restarting their
dev server, and restart with `npm run dev` only:
  curl -sI http://localhost:3000/signin | tr -d '\r' | grep -i '^content-security-policy:' | sed -E "s/'nonce-[0-9a-f]{32}'/'nonce-NONCE'/" > "$SCRATCH/csp-after.txt"
  grep -c "'unsafe-eval'" "$SCRATCH/csp-after.txt"          # must print 1
  diff <(sed "s/ 'unsafe-eval'//" "$SCRATCH/csp-after.txt") "$SCRATCH/csp-before.txt"   # must print nothing

That diff is the independent confirmation: the live dev header now differs from the pre-change header
by exactly the one appended token and in no other byte.
  </what-built>
  <verify>
    <automated>npm run typecheck:strict &amp;&amp; npm run lint &amp;&amp; npm test -- --runInBand &amp;&amp; npm run security:migrations:verify &amp;&amp; grep -q "'unsafe-eval'" "$SCRATCH/csp-after.txt" &amp;&amp; diff &lt;(sed "s/ 'unsafe-eval'//" "$SCRATCH/csp-after.txt") "$SCRATCH/csp-before.txt"</automated>
    <human-check>Browser confirmation on localhost:3000/signin — see how-to-verify</human-check>
  </verify>
  <done>
Every gate command exits 0, the live dev header carries `'unsafe-eval'` and otherwise matches the
pre-change capture byte-for-byte, and the owner has confirmed in a browser that the EvalError is gone
and sign-in works through its client handler.
  </done>
  <how-to-verify>
Only a browser can confirm the thing the user actually reported, so please check it:

1. Hard-reload http://localhost:3000/signin (Cmd-Shift-R).
2. Open the console. The repeated `EvalError: Evaluating a string as JavaScript violates the
   following Content Security Policy directive` from `/_next/static/chunks/main-app.js` should be
   GONE. Any remaining CSP error is a different directive and worth reporting verbatim.
3. Confirm React hydrated — any client-side interaction will do: a nav item that opens without a
   full page load, or a form field that reacts as you type.
4. Enter your password and sign in. The page should no longer appear to "just refresh"; it should
   sign you in through the client handler.
  </how-to-verify>
  <resume-signal>Type "approved", or paste any console error that remains</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → `Content-Security-Policy` response header | `middleware.ts` is the app's only CSP authority; this header is the sole browser-side control limiting the impact of injected markup |
| local dev process → deployed environments | the relaxation must reach exactly one of these and never the other |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ryb-01 | Elevation of Privilege | `script-src` in `lib/security/csp.ts` | critical | mitigate | `lib/security/csp.test.ts` asserts full-string equality between the production-mode output and the policy captured from the running app before the change, and asserts the dev delta is exactly one stripped token — so any production drift fails the suite rather than shipping |
| T-ryb-02 | Tampering | the `allowUnsafeEval` argument at the `middleware.ts` call site | high | mitigate | One gate, one call site, asserted as source text in `__tests__/marketing-root-route.test.ts` so a later edit cannot hardcode `true`; the builder itself is pure and reads no environment variable, so there is no second place the decision can hide |
| T-ryb-03 | Elevation of Privilege | Vercel preview and production deployments | medium | accept | `next build` sets `NODE_ENV=production`, so every deployed environment — preview included — takes the unrelaxed branch; only a local `next dev` process relaxes. Flagged honestly: this rests on Next's documented build-time `NODE_ENV`, which this plan does not independently verify against a deploy. `middleware.ts:112` already depends on the same expression, so the change introduces no new dependency on it |
| T-ryb-04 | Tampering | `'unsafe-inline'` in `script-src` | high | accept | Out of scope and untouched. The comment at `middleware.ts:30-34` records that CSP lives in middleware specifically so `script-src` can avoid `'unsafe-inline'`; this change adds `'unsafe-eval'` only, in dev only, and `scripts/build-marketing-artifact.ts:930-938` documents a prior checkpoint decision refusing to widen the policy for inline handlers — that decision stands |

No package-manager installs occur in this plan, so the package legitimacy gate does not apply.
</threat_model>

<verification>
The project Verification Gate in `.claude/CLAUDE.md` is the standard for green. Relevant checks, all
run in Task 3: `npm run typecheck:strict`, `npm run lint` (`--max-warnings=0`, so any warning fails),
`npm test -- --runInBand`, `npm run security:migrations:verify`. `npm run build` is deliberately
excluded — it is not part of CI's validate job and it clobbers `.next` under a live dev server.

Behavioural verification, not mechanism verification: the suite passing proves the code runs, not
that the answer is right. The two independent proofs that the answer is right are (a) the full-string
equality in `lib/security/csp.test.ts` against a policy captured from the running app rather than
retyped, and (b) the live `curl` diff in Task 3 showing the emitted header changed by exactly one
token. Both must hold.
</verification>

<success_criteria>
- `'unsafe-eval'` appears in the emitted `script-src` on localhost and only on localhost
- The production-mode policy is byte-for-byte identical to the policy captured before the change
- The dev/prod difference is one named conditional in `lib/security/csp.ts` and one argument in
  `middleware.ts`, each carrying a comment that says plainly that it is dev-only and why
- React hydrates on localhost: no `EvalError` in the console, and sign-in works through its client
  handler rather than a native form submit
- Full Verification Gate green; no pre-existing test edited to accommodate the change
</success_criteria>

<output>
Create `.planning/quick/261118-ryb-dev-only-csp-guard-append-unsafe-eval-to/261118-ryb-SUMMARY.md` when done
</output>
