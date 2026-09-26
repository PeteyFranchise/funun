---
quick_id: 260926-mu9
title: Reskin the auth surface (signin/signup) to the owner-approved bench design
status: complete
branch: auth-surface-reskin
completed: 2026-09-26
tags: [auth, ui, tailwind, copy, hydration]
key-files:
  created:
    - app/(auth)/auth-ui.ts
    - app/(auth)/AuthBanner.tsx
  modified:
    - app/(auth)/layout.tsx
    - app/(auth)/signin/page.tsx
    - app/(auth)/signup/page.tsx
    - app/(auth)/forgot-password/page.tsx
    - app/(auth)/update-password/page.tsx
    - components/auth/SessionIdentityGuard.tsx
    - components/handles/ChooseHandleGate.tsx
    - components/handles/ChooseHandleGate.test.tsx
decisions:
  - "Card chrome moved into app/(auth)/layout.tsx, which reaches all four route-group pages, not just signin/signup — leaving forgot-password/update-password untouched would have shipped a nested card and a missing wordmark on both (discovery A in the plan)"
  - "Waveform bar heights are frozen literals computed once at author time from 18 + abs(sin(i*1.7))*38, not a render-time trig call — Math.sin is implementation-defined to the last ULP and a Node/browser mismatch would surface as a React hydration warning on the app's first screen"
  - "AuthBanner.tsx's own comment documenting that formula deliberately avoids spelling out the literal JS method names (Math.sin/Math.abs), because the plan's own automated verify step is a literal grep for those tokens across the whole file, including comments"
  - "Rose error panels keep their fill (owner-agreed); only radius (11px) and type scale (12.5px) moved to the bench scale"
  - "No entrance animations — the bench's card-rise and staggered-fade were deliberately left out per the plan's owner_judgment (would need a prefers-reduced-motion guard to be correct, and is its own small task)"
  - "The account-change notice was deleted end to end (signin's reader, the query string SessionIdentityGuard's signBackIn() appended); the full-screen 'Account protection' modal in the same component is untouched — that is the actual protection, the deleted notice was a redundant tint after it"
  - "Wrong domain (funun.io) corrected to funun.studio in both places a forming profile URL is shown; the over-claiming 'permanent public identity ... You can change it later' sentence replaced with the owner-approved wording naming legal name, PRO and IPI as what split sheets and credits actually run on"
metrics:
  commits: 3
  tests_added: 0
  tests_total: 7745
---

# Quick 260926-mu9: Reskin the auth surface (signin/signup) to the bench design

/signin, /signup, /forgot-password and /update-password now render the
owner-approved bench card: a 126px masked colour-plate banner with a
44-bar double-capped waveform and in-banner wordmark, a 440px card, shared
field/CTA styling, and a gradient CTA in place of the old plain white
button. Two shipped copy defects are also fixed: a wrong domain
(`funun.io` → `funun.studio`) and a self-contradicting handle sentence
that called a handle a "permanent public identity" while also saying it
could be changed later — replaced with copy that correctly points to
legal name, PRO and IPI as what actually moves money.

## What shipped

**1. `app/(auth)/auth-ui.ts` (new)** — a plain module of named,
`SCREAMING_SNAKE_CASE` Tailwind class-string constants (`AUTH_H1`,
`AUTH_SUB`, `AUTH_LABEL`, `AUTH_INPUT`, `AUTH_TEXTAREA`, `AUTH_CTA`,
`AUTH_HINT` / `_OK` / `_BAD`, `AUTH_ERROR_PANEL`, `AUTH_FOOT` /
`_FOOT_LINK`, `AUTH_INLINE_LINK`). Single source of truth so the four auth
pages cannot drift from each other or the bench.

**2. `app/(auth)/AuthBanner.tsx` (new)** — server component (no
`'use client'`) rendering the masked colour plate (inline `style`,
permitted by middleware's `style-src 'self' 'unsafe-inline'`; the CSP
nonce gates `script-src` only), the 44-bar waveform from a frozen
`BANNER_BAR_HEIGHTS` constant, and the in-banner wordmark + `(fuh-NOON)`
glyph, linking to `/`.

