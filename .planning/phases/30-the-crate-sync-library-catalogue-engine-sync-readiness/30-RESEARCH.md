# Phase 30: The Crate + Sync Library — Catalogue Engine & Sync Readiness - Research

**Researched:** 2026-08-12
**Domain:** Internal extension of an existing Next.js 15 / Supabase catalogue, admission-gate, and readiness-scoring system (no new external services)
**Confidence:** HIGH (grounded directly in repo code — Phase 26/22/Wave-1 are shipped, live systems, not design docs)

## Summary

Phase 30 does not introduce a new domain — it deepens three systems that already exist and already
work: Phase 26's `sync_listings` admission state machine, Phase 22's `CatalogBrowserLight` buyer
surface, and Wave 1's `readinessItemsForProject()` scoring engine. All three are production code on
`main`, not prototypes. The research below is therefore almost entirely `[VERIFIED: codebase]` —
read directly from the shipped files — rather than external documentation, because this phase's job
is literally "extend these specific files without rebuilding them."

The most important finding is a **gap between the locked CONTEXT.md decision and the shipped Phase
26 code**: CONTEXT.md says "AE = browse & pull only; leadership = full curation" for the Sync
Library, but the live `POST /api/sync-library/admin/[listingId]` route currently grants **both**
`leadership` and `ae` the admit/reject curation action — only the separate `remove` route is
leadership-only. The planner must decide whether to tighten the existing admit/reject route to
`leadership`-only (matching the locked decision) or treat "browse & pull" as scoped to a *different*,
not-yet-built action (pulling into a Select, which is Phase 31's action, not this phase's).

The second major finding is that **there is no gate today** beyond a single human judgment call.
`POST /api/sync-library/submit` inserts a `sync_listings` row completely readiness-agnostic — it does
not check `vault_readiness_score`, `computeStage3()`, or any metadata completeness signal. The staff
`admit`/`reject` decision in `SyncLibraryAdmin.tsx` is manual and unstructured today. Phase 30's
"gate checks: rights clear / quality bar / metadata complete" is real, net-new logic — it should be
built as a pure predicate module (mirroring `lib/deals/catalog.ts`'s and
`lib/sync-library/submission.ts`'s established "pure, no I/O, accept an already-fetched shape"
convention) that composes signals already computed elsewhere: `readinessItemsForProject()` for
metadata, and `computeStage3()` for rights/legal-doc completeness — not a fourth parallel scoring
system.

**Primary recommendation:** Build Sync Readiness as a *filtered view* over the existing
`READINESS_ITEMS` registry (a `SYNC_READINESS_KEYS` allowlist, not a duplicate item list), add a
`sync_listings`-scoped worklist query that joins `sync_listings` (status = `pending_admit` or
earlier) against each track's `readinessItemsForProject()` output, and extend `CatalogRow` with an
optional `staff` field (never fork `CatalogBrowserLight`) gated by `requireStaff()` at the page/route
level exactly as `SyncLibraryAdmin.tsx` and `/admin/sync-library/page.tsx` already do.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inclusion gate (rights/quality/metadata check) | API / Backend (`app/api/sync-library/admin/[listingId]`) | Database (`sync_listings` state machine) | Decision logic must be server-authoritative; today's route already loads target server-side and writes via service role — gate logic slots into the same route before the admit branch |
| Sync Readiness scoring | API/Backend + Database | — | Pure derivation function (`lib/vault/readiness.ts` pattern) called server-side; no client-side scoring, mirrors `readinessItemsForProject()` exactly |
| Worklist queue (incomplete tracks) | API / Backend | Database (`sync_listings` + `vault_projects`/`tracks` join) | Read-heavy aggregation query, batched (no per-row queries) — same discipline as `loadCatalogPage` |
| Layered tagging (AI/artist/staff) | API / Backend (AI call) + Frontend Server (artist confirm UI) | Database (`tracks.metadata.descriptors` JSONB) | AI suggestion is a backend Anthropic call (like `brief-ai.ts`); artist confirm reuses existing MetadataStudio descriptor fields; staff refine is a new admin-only write path over the same JSONB shape |
| Role-aware Crate (staff layers) | Browser/Client (`CatalogBrowserLight`) + API/Backend (data enrichment) | — | Same component, additional server-computed fields passed as props only when `requireStaff()` passes; the client never independently decides staff visibility |
| Staff gate / access control | API / Backend (`lib/admin/gate.ts`) | — | Single existing authority (`requireStaff`) — no new gate module needed, only new role-set arguments per route |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Inclusion**
- Both, with a gate: artists submit (mark a Vault track for sync) AND staff curate tracks in; everything passes a **staff review gate** before it goes live.
- Incomplete ≠ rejected: incomplete tracks enter a completion pipeline, not a bin.

**The gate checks**
- Rights are clear → drives the rights badge (ready / partial / contact).
- Quality bar → audio quality + genuine sync fit.
- Metadata complete → tags, splits, ISRCs, etc.

**Sync Readiness (the completion pipeline)**
- A sync-specific readiness checklist — a *subset* of the existing Sound Vault readiness engine (Wave 1). **Reuse that engine; do not rebuild it.**
- The Funūn team guides the artist / artist team to close gaps (collaborative — not just kick-it-back).
- A worklist queue in Sync Library lists every incomplete track + exactly what's missing, worked down over time.

**Tagging (the mood/genre/energy/etc. behind filters, search, brief-matching)**
- Layered, all three: AI suggests (auto-listen), artist provides/confirms, staff curate/refine for consistency.

**Role-aware Crate (admin ↔ buyer split)**
- ONE catalogue surface (The Crate). Buyers see the clean storefront; team members see the same surface with staff-only layers (rights details, readiness status, artist notes, in-progress tracks).
- Sync Library = backstage management of that same catalogue.

**Access**
- Sync Library curation: leadership = full curation; AE = browse & pull only (into Selects). Two ability levels, one room.
- Staff-layered Crate view = team members; clean Crate = public/buyer.

### Claude's Discretion
(none explicitly separated from Decisions in 30-CONTEXT.md — the entire `<decisions>` block above is locked. Implementation mechanics — table/column names, exact query shape, exact UI layout — are left to planning/implementation.)

### Deferred Ideas (OUT OF SCOPE)
- AE workspace, Selects build/send, Client Partners rooms → **Phase 31**.
- Peripheral admin rooms (Green Room, etc.) → tabled (see review note).

