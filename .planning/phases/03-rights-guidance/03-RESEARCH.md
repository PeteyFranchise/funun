# Phase 03: Rights Guidance — Research

**Researched:** 2026-06-28
**Domain:** Per-project rights registration checklists, CWR export, SoundExchange readiness, status tracking schema
**Confidence:** HIGH

---

## Summary

Phase 3 surfaces guided registration checklists for copyright, PRO, SoundExchange, and Songtrust on a per-project page, with status indicators and the CWR export as the Songtrust handoff action. The heavy infrastructure is already built — `lib/metadata/cwr.ts`, `lib/metadata/registration.ts`, `lib/metadata/rdr.ts`, and `app/(artist)/vault/[projectId]/metadata/registrations/page.tsx` all exist and serve the data this phase needs to surface. The Rights Coach page at `/coach` already exists as a cross-project eligibility view and is already in the sidebar navigation.

The core work for Phase 3 is:
1. A new per-project rights status page at `/vault/[projectId]/rights` with copyright, PRO, and SoundExchange checklists.
2. A DB migration adding three status-tracking columns to `vault_projects`.
3. A PATCH API route to persist those status fields.
4. A Songtrust guide card on the rights page linking to the existing CWR export.

No new libraries are needed. All logic (RDR-N readiness, CWR readiness, registration packages) already exists and is importable.

**Primary recommendation:** Build `/vault/[projectId]/rights` as a new server page under the existing `[projectId]` route group, importing existing lib functions and adding three lightweight status columns to `vault_projects` via migration 024.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RIGHTS-01 | Step-by-step copyright registration guide with deep-link to copyright.gov eCO; per-project status (not filed / filed / registered) | `CopyrightFiling` component + `copyright_registration` doc pattern already exists; add `copyright_status` enum column to `vault_projects` for the 3-state indicator |
| RIGHTS-02 | PRO registration guide (ASCAP / BMI / SESAC / SOCAN) with deep-links; per-project ISWC proxy status | `lib/metadata/registration.ts` builds the PRO package; need `pro_registration_status` column; existing ISWC proxy on readiness score can drive it |
| RIGHTS-03 | SoundExchange guide with deep-link; status auto-shows "ready" when ISRC + performer credits present | `lib/metadata/rdr.ts` `assessRdrReadiness()` + `assessRdrTrack()` — "core" profile means ISRC + mainArtist + rightsOwner + at least one performer — exactly what the requirement means by "ISRC + performer credits" |
| RIGHTS-04 | All three checklists on the per-project Rights/Registrations page with visual completion indicators | New page at `/vault/[projectId]/rights` (server component); import existing lib modules |
| SONGTRUST-01 | Songtrust guide card explaining publishing admin value; CWR export as "send your data" action | CWR export route already live at `GET /api/vault/[projectId]/metadata/cwr`; CWR readiness page at `/vault/[projectId]/metadata/cwr`; Songtrust card links there |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-project rights status tracking | Database / Storage | API / Backend | Status values (copyright filed/registered, PRO status) are persisted state that survive page reloads |
| RDR-N / SoundExchange readiness check | API / Backend | Frontend Server (SSR) | Computed from track ISRC + metadata performers; pure function in `lib/metadata/rdr.ts`, runs server-side |
| PRO registration data package | API / Backend | Frontend Server (SSR) | `buildRegistrationPackages()` runs server-side from bundle data |
| CWR export download | API / Backend | — | Already exists as `GET /api/vault/[projectId]/metadata/cwr` |
| Rights page rendering | Frontend Server (SSR) | — | Server component fetches all data; passes status to client PATCH component |
| Status update (PATCH) | API / Backend | Browser / Client | Artist marks copyright as filed/registered; thin client component, API route persists |

---

## Codebase Findings

### Existing Infrastructure (do not rebuild)

**CWR export — fully implemented**
- API route: `app/api/vault/[projectId]/metadata/cwr/route.ts` — `GET` returns a `.V21` file download [VERIFIED: grep]
- UI page: `app/(artist)/vault/[projectId]/metadata/cwr/page.tsx` — readiness display + download button [VERIFIED: grep]
- Core lib: `lib/metadata/cwr.ts` — `buildCwrFile()`, `assessCwrReadiness()`, `cwrFilename()`, `defaultSelfSubmitSender()` [VERIFIED: grep]

