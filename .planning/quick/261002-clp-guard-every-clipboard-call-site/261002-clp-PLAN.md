---
phase: 261002-clp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/clipboard/attempt-copy.ts
  - lib/clipboard/attempt-copy.test.ts
  - __tests__/clipboard-call-site-guard.test.ts
  - components/tools/PitchCard.tsx
  - components/tools/PitchPlugForm.tsx
  - components/profile/ShareButton.tsx
  - components/profile/ProfileMoreMenu.tsx
  - components/vault/ToolSidePanel.tsx
  - components/vault/ExportPackPanel.tsx
  - components/vault/PublicPlaybackView.tsx
  - components/selects-player/SelectsPlayer.tsx
  - components/admin/SelectsBuilder.tsx
  - components/admin/ArtistInvitesAdmin.tsx
  - components/admin/StaffAdmin.tsx
  - components/catalogue/WorkRoster.tsx
  - components/catalogue/ProducerInbox.tsx
  - components/catalogue/ProducerHandoffTimeline.tsx
  - components/catalogue/CopyLyricMenu.tsx
  - components/collaborators/QuickInviteModal.tsx
  - components/split-sheets/PartyPicker.tsx
  - components/playbook/AuthHealthPanel.tsx
  - components/ideas/IdeasInbox.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "No clipboard copy anywhere in app/ or components/ can fail without the user being told something."
    - "Every site that copies today still copies, with the identical success UX."
    - "A new direct navigator.clipboard call added under app/ or components/ fails CI."
    - "A paste handler reading event.clipboardData is not caught by the guard."
  artifacts:
    - lib/clipboard/attempt-copy.ts
    - lib/clipboard/attempt-copy.test.ts
    - __tests__/clipboard-call-site-guard.test.ts
  key_links:
    - "All 21 clipboard call sites in 18 component files import the helper; the guard is what proves none were missed."
    - "shareOrCopy()'s navigator.share() must remain the first executed statement after the signature change (gesture window)."
---

<objective>
Give every clipboard copy in the app one guarded helper, and a source-scanning drift
guard so a new unguarded call fails CI.

Purpose: `navigator.clipboard` is `undefined` on non-secure origins and `writeText`
rejects when the document is unfocused or permission is refused. Unguarded, that
throws inside an async handler, the success state never runs, and a button whose only
feedback is a label flip silently does nothing. The user cannot tell "copied" from
"broken".

Output: `lib/clipboard/attempt-copy.ts` + unit test, a drift guard committed RED, and
all 21 call sites migrated.
</objective>

<verified_facts>
Every claim below was checked against the source on this branch. Two claims in the
task description did not survive that check — see CORRECTIONS.

**Measured corpus.** 23 raw `writeText` grep lines in `app/` + `components/`, which is
**21 actual copy invocations** — `CopyLyricMenu.tsx` contributes three matching lines
(`:64` a type annotation, `:67` a `writeText` existence check, `:75` the single real
call). The drift-guard matcher below reports **27 offender lines across 18 files**
(it also sees the bare feature-detect lines), out of **915** scanned files.

**Severity classes, verified by reading each site:**

*Class A — uncaught; throws into the handler, nothing is told to the user (8):*
- `components/tools/PitchCard.tsx:13` — `await`, then `setCopied(true)`
- `components/tools/PitchCard.tsx:139` — `await`, then `window.open(...)`
- `components/profile/ShareButton.tsx:29` — Web Share catch-block fallback
- `components/profile/ShareButton.tsx:33` — no-Web-Share path
- `components/vault/ToolSidePanel.tsx:391` — the PR #120 one
- `components/vault/ExportPackPanel.tsx:131` — has `.catch()`, but no feature detect,
  so an undefined `clipboard` throws a **synchronous** TypeError before `.then` is
  ever reached; the `.catch()` never runs
- `components/vault/PublicPlaybackView.tsx:115`
- `components/vault/PublicPlaybackView.tsx:133`

*Class B — caught, but claims success anyway. The description filed these under
"already handled" (2):*
- `components/selects-player/SelectsPlayer.tsx:529` — `.catch(() => {})`, then
  `showToast('Copied link to this Selects')` **unconditionally**
