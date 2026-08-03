---
phase: 16-gtm-beta-buyer-portal
plan: 00
subsystem: metadata
tags: [typescript, nextjs, jest, jsonb, sync-licensing, controlled-vocabulary]

# Dependency graph
requires: []
provides:
  - Controlled mood vocabulary (Mood/MOOD_LABELS/MOOD_VALUES/MOODS_MAX) in lib/metadata/schema.ts — the single shared term list for supply-side tagging and demand-side matching/filtering
  - EnergyLevel/VocalType types + label/value pairs, mirroring SoundIdentity.energy_level for direct comparability
  - TrackDescriptors JSONB shape + readDescriptors()/sanitizeDescriptors() helpers, following the composers/lyrics/performers/recording pattern
  - PATCH /api/vault/[projectId]/tracks/[trackId] descriptors allowlist entry
  - Metadata Studio Descriptors editor (mood chips, energy selector, vocal/instrumental toggle)
affects: [16-05-buyer-catalog-filters, antenna-matching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controlled-vocabulary JSONB field: type + LABELS record + VALUES array + read*()/sanitize*() pair, mirroring the PRO/COMPOSER_ROLE/PERFORMER_ROLE triplet already in lib/metadata/schema.ts"
    - "Client-side loose string storage for select-style fields (descriptorEnergy/descriptorVocal typed as string in StudioTrack, same as existing originalPurpose), narrowed only at the point of comparison/emit — server sanitize is the validation source of truth"

key-files:
  created:
    - lib/metadata/descriptors.test.ts
  modified:
    - lib/metadata/schema.ts
    - app/api/vault/[projectId]/tracks/[trackId]/route.ts
    - components/vault/MetadataStudio.tsx
    - app/(artist)/vault/[projectId]/metadata/page.tsx

key-decisions:
  - "No prior controlled mood vocabulary existed anywhere in the codebase — antenna_opportunities.mood_tags and SoundIdentity.mood_tags are free-form string[]. This plan's 40-term MOOD_VALUES list is the first controlled vocabulary; documented in a schema.ts comment for 16-05/Antenna to converge onto it rather than invent a second list."
  - "descriptorEnergy/descriptorVocal stored as plain `string` on StudioTrack (not the narrow EnergyLevel/VocalType union) to match the existing originalPurpose convention — avoids TS widening friction on the per-track map and keeps sanitizeDescriptors() as the single validation authority."
  - "No extracted reusable chip-picker component exists in the codebase (components/profile/ProfileForm.tsx implements the genre/role picker inline). DescriptorsEditor mirrors that inline chip-styling convention rather than inventing a new shared component, since there was nothing to import."

patterns-established:
  - "TrackDescriptors: { moods: Mood[]; energy?: EnergyLevel | null; vocal?: VocalType | null; updated_at?: string } — additive TrackMetadata field, absent means untagged"

requirements-completed: [META-01, META-02]

coverage:
  - id: D1
    description: "sanitizeDescriptors()/readDescriptors() enforce controlled vocabulary, dedup, MOODS_MAX truncation, and null-when-empty semantics"
    requirement: "META-01"
    verification:
      - kind: unit
        ref: "lib/metadata/descriptors.test.ts (15 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PATCH track route accepts a descriptors key, sanitizes it, merges into tracks.metadata via the existing JSONB merge, never spreads the request body"
    requirement: "META-01"
    verification:
      - kind: unit
        ref: "grep -Eq sanitizeDescriptors app/api/vault/[projectId]/tracks/[trackId]/route.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Metadata Studio Descriptors editor: mood chip picker (MOODS_MAX capped, visible counter, disabled state), energy 3-way selector, vocal/instrumental toggle; optional, does not gate saving or touch readiness scoring"
    requirement: "META-02"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit; npm run lint; grep -Eq MOOD_VALUES components/vault/MetadataStudio.tsx"
        status: pass
    human_judgment: true
    rationale: "Visual chip-cap enforcement, save/reload round-trip, and readiness-score stability in a live browser were not exercised — this plan shipped no preview/browser check. A human should click through the Descriptors section on a real project once before relying on it in the buyer-catalog-filter phase (16-05)."

# Metrics
duration: ~20min
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 00: Descriptor Vocabulary & Metadata Studio Tagging Summary

**Artist-authored mood/energy/vocal tagging on tracks.metadata JSONB, backed by a new 40-term controlled mood vocabulary shared with the demand side (antenna_opportunities/buyer catalog filters).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-03T04:35Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- First controlled mood vocabulary in the codebase (`Mood`/`MOOD_LABELS`/`MOOD_VALUES`, 40 terms spanning emotional tone and cinematic register), plus `EnergyLevel` (mirroring `SoundIdentity.energy_level`) and `VocalType`, all exported from `lib/metadata/schema.ts` as the single source both sides of the marketplace should read from.
- `readDescriptors()`/`sanitizeDescriptors()` mirror `readComposers()`/`sanitizeComposers()` exactly: free text and retired terms silently dropped, duplicates de-duped, `MOODS_MAX` (8) enforced, and fully-empty input collapses to `null` ("untagged") rather than an empty object.
- Track PATCH route (`app/api/vault/[projectId]/tracks/[trackId]/route.ts`) accepts `descriptors` through the same explicit-allowlist + sanitize + JSONB-merge pattern already used for composers/lyrics/performers/recording — no ownership-check changes, no request-body spreading.
- Metadata Studio gained a Descriptors section per track: mood chip picker (cap-enforced with a visible counter and disabled state at the cap), a three-way energy selector, and a vocal/instrumental toggle, placed next to the ISRC/ISWC/language row rather than inside rights/credits.
- Full Jest suite (97 suites / 1219 tests) green with zero regressions; `tsc --noEmit` and `npm run lint` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Descriptor vocabulary, types, and read/sanitize helpers** - `2bbe127` (feat, RED→GREEN internal to the commit: 15/15 tests written against the plan's behavior block, then implemented)
2. **Task 2: Persist descriptors through the track PATCH route** - `13e0b53` (feat)
3. **Task 3: Metadata Studio descriptors editor** - `c44fdc1` (feat, includes the page.tsx auto-fix below)

## Files Created/Modified

- `lib/metadata/schema.ts` - Mood/EnergyLevel/VocalType types, MOOD_LABELS/MOOD_VALUES/MOODS_MAX/ENERGY_LABELS/ENERGY_VALUES/VOCAL_LABELS/VOCAL_VALUES, TrackDescriptors type, readDescriptors()/sanitizeDescriptors(), TrackMetadata extended with `descriptors?`
- `lib/metadata/descriptors.test.ts` - 15 RED-first tests covering every behavior case in the plan (free text rejection, dedup, cap truncation, energy/vocal validation, null-when-empty, retired-term filtering on read)
- `app/api/vault/[projectId]/tracks/[trackId]/route.ts` - `descriptors` added to the metadata key allowlist, run through `sanitizeDescriptors` before merge
- `components/vault/MetadataStudio.tsx` - `DescriptorsEditor` component + `StudioTrack` fields (`descriptorMoods`/`descriptorEnergy`/`descriptorVocal`) + `saveTrack()` payload wiring
- `app/(artist)/vault/[projectId]/metadata/page.tsx` - (deviation, see below) `readDescriptors()` wired into `initialTracks` so previously-saved descriptors render on page load

## Decisions Made

- No existing mood constant list to extend (checked `lib/matching/antenna.ts`, `lib/matching/run.ts`, `lib/antenna/demo.ts`, `types/index.ts` — all free-form `string[]`); built a fresh 40-term vocabulary per the plan's guidance and documented it as the canonical list for 16-05/Antenna to converge onto.
- `descriptorEnergy`/`descriptorVocal` typed as plain `string` on `StudioTrack` (matching the existing `originalPurpose` convention) rather than the narrow `EnergyLevel | ''`/`VocalType | ''` union, to avoid TS widening friction in the per-track `.map()` and keep `sanitizeDescriptors()` as the single validation authority — the same pattern the codebase already uses for `originalPurpose`.
- No extracted, reusable chip-picker component exists anywhere in the app (`components/profile/ProfileForm.tsx`'s genre/role picker is inline JSX, not a component). `DescriptorsEditor` mirrors that inline chip-styling convention (`border-lav/50 bg-lav/20` selected state) rather than fabricating a new shared component to "reuse."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired `readDescriptors()` into the metadata page's `initialTracks` builder**
- **Found during:** Task 3 (Metadata Studio descriptors editor)
- **Issue:** `StudioTrack` gained three new required fields (`descriptorMoods`/`descriptorEnergy`/`descriptorVocal`). The server component at `app/(artist)/vault/[projectId]/metadata/page.tsx` (not in the plan's `files_modified`) builds `initialTracks` and did not supply them — `npx tsc --noEmit` failed with a hard type error, and functionally, previously-saved descriptors would never render on page load, violating the plan's own verification line ("a track saved with no descriptors reads back as untagged, not as an empty object" implies the read path must be wired).
- **Fix:** Imported `readDescriptors` from `lib/metadata/schema.ts` and added `descriptorMoods`/`descriptorEnergy`/`descriptorVocal` to the `initialTracks` map, using the same per-track `readDescriptors(t.metadata)` call already made for composers/lyrics/performers/recording.
- **Files modified:** `app/(artist)/vault/[projectId]/metadata/page.tsx`
- **Verification:** `npx tsc --noEmit` clean; full Jest suite green (97/97 suites, 1219/1219 tests).
- **Committed in:** `c44fdc1` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for both compilation and the plan's own round-trip requirement. No scope creep — reused the file's existing `read*()` wiring pattern verbatim.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `MOOD_VALUES`/`ENERGY_VALUES`/`VOCAL_VALUES` are ready for 16-05's buyer catalog filters and for Antenna matching to converge onto — both currently use uncontrolled `string[]` mood tags and should be revisited against this list in a later plan.
- Human UAT still outstanding (D3 in coverage): clicking through the Descriptors section on a real project — mood cap enforcement, save/reload round-trip, and confirming readiness scores are unchanged before/after — was not exercised in a live browser during this autonomous run.

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*