**Registration packages — fully implemented**
- `lib/metadata/registration.ts` — `buildRegistrationPackages()` returns `RegistrationPackages` with `.works` (PRO/MLC), `.recordings` (SoundExchange), `.usProsPresent`, `.foreignProsPresent` [VERIFIED: grep]
- Existing registrations page at `/vault/[projectId]/metadata/registrations` already renders all three bodies (PRO, MLC, SoundExchange) with data pre-filled from metadata [VERIFIED: grep]

**RDR-N / SoundExchange readiness — fully implemented**
- `lib/metadata/rdr.ts` — `assessRdrReadiness()`, `assessRdrTrack()` [VERIFIED: grep]
- `RdrProfile`: `'none' | 'core' | 'recommended'`
- Core profile requires: `isrc`, `title`, `mainArtist`, `rightsOwner`, at least one `performer`
- Recommended adds: performer ISNI/IPN, featured performer marked, recording date, country, purpose, commercial availability flag
- Already used in `/vault/[projectId]/readiness/page.tsx` (line 138) and `/coach` page [VERIFIED: grep]

**Copyright filing UI — component exists**
- `components/vault/CopyrightFiling.tsx` — shows eCO link + "Mark as filed" button; writes a `copyright_registration` document via `POST /api/vault/[projectId]/documents` [VERIFIED: grep]
- Currently used only inside `/vault/[projectId]/metadata/registrations/page.tsx`
- Phase 3 reuses this component but adds a 3-state status indicator: `not_filed / filed / registered`

**PRO data on artist profile**
- `artist_profiles.pro` (TEXT) and `artist_profiles.ipi` (TEXT) added in migration 020 [VERIFIED: grep of migration 020_artist_profile_rights_fields.sql]
- `artist_profiles.soundexchange_id` also on the profile table [VERIFIED: same migration]

**Rights Coach (/coach) — already in nav, different purpose**
- `/coach` page (`app/(artist)/coach/page.tsx`) is a cross-project deal-eligibility view (direct sync / library deals) [VERIFIED: grep]
- Uses `RightsCoach` component from `components/coach/RightsCoach.tsx` [VERIFIED: grep]
- This is NOT the registration guide Phase 3 needs — it measures deal tier eligibility, not registration status
- Phase 3 needs per-project registration checklists; the `/coach` route stays as-is

**Existing metadata/registrations page vs. Phase 3**
- `/vault/[projectId]/metadata/registrations` already shows pre-filled registration data for PRO/MLC/SoundExchange but does NOT track per-project status, does NOT have checklist visual indicators, and does NOT include a Songtrust guide card
- Phase 3 creates `/vault/[projectId]/rights` as the canonical per-project registration guide page; the existing `/metadata/registrations` page stays for the "copy-paste into portal" data view

**Readiness score — copyright gate already exists**
- `calculate_vault_readiness()` SQL function (migration 008/016) awards 15 points when `vault_documents` has a `copyright_registration` type row — presence only, no `status` filter [VERIFIED: grep of migration 008]
- PRO proxy: 5 pts when any track has `iswc IS NOT NULL AND iswc <> ''` [VERIFIED: same migration]

---

## Schema Recommendation

Add three columns to `vault_projects` via migration 024. These track what the artist has done, separate from whether the data is ready.

```sql
-- Migration 024: Per-project rights registration status
-- copyright_status: artist self-reports their filing progress
-- pro_registration_status: artist self-reports PRO registration
-- soundexchange_status: derived from RDR-N data, but artist can override
ALTER TABLE vault_projects
  ADD COLUMN IF NOT EXISTS copyright_status
    TEXT DEFAULT 'not_filed'
    CHECK (copyright_status IN ('not_filed', 'filed', 'registered')),
  ADD COLUMN IF NOT EXISTS pro_registration_status
    TEXT DEFAULT 'not_registered'
    CHECK (pro_registration_status IN ('not_registered', 'registered')),
  ADD COLUMN IF NOT EXISTS soundexchange_registered
    BOOLEAN DEFAULT false;
```

