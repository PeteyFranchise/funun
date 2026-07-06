---
phase: 14-playback-room-refinement
plan: "01"
subsystem: storage-foundation
tags: [migration, schema, npm, tdd, stems, instrumental]
status: complete
dependency_graph:
  requires: []
  provides:
    - "track-audio bucket accepts 250MB uploads and ZIP MIME types (D-07)"
    - "readStems() canonical reader for tracks.metadata.stems (D-03)"
    - "readInstrumental() canonical reader for tracks.metadata.instrumental (D-04)"
    - "archiver@8.0.0, @react-pdf/renderer@4.5.1, tus-js-client@4.3.1 installed (D-10)"
  affects:
    - "supabase/migrations/ — bucket config for Plans 03, 05"
    - "lib/metadata/schema.ts — Plans 03, 04, 05 consume new readers"
    - "package.json — downstream plans import archiver, @react-pdf/renderer, tus-js-client"
tech_stack:
  added:
    - archiver@8.0.0
    - "@react-pdf/renderer@4.5.1"
    - tus-js-client@4.3.1
    - "@types/archiver (devDep)"
    - jest + ts-jest (devDeps, TDD infrastructure)
  patterns:
    - "defensive-parse typed reader pattern (mirrors readMasterAudio)"
    - "idempotent on-conflict upsert migration (mirrors migration 004)"
    - "TDD RED→GREEN cycle for pure utility functions"
key_files:
  created:
    - supabase/migrations/041_track_audio_stems_config.sql
    - __tests__/schema-stems-instrumental.test.ts
    - jest.config.js
  modified:
    - lib/metadata/schema.ts
    - package.json
    - package-lock.json
decisions:
  - "readStems and readInstrumental mirror readMasterAudio's defensive-parse verbatim — same guard, same null-on-absent, same defaulting pattern — ensuring downstream plans have a single canonical API without inventing their own"
  - "Migration 041 is config-only — no RLS policy DDL — so it cannot break existing access-control behaviour while raising the bucket limits"
  - "supabase db push --dry-run deferred to human (no supabase/config.toml / linked project in this sandbox, per STATE.md Phase 8 blocker)"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-07-06"
  tasks_completed: 4
  files_changed: 6
---

# Phase 14 Plan 01: Storage & Type Foundation Summary

Storage + type foundation for Phase 14: `track-audio` bucket raised to 250MB with ZIP MIME types, canonical `readStems()`/`readInstrumental()` typed readers added to `lib/metadata/schema.ts`, and three new npm libraries installed at human-verified pinned versions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (checkpoint) | Confirm npm packages resolve to legitimate packages | — (human gate, no code) | — |
| 2 | Install archiver, @react-pdf/renderer, tus-js-client, @types/archiver | `4046002` | package.json, package-lock.json |
| 3 | Migration 041 — raise bucket size limit to 250MB and add ZIP MIME types | `ebcabe2` | supabase/migrations/041_track_audio_stems_config.sql |
| 4 (RED) | Failing tests for readStems() and readInstrumental() | `73f27cf` | __tests__/schema-stems-instrumental.test.ts, jest.config.js |
| 4 (GREEN) | Implement readStems() and readInstrumental() | `9487d1a` | lib/metadata/schema.ts |

## Key Artifacts

### Migration 041 — track-audio bucket config

File: `supabase/migrations/041_track_audio_stems_config.sql`

- `file_size_limit`: `262144000` (250 MB, D-07)
- `allowed_mime_types`: the existing nine audio types plus `application/zip` and `application/x-zip-compressed`
- Uses idempotent `on conflict (id) do update set file_size_limit = ..., allowed_mime_types = ...` — mirrors migration 004's exact statement shape; safe to re-run
- No `CREATE POLICY` / `DROP POLICY` statements — the four owner-path RLS policies from migration 004 are intact and untouched

### Reader function signatures (Plans 03, 04, 05 consume these)