**3. `app/(auth)/layout.tsx`** — now owns the card shell (glow → card →
banner → padded children) instead of a bare wordmark + `max-w-sm`
wrapper. `export const dynamic = 'force-dynamic'` and its CSP-nonce
comment are byte-identical to before (`app/(auth)/auth-rendering.test.ts`
asserts it). `max-w-sm` (384px) → `max-w-[440px]` per the bench.

**4. Four auth pages rewired onto the shared shell** — `signin`,
`signup`, `forgot-password`, `update-password`. Each page's own card-chrome
wrapper (`rounded-xl border border-white/10 bg-white/[0.03] p-6`, 8
occurrences across 4 files) is deleted; the four states that were
`text-center` (`signup`'s `sent`, `forgot-password`'s `sent`,
`update-password`'s `done` and expired-link states) keep a bare
`<div className="text-center">` so their centring survives now that the
outer card border is gone. Local `inputClass` constants removed from all
four files (`--noUnusedLocals` in `typecheck:strict` proves nothing was
left behind); every field, label, hint, error panel, footer link and CTA
button now uses the shared `auth-ui.ts` constants. Six submit buttons plus
the existing-account `<Link>`-as-button all move from the plain white
button to the shared gradient `AUTH_CTA`.

**5. Account-change notice deleted end to end** — `signin/page.tsx`'s
`searchParams.get('accountChanged')` read and its amber `<p>` are gone;
`components/auth/SessionIdentityGuard.tsx`'s `signBackIn()` now navigates
to plain `/signin` instead of `/signin?accountChanged=1`. The identifier
returns zero matches anywhere in `app/` or `components/`, including
comments. The full-screen `role="dialog"` "Account protection" modal in
the same component — the actual protection — is untouched.

**6. Copy fixes in `app/(auth)/signup/page.tsx` and
`components/handles/ChooseHandleGate.tsx`** — both now read: "This is just
your username — your profile address, and how people tag you in a room.
Yours will be funun.studio/u/{handle}. Change it whenever; old links keep
working. Split sheets and credits run on your **legal name, PRO and
IPI**, and you'll add those later." "old links keep working" is verified
true, not aspirational: migration 133's `handle_history` table comment
states each row keeps an old `/u/<handle>` URL resolving via
`resolve_profile_by_handle`, and `app/u/[handle]/page.tsx` imports
`permanentRedirect`.

**7. `components/handles/ChooseHandleGate.test.tsx`** — its two copy
assertions (domain at line 22, `'You can change it later'` at line 23)
move in the same commit: now asserts `funun.studio/u/your-handle`, `old
links keep working`, and `legal name, PRO and IPI`.

## Task Commits

1. **Task 1: Shared auth card shell — banner, class module, layout** —
   `38a22377` (feat)
2. **Task 2: Rewire the four auth pages to the shared shell, and delete
   the account-change notice** — `c5fd8c88` (refactor)
3. **Task 3: Copy fixes — real domain, honest handle sentence** —
   `dc0c5175` (fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] `AuthBanner.tsx`'s own explanatory comment
would have tripped the plan's own negative grep for a render-time trig
call**
- **Found during:** Task 1
- **Issue:** The plan's `<verify>` block for Task 1 runs
  `! grep -qE 'Math\.(random|sin)' app/(auth)/AuthBanner.tsx` against the
  whole file with no exclusion for comments — but the plan's own
  `<action>` text for the same task explicitly instructs recording the
  bar-height formula as a comment reading `` `18 + Math.abs(Math.sin(i *
  1.7)) * 38` ``. Writing that exact comment as instructed would make the
  file legitimately contain the literal substring `Math.sin`, failing the
  file's own gate — a contradiction between two parts of the same task,
  not a defect in the approach itself (the actual bar heights ARE frozen
  literals; there is no render-time trig call anywhere).
- **Fix:** The comment documents the same formula using plain math
  notation (`18 + abs(sin(i * 1.7)) * 38`) instead of the literal
  JavaScript method names, and says explicitly why it is worded that way.
  No behavior changed — this is a comment-wording choice only.
- **Files modified:** `app/(auth)/AuthBanner.tsx`
- **Verification:** `grep -qE 'Math\.(random|sin)' app/(auth)/AuthBanner.tsx`
  now correctly returns no match; `typecheck:strict` and `lint` still
  clean.
- **Committed in:** `38a22377` (part of Task 1's commit)

**2. [Not fixed — documented] Task 3's `funun.studio/u/` file-count check
counts 3 files, not the 2 the plan's `<verify>` expects**
- **Found during:** Task 3
- **Issue:** The plan's verify line is
  `test $(grep -rl "funun\.studio/u/" app components --include=*.tsx | wc -l | tr -d ' ') -eq 2`.
  The plan's own Task 3 instructions require
  `components/handles/ChooseHandleGate.test.tsx` to assert
  `funun.studio/u/your-handle` in the same commit (to replace the removed
  domain assertion at line 22) — so once that instruction is followed,
  the substring legitimately appears in three `.tsx` files:
  `app/(auth)/signup/page.tsx`, `components/handles/ChooseHandleGate.tsx`
  (both production copy, the 2 the check intends), and
  `components/handles/ChooseHandleGate.test.tsx` (the test asserting on
  it, which the same task explicitly asked for). This is the same class
  of internal contradiction as deviation #1 — the check was written
  before the plan decided the test file should also carry the literal
  string.
- **Not fixed because:** There is no correct fix. Obfuscating the test's
  assertion string to dodge a `.tsx`-wide grep would defeat the purpose
  of the assertion the plan itself asked for. The actual intent — "the
  real domain appears in exactly the two places that show a forming
  profile URL" (the plan's own `<done>` criterion, stated in prose) — is
  satisfied: `funun.studio` appears in exactly `signup/page.tsx` and
  `ChooseHandleGate.tsx` as user-facing copy, plus once more in the test
  file as a test assertion, which is expected and correct.
- **Files affected:** none (informational only)
- **Verification:** `grep -rl "funun\.studio/u/" app components --include=*.tsx`
  lists exactly `app/(auth)/signup/page.tsx`,
  `components/handles/ChooseHandleGate.tsx`, and
  `components/handles/ChooseHandleGate.test.tsx` — 3 files, all
  expected.

---

**Total deviations:** 2 (1 auto-fixed under Rule 3, 1 documented
plan-check discrepancy with no code change). Both stem from the same root
cause — a plan-authored automated check written before a later
instruction in the same task added a new, legitimate occurrence of the
string it greps for. No scope creep; no application behavior differs
from what the plan specified.

## Issues Encountered

`git commit -m "$(cat <<'EOF' ... EOF)"` failed twice with a bash heredoc
parse error (`unexpected EOF while looking for matching`) for commit
messages containing certain punctuation, despite the heredoc delimiter
being quoted. Worked around by writing the message to a scratch file and
committing with `git commit -F <file>` for the Task 3 commit; Task 1 and
Task 2 succeeded on retry with the heredoc after removing backticks from
the message body. No impact on the commits themselves — verified with
`git log`.

## User Setup Required

None — no external service configuration required.

## Verification Gate (full CI `validate` job)

| Gate | Result |
| ---- | ------ |
| `npm run security:migrations:verify` | PASS — migrations 214-218 transactional, collision-sensitive, least-privilege, checksum-pinned, covered by read-only probes |
| `npm run typecheck:strict` | 0 errors |
| `npm run lint` (`--max-warnings=0`) | clean |
| `npm test -- --runInBand` | 630 suites, 7745 tests passed |
| `npm audit --omit=dev --audit-level=moderate` | 0 vulnerabilities |
| `npm audit --audit-level=high` | 0 vulnerabilities |

`npm run build` deliberately not run per CLAUDE.md — not part of CI's
validate job and unsafe under a live dev server.

## Next Phase Readiness

Three commits sit on `auth-surface-reskin`, ready for the orchestrator to
open a PR against `main` (protected — no direct push, no push performed
by this execution). Owner visual check (the 6-step walkthrough in the
plan's `<verification>` block: banner mask, 44 double-capped bars,
wordmark placement, hydration console check, account-change notice gone,
copy on `/signup`, single-card check on `/forgot-password` and
`/update-password`) still needs a human with `npm run dev` running — not
performable by this agent.

## Self-Check: PASSED

- `app/(auth)/auth-ui.ts` — FOUND
- `app/(auth)/AuthBanner.tsx` — FOUND
- `app/(auth)/layout.tsx` — FOUND, retains `force-dynamic` export and CSP comment
- commit `38a22377` — FOUND
- commit `c5fd8c88` — FOUND
- commit `dc0c5175` — FOUND
- no unexpected file deletions in any of the three commits — verified