**Design rationale:**
- `copyright_status` is a 3-state enum matching RIGHTS-01: `not_filed / filed / registered`. The existing `copyright_registration` document row (written by `CopyrightFiling`) maps to `filed`; `registered` requires the artist to manually confirm receipt of the registration certificate. These are different enough to warrant 3 states.
- `pro_registration_status` is binary for MVP — the artist joins a PRO once and stays registered. The existing ISWC proxy in the readiness score is work-readiness, not artist-registration status.
- `soundexchange_registered` is a boolean override. The page derives "ready to register" automatically from RDR-N data (via `assessRdrReadiness()`), but the artist should be able to mark themselves as already registered. Default false lets the auto-detection drive the "ready" indicator.
- No separate table needed for MVP — all three are project-level single values.
- No trigger changes needed — these fields do NOT feed into `vault_readiness_score` (that score is already tracking the data-readiness signals; registration status is a separate outcome).

**RLS:** `vault_projects` already has `USING (auth.uid() = user_id)` — no new policies needed.

---

## CWR Export Location

**Route:** `GET /api/vault/[projectId]/metadata/cwr/route.ts`
**Page:** `app/(artist)/vault/[projectId]/metadata/cwr/page.tsx`

**Data shape it consumes:** `ReleaseBundle` (built by `buildBundle()` from `lib/metadata/bundle.ts`) — requires `vault_projects` columns (`title`, `type`, `genre`, `release_date`, `upc`, `publisher`, `c_line`, `p_line`, `copyright_year`, `primary_language`, contact fields) plus `tracks` columns (`title`, `isrc`, `iswc`, `duration_seconds`, `language`, `featuring_artists`, `metadata`).

**Songtrust integration:** The Phase 3 Songtrust guide card links to the existing `/vault/[projectId]/metadata/cwr` page. No new route or logic is needed. The card explains Songtrust's publishing admin value and instructs the artist to download the CWR file from that page.

---

## RDR-N Check (SoundExchange Readiness)

The requirement says "status shows 'ready' when the project has RDR-N data (ISRC + performer credits present)."

**Exact check in code (`lib/metadata/rdr.ts`):**
- ISRC: `track.isrc !== null` — column directly on `tracks` table
- Performer credits: `readPerformers(track.metadata)` returns a non-empty array — stored in `tracks.metadata` JSONB under key `performers` (array of `{ name, role, contribution?, ipn?, isni? }`)

**"Core" profile = SoundExchange registration-ready:**
A track reaches `core` profile when all of these are non-null/non-empty:
1. `track.isrc` — column on `tracks`
2. `track.title` — column on `tracks`
3. `mainArtist` — derived from `artist_profiles.artist_name`
4. `rightsOwner` — derived from `vault_projects.p_line || vault_projects.label || artist_name`
5. `performers.length > 0` — from `tracks.metadata.performers`

The UI should show "Ready to register" when ALL tracks in the project have at least `core` profile, i.e., `rdr.coreCount === rdr.tracks.length && rdr.tracks.length > 0`.

The `soundexchange_registered` boolean column is the override for artists who have already registered.

**The auto-derived SoundExchange readiness status logic:**
```typescript
// In the rights page server component:
const isReady = rdr.coreCount === rdr.tracks.length && rdr.tracks.length > 0
const displayStatus =
  project.soundexchange_registered ? 'registered'
  : isReady ? 'ready'
  : 'not_ready'
```

---

## Page Architecture

### Recommended Route

**New page:** `app/(artist)/vault/[projectId]/rights/page.tsx`

This is a new folder under the existing `[projectId]` group, matching the exact pattern used by `documents/`, `metadata/`, `readiness/`, and `pitch/` (all server components at `app/(artist)/vault/[projectId]/[section]/page.tsx`).

**Do NOT** use a tab on the main project page — rights is enough content for a full page. The existing `readiness/` page is also a standalone page, not a tab.

**How the artist gets there:**
- Add a "Rights & Registrations" link on the main project page (`app/(artist)/vault/[projectId]/page.tsx`) alongside the existing "Complete the documentation" and "Prepare release metadata" links in the readiness panel (lines 228-236 of that page).

