---
phase: 03-rights-guidance
plan: "02"
subsystem: rights-ui-layer
status: complete
commit: 344bed1
completed_date: "2026-06-28"
duration_seconds: 420
tags:
  - rights
  - ui
  - server-component
  - client-component
  - registration
dependencies:
  requires:
    - vault_projects.copyright_status column (03-01)
    - vault_projects.pro_registration_status column (03-01)
    - vault_projects.soundexchange_registered column (03-01)
    - PATCH /api/vault/[projectId]/rights route (03-01)
  provides:
    - /vault/[projectId]/rights server component page
    - RightsStatusPatch client component
    - SongtrustGuideCard display component
    - CopyrightFiling 3-state copyrightStatus prop
    - Rights & Registrations nav link in project readiness panel
  affects:
    - app/(artist)/vault/[projectId]/page.tsx
    - components/vault/CopyrightFiling.tsx
tech_stack:
  added: []
  patterns:
    - Server component data fetching with auth guard (createServerClient + auth.getUser)
    - assessRdrReadiness used server-side to derive SoundExchange eligibility
    - RightsStatusPatch generic PATCH + router.refresh pattern
    - 3-state badge rendering (not_filed/filed/registered)
key_files:
  created:
    - app/(artist)/vault/[projectId]/rights/page.tsx
    - components/vault/RightsStatusPatch.tsx
    - components/vault/SongtrustGuideCard.tsx
  modified:
    - components/vault/CopyrightFiling.tsx
    - app/(artist)/vault/[projectId]/page.tsx
decisions:
  - "Used redirect('/vault') for DEMO mode in rights page — DEMO store lacks rights columns"
  - "copyrightDocFiled legacy check preserved alongside copyrightStatus prop for backward compat with existing registrations/page.tsx usage"
  - "SoundExchange seStatus derived from rdr.coreCount === rdr.tracks.length, matching DDEX RDR-N core profile definition"
  - "SOCAN and Songtrust URLs marked [ASSUMED] with TODO comments — 03-03 checkpoint will verify"
metrics:
  duration_minutes: 7
  completed_date: "2026-06-28"
  tasks_completed: 3
  files_changed: 5
---

# Phase 03 Plan 02: Rights UI Layer Summary

Per-project Rights & Registrations page (RIGHTS-01 through RIGHTS-04, SONGTRUST-01) — server component with copyright guide, PRO guide, SoundExchange auto-readiness, and Songtrust card, plus a status-patch client component and a nav link from the project page.

## What Was Built

### RightsStatusPatch component (`components/vault/RightsStatusPatch.tsx`)
Generic `'use client'` component. Props: `projectId`, `field` (union of the three rights columns), `value` (string | boolean), `label`, `disabled?`. On click calls `PATCH /api/vault/${projectId}/rights` with the field/value pair, then calls `router.refresh()`. Shows "Saving…" in flight. Disabled when saving or the `disabled` prop is true. Styled with the indigo accent palette consistent with the rest of the vault UI.

### SongtrustGuideCard component (`components/vault/SongtrustGuideCard.tsx`)
Pure display component (no `'use client'`). Props: `cwrHref: string`. Renders an explanation of Songtrust (publishing admin, global royalty collection via CWR), a "Download CWR file →" link pointing to the passed `cwrHref`, and a "Learn about Songtrust →" external link. The Songtrust URL (`https://www.songtrust.com/`) is marked `[ASSUMED]` with a TODO comment pending the 03-03 checkpoint.

### CopyrightFiling extended (`components/vault/CopyrightFiling.tsx`)
Added optional `copyrightStatus?: 'not_filed' | 'filed' | 'registered'` prop.
- `'registered'`: shows emerald "Registered ✓" badge only — no action button.
- `'filed'` (or when the `filed` boolean is true from the vault_documents check): shows amber "Filed — awaiting certificate" badge plus a `RightsStatusPatch` button to transition to `'registered'`. The existing "Mark as filed" path (POST to /api/vault/[projectId]/documents) is unchanged.
- `undefined` / `'not_filed'`: existing behavior — eCO link and "Mark as filed" button.

### Rights page (`app/(artist)/vault/[projectId]/rights/page.tsx`)
Server component following the `readiness/page.tsx` pattern exactly. Auth guard: `createServerClient` + `auth.getUser` + redirect to `/signin`. DEMO guard: redirect to `/vault`.

Data fetched in three queries:
1. `vault_projects` — rights status columns, p_line, label, publisher
2. `tracks` — id, title, isrc, iswc, metadata, duration_seconds
3. `artist_profiles` — artist_name, pro, ipi, soundexchange_id

RDR readiness derived via `assessRdrReadiness` from `@/lib/metadata/rdr` with `readPerformers` parsing track metadata. SoundExchange status computed as `seStatus = soundexchange_registered ? 'registered' : seReady ? 'ready' : 'not_ready'` where `seReady = rdr.coreCount === rdr.tracks.length && tracks.length > 0`.

Four sections rendered:
1. **Copyright (RIGHTS-01)**: status badge + `<CopyrightFiling>` with 3-state prop
2. **PRO Registration (RIGHTS-02)**: status badge, artist PRO + IPI, ISWC count, ASCAP/BMI/SESAC/SOCAN links, `RightsStatusPatch`
3. **SoundExchange (RIGHTS-03)**: derived `seStatus` badge, missing-data breakdown when `not_ready`, `RightsStatusPatch`
4. **Songtrust (SONGTRUST-01)**: `<SongtrustGuideCard>` with `/vault/[projectId]/metadata/cwr` link

### Project page nav link (`app/(artist)/vault/[projectId]/page.tsx`)
Added third Link in the readiness panel after "Prepare release metadata":
`href=/vault/${project.id}/rights`, label "Rights & Registrations →", same `border-indigo-400/30 bg-indigo-400/10` styling as the two existing links.

## Verification

- `npm run build` — passes clean, zero TypeScript errors, zero new warnings
- `/vault/[projectId]/rights` appears in route manifest as `ƒ` (dynamic server route)
- All five requirements representable from the rights page

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- SOCAN URL (`https://www.socan.com/music-creators/`) is assumed from research — marked with `// TODO: verify SOCAN URL` in JSX. Plan 03-03 checkpoint will confirm.
- Songtrust URL (`https://www.songtrust.com/`) is assumed — marked with `// TODO: verify Songtrust URL` in SongtrustGuideCard.tsx. Plan 03-03 checkpoint will confirm.

Neither stub prevents the plan's functional goals — the URLs render correctly; correctness is verified in 03-03.

## Self-Check: PASSED

Files verified:
- `/Users/peterzora/Desktop/funun/app/(artist)/vault/[projectId]/rights/page.tsx` — exists
- `/Users/peterzora/Desktop/funun/components/vault/RightsStatusPatch.tsx` — exists
- `/Users/peterzora/Desktop/funun/components/vault/SongtrustGuideCard.tsx` — exists
- Commit `344bed1` — present in git log