- `components/tools/PitchPlugForm.tsx:30` — floating promise, no `.catch` at all
  (unhandled rejection), then `setCopied(path)` **unconditionally**

*Class C — caught, no false claim, but no feedback either (3):*
- `components/admin/SelectsBuilder.tsx:596` — `.catch(() => {})`; `copyState` stays
  `idle`, nothing is said
- `components/catalogue/WorkRoster.tsx:289` — `if (!navigator.clipboard) return` is a
  silent no-op; the catch is empty behind a comment claiming a selection fallback
- `components/ideas/IdeasInbox.tsx:215` — `.catch(() => undefined)`; the link does
  render in a readonly input, so a visible fallback exists

*Class D — genuinely handled (8):* `ArtistInvitesAdmin:164`, `StaffAdmin:875`,
`AuthHealthPanel:83` (try/catch + message, no feature detect);
`ProducerHandoffTimeline:183`, `ProducerInbox:135`, `QuickInviteModal:117`,
`PartyPicker:355`, `CopyLyricMenu:75` (feature detect + try/catch, both modes
messaged).

**CORRECTIONS to the task description — report these in the PR body.**

1. **`StaffAdmin.tsx:875` is NOT unguarded.** The description calls it the worst case
   ("await, then a success toast", staff believing they hold a link they do not).
   Verified `components/admin/StaffAdmin.tsx:866-879`: the `await` and the `'ok'`
   toast are both inside a `try`, and the `catch` at :877 shows a `'bad'` toast. The
   false-success claim is wrong. Its real (lesser) defect is the **missing feature
   detect**: on a non-secure origin `navigator.clipboard.writeText` throws a
   TypeError, the catch fires, and `err.message` is rendered to staff as
   `Cannot read properties of undefined (reading 'writeText')`. Cryptic, not silent.
2. **The split is 21 / 8 / 5, not 23 / 14 / 9.** 8 uncaught + 5 caught-but-misleading-
   or-mute (classes B and C) + 8 handled. Ten sites have wrong user-visible failure
   behaviour today, and two of them (`SelectsPlayer`, `PitchPlugForm`) were on the
   description's "already handled" list.
3. **The description's "worse than the original" judgement still holds — for the share
   fallbacks, not for StaffAdmin.** `ShareButton:33` is the no-Web-Share path and
   throws a synchronous TypeError straight out of `shareOrCopy()` into the onClick
   handler on any non-secure origin: the fallback has no fallback.
   `ExportPackPanel:131` loses a signed download URL the same way.

**Harness facts.** `jest.config.js` is `testEnvironment: 'node'`, no jsdom —
component interaction cannot be observed, so the helper must be unit-testable as a
pure function and the drift guard must be a source scan. Co-located `lib/**/*.test.ts`
is an established pattern (`lib/phone.test.ts`, `lib/catalogue/local-drafts.test.ts`).
Neither `lib/clipboard/` nor `lib/ui/` exists. `lib/` contains zero
`navigator.clipboard` uses today, so scanning only `app/` + `components/` leaves the
helper outside the scanned tree and the guard needs **no allowlist at all**.
</verified_facts>

<context>
@.claude/CLAUDE.md
@components/catalogue/CopyLyricMenu.tsx
@__tests__/palette-single-source.test.ts
@__tests__/rls-helper-callsites.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build the helper, unit-test it, and commit the drift guard RED</name>
  <files>lib/clipboard/attempt-copy.ts, lib/clipboard/attempt-copy.test.ts, __tests__/clipboard-call-site-guard.test.ts</files>

  <behavior>
    attempt-copy.test.ts (node env, no jsdom, no global mutation — fakes are passed in):
    - resolveClipboard(undefined) returns undefined (SSR)
    - resolveClipboard({}) returns undefined (no clipboard property)
    - resolveClipboard({ clipboard: {} }) returns undefined (no writeText function)
    - resolveClipboard({ clipboard: { writeText: fn } }) returns the clipboard object
    - attemptCopy('x', undefined) resolves to 'unavailable' and writes nothing
    - attemptCopy('x', fake-that-resolves) resolves to 'copied' and the fake received
      exactly the string 'x'
    - attemptCopy('x', fake-that-rejects) resolves to 'rejected' and does not throw
    - attemptCopy('x', fake-that-throws-synchronously) resolves to 'rejected'
      (a non-secure-origin TypeError must not escape)

    clipboard-call-site-guard.test.ts:
    - matcher truth table: flags `navigator.clipboard.writeText(x)`,
      `navigator.clipboard?.writeText(x)`, `(navigator as Navigator & {...}).clipboard`,
      and the quoted-property `in navigator` feature check
    - matcher truth table: does NOT flag `event.clipboardData.getData('text')`
      (LyricsPad.tsx:773 is a paste handler, unrelated), and does NOT flag a
      capital-C user-facing string such as the "unavailable" copy in QuickInviteModal
    - non-vacuity: the walker finds more than 400 files under app/ + components/
    - the offender list is empty
  </behavior>

  <action>