### Component Structure

```
app/(artist)/vault/[projectId]/rights/
└── page.tsx                          # Server component — fetches project + tracks + artist_profiles.pro

components/vault/
├── CopyrightFiling.tsx               # REUSE existing — add 3-state status prop
├── RightsStatusPatch.tsx             # NEW — client component for PATCH /api/vault/[projectId]/rights
└── SongtrastGuideCard.tsx            # NEW — static card with CWR link

app/api/vault/[projectId]/rights/
└── route.ts                          # NEW — PATCH to update copyright_status, pro_registration_status, soundexchange_registered
```

### Page Data Query

The rights page needs:
- `vault_projects`: `id, title, type, copyright_status, pro_registration_status, soundexchange_registered, p_line, label, publisher`
- `tracks`: `id, title, isrc, iswc, metadata`
- `artist_profiles`: `artist_name, pro, ipi, soundexchange_id`

### Server Component Logic

```typescript
// app/(artist)/vault/[projectId]/rights/page.tsx
import { assessRdrReadiness } from '@/lib/metadata/rdr'
import { readPerformers, readRecordingInfo } from '@/lib/metadata/schema'
import { buildBundle } from '@/lib/metadata/bundle'
import { buildRegistrationPackages } from '@/lib/metadata/registration'
import { assessCwrReadiness, defaultSelfSubmitSender } from '@/lib/metadata/cwr'

// 1. Fetch project + tracks + artist profile
// 2. Derive RDR readiness: assessRdrReadiness(rdrInputs)
// 3. Derive CWR readiness: assessCwrReadiness(bundle, sender)
// 4. Pass copyright_status, pro_registration_status, soundexchange_registered + derived values to sections
```

---

## Deep-Links (Confirmed from Existing Code)

The following URLs are used in existing codebase files:

| Body | URL | Source |
|------|-----|--------|
| copyright.gov eCO | `https://eco.copyright.gov` | `CopyrightFiling.tsx` line 54 [VERIFIED: grep] |
| ASCAP | `https://www.ascap.com/music-creators` | `registrations/page.tsx` line 180 [VERIFIED: grep] |
| BMI | `https://www.bmi.com/songwriters` | `registrations/page.tsx` line 181 [VERIFIED: grep] |
| SESAC | `https://www.sesac.com` | `registrations/page.tsx` line 182 [VERIFIED: grep] |
| SoundExchange | `https://www.soundexchange.com` | `registrations/page.tsx` line 230 [VERIFIED: grep] |

**SOCAN** — referenced in REQUIREMENTS.md RIGHTS-02 and ROADMAP.md but NOT present in the existing codebase. The registration type `SOCAN` is in `lib/metadata/schema.ts` `PRO_LABELS` as `'SOCAN (Canada)'` [VERIFIED: grep]. The deep-link URL to use: `[ASSUMED]` — based on training knowledge, the SOCAN membership page is at `https://www.socan.com/music-creators/` or `https://www.socan.com/join`. The planner should add a `checkpoint:human-verify` before hard-coding this URL in the plan.

**Songtrust** — no existing URL in codebase. Based on training knowledge: `https://www.songtrust.com/` [ASSUMED]. Planner should verify before committing.

**ASCAP join specifically** — the existing code links to `/music-creators` (the general music creators portal), not the join page. For Phase 3's "register with your PRO" guidance, the join page is more appropriate: [ASSUMED] `https://www.ascap.com/music-creators/join`. Planner should use the existing URL for consistency unless instructed otherwise.

---

## Standard Stack

No new packages required. Phase 3 uses exclusively existing project dependencies.

| Library | Version | Role |
|---------|---------|------|
| Next.js | 15.0.0 | Server components, API routes | 
| Supabase JS | 2.45.0 | DB reads/writes |
| TypeScript | 5.5.0 | Type safety |
| Tailwind CSS | 3.4.0 | Styling (match existing pattern) |

### Existing Lib Modules to Import (no new packages)

