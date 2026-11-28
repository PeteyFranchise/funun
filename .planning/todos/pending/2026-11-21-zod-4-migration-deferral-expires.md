---
created: 2026-11-21T18:00:00-05:00
title: Migrate zod 3 to 4 before the audit deferral expires on 2026-12-21
area: dependencies-security
priority: dated-hard-deadline
status: scheduled-work-behind-an-expiring-deferral
depends_on:
  - the owner-applied zod deferral landing in scripts/audit-gate.ts
  - deps/audit-repair merging to main
files:
  - scripts/audit-gate.ts
  - package.json
---

# The deadline is real and it is in a code comment

`GHSA-MRHX-C7XC-M3W5` (high): Zod can exhaust memory while validating oversized
constrained collections. The only published fix is **zod 4.x**, a semver-major
upgrade from the pinned `^3.23.0`.

A dated deferral was approved by the owner on **2026-11-21** and **expires
2026-12-21**. On that date `audit:gate` stops suppressing it and CI goes red
again, by design. That is the mechanism working, not a bug, and the correct
response is to have done the migration rather than to push the date out.

**This file exists because an expiry date living only inside `AUDIT_DEFERRALS`
is a commitment nobody is tracking.** The `braces` entry expired on 2026-11-02
and sat red for nineteen days before anyone noticed, and by then its advisory
had been fixed upstream anyway, so the entry was suppressing nothing while
still looking authoritative.

## Size, measured not guessed

**142 files** import zod, across `app/`, `lib/`, `components/` and `scripts/`:
every API input schema, the metadata and profile models, and the contract
validation path. This is scheduled work, not a dependency bump.

## What the deferral does and does not say

It says the repository cannot be held unmergeable for a month while a 142-file
migration happens. It does **not** say the advisory is harmless.

Exposure is bounded but not zero: the vulnerable path needs an attacker-supplied
oversized constrained collection, and the `app/api` routes that parse request
bodies sit behind authentication. That is a reason it can wait a month. It is
not a reason to let the date slide.

## Before starting

Re-check whether zod 4 is still the only fix, and whether a 3.x patch has since
been published. If one has, this becomes a bump and the deferral should be
removed the same day rather than left to expire.

## Related

`npm audit` also reports `archiver` 6 to 7 and `mermaid` 11 to 12 as breaking
upgrades, both **below** the gate's `high` threshold, so neither blocks CI.
Worth doing eventually, worth doing separately, and explicitly not a reason to
delay this one.

---

## ATTEMPTED 2026-11-28 — and the "one required line" scope was WRONG

The upgrade was run on `deps/zod-4` off `main`. **`zod@4.6.7` installed, and the static scope held
exactly as far as the compiler:**

- **`typecheck:strict` produced exactly ONE error**, at the exact line predicted:
  `lib/client-partners/contacts.ts:59`, the single-argument `z.record`. Fixed with
  `z.record(z.string(), z.unknown())`. Typecheck then passes, and `lint` passes.
- **Then the test suite failed: 171 tests across 27 suites.**

**The cause, which no static scan or changelog reading would have found: `z.string().uuid()` in
zod 4 is version-aware and REJECTS non-v4 UUIDs.** In zod 3 it accepted any RFC-4122-shaped string.

| validator | `3f2504e0-...-41d3-...` (v4) | `11111111-1111-1111-1111-111111111111` | nil uuid |
|---|---|---|---|
| `z.string().uuid()` (zod 4) | accepted | **rejected** | accepted |
| `z.uuid()` (zod 4) | accepted | **rejected** | accepted |
| `z.guid()` (zod 4) | accepted | accepted | accepted |

Every route validating a UUID now 400s on those ids, which is why unrelated suites fail together.

**Scale:** 162 `.uuid()` call sites; 50 distinct UUID literals in the repo, **22 of them not v4**.

## The decision this actually needs — OWNER

This is not a fixture problem. `.uuid()` sits on an **input-validation boundary**, so the strict
reading is a behaviour change in production, not just in tests.

1. **Preserve zod 3 behaviour: `z.guid()` at all 162 sites.** Mechanical, reviewable, and nothing
   that validated before starts failing. Gives up a tightening that was never deliberately chosen.
2. **Keep the strict `.uuid()` and fix the 22 fixtures.** Production ids come from
   `gen_random_uuid()` and `uuid_generate_v4()`, which are v4, so real data should pass — but any
   non-v4 UUID that reaches an input boundary from anywhere else would start being rejected, and
   that has not been established against production data.
3. **Mixed:** strict where ids are Funūn-generated, `z.guid()` where they arrive from outside.
   Most correct, most work, needs a per-site judgement across 162 sites.

**Recommendation: option 1 now, option 3 later if wanted.** The deferral exists to get off a
vulnerable dependency before 2026-12-21; silently tightening an input boundary in the same change is
how a security upgrade becomes an outage.

**What this episode is worth remembering:** the static scan plus the official changelog gave "one
required line", and the compiler agreed. The test suite disagreed, and it was right. A dependency
scope that has not been run is a hypothesis.
