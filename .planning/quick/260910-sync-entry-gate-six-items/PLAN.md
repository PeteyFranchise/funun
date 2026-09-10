---
quick_id: 260910-sync-entry-gate-six-items
created: 2026-09-10
type: quick
autonomous: true
files_modified:
  - lib/sync-library/readiness.ts
  - lib/deals/catalog.ts
---

# Sync entry gate: six specific items, not the aggregate score

## The decision (owner, 2026-09-09)

Read `.planning/deliberations/sync-catalogue-entry-and-samples.md` and
`.planning/phases/22-buyer-catalogue-light-ui/22-05-STATUS.md` first.

Entering the sync catalogue requires **six** readiness items:

`split_sheets`, `copyright`, `hire_right`, `audio_files`, `metadata`, `visual_asset`

It must **NOT** use `vault_readiness_score`. That aggregate was designed for releasing on
Spotify: 30 of its 100 points (`isrc_codes`, `distributor`, `pro_registration`,
`mlc_registration`) are release admin a sync buyer has no stake in. Under today's rule a
song with every signature signed and a finished master reads as unlicensable because
nobody picked a distributor.

## Established already — do not re-derive

1. **`SYNC_READINESS_KEYS`** (`lib/sync-library/readiness.ts`) already exists and is the
   right home. It currently holds eight keys and **disagrees with the decision in both
   directions**: it includes `isrc_codes` / `pro_registration` / `mlc_registration` (remove)
   and omits `visual_asset` (add).
2. **`isRightsReady()`** (`lib/deals/catalog.ts`) gates on
   `isAdmittedToSyncLibrary(project) && vault_readiness_score >= 60 && stage3.canContinue`.
   **The middle condition is what changes.** Keep the other two.
3. **It is the SINGLE rights authority**, six live call sites: `catalog-query.ts`,
   `shortlists.ts`, `selects/tracks-query.ts`, `selects/ai-draft.ts` (×2), plus
   `request-target.ts` / `metrics.ts` referencing it. Deliberate architecture — **never
   create a second rights definition.**
4. `catalog-query.ts` already selects `cover_art_url`, `tracks(... metadata ...)` and
   `vault_documents(id, type, status, track_id, document_data)` — five of six inputs are
   loaded. It does **not** select `tracks.audio_file_url`; check whether the `audio_files`
   item needs it and add it to `PROJECT_COLUMNS` if so.
5. `syncReadinessForTrack()` / `missingSyncItems()` exist and already drive the **staff**
   `pending_admit` / `needs_completion` label in `catalog-query.ts` ~line 320.
6. **Production impact is ZERO today** — an owner-run query returned **0** admitted
   `sync_listings`. Nothing changes state. That is precisely why this ships now.

## The work

- Update `SYNC_READINESS_KEYS` to the decided six.
- **Handle the fallout for `METADATA_FAMILY_KEYS` / `isSyncMetadataComplete()`**, which
  currently group `metadata + isrc_codes + pro_registration + mlc_registration`. Three of
  its four members are no longer required. Decide whether that grouping still makes sense,
  document the reasoning, and **do not silently break the staff label that depends on it.**
- Make `isRightsReady()` gate on the six items being complete instead of on the aggregate.
- **Note the consequence and state it:** `SYNC_READINESS_KEYS` also drives the staff
  `pending_admit` label, so that label moves with the gate. That is almost certainly
  correct — staff should see the same bar the catalogue enforces — but say so explicitly
  rather than letting it happen quietly.
- Signature change is your call. Prefer the smallest change that does not force every call
  site to fetch new data. If unavoidable, update all six and say so.
- `CATALOG_READINESS_THRESHOLD` becomes unused by `isRightsReady`. **Check its other
  callers** (`lib/deals/metrics.ts` references the threshold concept) and if it is now
  dead, **say so rather than removing it silently.**

## Tests

- Each of the six missing individually → gate FAILS. Six separate cases.
- All six present → gate PASSES.
- **THE NAMED TEST — the entire point of the change:** all six complete but a LOW aggregate
  score (e.g. 50, because no distributor and no ISRC) → **PASSES.**
- `isrc_codes`, `pro_registration`, `mlc_registration` and `distributor` do NOT affect the gate.
- **Drift guard:** `SYNC_READINESS_KEYS` contains exactly the decided six, so nobody re-adds
  the release-admin items.
- Mutation-test every assertion that carries the argument.

## Constraints

- Never `git add -A`. Stage only files you change, by explicit path. Another agent has ~27
  uncommitted Playbook files here — leave them alone. Do not touch `lib/playbook/`,
  `components/playbook/`, `app/api/admin/playbook/` or `supabase/migrations/`.
- **No migration and no schema change** is implied or permitted.
- **Do not change `rightsBadge()`** in `lib/sync-library/gate.ts` — guarded by
  `__tests__/buyer-rights-two-states.test.ts`; staff review needs its three states.
- Check for a dev server (`lsof -iTCP:3000 -sTCP:LISTEN -n -P`, `pgrep -fl "next dev"`)
  before building. If nothing is listening you MAY and SHOULD `npm run build` — but
  **redirect to a FILE, never pipe to head/grep.** A SIGPIPE truncated `.next` twice today
  and produced a fake build failure.
- `npx tsc --noEmit` and `npx jest` clean. **Do not push.**