| Module | What to use |
|--------|-------------|
| `lib/metadata/rdr.ts` | `assessRdrReadiness()`, `assessRdrTrack()`, `RdrReadiness`, `RdrTrackInput` |
| `lib/metadata/registration.ts` | `buildRegistrationPackages()`, `RegistrationPackages` |
| `lib/metadata/cwr.ts` | `assessCwrReadiness()`, `defaultSelfSubmitSender()` |
| `lib/metadata/bundle.ts` | `buildBundle()`, `ProjectRow`, `TrackRow` |
| `lib/metadata/schema.ts` | `readPerformers()`, `readRecordingInfo()` |
| `lib/supabase/server.ts` | `createServerClient()`, `createApiClient()` |
| `components/vault/CopyrightFiling.tsx` | Reuse with extended props |

---

## Package Legitimacy Audit

No new packages. Audit not applicable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| SoundExchange readiness check | Custom ISRC + performer check | `assessRdrReadiness()` in `lib/metadata/rdr.ts` — already handles both Core and Recommended profiles |
| PRO data pre-fill | Custom writer PRO lookup | `buildRegistrationPackages()` in `lib/metadata/registration.ts` — already maps writers to PRO bodies |
| CWR file generation | CWR builder | `buildCwrFile()` / `assessCwrReadiness()` in `lib/metadata/cwr.ts` — complete CWR 2.1 implementation |
| Copyright filing button | Custom document creator | `CopyrightFiling` component — already POSTs to documents API |

---

## Architecture Patterns

### Server Component Pattern (Follow Exactly)

Every existing `[projectId]` sub-page is a server component:

```typescript
// Source: app/(artist)/vault/[projectId]/readiness/page.tsx (actual pattern)
export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default async function RightsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  // 1. Guard demo mode
  // 2. supabase.auth.getUser()
  // 3. SELECT project + tracks + artist profile
  // 4. notFound() if null
  // 5. Compute derived values (rdr, cwr readiness)
  // 6. Return JSX
}
```

### PATCH API Route Pattern

Follow `app/api/vault/[projectId]/route.ts` — use `createApiClient()`, validate input against allowlist:

```typescript
// app/api/vault/[projectId]/rights/route.ts
export async function PATCH(request: Request, { params }) {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const ALLOWED = ['copyright_status', 'pro_registration_status', 'soundexchange_registered']
  const update: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) update[key] = body[key]
  }

  const { error } = await supabase
    .from('vault_projects')
    .update(update)
    .eq('id', projectId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

### Client Status Update Pattern

Follow `CopyrightFiling.tsx` pattern — thin `'use client'` component, `useState` + `useRouter().refresh()`:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RightsStatusPatch({ projectId, field, value, children }: ...) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch(`/api/vault/${projectId}/rights`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setSaving(false)
    router.refresh()
  }
  // ...
}
```

### Recommended Project Structure for New Files

```
app/(artist)/vault/[projectId]/rights/
└── page.tsx                       # Server component

app/api/vault/[projectId]/rights/
└── route.ts                       # PATCH handler

components/vault/
├── RightsStatusPatch.tsx          # Generic PATCH-on-click client button
└── SongtrastGuideCard.tsx         # Static Songtrust explanation + CWR link

supabase/migrations/
└── 024_vault_project_rights_status.sql   # 3 new columns on vault_projects
```

---

## Anti-Patterns to Avoid

- **Don't add rights status to `vault_documents`:** Rights registration status (filed/registered) is a project-level attribute, not a document. The `copyright_registration` document type already handles the artifact; the new `copyright_status` column tracks what the artist has confirmed.
- **Don't modify `calculate_vault_readiness()`:** The vault readiness score is about data completeness, not registration actions. Adding registration status to the score would create confusing feedback loops and penalize artists who have completed metadata but haven't yet registered.
- **Don't redirect to `/metadata/registrations`:** The existing page is a data-entry helper (copy-paste into portal). Phase 3 needs a guidance page with checklist steps. These serve different user intents and should remain separate routes.
- **Don't add a new sidebar nav item:** The rights guidance is per-project, reached from the project page. A global sidebar link would be misleading since the content is project-specific.

---

## Common Pitfalls

