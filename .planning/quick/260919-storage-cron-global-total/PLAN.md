---
type: quick
slug: storage-cron-global-total
created: 2026-09-19
branch: storage-cron-global-total
migration: none
source: .planning/reviews/CODEX-RESPONSE-260919-what-is-worth-doing.md
---

# Stop the storage job claiming things it cannot know

## Two problems, one change

**1. The job is silent by construction.** It passes the 25 GB `account_storage_gb`
warning band as `p_min_bytes` (`app/api/cron/storage-usage-check/route.ts:40-45`), so the
RPC returns zero rows and the route reports healthy whenever no *single path segment*
exceeds 25 GB. Total production storage is 0.047 GB and bytes fragment across work ids, so
nothing aggregates. **It cannot fire.** Every deferral decision made this week assumes a
growth sensor that does not exist.

**2. It reports a falsehood when it does fire.** `owner_segment` is treated as an account
(`:59-64`), and the alert says "N account(s) over the Storage warning threshold". Verified
against production: of 8 UUID segments, **2 are accounts, 5 are work ids, 1 is unknown.**
Work-scoped paths deliberately begin with `{workId}` (`lib/catalogue/audio-mime.ts:125-137`),
playbook media with `{roomId}`, stream previews with `{trackId}`.

## The change

Use migration 227's function as an **inventory feed**, not an owner detector. No SQL, no
migration — the function already accepts any floor.

1. Call the RPC with **`p_min_bytes: 0`** and sum every row into one global byte total.
2. Add **`storage_total_gb`** to `lib/observability/config.ts` — warning **5**, critical
   **20**, `provisional: true`. 5 GB is ~100× current usage and is the reassessment trigger
   the review named.
3. Alert **only when the global total crosses the band.** Silent below it. A daily email
   about 0.047 GB trains the reader to ignore the one that matters.
4. **Delete every per-account claim from the alert and the JSON.** No "N accounts", no
   "largest single footprint" attributed to a person. Report the global total, the object
   count, and the number of distinct path segments — that last one described as
   *path segments*, never owners.
5. **Drop the `is_uuid` "unattributed" framing too.** It is also wrong: the `ideas/` prefix
   is the one path already governed by server-issued upload intents. Do not describe a
   non-UUID prefix as a problem.
6. **Retire `account_storage_gb`.** Nothing can honestly measure it until attribution is
   repaired. Remove it, or leave it with a comment saying it is unused and why —
   whichever keeps `classifyThreshold` and its tests coherent. Do not leave a live
   threshold that no code can compute truthfully.
7. **Keep the failure alert.** A check that cannot run must still say so — silence there
   would be indistinguishable from "healthy".

## What this deliberately is NOT

Not attribution repair (that is migration 228). Not a quota. Not a sweeper. Not growth-rate
detection — **week-over-week growth needs somewhere to keep yesterday's number, and no
metrics-history table exists**; adding one means a human-gated migration, which is out of
scope here. A total band needs no history and fires at the named trigger. If the band
proves insufficient, growth tracking is a follow-up.

## Tests

The existing suite is `__tests__/storage-usage-check-cron.test.ts`. Update it, and make the
new assertions behavioural rather than source-text where possible.

Required:
- The RPC is called with `p_min_bytes: 0` — **not** a threshold-derived floor.
- Rows below the band produce **no alert** and a healthy response.
- Crossing the band produces exactly one alert whose body contains the global total.
- **The alert body contains no per-account claim.** Assert the absence of "account" as a
  descriptor of a segment. This is the assertion that stops the falsehood coming back.
- The auth guard still runs first, and the existing ordering assertion still passes.
- A failed RPC still alerts.

**Prove they bite:** revert one assertion's subject (e.g. restore the threshold floor) and
confirm the suite fails. Report the actual output.

## Verification gate

Every step CI `validate` runs, per `.claude/CLAUDE.md`, including
`npm run lint` at `--max-warnings=0`.
