---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
hardened: 2026-08-17T22:40:00Z
source: 33-REVIEW.md (2026-08-18T02:10:58Z)
findings_resolved: 5
commits: 4
---

# Phase 33: Post-Review Hardening Summary

Closes all findings from `33-REVIEW.md` (1 critical, 3 warnings, 2 info — one
warning, WR-03, was pre-existing-not-exploitable and out of this pass's
explicit scope; see Note at the end). Four atomic commits, one per logical
fix, applied directly on `feat/lane1-catalogue-menu-help`.

## CR-01 (BLOCKER) — `it` StaffRole over-granted to all-staff admin surfaces

**Finding:** Migration 114 states the invariant that `it` "carries ONLY read
access to The Playbook's IT Team room ... it is never granted write/curation
power anywhere in the app." Widening `ALL_STAFF_ROLES` to include `it`
(Phase 33) silently widened every guard that defaulted to
`ALL_STAFF_ROLES` — both `requireStaff()`/`requireStaffPage()`'s default
parameter and ~8 inline page guards written as `if (!role) redirect('/')` —
so an `it` account passed every general-staff check and reached the
AE/client-partner sales pipeline (Crate Requests, Selects, My Client
Partners, client/clients workspaces, Artist Invites, Directory).

**Fix applied:**
- `lib/admin/staff-role.ts` — added `OPERATIONAL_STAFF_ROLES: StaffRole[] =
  ['leadership', 'ae', 'bd', 'anr']`, the pre-Phase-33 default staff set
  (every role except the read-only `it`), with a comment explaining it is
  the fail-closed default for general staff surfaces. `ALL_STAFF_ROLES` is
  unchanged — still the full enumeration for dropdowns/display.
- `lib/admin/gate.ts` — `requireStaff()` and `requireStaffPage()` now
  default to `OPERATIONAL_STAFF_ROLES` instead of `ALL_STAFF_ROLES`;
  `OPERATIONAL_STAFF_ROLES` is re-exported alongside the existing
  re-exports. Every explicit-allowlist caller (the 5 Playbook IT-room pages'
  `requireStaffPage(['leadership','it'])`, `verifyAdmin()`'s
  `requireStaff(['leadership'])`, `sync-library`'s
  `requireStaff(['leadership','ae'])`, etc.) is unaffected — this only
  tightens the *default*.
- 8 inline page guards changed from `if (!role) redirect('/')` (or the
  `getStaffRole(user) === null` inline variant) to also redirect when
  `role === 'it'`:
  - `app/(admin)/admin/artist-invites/page.tsx`
  - `app/(admin)/admin/crate-requests/page.tsx`
  - `app/(admin)/admin/directory/page.tsx` (also had to capture
    `getStaffRole(user)` into a `role` const first, since it was previously
    an inline `=== null` check with no captured variable)
  - `app/(admin)/admin/my-client-partners/page.tsx`
  - `app/(admin)/admin/selects/page.tsx`
  - `app/(admin)/admin/selects/[id]/page.tsx`
  - `app/(admin)/admin/client-partners/[orgId]/page.tsx` (variable named
    `staffRole`, not `role`)
  - `app/(admin)/admin/clients/[personId]/page.tsx` (variable named
    `staffRole`, not `role`)
- `app/(admin)/layout.tsx` — `it` still reaches the admin shell (required to
  open `/admin/playbook`; the layout's own gate at line 28 only excludes a
  null role, which is correct and unchanged). The sales/ops nav links (Crate
  Requests, Selects, My Client Partners, Directory, Artist Invites) are now
  wrapped in `{role !== 'it' && (...)}` so they no longer render — or invite
  discovery of — surfaces `it` cannot open. This is defense-in-depth/UX on
  top of the page-level guards above, which are the real security boundary.