### Pitfall 1: ISWC Proxy vs. PRO Registration Status
**What goes wrong:** ISWC presence on a track (the readiness score signal) is confused with whether the artist is registered with a PRO.
**Why it happens:** Both relate to PRO but measure different things: ISWC = the work has been registered (composition side); PRO affiliation = the artist belongs to a society.
**How to avoid:** The `pro_registration_status` column tracks whether the artist has joined a PRO (personal account). ISWC proxy on the score tracks whether work registration data is ready. Keep these visually separate on the rights page.

### Pitfall 2: SoundExchange "Ready" vs. "Registered"
**What goes wrong:** The page shows "ready" (data complete) when the artist is actually already registered — or shows "not ready" when they registered years ago before using Funūn.
**How to avoid:** Two indicators: (1) auto-derived from RDR-N readiness (`assessRdrReadiness()`) = "your data is ready to file"; (2) `soundexchange_registered` boolean = "I've already registered". Both can be true. Show them independently.

### Pitfall 3: Copyright Filing vs. Copyright Status
**What goes wrong:** Reusing the existing `CopyrightFiling` component as-is without adding the 3-state status from the new column.
**Why it happens:** `CopyrightFiling` currently only checks if a `copyright_registration` document exists (`filed` boolean). The new column adds `registered` as a third state.
**How to avoid:** Extend `CopyrightFiling` with a `copyrightStatus` prop (`'not_filed' | 'filed' | 'registered'`) in addition to the document-presence check. The component should accept the column value and allow transitioning `filed → registered` via a separate "Mark as registered" button that calls `PATCH /api/vault/[projectId]/rights`.

### Pitfall 4: Missing SOCAN deep-link
**What goes wrong:** SOCAN is listed in requirements but has no URL in the codebase. Hard-coding a guessed URL silently gives artists a broken link.
**How to avoid:** Mark SOCAN URL as `[ASSUMED]`, add a `checkpoint:human-verify` in the plan, and fall back to displaying the SOCAN name without a link if the URL is not confirmed.

### Pitfall 5: Type mismatch on new columns from Supabase client
**What goes wrong:** After running migration 024, TypeScript types from Supabase are stale — the new columns aren't in the generated types.
**Why it happens:** The `supabase` CLI generates types from the live schema; the repo doesn't auto-regenerate.
**How to avoid:** Use explicit type assertions `as unknown as ProjectWithRights` or add a local type extension until types are regenerated. Document this in the plan as a Wave 0 task.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SOCAN membership deep-link is `https://www.socan.com/music-creators/` or similar | Deep-Links | Artist sees broken link; low severity — SOCAN can be shown as text only |
| A2 | Songtrust website is at `https://www.songtrust.com/` | Deep-Links | Broken link in Songtrust card; low severity |
| A3 | ASCAP join page is `https://www.ascap.com/music-creators/join` (vs. the existing `/music-creators` in codebase) | Deep-Links | Uses general portal rather than join-specific page; cosmetic only |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 is code/config/migration only. No new external services, CLI tools, or runtimes required. CWR export (existing), Supabase (existing), and Next.js (existing) are already operational.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected in dependencies |
| Config file | None |
| Quick run command | `npm run build` (type-check) |
| Full suite command | `npm run build && npm run lint` |

No test framework is installed (`package.json` has no Jest, Vitest, or similar). Testing is manual + type-check per project convention.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RIGHTS-01 | Copyright status updates from `not_filed → filed → registered` | manual | `npm run build` (type safety) | N/A |
| RIGHTS-02 | PRO guide renders with ASCAP/BMI/SESAC/SOCAN links | manual | `npm run build` | N/A |
| RIGHTS-03 | SoundExchange shows "ready" when ISRC + performers present | manual | `npm run build` | N/A |
| RIGHTS-04 | All three checklists render on `/vault/[projectId]/rights` | manual | `npm run build` | N/A |
| SONGTRUST-01 | Songtrust card links to CWR export page | manual | `npm run build` | N/A |

### Wave 0 Gaps

- [ ] Supabase types regeneration after migration 024 — either run `npm run supabase gen types` or add local type extensions for the three new columns

---

## Security Domain