</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs were provided to this research pass (none exist yet — 30-CONTEXT.md has no
registered REQUIREMENTS.md IDs; per the Phase 26/27 precedent, provisional IDs (likely a new
`CRATE-XX` or `SYNCREADY-XX` prefix, distinct from Phase 26's `SYNCLIB-XX` and Phase 23's `SYNC-XX`)
should be derived at plan time and registered via `/gsd-docs-update` before phase close.

| ID | Description | Research Support |
|----|-------------|------------------|
| (TBD at plan time) | Staff inclusion gate (rights/quality/metadata) | §"Don't Hand-Roll" + §"Architecture Patterns" Pattern 1 |
| (TBD at plan time) | Sync Readiness checklist (subset of Wave 1) | §"Architecture Patterns" Pattern 2 |
| (TBD at plan time) | Worklist queue | §"Architecture Patterns" Pattern 3 |
| (TBD at plan time) | Layered AI/artist/staff tagging | §"Architecture Patterns" Pattern 4 |
| (TBD at plan time) | Role-aware Crate staff layers | §"Architecture Patterns" Pattern 5 |
| (TBD at plan time) | Access model (leadership full, AE browse/pull) | §"Common Pitfalls" Pitfall 1 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Migrations are **owner-run** — never `supabase db push` from an agent. Every migration this phase
  needs must be drafted, text-tested, and explicitly called out as `[BLOCKING] human-gated schema
  push`, per the standing convention (`migration 096`'s own header is the canonical example).
- Buyer side is **light-themed** (`.fnbl` tokens in `components/buyer/fnbl-theme.ts`); admin "Team
  Console" is **dark** (`.fncon` CSS-variable tokens per `26-UI-SPEC.md`/`SyncLibraryAdmin.tsx`
  comments). Any staff-only layer rendered *inside* `CatalogBrowserLight` (a `.fnbl`-themed
  component) must therefore either (a) render in light theme even for staff, matching the
  surrounding Crate surface, or (b) the planner must explicitly decide how staff-layer chrome looks
  against a light background — this is an open design question, not a locked decision (see Open
  Questions).
- Naming: camelCase functions/variables, PascalCase types/components, `SCREAMING_SNAKE_CASE`
  constants, `_LABELS`/`_VALUES` suffix convention for enum-like registries (see
  `READINESS_ITEMS`/`MOOD_LABELS`/`MOOD_VALUES` precedent) — new tag/status vocab should follow this
  exactly.
- Absolute imports only (`@/lib/...`, `@/components/...`) — never relative `../` imports.
- Error handling: throw descriptive `Error` with user-facing messages; API routes return
  `NextResponse.json({ error }, { status })`, never throw uncaught.
- `lib/` modules stay pure where possible (no I/O) — every catalogue/readiness/eligibility module in
  this codebase (`lib/deals/catalog.ts`, `lib/sync-library/submission.ts`,
  `lib/sync-library/eligibility.ts`, `lib/vault/readiness.ts`) follows "accept an already-fetched
  shape, do the DB read in the route/page caller" — Phase 30's new gate/readiness/tagging modules
  MUST follow the same split for testability, per direct in-code convention comments.
- RLS doctrine (established since migration 031, reapplied through 096): tables staff write to are
  `REVOKE`d from `authenticated`/`anon`; all writes route through service-role API routes gated by
  `requireStaff()`. Any new table this phase adds (if any) must follow this exactly — see migration
  096's `sync_listings` RLS block as the template.
- Threat-ID convention: every migration/route in this codebase documents its threat model inline as
  `T-<phase>-<NN>` comments (STRIDE-labeled). Phase 30 work should continue this as `T-30-XX`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.52.0 `[VERIFIED: package.json]` | AI tagging (mood/genre/energy/instrument suggestion) | Already the project's only LLM integration; `lib/anthropic/index.ts` + `lib/buyer/brief-ai.ts` establish the exact prompt-for-JSON pattern to reuse |
| `@supabase/supabase-js` | 2.45.0 `[VERIFIED: package.json]` | All new queries (worklist, gate signals, staff layer enrichment) | Existing DB/auth client; no alternative in this codebase |
| Next.js | 15.0.0 `[VERIFIED: package.json]` | Server components + API routes for the gate/worklist/tagging routes | Existing framework; this phase adds routes/pages, not a new stack |

No new packages are required for this phase — every capability described in 30-CONTEXT.md
(readiness subset, worklist, layered tagging, role-aware UI, staff gate) is achievable by extending
existing modules with the existing stack. **Do not add a new AI SDK, queue library, or tagging
service** — that would violate "reuse, don't rebuild."

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 3.23.0 `[VERIFIED: package.json]` | Input validation for new gate-decision/tag-edit API routes | Every new POST route body (mirrors `SyncListingStatus`/`decision` inline-typed validation already used in `app/api/sync-library/admin/[listingId]/route.ts` — that route hand-rolls a `decision !== 'admit' && decision !== 'reject'` check rather than zod; either convention is acceptable in this codebase, follow whichever the file being edited already uses) | Any new request-body shape |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Filtering `READINESS_ITEMS` by an allowlist of keys | A new, separate `SYNC_READINESS_ITEMS` array duplicating item definitions | Explicitly forbidden by CONTEXT.md ("Reuse that engine; do not rebuild it") — duplicating item text/points would drift from Wave 1 the first time either changes, exactly the failure mode the split-sheet readiness convergence (Phase 17/18) already paid down once |
| A DB trigger computing a `sync_readiness_score` column | A pure TS derivation function called on read, like `readinessItemsForProject()` | Wave 1's own score IS a DB-trigger-computed column (`vault_readiness_score`) with a parallel TS twin for the breakdown UI — Phase 30 could mirror that if a stored, sortable score is needed for the worklist queue's ordering; if only a live breakdown view is needed, a pure function alone suffices. Planner should decide based on whether the worklist queue needs to `ORDER BY` a stored score across many rows (favors a stored column) or just render a live checklist per selected track (favors pure function only) |

**Installation:** none required — reuse only.

**Version verification:** `@anthropic-ai/sdk` `^0.52.0` and all other dependencies above were read
directly from the repo's `package.json` (`[VERIFIED: package.json]`), not queried against the npm
registry, since no new install is proposed.

## Package Legitimacy Audit

**Not applicable** — this phase installs no new external packages. Every capability is built by
extending existing, already-installed modules (`@anthropic-ai/sdk`, `@supabase/supabase-js`, `zod`,
Next.js). If a planner later decides a new package is genuinely needed (e.g., an audio-quality/BPM
analysis library for the "quality bar" check), that decision must re-run the Package Legitimacy Gate
protocol before it is added to a plan.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────────┐
                    │              vault_projects / tracks             │
                    │         (Wave 1 — the single song source)        │
                    └───────────────────────┬───────────────────────┬─┘
                                             │                       │
                     artist submits          │           readiness  │  metadata /
                     "+ Sync Library"        ▼                       ▼  descriptors
                    ┌─────────────────────────────────────┐   ┌──────────────────┐
                    │   sync_listings (Phase 26, per-song)  │   │ readinessItemsFor │
                    │   applied/invited → agreement_pending │   │ Project() (Wave1) │
                    │   → pending_admit → admitted/rejected │   └─────────┬────────┘
                    └───────────────┬───────────────────────┘             │
                                    │                                     │
                     staff admit/reject               NEW: gate composes  │
                     (POST /api/sync-library/admin/[id])◄─────────────────┘
                                    │              + computeStage3() (rights/docs)
                    ┌───────────────▼───────────────────────┐
                    │ NEW: gate decision                     │
                    │  rights clear / quality bar / metadata │
                    │  complete → route to:                  │
                    │   (a) admitted → live in Crate          │
                    │   (b) incomplete → NEW: Sync Readiness  │
                    │       worklist entry, NOT rejected      │
                    └──────┬───────────────────────┬─────────┘
                           │                        │
              admitted     │          incomplete    │  NEW: worklist queue
                           ▼                        ▼  (Sync Library backstage)
        ┌──────────────────────────────┐   ┌─────────────────────────────┐
        │ lib/deals/catalog-query.ts   │   │ Staff-facing "what's missing│
        │ loadCatalogPage() — the ONE   │   │ per track" list, staff      │
        │ query both surfaces below use │   │ guides artist to close gaps │
        └───────────┬───────────────────┘   └─────────────────────────────┘
                     │
     ┌───────────────┴────────────────────┐
     ▼                                     ▼
┌─────────────────────┐         ┌──────────────────────────────────┐
│ The Crate (buyer)    │         │ The Crate + staff layers (team)   │
│ CatalogBrowserLight   │◄────────│ SAME component, extra `staff`     │
│ isPublic / embedded   │  same   │ prop (rights detail, readiness,   │
│ (existing)            │  comp.  │ notes, in-progress) gated by      │
│                       │         │ requireStaff() server-side        │
└──────────────────────┘         └──────────────────────────────────┘
```

### Recommended Project Structure
```
lib/sync-library/
├── eligibility.ts          # existing — capability grant predicate, unchanged
├── submission.ts           # existing — status state machine, unchanged
├── gate.ts                 # NEW — pure inclusion-gate predicate (rights/quality/metadata)
├── readiness.ts            # NEW — SYNC_READINESS_KEYS filter over READINESS_ITEMS + score fn
└── worklist.ts             # NEW — pure shaping of a worklist row from readiness + listing data

lib/tagging/                # NEW directory (or lib/metadata/ extension — planner decides)
├── ai-tag.ts                # NEW — Anthropic call, mirrors lib/buyer/brief-ai.ts pattern exactly
└── tag-merge.ts             # NEW — pure merge of AI-suggested + artist-confirmed + staff-refined tags

app/api/sync-library/
├── admin/[listingId]/route.ts     # existing — extend with gate-aware admit branch
├── worklist/route.ts              # NEW — GET, staff-gated, returns incomplete-track rows
└── tag-suggest/route.ts           # NEW — POST, AI tag suggestion for a track (staff or artist trigger)

components/admin/
├── SyncLibraryAdmin.tsx    # existing — extend curation queue with gate signals + worklist tab
└── SyncReadinessWorklist.tsx  # NEW — mirrors readiness/page.tsx's GateRow pattern, staff-facing

components/buyer/
└── CatalogBrowserLight.tsx  # existing — extend CatalogRow with optional `staff?: StaffLayer` field
```

### Pattern 1: Inclusion gate as a pure predicate composing existing signals
**What:** A `lib/sync-library/gate.ts` module exporting a pure function that takes an
already-computed `Stage3Result` (rights), a `readinessItemsForProject()` output filtered to the sync
subset (metadata), and a to-be-defined quality signal, and returns a structured verdict — never a
bare boolean — so the admit route can distinguish "clear to admit" from "route to Sync Readiness
worklist."
**When to use:** In `POST /api/sync-library/admin/[listingId]`, before the existing
`isValidTransition()` check, to decide whether `admit` is actually legal given the song's readiness,
or whether the UI should instead only offer "keep in worklist."
**Example:**
```typescript
// Source: pattern lifted directly from lib/deals/catalog.ts's isRightsReady (existing, shipped)
export type GateSignal = { rightsClear: boolean; qualityOk: boolean; metadataComplete: boolean }

export function evaluateInclusionGate(signal: GateSignal): 'admit_eligible' | 'needs_completion' {
  if (signal.rightsClear && signal.qualityOk && signal.metadataComplete) return 'admit_eligible'
  return 'needs_completion' // NOT 'rejected' — CONTEXT.md: incomplete ≠ rejected
}
```

### Pattern 2: Sync Readiness as a filtered view of `READINESS_ITEMS`
**What:** A `SYNC_READINESS_KEYS` constant (a subset of the existing `READINESS_ITEMS` keys) and a
thin wrapper that calls the existing `readinessItemsForProject()` and filters its output — never a
parallel item registry.
**When to use:** Anywhere the worklist or gate needs "what's missing for sync," instead of the
release-oriented full Wave 1 checklist.
**Example:**
```typescript
// Source: lib/vault/readiness.ts (existing) — types/index.ts READINESS_ITEMS (existing)
import { READINESS_ITEMS } from '@/types'
import { readinessItemsForProject } from '@/lib/vault/readiness'

// Sync-relevant subset — release-only items (visual_asset, distributor, epk,
// caption_copy, tiktok_strategy) are deliberately excluded; a licensed track
// does not need a distributor or a TikTok strategy to be sync-ready.
export const SYNC_READINESS_KEYS = [
  'audio_files', 'split_sheets', 'copyright', 'isrc_codes',
  'pro_registration', 'mlc_registration', 'hire_right', 'metadata',
] as const

export function syncReadinessItemsForProject(input: Parameters<typeof readinessItemsForProject>[0]) {
  return readinessItemsForProject(input).filter(i => SYNC_READINESS_KEYS.includes(i.key as any))
}
```
Note: `READINESS_ITEMS` operates at project granularity; `sync_listings` is **song (track)
granularity** (per Phase 26's explicit SONG-LEVEL decision — see migration 096's header comment).
The planner must resolve this granularity mismatch — see Open Questions §1.

### Pattern 3: Worklist queue as a batched join, not per-row queries
**What:** A single query joining `sync_listings` (status not yet `admitted`/terminal) against
`vault_projects`/`tracks`, batching readiness computation the same way `loadCatalogPage` batches
`sync_listings`/`user_profiles`/`project_license_terms` lookups (never N+1).
**When to use:** The Sync Library worklist tab/page.
**Example:**
```typescript
// Source: pattern lifted from lib/deals/catalog-query.ts's loadCatalogPage (existing, shipped) —
// same "ONE batched query scoped to this page's ids" discipline (T-16-21 precedent)
const { data: listings } = await service
  .from('sync_listings')
  .select('id, status, track_id, vault_project_id, artist_user_id, applied_at')
  .in('status', ['applied', 'invited', 'agreement_pending', 'pending_admit'])
  .order('applied_at', { ascending: true })
// then ONE batched tracks/vault_projects fetch by the collected ids (mirrors
// AdminSyncLibraryPage's existing trackTitleById/projectTitleById map pattern)
```

### Pattern 4: Layered tagging — AI suggests, artist confirms, staff refines, one JSONB shape
**What:** Extend `tracks.metadata.descriptors` (already artist-authored: `moods`, `energy`, `vocal`
per `lib/metadata/schema.ts`) with a parallel `ai_suggested` sub-object rather than overwriting the
confirmed value — the existing `TrackDescriptors` type is explicitly documented as "artist-set —
never inferred," so AI output must NOT silently populate the same field the artist controls.
**When to use:** AI tagging feature (mood/genre/energy/instrument auto-suggestion).
**Example:**
```typescript
// Source: pattern lifted from lib/buyer/brief-ai.ts's draftBriefFromProse (existing, shipped) —
// identical prompt-for-JSON + tolerant-extract convention
import Anthropic from '@anthropic-ai/sdk'
function extractJson(text: string): Record<string, unknown> | null { /* identical to brief-ai.ts */ }

export async function suggestTrackTags(trackTitle: string, lyricsOrNotes: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false as const, error: 'Tagging assistant is offline right now.' }
  const anthropic = new Anthropic({ apiKey })
  // buildPrompt() constrains output to MOOD_VALUES/ENERGY_VALUES/VOCAL_VALUES/GENRES — the SAME
  // controlled vocab lib/metadata/schema.ts and lib/genres.ts already define, so AI suggestions are
  // never off-vocabulary and slot directly into the existing descriptors shape.
}
```
Staff refine is a third write path (admin-only route) over the same `descriptors` shape — needs a
`source: 'ai' | 'artist' | 'staff'` provenance marker per tag so the UI can show "AI-suggested,
unconfirmed" vs "artist-confirmed" vs "staff-adjusted" distinctly (none of this provenance tracking
exists today — `descriptors` is currently a flat, unattributed value).

### Pattern 5: Role-aware Crate via an optional prop, never a forked component
**What:** Extend `CatalogRow` (in `components/buyer/CatalogBrowserLight.tsx`) with an optional
`staff?: { rightsDetail: string; readinessStatus: string; artistNotes: string; inProgress: boolean }`
field, and the top-level `CatalogBrowserLight({ rows, isPublic, embedded })` props with a new
`staffMode?: 'leadership' | 'ae' | null`. The component conditionally renders staff-only sections
(e.g. an extra info panel per row) only when `staffMode` is non-null — the buyer-facing render path
is completely unchanged when `staffMode` is absent.
**When to use:** The single "team view" of the Crate.
**Example:**
```typescript
// Source: pattern extends components/buyer/CatalogBrowserLight.tsx's existing CatalogRow type
export type CatalogRow = {
  // ...all existing fields unchanged...
  staff?: {
    readinessStatus: 'admitted' | 'pending_admit' | 'needs_completion'
    rightsDetail: string
    artistNotes: string | null
    inProgress: boolean
  }
}
```
The server page (`app/sync/catalog/page.tsx` today, or a new `app/(admin)/admin/crate/page.tsx` — see
Open Questions §3) resolves `staffMode` via `getStaffRole(user)` exactly as
`AdminSyncLibraryPage` already does, and only fetches/attaches the `staff` field when a role is
present — never trusting a client-supplied flag.

### Anti-Patterns to Avoid
- **A second catalogue query module:** Do not write a new `loadCrateStaffPage()` parallel to
  `loadCatalogPage()`. Extend `loadCatalogPage()` (or a thin wrapper around it) so admission logic
  never drifts between the buyer and staff views — this is the exact T-26-24 discipline
  (`isAdmittedToSyncLibrary` as the single admission authority) the codebase already enforces twice.
- **A parallel readiness score:** Do not add a `sync_readiness_score` DB column computed by a
  separate trigger with independently-hand-copied logic. If a stored/sortable score is needed, derive
  it via the SAME `SYNC_READINESS_KEYS` filter, ideally sharing a fixture-tested TS/SQL pair the way
  Phase 18's coverage tier did (`lib/vault/readiness-coverage.ts` + migration 065's SQL trigger,
  "both asserted against lib/vault/coverage-fixtures.ts").
- **Overwriting artist-confirmed descriptors with AI output:** `TrackDescriptors` is explicitly
  documented as artist-authored, never inferred. AI suggestions must land in a distinct field/state
  (`suggested`, not `confirmed`) until an artist or staff member accepts them.
- **A client-trusted staff flag:** Never accept `isStaff`/`staffMode` as client input to a route that
  returns staff-only fields — always resolve via `requireStaff()`/`getStaffRole()` server-side, per
  every existing admin route in this codebase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Sync-specific readiness checklist | A new items array + new scoring function | `readinessItemsForProject()` filtered by a `SYNC_READINESS_KEYS` allowlist | CONTEXT.md explicitly locks this: "Reuse that engine; do not rebuild it." A duplicate registry drifts the first time a Wave 1 item's points/description changes (this exact failure mode is why Phase 17/18 had to run a "convergence phase" to reconcile three drifted split-sheet systems) |
| Rights-clear signal | A new rights-document scanner | `computeStage3()` (`lib/vault/stage3.ts`) — already checks split_sheet/hire_right/copyright_registration/sample_clearance completeness | Already the shipped legal-doc gate feeding `isRightsReady`; re-deriving it risks a second, drifted rights definition |
| Catalogue admission authority | A new `isCrateEligible()` or similar | `isAdmittedToSyncLibrary()` (`lib/deals/catalog.ts`) | T-26-24 already establishes this as the SINGLE admission authority both `loadCatalogPage` and `authorizeRequestTarget` call — a third caller must reuse it, not reimplement |
| AI JSON extraction from an LLM response | A new regex/parsing helper | The `extractJson()` pattern in `lib/buyer/brief-ai.ts` (fenced-code-block strip → find `{`/`}` → `JSON.parse`, `null` on failure) | Already proven against real Anthropic responses in production; re-deriving risks missing an edge case (e.g. markdown fencing) already handled |
| Staff-role authorization | A new `isStaffMember()`/role check | `requireStaff(allowed: StaffRole[])` (`lib/admin/gate.ts`) | The single authority for every `/api/admin/*` and staff route in the codebase (D-01, Phase 25) — every new staff route in this phase must call it first, before any DB read |
| Filter vocabulary for mood/genre/energy/vocal | A new tag taxonomy for AI-suggested tags | `MOOD_VALUES`/`ENERGY_VALUES`/`VOCAL_VALUES`/`GENRES` (`lib/metadata/schema.ts`, `lib/genres.ts`) | Already the controlled vocabulary the buyer catalogue filters against (`CatalogBrowserLight`'s `FILTER_OPTIONS`); AI-suggested tags outside this vocab would be filter-invisible |

**Key insight:** Every "don't hand-roll" item above is not a generic library recommendation — it is
a **specific, already-shipped function in this exact repo** that a naive implementation could
accidentally duplicate. The single highest-risk failure mode for this phase is silent architectural
drift: a second definition of "readiness," "rights-ready," or "admitted" that looks equivalent today
and diverges the next time either is edited. The plan-checker should specifically verify no new
parallel implementation of these five functions exists.

## Common Pitfalls

### Pitfall 1: Access-model mismatch between CONTEXT.md and shipped Phase 26 code
**What goes wrong:** CONTEXT.md locks "AE = browse & pull only; leadership = full curation" for Sync
Library. The live route `app/api/sync-library/admin/[listingId]/route.ts` currently calls
`requireStaff(['leadership', 'ae'])` — AE can admit/reject today, which is full curation, not
"browse & pull only."
**Why it happens:** Phase 26 was planned/shipped (2026-08-08) before the Phase 30 access-model review
session (2026-08-12) tightened the intended AE scope. The code predates the decision.
**How to avoid:** The planner must explicitly decide: (a) tighten the existing admit/reject route to
`requireStaff(['leadership'])` only, reconciling code with the locked decision, or (b) treat "AE
browse & pull" as referring to a distinct, not-yet-built action (pulling a track into a Select —
which per CONTEXT.md's own deferred-ideas list belongs to **Phase 31**, not this phase), leaving the
existing admit/reject route's AE access unchanged. This is a real product decision, not an
implementation detail — flag it for `/gsd-discuss-phase` or explicit owner confirmation before
planning locks it either way.
**Warning signs:** If a plan touches `app/api/sync-library/admin/[listingId]/route.ts`'s
`requireStaff()` call without addressing this explicitly, the mismatch will ship unresolved.

### Pitfall 2: Song-level (`sync_listings`) vs project-level (`READINESS_ITEMS`) granularity mismatch
**What goes wrong:** Phase 26 deliberately made `sync_listings` **song/track-level**
("SONG-LEVEL per 26-CONTEXT.md... a buyer licenses one song at a time" — migration 096 header). Wave
1's `readinessItemsForProject()` operates on a **project** (which may have many tracks) and several of
its items (`split_sheets`, `isrc_codes`, `metadata`, `pro_registration`) are already
per-track-aggregated internally (`withComposers === tracks.length`, etc.) but return one status for
the whole project. A Sync Readiness worklist entry for a single incomplete *song* cannot correctly
show "what's missing" if the underlying readiness function only reports at project granularity — a
5-track album with 1 incomplete track and 4 complete tracks reads as "warning" project-wide, not
"this specific song is missing X."
**Why it happens:** The two systems were designed for different units of work (Wave 1 = "is this
release ready to submit to distribution," Phase 26 = "is this specific song ready to license").
**How to avoid:** The Sync Readiness subset likely needs a **per-track** derivation, not a
pass-through of the project-level function. Some `READINESS_ITEMS` checks are trivially
per-track-derivable from the existing per-track loop internals (`audio_files` per track = has audio;
`isrc_codes` per track = has ISRC; `metadata` per track = `composersComplete(track.metadata)`); others
(`copyright`, `pro_registration` as currently coded) are inherently project/document-level and may
need to stay project-scoped even in the sync subset. The planner should design the sync worklist
function to accept a single track + its project's shared documents, and derive per-track status
directly rather than trying to slice the existing project-level `ReadinessItem[]` output after the
fact. Phase 18's precedent (`coverageTier()` in `lib/vault/readiness-coverage.ts`, built specifically
because Phase 17/18 hit this exact "project-level item, track-level reality" mismatch for split
sheets) is the closest existing model to follow.
**Warning signs:** A worklist row that says "missing metadata" for a track whose own composer splits
are actually complete, because the underlying check only looked at project-wide aggregate completion.

### Pitfall 3: Three semi-overlapping "readiness"-like signals already exist
**What goes wrong:** The catalogue's `isRightsReady()` gate (`lib/deals/catalog.ts`) already combines
TWO signals — `vault_readiness_score >= 60` (Wave 1's headline score) AND `computeStage3().canContinue`
(the 5-required-document legal gate). Phase 30 proposes a THIRD, "Sync Readiness" — if this isn't
explicitly reconciled with the other two, the catalogue could end up with three different, possibly
disagreeing definitions of "ready."
**Why it happens:** Each was added by a different phase (Wave 1's score, Stage 3's doc gate in an
earlier vault phase, and now Phase 30's sync-specific subset) solving a locally-scoped problem without
a unifying pass.
**How to avoid:** Treat Sync Readiness as the thing that FEEDS `isRightsReady()`'s inputs, not a
fourth independent gate. Specifically: the inclusion gate's "rights clear" signal should reuse
`computeStage3()`; the "metadata complete" signal should reuse the `SYNC_READINESS_KEYS` filter over
`readinessItemsForProject()`; "quality bar" (audio quality + genuine sync fit) appears to be the only
genuinely NEW signal with no existing equivalent in the codebase (see Open Questions §2).
**Warning signs:** A track shows as `admitted` in `sync_listings` but the worklist independently
flags it as incomplete, or vice versa — two systems disagreeing about the same track's status.

### Pitfall 4: `.fnbl` (light) vs `.fncon` (dark) theme collision if staff layers render inside CatalogBrowserLight
**What goes wrong:** `CatalogBrowserLight` is scoped entirely under the `.fnbl` (light) token system
(`components/buyer/fnbl-theme.ts`). The admin Team Console (including `SyncLibraryAdmin.tsx`) uses the
dark `.fncon` token system. If staff-only sections are rendered directly inside
`CatalogBrowserLight`'s existing markup using `.fncon`-style CSS variables, they will not resolve
(those variables are declared under a different theme scope) and will silently fall back to browser
defaults or transparent/invisible styling.
**Why it happens:** CSS custom properties are scoped by class/attribute selector
(`.fnbl{...}`/`.fnbl[data-theme="dark"]{...}` vs presumably a separate `.fncon{...}` block elsewhere)
— a component rendered inside `.fnbl` cannot reach `.fncon`-scoped variables unless the staff layer
explicitly re-declares or bridges the palette.
**Why it matters here:** CONTEXT.md's "ONE catalogue surface... team members see the same surface
with staff-only layers" strongly implies staff view The Crate in ITS light theme (matching the buyer
surface, not the dark Team Console) — but this is not explicitly stated and should be confirmed (see
Open Questions §3 — whether the staff Crate view is reachable from `/admin/*` at all, or only from a
buyer-shaped surface staff happen to have access to).
**How to avoid:** Design staff-layer chrome to use `.fnbl`'s own CSS variables (light-theme-native),
not `.fncon`'s, unless the staff Crate view is deliberately a *separate* dark-themed admin page that
happens to reuse `CatalogBrowserLight`'s row-rendering logic via a shared sub-component.

## Runtime State Inventory

**Not applicable** — this phase is not a rename/refactor/migration phase. It extends existing tables
and adds new ones; no existing runtime state (stored data, live service config, OS-registered state,
secrets, or build artifacts) is being renamed or relocated. Skipped per the trigger condition.

## Layered Tagging — Data Model Detail

`tracks.metadata` is an unconstrained JSONB column (`[VERIFIED: codebase]` —
`lib/metadata/schema.ts`'s `readDescriptors`/`sanitizeDescriptors` read/write a `descriptors` sub-key
defensively, with no DB-level schema on the JSONB itself). This means the layered tagging feature
(AI suggests / artist confirms / staff refines) can be built **without a new migration** by extending
the JSONB shape — e.g.:

```typescript
// Proposed shape — NOT yet implemented, illustrative only
type TrackDescriptorsV2 = {
  moods: Mood[]              // artist-confirmed (existing field, unchanged)
  energy?: EnergyLevel | null
  vocal?: VocalType | null
  updated_at?: string
  ai_suggested?: {            // NEW — never overwrites the confirmed fields above
    moods: Mood[]
    energy: EnergyLevel | null
    vocal: VocalType | null
    instruments: string[]     // NEW dimension — no existing INSTRUMENTS vocab in lib/metadata/schema.ts
    suggested_at: string
    model: string
  }
  staff_refined_by?: string   // staff user id, if a staff member overrode/curated the confirmed value
}
```

**Gap found:** an "instruments" controlled vocabulary does not exist in `lib/metadata/schema.ts` today
— `CatalogBrowserLight`'s `FILTER_OPTIONS.Instruments` (`['Piano', 'Strings', 'Guitar', 'Synth',
'Brass']`) is a **UI-only fixture list**, not backed by a shared `INSTRUMENT_VALUES` export the way
mood/energy/vocal are. If AI tagging is to suggest instruments, the planner must either (a) define a
new controlled `INSTRUMENT_VALUES` list (extending `lib/metadata/schema.ts`'s pattern), or (b) treat
instrument tagging as free-text, accepting it will not have the same off-vocabulary safety mood/energy
tagging gets via `MOOD_VALUES.includes()` filtering.

## Code Examples

Verified patterns from this codebase (all `[VERIFIED: codebase]`):

### Existing admission-authority predicate (extend, do not duplicate)
```typescript
// Source: lib/deals/catalog.ts (existing, shipped)
export function isAdmittedToSyncLibrary(project: { has_admitted_sync_listing: boolean | null }): boolean {
  return project.has_admitted_sync_listing === true
}
```

### Existing status-transition authority (extend `LEGAL_TRANSITIONS`, do not fork)
```typescript
// Source: lib/sync-library/submission.ts (existing, shipped)
const LEGAL_TRANSITIONS: Record<SyncListingStatus, readonly SyncListingStatus[]> = {
  applied: ['agreement_pending', 'pending_admit', 'rejected', 'withdrawn'],
  invited: ['agreement_pending', 'pending_admit', 'rejected', 'withdrawn'],
  agreement_pending: ['pending_admit', 'rejected', 'withdrawn'],
  pending_admit: ['admitted', 'rejected', 'withdrawn'],
  admitted: ['removed', 'withdrawn'],
  rejected: [], withdrawn: [], removed: [],
}
```
If Phase 30 introduces a new intermediate status (e.g. `needs_completion` for the worklist), this
table — and migration 096's CHECK constraint — must both widen together (mirrors the DROP/re-ADD
constraint-widening convention migration 096 itself already used for `capability_grants`/
`vault_documents.type`).

### Existing AI prompt-for-JSON pattern to mirror for tagging
```typescript
// Source: lib/buyer/brief-ai.ts (existing, shipped)
const MODEL = 'claude-sonnet-4-6' // NOTE: lib/anthropic/index.ts's MODEL const uses a DIFFERENT
                                    // model id ('claude-sonnet-4-20250514') — an existing
                                    // inconsistency in the codebase; confirm which is current
                                    // before hardcoding a third value for tagging (see Open Q #5).
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null }
}
```

### Existing staff-gate-first route discipline to mirror for new gate/worklist routes
```typescript
// Source: app/api/sync-library/admin/[listingId]/route.ts (existing, shipped)
export async function POST(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  const auth = await requireStaff(['leadership', 'ae']) // FIRST statement, before any DB read
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  // ...target loaded from DB by path param, never from body...
  // ...isValidTransition() guards the write...
  // ...logStaffAction() called UNCONDITIONALLY after the write...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Catalogue membership via `is_public` flag on `vault_projects` | `sync_listings` per-song admission state machine | Phase 26 (2026-08-08, migration 096) | Any Phase 30 code touching admission must use `isAdmittedToSyncLibrary()`, never a raw `is_public` check — that column is described as "replaced," not removed; a stray reference to it would be a regression to the old, superseded model |
| Buyer catalogue rendered from `CatalogBrowser.tsx` (dark theme) | `CatalogBrowserLight.tsx` (light `.fnbl` theme) is the canonical buyer surface | Phase 22 (2026-08-03 direction) | `CatalogBrowser.tsx` still exists and is still used by `components/buyer/ShortlistPanel.tsx` and queries `GET /api/buyer/catalog` directly — it is a **secondary, still-live surface**, not dead code. Any filter-vocabulary or admission-logic change in this phase must be checked against both consumers of `lib/deals/catalog.ts`, not just `CatalogBrowserLight` |
| Buyer catalogue live-data query (slice 1.5 / plan `22-05`) | **Not yet built** — `22-05-PLAN.md` is unexecuted, gated on the (now-resolved) inclusion-model deliberation | Ongoing — `22-05` still shows `[ ]` in ROADMAP.md as of this research | `lib/deals/catalog-sample.ts`'s `mapCardsToLightRows()` explicitly notes the live `CatalogCard` shape "does NOT yet carry artist name, energy, aggregate length, mood, vocal, or instruments" — `CatalogRow`'s rich display fields are currently only populated by the `SAMPLE_CATALOG_ROWS` fixture. Phase 30's tagging/enrichment work and Phase 22's still-open `22-05` overlap heavily; the planner should check whether `22-05` should be folded into this phase's scope or explicitly deferred, since shipping "layered tagging" without the live-data enrichment query would tag data buyers never actually see |

**Deprecated/outdated:**
- `is_public`-based catalogue eligibility — fully replaced by `sync_listings`; do not resurrect.
- The "invited songs skip staff review" idea mentioned in `26-UI-SPEC.md` — migration 096's own
  comments record that the owner explicitly reversed this; invited and self-applied songs both pass
  through the identical `pending_admit` → admit/reject gate today.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | A stored, sortable `sync_readiness_score` column (vs. a pure on-read function) is only needed if the worklist queue must `ORDER BY` readiness across many rows at scale | Standard Stack, Alternatives Considered | If the worklist grows large without a stored/indexed score, sorting by "closest to ready" could become slow; a low-risk assumption since Wave 1 already proves the "score column + TS-twin breakdown function" pattern is easy to add later if needed |
| A2 | "Quality bar → audio quality + genuine sync fit" (from CONTEXT.md) has no existing automatable signal in this codebase today, and is either a manual staff judgment call or a genuinely new (possibly AI-assisted) check | Common Pitfalls, Pitfall 3 | If the owner actually intends an automated audio-quality check (e.g. loudness/clipping analysis), that requires new tooling (possibly a new package) not covered by this research — needs explicit clarification (see Open Questions §2) |
| A3 | The staff Crate view is reached through the buyer-shaped `/sync/catalog` surface (with a `staffMode` prop) rather than a separate `/admin/crate` page | Architecture Patterns, Pattern 5 | If leadership/AE actually need to reach the staff Crate from inside the dark Team Console nav (matching where `/admin/sync-library` lives today), the surface should instead be a new admin-route page importing `CatalogBrowserLight` as a sub-component with theme bridging — a materially different plan shape (see Open Questions §3) |
| A4 | A new `needs_completion`-style status (or equivalent) is required in `sync_listings` to distinguish "in the Sync Readiness worklist" from every existing status | Code Examples | If instead "incomplete ≠ rejected" is meant to be modeled entirely OUTSIDE `sync_listings.status` (e.g. as a computed readiness signal joined at read time, leaving `applied`/`pending_admit` as-is), no migration to `sync_listings` is needed at all — this materially changes whether Phase 30 needs a schema migration |
| A5 | The Sync Library curation-access mismatch (Pitfall 1) is a genuine open decision the owner has not yet resolved for THIS specific route, rather than an oversight already implicitly accepted | Common Pitfalls, Pitfall 1 | If the owner considers the current AE admit/reject access intentional (interpreting "browse & pull" narrowly as just meaning "AE also gets a Selects-pull action, in addition to existing curation"), tightening the route would be an unwanted regression in AE capability |

## Open Questions

1. **Granularity reconciliation (song-level `sync_listings` vs project-level `READINESS_ITEMS`).**
   - What we know: `sync_listings` is explicitly song-level (migration 096); `readinessItemsForProject()` is project-level with internal per-track aggregation for some items.
   - What's unclear: whether Sync Readiness should be computed per-track (new derivation, following the Phase 18 coverage-tier precedent) or accept project-level granularity with the caveat that a worklist entry represents "this project has an incomplete item that affects this song."
   - Recommendation: default to per-track derivation for the worklist display (planner should scope a small, explicit design pass on this before writing plan tasks), but the underlying score inputs (documents, ISWC, etc.) may legitimately stay project-scoped where the real-world artifact IS project-scoped (e.g., copyright registration is filed per release, not per song).

2. **What is the "quality bar" signal, concretely?**
   - What we know: CONTEXT.md names it as one of three gate checks ("audio quality + genuine sync fit").
   - What's unclear: whether this is a manual staff listen-and-judge action (no code needed, just a UI checkbox/note staff sets), or an automated signal (audio analysis, AI-assisted "sync fit" scoring against the brief-matching AI already used in `lib/buyer/brief-ai.ts`'s re-rank feature).
   - Recommendation: default to manual staff judgment (a simple boolean/note field staff sets during curation) for v1, since no audio-quality-analysis capability exists anywhere in this codebase today and adding one is a much larger, package-legitimacy-gated undertaking. Flag for owner confirmation.

3. **Where does the staff-layered Crate live — a route staff reach from the Team Console, or the same `/sync/catalog` URL staff happen to have elevated access to?**
   - What we know: CONTEXT.md says "ONE catalogue surface (The Crate)... team members see the same surface with staff-only layers."
   - What's unclear: the literal URL/entry point. `/admin/sync-library` (dark, `.fncon`) is today's backstage entry; `/sync/catalog` (light, `.fnbl`) is today's buyer entry. A truly "same surface" reading suggests staff should also hit `/sync/catalog` (or an equivalent) and see extra layers there — but the project's own theme convention (buyer=light, admin=dark) creates friction if staff are expected to view it inside the dark Team Console chrome.
   - Recommendation: treat "same surface" as "same `CatalogBrowserLight` component + same underlying query," reachable via a `.fncon`-shell admin page (`/admin/crate` or similar) that mounts `CatalogBrowserLight` with `staffMode` set — preserving the dark Team Console navigation pattern staff already use for `/admin/sync-library`, while reusing 100% of the row-rendering/filtering logic. Needs explicit confirmation before planning locks the route shape.

4. **Does this phase also need to absorb Phase 22's still-open `22-05` (live catalog data enrichment)?**
   - What we know: `22-05-PLAN.md` is unexecuted; `mapCardsToLightRows()` currently synthesizes blank artist/mood/energy/instrument fields for every live row, falling back to the fixture (`SAMPLE_CATALOG_ROWS`) whenever there are zero live rights-ready rows.
   - What's unclear: whether Phase 30's layered tagging feature is expected to ALSO wire the live query to actually populate `CatalogRow`'s rich fields (which is `22-05`'s exact scope), or whether Phase 30 only builds the tagging/gate/worklist machinery and `22-05` remains a separate, later concern.
   - Recommendation: flag explicitly at plan time — shipping AI/artist/staff tags with no live query surfacing them to buyers would be incomplete value; the planner should either fold a minimal version of `22-05`'s enrichment into this phase's scope or explicitly document the dependency/sequencing.

5. **Anthropic model-id inconsistency.**
   - What we know: `lib/anthropic/index.ts` exports `MODEL = 'claude-sonnet-4-20250514'`; `lib/buyer/brief-ai.ts` inline-declares its own `MODEL = 'claude-sonnet-4-6'` rather than importing the shared constant.
   - What's unclear: which is the currently-intended production model id; this is a pre-existing inconsistency, not something Phase 30 introduced.
   - Recommendation: for any new AI tagging call, import and use the shared `lib/anthropic/index.ts` constants (`anthropic`, `MODEL`, `MAX_TOKENS`) rather than inlining a third value — and flag the existing two-value inconsistency to the owner/planner as an unrelated but easy cleanup opportunity.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| `ANTHROPIC_API_KEY` env var | AI tag suggestion | Not verified in this research pass (secret, not inspectable) — `lib/anthropic/index.ts` throws at import if absent; `lib/buyer/brief-ai.ts` degrades gracefully instead | — | `draftBriefFromProse`'s pattern (`if (!apiKey) return { ok: false, error: '...offline...' }`) is the correct model to follow for tagging — degrade gracefully, never throw at import time in a route new code touches |
| Supabase (Postgres) | All new queries/tables | ✓ (existing, live) | — | — |
| `supabase db push` execution | Any new/altered table (`sync_listings` status widening, if Pitfall/A4's new status is adopted) | Owner-run only, not agent-executable | — | Draft migration + `[BLOCKING]` human-gated push task, per this project's standing convention |

**Missing dependencies with no fallback:** none identified — this phase is buildable entirely within
the existing stack and environment, contingent on the open questions above being resolved before
planning locks task scope.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 + ts-jest (`[VERIFIED: package.json]`) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest <path/to/new-test-file>.test.ts` |
| Full suite command | `npm test` (`"test": "jest"` in `package.json`) |

### Phase Requirements → Test Map
(Requirement IDs are provisional/TBD per `<phase_requirements>` above — mapped by capability instead.)

| Capability | Behavior | Test Type | Automated Command | File Exists? |
|------------|----------|-----------|--------------------|--------------|
| Inclusion gate | `evaluateInclusionGate()` returns `needs_completion` (not `rejected`) for an incomplete-but-not-disqualified signal | unit | `npx jest lib/sync-library/gate.test.ts` | ❌ Wave 0 |
| Sync Readiness subset | `syncReadinessItemsForProject()` excludes release-only keys (`visual_asset`, `distributor`, `epk`, `caption_copy`, `tiktok_strategy`) and matches `readinessItemsForProject()` exactly for included keys | unit | `npx jest lib/sync-library/readiness.test.ts` | ❌ Wave 0 |
| Worklist query | Batched query returns one row per non-terminal, non-admitted `sync_listings` row with correct missing-item summary | unit (pure shaping fn) + integration (route) | `npx jest lib/sync-library/worklist.test.ts` | ❌ Wave 0 |
| Gate route access | `POST /api/sync-library/admin/[listingId]` enforces the FINAL agreed role set (leadership-only or leadership+ae, per Pitfall 1's resolution) | unit (route test, existing pattern) | `npx jest app/api/sync-library/admin/\[listingId\]/route.test.ts` | ✅ (existing file — extend, don't replace) |
| AI tag suggestion | `suggestTrackTags()` degrades gracefully with no API key; parses fenced/unfenced JSON; drops off-vocabulary values | unit | `npx jest lib/tagging/ai-tag.test.ts` | ❌ Wave 0 |
| Tag provenance merge | AI-suggested tags never overwrite artist-confirmed `descriptors.moods`/`energy`/`vocal` | unit | `npx jest lib/tagging/tag-merge.test.ts` | ❌ Wave 0 |
| Staff-layer gating | `CatalogRow.staff` field is present only when `staffMode` is set server-side; buyer-facing render is byte-identical when absent | unit (component) or integration (page) | `npx jest components/buyer/CatalogBrowserLight.test.tsx` (or equivalent page test) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** run the specific new/touched `*.test.ts` file(s) via `npx jest <path>`
- **Per wave merge:** `npm test` (full suite) — this repo's existing sync-library tests
  (`lib/sync-library/*.test.ts`, `app/api/sync-library/**/*.test.ts`, ~1511 lines across those files
  per this research's line count) must stay green; Phase 30 extends, not replaces, that surface
- **Phase gate:** full suite + `tsc` green before `/gsd-verify-work`, matching the "1723 tests + tsc +
  build green" bar Phase 26 itself was held to at close

### Wave 0 Gaps
- [ ] `lib/sync-library/gate.test.ts` — covers the new inclusion-gate predicate
- [ ] `lib/sync-library/readiness.test.ts` — covers the `SYNC_READINESS_KEYS` filter
- [ ] `lib/sync-library/worklist.test.ts` — covers worklist row shaping
- [ ] `lib/tagging/ai-tag.test.ts` + `lib/tagging/tag-merge.test.ts` — covers AI tagging + provenance merge
- [ ] Framework install: none — Jest/ts-jest already configured and in use across `lib/sync-library/*.test.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|--------------------|
| V2 Authentication | No (new work) | Reuses existing Supabase session auth, unchanged |
| V3 Session Management | No (new work) | Unchanged |
| V4 Access Control | **Yes** | `requireStaff(allowed: StaffRole[])` (`lib/admin/gate.ts`) — every new staff route/page must call this FIRST, before any DB read, exactly as every existing `/api/sync-library/*` and `/api/admin/*` route does |
| V5 Input Validation | **Yes** | Follow the existing hand-rolled-allowlist convention (`decision !== 'admit' && decision !== 'reject'` style checks, or `zod`) — never spread request bodies into DB writes (`EDITABLE_FIELDS`-style fixed column sets, per `lib/admin/gate.ts` and every sync-library route) |
| V6 Cryptography | No | Not applicable — no new secrets/crypto in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| A non-leadership/AE user calling the gate/worklist/tag-suggest routes directly | Elevation of Privilege | `requireStaff()` as the first statement in every new route, mirroring T-26-17/T-26-18's precedent |
| Client-supplied `staffMode`/`isStaff` flag trusted to reveal staff-only Crate fields | Information Disclosure | Resolve staff role server-side (`getStaffRole(user)`) on every page/route that returns the `staff` field on `CatalogRow`; never accept it as request input |
| A track's `sync_listings` status advanced past a gate check via a malformed/unexpected transition (e.g., directly to `admitted` bypassing the new gate logic) | Tampering | Extend `isValidTransition()`/`LEGAL_TRANSITIONS` as the SINGLE authority (T-26-05's existing discipline) rather than checking gate-eligibility ad hoc in the route body |
| AI tag-suggestion prompt injection via a track's own artist-supplied lyrics/notes text fed into the Anthropic prompt | Tampering (prompt injection) | Mirror `brief-ai.ts`'s discipline: constrain output to enumerated `_VALUES` vocab via `coerceBrief`-style tolerant coercion (`MOOD_VALUES.includes(...)`) — never let free-text AI output write directly into a DB column or render unescaped; this codebase already treats "constrain to known vocab, drop anything else silently" as the standard defense here |
| A staff member's admit/reject or tag-refine action left unaudited | Repudiation | `logStaffAction()` (`lib/staff/audit.ts`) called UNCONDITIONALLY after every new staff write, mirroring the existing admit/reject/remove routes exactly |

## Sources

### Primary (HIGH confidence — direct codebase reads, `[VERIFIED: codebase]`)
- `supabase/migrations/096_sync_library.sql` — `sync_listings` schema, RLS, capability/document-type widening
- `lib/sync-library/eligibility.ts`, `lib/sync-library/submission.ts` — eligibility predicate + status state machine
- `app/api/sync-library/admin/[listingId]/route.ts`, `app/api/sync-library/submit/route.ts`, `app/(admin)/admin/sync-library/page.tsx` — the shipped gate/curation flow
- `components/admin/SyncLibraryAdmin.tsx` — the shipped curation UI, its stated access model, and reused UI patterns
- `lib/deals/catalog.ts`, `lib/deals/catalog-query.ts`, `lib/deals/catalog-sample.ts` — admission authority, buyer catalogue query, live-vs-fixture data state
- `components/buyer/CatalogBrowserLight.tsx`, `components/buyer/fnbl-theme.ts`, `app/sync/catalog/page.tsx` — the Crate UI, its prop shape, and its theme scoping
- `lib/vault/readiness.ts`, `types/index.ts` (READINESS_ITEMS/ReadinessItem) — the Wave 1 readiness engine
- `lib/vault/stage3.ts` — the existing legal-document ("rights") gate feeding `isRightsReady`
- `lib/metadata/schema.ts` — the existing mood/energy/vocal controlled vocabulary and artist-authored descriptors
- `lib/anthropic/index.ts`, `lib/buyer/brief-ai.ts` — the existing Anthropic SDK usage pattern
- `lib/admin/gate.ts`, `lib/admin/staff-role.ts` — the staff auth gate
- `lib/staff/audit.ts`, `lib/social/notifications.ts` — staff audit logging + sync-library notification builders
- `.planning/phases/30-.../30-CONTEXT.md`, `.planning/notes/team-member-rooms-review.md`, `.planning/ROADMAP.md` (Phase 22/26/29/30/31 entries) — locked scope and decisions
- `.planning/REQUIREMENTS.md` (Phase 26 SYNCLIB-01..15 section) — provisional-ID registration precedent
- `.claude/CLAUDE.md` — project conventions

### Secondary (MEDIUM confidence)
None used — no external documentation lookups were performed for this phase, since every capability
required is a direct extension of already-shipped, in-repo systems and all research questions were
answerable by reading code directly. (Per `.planning/config.json`, all external search-provider flags
are `false` in this project's current config.)

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all versions read directly from `package.json`
- Architecture: HIGH — patterns extend files read in full; granularity/theme risks called out explicitly as open questions rather than glossed over
- Pitfalls: HIGH — the access-model mismatch (Pitfall 1) and the "no gate exists today" finding are both directly verified against the live route/component code, not inferred

**Research date:** 2026-08-12
**Valid until:** 2026-09-11 (30 days — stable, internal-codebase-grounded research; re-verify sooner if Phase 22's `22-05` or Phase 26 code is touched by an intervening phase before Phase 30 planning begins)
