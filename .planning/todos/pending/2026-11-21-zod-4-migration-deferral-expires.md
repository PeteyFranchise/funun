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