```typescript
export type StemsFile = { path: string; size: number; name: string }
export function readStems(
  metadata: Record<string, unknown> | null | undefined
): StemsFile | null

export type InstrumentalFile = { path: string; size: number; ext: string }
export function readInstrumental(
  metadata: Record<string, unknown> | null | undefined
): InstrumentalFile | null
```

Both readers:
- Return `null` for `null`, `undefined`, `{}`, or a present sub-object with an empty/non-string `path`
- Default `size` to `0` when absent or not a number
- Default `name` to `'stems.zip'` / `ext` to `'mp3'` when absent or empty string
- Mirror `readMasterAudio()`'s defensive-parse pattern verbatim — same guard, same null semantics

### Installed packages

| Package | Version | Purpose |
|---------|---------|---------|
| archiver | 8.0.0 | Streaming ZIP assembly for Export Pack (Plan 04) |
| @react-pdf/renderer | 4.5.1 | Server-side PDF generation for Export Pack (Plan 04) |
| tus-js-client | 4.3.1 | Resumable direct-to-storage upload for 250MB stems (Plan 05) |
| @types/archiver | ^8.0.0 | TypeScript types for archiver (devDep) |

All three packages human-verified on npmjs.com on 2026-07-06 (archiver: archiverjs/node-archiver ~30M/wk; @react-pdf/renderer: diegomura/react-pdf ~4M/wk; tus-js-client: tus/tus-js-client ~1M/wk).

## Deviations from Plan

### Auto-added TDD Infrastructure

**Rule 2 — Missing critical infrastructure**
- **Found during:** Task 4 (tdd="true" task)
- **Issue:** No test framework existed in the project. TDD execution requires a working test runner.
- **Fix:** Installed `jest`, `@types/jest`, `ts-jest` as devDeps; created `jest.config.js` with ts-jest preset and `@/*` path alias support.
- **Files modified:** `package.json`, `jest.config.js` (new)
- **Commits:** `73f27cf` (RED), `9487d1a` (GREEN)

No other deviations — plan executed as written.

## TDD Gate Compliance

- RED gate: `73f27cf` — `test(14-01)` commit with 16 failing tests (all 16 failed: `readStems is not a function`, `readInstrumental is not a function`)
- GREEN gate: `9487d1a` — `feat(14-01)` commit — all 16 tests pass
- REFACTOR: not needed (implementation is minimal and clean on first pass)

## Verification Status

| Check | Status | Notes |
|-------|--------|-------|
| `node -e require(...)` prints `ok` | PASS | All three runtime packages resolve |
| Migration 041 grep (262144000, application/zip, application/x-zip-compressed, on conflict) | PASS | `grep` returns `PASS` |
| Migration 041 has zero RLS policy statements | PASS | `grep -ciE 'create polic\|drop polic'` returns 0 |
| schema.ts grep (readStems, readInstrumental, StemsFile, InstrumentalFile) | PASS | node verify prints `PASS` |
| TypeScript strict-mode check (`npx tsc --noEmit`) | PASS | No errors |
| `npx supabase db push --dry-run` for migration 041 | DEFERRED | No supabase/config.toml / linked project in sandbox (STATE.md Phase 8 blocker). Human must run against real project before Phase 14 deploys. |
| All 16 TDD tests pass | PASS | 16/16 green |

## Known Stubs

None — this plan adds no UI and no data-wiring. The readers return typed data from JSONB when it exists; downstream plans (03/04/05) will write the data they read.

## Threat Flags

No new network endpoints, auth paths, or schema changes beyond what the plan's threat model covers.

## Self-Check: PASSED

- [x] `supabase/migrations/041_track_audio_stems_config.sql` — found
- [x] `lib/metadata/schema.ts` — modified with readStems, readInstrumental, StemsFile, InstrumentalFile exports
- [x] `__tests__/schema-stems-instrumental.test.ts` — found
- [x] `jest.config.js` — found
- [x] Commits `4046002`, `ebcabe2`, `73f27cf`, `9487d1a` — all found in git log