Create `lib/clipboard/attempt-copy.ts`. Generalise the handling already in
`components/catalogue/CopyLyricMenu.tsx:58-82` — do not invent a different approach.
No `'use client'` directive; this is a plain util imported by client components.

Export `type ClipboardAttempt = 'copied' | 'unavailable' | 'rejected'`.

**Return-shape decision, to be recorded in the module header and the PR body.** A
boolean is too thin. Five sites today already distinguish "there is no clipboard API
here" from "the write failed" and show different copy for each — QuickInviteModal,
PartyPicker, ProducerInbox, ProducerHandoffTimeline, and CopyLyricMenu. Collapsing
those into one branch would be a worse UX than they have now, which this task forbids.
Throwing is also rejected: it recreates the exact defect being fixed (an uncaught
throw in an async handler) and forces a try/catch at all 21 sites.

**Naming, per `label-integrity-funun`.** The member is `'rejected'`, not `'refused'`.
"Refused" asserts a cause — permission denied — that a rejected promise does not
establish; a rejection can be a transient DOMException with no refusal involved.
`'rejected'` states only what was observed. `'unavailable'` is derived from a feature
check and claims only that no write API is reachable. `'copied'` is the browser's own
report that the write resolved, which is the strongest evidence obtainable. The
function is named for the attempt it makes, not for an outcome it cannot promise —
which is the whole bug: a void-returning `copyToClipboard()` is a name that authorises
the caller's unconditional `setCopied(true)`.

Export `type ClipboardWriter = { writeText: (text: string) => Promise<void> }`.

Export `resolveClipboard(nav: unknown): ClipboardWriter | undefined` — a pure
function taking a navigator-like value. Return undefined unless the value is a
non-null object carrying a `clipboard` property that is itself a non-null object whose
`writeText` is a function. Taking the navigator as an argument is what makes it
testable under `testEnvironment: 'node'` without touching globals.

Export `async function attemptCopy(text: string, writer?: ClipboardWriter):
Promise<ClipboardAttempt>`. When `writer` is omitted, resolve it from the global via
`resolveClipboard(typeof navigator === 'undefined' ? undefined : navigator)` — the
`typeof` guard is what makes this SSR-safe, since several callers are client
components inside server-rendered trees. Return `'unavailable'` when no writer
resolves. Otherwise `await writer.writeText(text)` inside a try/catch that returns
`'copied'` on success and `'rejected'` on any throw. The try must enclose the call
itself, not just the await, so a synchronous TypeError is caught too.

Create `lib/clipboard/attempt-copy.test.ts` covering the behaviours above.

Create `__tests__/clipboard-call-site-guard.test.ts`, following the structure of
`__tests__/palette-single-source.test.ts` (recursive walker, non-vacuity floor,
classifier truth table) and its stated vacuity discipline.

Guard construction, already prototyped against this tree:
- Scan dirs: `app` and `components` only. `.ts`/`.tsx`. Skip `node_modules` and
  dot-directories.
- Strip block comments then line comments **first**, preserving line count, before
  matching — `__tests__/rls-helper-callsites.test.ts` documents a parser defect where
  a word in prose inverted an entire audit, and several of these files discuss the
  clipboard in comments.
