---
type: quick
slug: storage-cron-global-total
created: 2026-09-19
completed: 2026-09-19
branch: storage-cron-global-total
migration: none
status: complete
---

# Stop the storage job claiming things it cannot know — SUMMARY

The daily Storage job now measures one thing it can actually measure — total bytes in
Storage — and says nothing about who owns them.

## What was wrong

**It could not fire.** The route passed `THRESHOLDS.account_storage_gb.warning` (25 GB) as
the RPC's `p_min_bytes`, so migration 227's function returned rows only when a *single path
segment* exceeded 25 GB. Production total is 0.047 GB fragmented across many segments, so the
RPC returned zero rows every day and the route answered `{ status: 'healthy' }`. The sensor
several deferral decisions leaned on did not exist.

**And when it did fire it lied.** It treated `owner_segment` as an account and wrote "N
account(s) over the Storage warning threshold". Of 8 UUID segments in production, 2 are
accounts and 5 are work ids: work audio is deliberately written to `{workId}/{versionId}.ext`
(`lib/catalogue/audio-mime.ts:125-137`), playbook media to `{roomId}/...`, stream previews to
`{trackId}/...`. The old alert's "unattributed prefix" line was wrong in the same direction —
the only non-UUID prefix is `ideas/`, the one path *already* governed by server-issued upload
intents.

## What changed

`app/api/cron/storage-usage-check/route.ts`

- RPC floor is now `p_min_bytes: 0` — an inventory feed, not an owner detector.
- Every row sums into one global `totalBytes` / `objectCount`; `segmentCount` is `rows.length`.
- Classified against the new `storage_total_gb` band. Classification uses the exact ratio and
  the report uses the rounded figure, so display rounding cannot promote 4.999 GB into the band.
- `gb()` rounds to 2 decimals, not 1 — at 0.047 GB a one-decimal total renders "0 GB".
- **Silent below the band.** A daily email about 0.047 GB teaches the reader to skip the one
  that matters.
- Alert body and JSON carry no per-account claim, no "largest single footprint", no
  "unattributed". The segment count is described as *path segments*, with an explicit line
  saying a path segment is not a person.
- The `UsageRow` type no longer declares `owner_segment` or `is_uuid` — the columns exist in
  the RPC's result but nothing reads them, so nothing can leak them.
- The failure alert is kept and its "per-account" wording stripped. A check that cannot run
  must still say so; silence there is indistinguishable from healthy.
- The auth guard is untouched and still first.

`lib/observability/config.ts`

- `account_storage_gb` (warn 25 / crit 50) **retired** — removed from `ThresholdMetric` and
  `THRESHOLDS`, with a comment recording why. Nothing can compute it honestly, and a live
  threshold no code can compute truthfully is an invitation to compute it falsely again.
- `storage_total_gb` added: warning **5**, critical **20**, `provisional: true`. 5 GB is ~100x
  observed usage and is the reassessment trigger, not a quota.
- `classifyThreshold` is unchanged; both generic consumers (`daily-observability-check`,
  `lib/playbook/digest.ts`) iterate `Object.keys(THRESHOLDS)` and pick the swap up for free.
  `ThresholdsPanel`'s 7-row allowlist never included the storage band.

`.planning/todos/pending/2026-09-14-storage-upload-admission-bypass.md`

- The "STOPGAP SHIPPED" section no longer claims per-account totalling, and records the
  correction.

## What this deliberately is NOT

- **Not attribution repair.** Which bytes belong to whom is still unknown. That is migration
  228's work, and it is the same work this todo already tracks.
- **Not a quota.** Nothing is blocked, reclaimed or refused. Direct browser uploads still
  bypass `lib/security/upload-admission.ts`; the durable fix remains server-issued upload
  intents.