- `__tests__/staff-role-it.test.ts` — extended with 3 new `describe` blocks
  (5 new tests): `OPERATIONAL_STAFF_ROLES` excludes `it` and has length 4;
  `requireStaff()` denies an `it` caller by default (403) while still
  admitting `leadership`; `requireStaffPage()` denies an `it` caller by
  default (redirects to `/`) while still admitting `leadership`. Mirrors the
  file's existing dynamic-import-per-test / mock style.

**Verification swept (step 5 of the fix instructions):** grepped the whole
`app/` tree for every `getStaffRole`/`if (!role)`/`=== null) redirect`
pattern. All other admin pages already gate on `=== 'leadership'` explicitly
or an explicit allowlist (e.g. `sync-library`'s `role !== 'leadership' &&
role !== 'ae'`) and were left untouched per the fix scope, since they
already exclude `it`. `app/(admin)/playbook/page.tsx` and
`app/(admin)/playbook/layout.tsx` (the Playbook shell itself) already
correctly check `role === 'leadership' || role === 'it'` explicitly — no
change needed. Two non-admin, buyer-facing surfaces
(`app/sync/catalog/page.tsx`'s `staffMode` preview layer and
`app/selects/[token]/page.tsx`'s cosmetic `isStaff` flag) also read
`getStaffRole()` for any-staff cosmetic/preview behavior on public pages —
these are outside CR-01's stated scope (they don't reach the admin sales
pipeline) and outside the fix instructions' explicit 8-page list, so they
were intentionally left unchanged; flagged here for awareness, not as an
open gap.

**Files touched:** `lib/admin/staff-role.ts`, `lib/admin/gate.ts`, 8 admin
pages listed above, `app/(admin)/layout.tsx`, `__tests__/staff-role-it.test.ts`.

**Commit:** `80fe1ed` — `fix(33): restore fail-closed default staff guard so read-only it role can't reach non-Playbook admin surfaces (CR-01)`

## WR-01 / IN-01 — mockup-alias CSS tokens break the light theme

**Finding:** `StatusBanner.tsx`, `DigestPanel.tsx`, and `ThresholdsPanel.tsx`
used mockup-alias custom-property names (`--hair`, `--card`, `--lav`,
`--lavdim`) that are not declared anywhere in the codebase's real `.fncon`
token block (`components/admin/console-theme.ts`). `--hair`/`--lavdim`
resolve to nothing (invalid at computed-value time); `--card`/`--lav` only
ever pick up the dark `:root` values and never the
`.fncon[data-theme="light"]` overrides — so in the admin console's opt-in
light theme these three panels rendered a dark card against an otherwise
light-themed page. Sibling files (`lib/playbook/markdown-components.tsx`,
`components/playbook/VendorsGrid.tsx`) already used the correct real
tokens and documented the exact mapping. IN-01 (hardcoded `text-white`) is
the same class of defect and was fixed in the same pass.

**Fix applied** — mapped every mockup-alias token to its real equivalent,
per the mapping already documented in `markdown-components.tsx`/
`VendorsGrid.tsx` and confirmed live against
`components/admin/console-theme.ts`'s `.fncon` block:

| Mockup alias | Real token |
|---|---|
| `--hair` | `--border` |
| `--card` | `--panel` |
| `--lav` | `--ink-2` |
| `--lavdim` | `--ink-3` |
| `text-white` (hardcoded) | `text-[color:var(--ink)]` |

Applied to all three components. `DigestPanel.tsx`'s `DOT_HEX.lavdim`
literal (`'var(--lavdim)'`) was changed to `'var(--ink-3)'`. Confirmed via
grep that no `--hair`/`--card`/`--card2`/`--lav`/`--lavdim`/`text-white`
references remain in any of the three files.

**Files touched:** `components/playbook/StatusBanner.tsx`,
`components/playbook/DigestPanel.tsx`, `components/playbook/ThresholdsPanel.tsx`.

**Commit:** `2fa1145` — `fix(33): use real theme-aware .fncon tokens in dashboard panels for light mode (WR-01)`

## WR-02 — dashboard App Health tile fabricates "→ 503" for `unknown`

**Finding:** `app/(admin)/playbook/it/dashboard/page.tsx` computed
`isHealthy = health === 'healthy'` and branched the App Health tile on that
boolean alone, collapsing `degraded` and `unknown` into the same "not
healthy" copy — printing a concrete `/api/health → 503` even when
`getDashboardHealth()` returned `'unknown'` (the in-process health re-check
threw, or its body was unparseable — i.e. the endpoint was never actually
reached). That asserts a status code that was never observed, diverging
from `StatusBanner`, which already gives `unknown` its own distinct copy.

**Fix applied:** kept `isHealthy` for the tile's color treatment only
(matches `StatusBanner`'s own choice to give `unknown` the same
attention-needed visual as `degraded`), but added `healthLabel` and
`healthDetail`, each branching on all 3 `DashboardHealthStatus` values:

```ts
const healthLabel = health === 'healthy' ? 'Healthy' : health === 'degraded' ? 'Degraded' : 'Unknown'
const healthDetail =
  health === 'healthy' ? '→ 200' : health === 'degraded' ? '→ 503' : 'unreachable — treat as degraded'
```

`unknown` now renders "Unknown" / "unreachable — treat as degraded" instead
of "Degraded" / "→ 503" — no invented status code, and the wording mirrors
`StatusBanner`'s existing unknown-state copy.

**Files touched:** `app/(admin)/playbook/it/dashboard/page.tsx`.

**Commit:** `8777005` — `fix(33): stop fabricating 503 for unreachable health check on dashboard (WR-02)`

## IN-02 — `StatusBanner` hardcoded uptime claim

**Finding:** The healthy-state subtext stated "3/3 uptime monitors up ...
no open incidents" as fact, while v1 ships no live per-route uptime data at
all (the dashboard's own Uptime tile is an explicit link-out to Better
Stack, not a live count). A fixed "3/3" can go stale or false and mildly
contradicts the dashboard's own no-live-telemetry-yet honesty stance.

**Fix applied:** replaced the claim with neutral phrasing that names Better
Stack as the external source of record instead of asserting a live number:

- Before: `3/3 uptime monitors up · /api/health healthy · no open incidents`
- After: `/api/health healthy · uptime tracked externally by Better Stack`

Updated the matching assertion in `__tests__/playbook-status-banner.test.tsx`
(`toContain('3/3 uptime monitors up')` → `toContain('uptime tracked externally by Better Stack')`).

**Files touched:** `components/playbook/StatusBanner.tsx`,
`__tests__/playbook-status-banner.test.tsx`.

**Commit:** `7cc797e` — `fix(33): don't assert live uptime as fact in StatusBanner v1 (IN-02)`

## Verification results

Run after all 4 fixes were applied and committed:

```
$ npx tsc --noEmit
(no output — clean)

$ npx jest --ci
Test Suites: 203 passed, 203 total
Tests:       2335 passed, 2335 total
Snapshots:   0 total
Time:        10.926 s
Ran all test suites.

$ npm run build
 ✓ Compiled successfully in 46s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (100/100)
(all /admin/playbook/it/* and /playbook/it/* routes present in the route
manifest; no errors, no "Failed to compile")
```

## Note — WR-03 not addressed in this pass

`33-REVIEW.md`'s WR-03 (`readObservabilityDoc()` has no path-containment
guard) was **not** part of this hardening pass's assigned fix list (FIX
1–4 above cover CR-01, WR-01, WR-02, IN-01, IN-02 only) and was left
untouched. The review itself notes it is not currently exploitable — every
caller today passes a fixed `DOC_PAGE_FILE[...]` compile-time constant, never
user input — so this is a latent-hardening item for a future pass, not a
functional gap in what this pass was scoped to fix.

---

_Hardening pass completed: 2026-08-17T22:40:00Z_