- Two patterns, applied to the stripped text: a property access of a `clipboard`
  member reached through a dot (which also covers optional chaining and a parenthesised
  cast), and a quoted `clipboard` property name followed by the `in` operator. Both
  must end on a word boundary — that single detail is what excludes
  `event.clipboardData` without needing an exception for it.
- **Allowlist: empty.** The helper lives under `lib/`, outside the scanned dirs, so
  there is nothing legitimate left to exclude. If this ever appears to need entries,
  the matcher is wrong.
- Non-vacuity: assert the walker finds > 400 files, and assert the matcher truth table
  above, so the guard cannot go quietly green by matching nothing.

**Commit this task RED.** A guard that passes before the fix proves nothing. Expect
the offender assertion to fail listing **27 lines across 18 files**; record that exact
number in the commit message. `attempt-copy.test.ts` must be GREEN in the same commit.

Do not push yet — CI runs on the pushed tip, so the whole branch is pushed once at the
end of Task 3 and CI sees a green tree.
  </action>

  <verify>
    <automated>npx jest lib/clipboard/attempt-copy.test.ts</automated>
    <automated>npx jest __tests__/clipboard-call-site-guard.test.ts 2>&1 | tail -40  # MUST FAIL here, listing 27 offender lines across 18 files</automated>
  </verify>

  <done>Helper unit test green. Drift guard red with 27 offenders across 18 files, truth-table and non-vacuity assertions green. Both committed, nothing pushed.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate the ten sites whose failure behaviour is wrong today</name>
  <files>components/tools/PitchCard.tsx, components/tools/PitchPlugForm.tsx, components/profile/ShareButton.tsx, components/profile/ProfileMoreMenu.tsx, components/vault/ToolSidePanel.tsx, components/vault/ExportPackPanel.tsx, components/vault/PublicPlaybackView.tsx, components/selects-player/SelectsPlayer.tsx</files>

  <action>
Classes A and B from `<verified_facts>`. Each site adopts `attemptCopy` and **keeps or
gains its own failure UX** — this is about never failing silently, not about making
them identical. Happy path is untouched everywhere: the same success state, the same
timers, the same strings.

`PitchCard.tsx:8-22` (`CopyButton`) — branch on the outcome. `'copied'` keeps
`setCopied(true)` and the 1500ms reset. Otherwise show a distinct transient label on
the same button (the button is the only surface this component owns) so the flip is
never a lie.

`PitchCard.tsx:136-146` (`Copy & open SubmitHub`) — **do not open the tab unless the
outcome is `'copied'`.** Rationale to state in the PR body: the tab exists so the user
can paste; a tab that opens over an empty clipboard reads as success and the user
discovers the failure on a third-party site with the source text no longer in front of
them. On a non-`'copied'` outcome, stay on the page — the email body is already
rendered above and selectable — and show the same failure label as the sibling button.
Note the pre-existing `await` before `window.open` already exposes this to popup
blocking; this change does not widen that.

`PitchPlugForm.tsx:28-33` (`copyLink`) — Class B. `setCopied(path)` currently runs
unconditionally over a floating promise. Make the handler async, await the outcome,
and set `copied` only on `'copied'`; otherwise surface a short inline failure beside
the link. Verify the caller is not relying on a synchronous return.

`ShareButton.tsx:22-33` (`shareOrCopy`) — **the gesture rule in the file's own
docblock is load-bearing: `navigator.share()` must remain the first executed
statement, with no leading await.** Keep `shareOrCopy` non-async and keep the share
call where it is. Replace each clipboard branch with a non-awaited `attemptCopy(...)`
whose `.then` delivers the outcome to the callback — structurally the same `void
...then(...)` shape the file uses today, so nothing moves before the share call. Widen
the third parameter from `onCopied: () => void` to an outcome callback receiving
`ClipboardAttempt`. There are exactly two callers: `ShareButton.tsx:56` and
`ProfileMoreMenu.tsx:35`. Update both to set their existing copied state only on
`'copied'` and to show a failure affordance otherwise.