- **Not growth-rate detection.** Week-over-week growth needs somewhere to keep yesterday's
  number and no metrics-history table exists. Adding one is a human-gated migration, which
  this task deliberately avoids. A total band needs no history and fires at the named trigger;
  if the band proves insufficient, growth tracking is the follow-up.

This is a sensor correction. It makes one honest reading available where there were previously
two false ones.

## Tests

`__tests__/storage-usage-check-cron.test.ts` — 26 tests, rewritten from source-text assertions
to behavioural ones. The route is imported and invoked with `@/lib/supabase/server` and
`@/lib/observability/alerts` mocked, so the assertions are over what the route *did*, not over
what the file *says*.

Behavioural coverage:

- 401 on a wrong bearer token and on an unset `CRON_SECRET`, with the RPC never called.
- RPC called with `{ p_min_bytes: 0 }`, asserted explicitly not to equal the threshold-derived
  floor.
- Three rows summed into one total (3.5 GB / 35 objects / 3 segments) rather than the max taken.
- Below the band: healthy, no alert, no `alerted` flag.
- Twelve 0.5 GB segments — none near the old 25 GB per-segment floor — cross the band together
  and produce exactly one alert. This is the reading the old shape threw away.
- Critical band classification and subject.
- 4.999 GB stays healthy (rounding does not promote).
- **No per-account claim in the alert**: subject and body both asserted not to match
  `/account/i`, `/\bowner/i`, or per-user phrasing. This is the assertion that stops the
  falsehood returning.
- No "unattributed" framing even when a non-UUID `ideas` prefix is present.
- Body describes *path segments* and states they are not people.
- JSON response keys carry no `account|owner|unattributed|worst`.
- A failed RPC still alerts and 500s, and that alert is also account-free.

Source-text assertions kept only where source order is the property under test (guard above the
RPC call) or where the risk is interpolation (`${owner_segment}` never reaching an email).

Migration-227 SQL assertions kept unchanged — the function itself did not change.

### Proof the tests bite

Two mutations, both caught, output as observed:

**1. Threshold floor restored** (`p_min_bytes: Math.floor(THRESHOLDS.storage_total_gb.warning * GB)`):

```
● the storage usage cron route — inventory feed › calls the RPC with a zero floor, not a threshold-derived one
    - Expected
    + Received
      "storage_usage_over_threshold",
      Object {
    -   "p_min_bytes": 0,
    +   "p_min_bytes": 5368709120,
      },
Tests: 1 failed, 25 passed, 26 total
```

**2. Per-account claim reintroduced** (`<li><strong>${segmentCount}</strong> account(s) at or above the warning band.</li>`):

```
● the storage usage cron route — what it may not claim › makes no per-account claim anywhere in the alert
    expect(received).not.toMatch(expected)
    Expected pattern: not /account/i
    Received string: "... <li><strong>2</strong> account(s) at or above the warning band.</li> ..."
Tests: 1 failed, 25 passed, 26 total
```

Both reverted; suite green at 26/26.

## Verification gate

Every step of CI's `validate` job:

| Gate | Result |
|---|---|
| `npm run security:migrations:verify` | PASS — migrations 214–218 transactional, least-privilege, checksum-pinned |
| `npm run typecheck:strict` | PASS — clean, exit 0 |
| `npm run lint` (`--max-warnings=0`) | PASS — exit 0 |
| `npm test -- --runInBand` | PASS — 624 suites, 7607 tests |
| `npm audit --omit=dev --audit-level=moderate` | PASS — 0 vulnerabilities |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

`npm run build` deliberately not run (not part of CI `validate`, and unsafe under a live dev
server).

## Follow-ups

- **Attribution** (migration 228) is what makes a per-account band possible again. Until then
  `account_storage_gb` stays retired.
- **Growth rate** needs a metrics-history table — a human-gated migration, out of scope here.
- The `storage_total_gb` band is `provisional: true`. 5 GB is a reassessment trigger, not a
  validated limit; revisit once beta usage gives it a baseline.