`security_enforcement` is enabled (config). ASVS Level 1 applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getUser()` in every API route handler (existing pattern) |
| V3 Session Management | yes | Cookie-based Supabase session (existing middleware) |
| V4 Access Control | yes | `.eq('user_id', user.id)` on all DB writes — enforce ownership on PATCH route |
| V5 Input Validation | yes | Allowlist on PATCH handler (`ALLOWED` array pattern, see above) |
| V6 Cryptography | no | No crypto operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on rights PATCH (artist A updates artist B's status) | Elevation of privilege | `.eq('user_id', user.id)` on UPDATE — same pattern as all other vault API routes |
| Unvalidated enum value on `copyright_status` PATCH | Tampering | Validate against allowlist `['not_filed', 'filed', 'registered']` before write; Supabase CHECK constraint as defense in depth |

---

## Implementation Risks

### Risk 1: `copyright_status` column vs. existing `copyright_registration` document
**Situation:** `CopyrightFiling.tsx` already writes a `copyright_registration` vault document (status `verified`) when the artist clicks "Mark as filed." The new `copyright_status` column is a separate source of truth.
**Resolution:** On the rights page, seed the initial display from the document count (existing behavior), but also show the column value. The "Mark as registered" action (new) writes only to the column. The "Mark as filed" action (existing) continues to write a document AND should also set `copyright_status = 'filed'` in the PATCH. This requires updating `CopyrightFiling.tsx` to also call the rights PATCH route, or accepting that `filed` state is inferred from document existence while `registered` is column-driven.
**Recommendation:** Keep the document-based `filed` detection as-is (avoids changing the existing component's behavior), and use the column only for the `registered` state. The rights page reads both: `copyrightFiled = documentCount > 0`, `copyrightRegistered = project.copyright_status === 'registered'`.

### Risk 2: Migration 023 may not be deployed yet (Phase 2 dependency)
**Situation:** ROADMAP.md shows Phase 2 (Document Lifecycle) as "Complete" as of 2026-06-28. Migration 023 adds `file_url` and `signed_by` to `vault_documents`. Phase 3 does not depend on these columns but must not conflict.
**Resolution:** Migration 024 targets `vault_projects` (different table). No conflict.

### Risk 3: Supabase TypeScript types are not auto-generated
**Situation:** The project does not have an auto-generation step for Supabase types. After running migration 024, TypeScript will not know about the three new columns.
**Resolution:** Add local type extensions in the `types/index.ts` file's `VaultProject` type, or cast with `as unknown as`. Document in Wave 0.

### Risk 4: No test framework means no automated regression testing
**Situation:** Adding a PATCH route with an enum constraint risks undetected typos.
**Resolution:** The CHECK constraint in migration 024 catches bad values at the DB level. TypeScript strict mode catches bad types at compile time. Manual smoke testing is the verification gate.

---

## Sources

### Primary (HIGH confidence)

- `lib/metadata/rdr.ts` — RDR-N assessment functions, exact field requirements
- `lib/metadata/registration.ts` — PRO/MLC/SoundExchange data shapes
- `lib/metadata/cwr.ts` — CWR export implementation
- `app/(artist)/vault/[projectId]/metadata/registrations/page.tsx` — existing registrations page (deep-links, data patterns)
- `components/vault/CopyrightFiling.tsx` — existing copyright component
- `supabase/migrations/001_initial_schema.sql` through `023_vault_documents_file_url.sql` — schema ground truth
- `types/index.ts` — VaultProject, Track, ArtistProfile types
- `lib/vault/readiness.ts` — readiness scoring logic

### Tertiary (LOW confidence)

- SOCAN URL (`https://www.socan.com/music-creators/`) — training knowledge, not verified this session [ASSUMED]
- Songtrust URL (`https://www.songtrust.com/`) — training knowledge, not verified this session [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Codebase findings: HIGH — all verified by grep/file read
- Schema recommendation: HIGH — follows established migration patterns
- Deep-links (ASCAP/BMI/SESAC/SoundExchange/eCO): HIGH — verified in existing code
- Deep-links (SOCAN/Songtrust): LOW — assumed from training knowledge
- Architecture: HIGH — follows exact existing file patterns

**Research date:** 2026-06-28
**Valid until:** 2026-07-28 (30 days — stable codebase, no fast-moving dependencies)