`ToolSidePanel.tsx:386-400` (`CopyButton`) — the PR #120 site. Same treatment as
PitchCard's CopyButton. These are the SampleClear rights-holder letters, so the
failure label must be legible enough that the artist knows to select the letter text
manually.

`ExportPackPanel.tsx:129-136` (`copyLink`) — carries a signed download URL. Make it
async, branch on the outcome, keep `setCopied(true)` and the existing 2000ms
`copyTimeoutRef` behaviour on `'copied'` only, and render a failure message on the
other outcomes so the user is not left believing they hold a link.

`PublicPlaybackView.tsx:113-136` — two sites. `copyLink` gates `setCopied(true)` on
`'copied'`. `shareTrack` is the Web Share fallback: preserve the existing ordering
(the `navigator.share` call stays reached without an intervening await) and gate
`setShared(true)` on `'copied'`. Both need a visible failure state; reuse the same
transient-label pattern the component already uses for `copied`/`shared`.

`SelectsPlayer.tsx:527-531` (`share`) — Class B, the toast currently lies. Await the
outcome and choose the toast from it: keep the exact existing string on `'copied'`,
and show a distinct "could not copy" message otherwise. `showToast` takes a single
string (`:307`), so do not invent a second argument.

Commit with a message naming the ten sites and the two the description had
misclassified.
  </action>

  <verify>
    <automated>npm run typecheck:strict</automated>
    <automated>npm run lint</automated>
    <automated>npx jest __tests__/clipboard-call-site-guard.test.ts 2>&1 | tail -30  # still RED, offender count must have dropped from 27</automated>
  </verify>

  <done>Ten sites use attemptCopy. No success state, toast, label flip or new tab fires on a non-'copied' outcome. Every one shows something on failure. typecheck:strict and lint clean. Guard still red with a strictly lower offender count.</done>
</task>

<task type="auto">
  <name>Task 3: Migrate the remaining eleven sites, green the guard, run the full gate, open the PR</name>
  <files>components/admin/SelectsBuilder.tsx, components/catalogue/WorkRoster.tsx, components/ideas/IdeasInbox.tsx, components/admin/ArtistInvitesAdmin.tsx, components/admin/StaffAdmin.tsx, components/playbook/AuthHealthPanel.tsx, components/catalogue/ProducerHandoffTimeline.tsx, components/catalogue/ProducerInbox.tsx, components/collaborators/QuickInviteModal.tsx, components/split-sheets/PartyPicker.tsx, components/catalogue/CopyLyricMenu.tsx</files>

  <action>
Classes C and D. These are mostly mechanical adoption — the guard's empty allowlist is
what requires them, and routing every site through one helper is the owner's decision.
Do not redesign any of these UIs.

Class C — adoption plus the one missing message each:
- `SelectsBuilder.tsx:593-599` — keep the `copied` → 2000ms → `idle` transition on
  `'copied'`. Add a failure value to the existing `copyState` union rather than a new
  piece of state, so the silent `.catch(() => {})` becomes visible.
- `WorkRoster.tsx:288-296` — the silent early return and the empty catch both become
  one visible outcome. The comment there claims a selection fallback; if the readonly
  input genuinely is select-on-click, keep that and make the claim true by pointing the
  user at it — otherwise delete the claim. Do not leave a comment asserting a fallback
  that is not wired.
- `IdeasInbox.tsx:215` — a single very long JSX line; edit surgically, change only the
  copy call and its outcome handling, and do not reformat the line.

Class D — behaviour-preserving adoption. Each already distinguishes the two failure
modes; map `'unavailable'` to the existing unavailable branch and `'rejected'` to the
existing catch branch, keeping every string verbatim:
- `ProducerHandoffTimeline.tsx:177-197`, `ProducerInbox.tsx:129-150`,
  `QuickInviteModal.tsx:111-124`, `PartyPicker.tsx:349-362` — the explicit
  feature-detect `if` disappears into the `'unavailable'` arm; the strings do not
  change.
- `ArtistInvitesAdmin.tsx:161-169`, `AuthHealthPanel.tsx:81-89` — these had no feature
  detect, so they gain a correct `'unavailable'` arm. Reuse each file's existing
  failure string rather than inventing new copy.
- `StaffAdmin.tsx:863-880` — keep the whole fetch inside its try/catch exactly as it
  is; only the clipboard line changes. The `'ok'` toast fires on `'copied'` only. A
  non-`'copied'` outcome gets a `'bad'` toast with a written message — this is what
  replaces today's raw `Cannot read properties of undefined` string reaching staff.
- `CopyLyricMenu.tsx:58-82` — **must not lose its selectable-fallback behaviour.**
  Replace only the inline detect-and-try block with `attemptCopy`; both non-`'copied'`
  outcomes keep setting `fallbackText`/`fallbackFlavor` and closing the menu, exactly
  as now. Its static-markup test must still pass.

Then green the guard and run the Verification Gate from `.claude/CLAUDE.md` in full —
all six steps, no substitutions. Do **not** run `npm run build`; a dev server is on
:3000 and build is not part of CI's validate job anyway.

Stage only the files this plan touched. Never `git add -A` — five pre-existing
untracked files under `.planning/reviews/` and `.planning/todos/pending/` stay
untracked. Then push the whole branch once (so CI evaluates the green tip rather than
Task 1's deliberate RED commit) and open a PR against `main`.

PR body must carry: that this began as PR #120's un-runnable manual browser check,
which needed the owner's session plus a project with a flagged sample plus a completed
tool run, and that reading the code found the defect the click was meant to catch and
then found it was a class rather than an instance; the measured split (21 call sites —
8 uncaught, 5 caught-but-misleading-or-mute, 8 handled) **and the two corrections to
the originally reported 23/14/9**, namely that `StaffAdmin:875` is already inside a
try/catch and its real defect is a missing feature detect surfacing a raw TypeError
string to staff, and that `SelectsPlayer:529` and `PitchPlugForm:30` were on the
"handled" list while unconditionally claiming success; why the share fallbacks
(`ShareButton:33`, `PublicPlaybackView`) and `ExportPackPanel`'s signed URL are the
genuinely worse cases — a fallback with no fallback; the helper's three-member return
shape and why a boolean was rejected, plus why the member is `'rejected'` and not
`'refused'`; that each site keeps its own failure UX; the `PitchCard:139` decision not
to open SubmitHub on a failed copy and the reason; the drift guard's pre-fix RED count
of 27 offender lines across 18 files and its empty allowlist; and that #120's loose end
is closed by this rather than by a click.
  </action>

  <verify>
    <automated>npx jest __tests__/clipboard-call-site-guard.test.ts  # now GREEN, zero offenders</automated>
    <automated>npm run security:migrations:verify</automated>
    <automated>npm run typecheck:strict</automated>
    <automated>npm run lint</automated>
    <automated>npm test -- --runInBand</automated>
    <automated>npm audit --omit=dev --audit-level=moderate &amp;&amp; npm audit --audit-level=high</automated>
    <automated>git status --porcelain | grep -E '^\?\? \.planning/(reviews|todos)' | wc -l  # expect 5, still untracked</automated>
  </verify>

  <done>All 21 sites use the helper. Guard green with an empty allowlist. All six Verification Gate steps pass. The five pre-existing untracked planning files are still untracked. Branch pushed once, PR open against main with the body contents above.</done>
</task>

</tasks>

<verification>
- `npx jest __tests__/clipboard-call-site-guard.test.ts` green, and its non-vacuity
  (> 400 files) and truth-table assertions green — a guard that matches nothing is the
  failure mode this repo has already been bitten by.
- `npx jest lib/clipboard/attempt-copy.test.ts` green, including the
  synchronous-throw case.
- Full Verification Gate, all six steps.
- Happy-path spot check by reading the diff: every `setCopied(true)` / toast / label
  flip / `window.open` is now reachable only on `'copied'`, and none of the success
  strings changed.
</verification>

<success_criteria>
One helper, 21 call sites, zero direct clipboard access left under `app/` or
`components/`, an empty allowlist, a guard that was red at 27 before it was green at 0,
and no happy-path behaviour changed anywhere.
</success_criteria>

<output>
Commit per task (Task 1's commit is deliberately RED). Push once at the end of Task 3.
</output>
