# Phase 26: Sync-Library Inclusion & Artist Submission - Research

**Researched:** 2026-08-07
**Domain:** Brownfield Next.js/Supabase — new curated-catalogue admission workflow layered on existing Sound Vault, e-sign, and buyer-catalogue systems
**Confidence:** MEDIUM — the mechanical/schema findings are HIGH (verified by direct file reads); the legal/product scope of the blanket agreement is explicitly unresolved and tagged LOW/ASSUMED throughout

## Summary

Phase 26 replaces today's implicit catalogue gate (`vault_projects.is_public = true` AND readiness ≥ 60 AND `computeStage3().canContinue`, all defined in `lib/deals/catalog.ts`'s `isRightsReady`) with an explicit, curated admission pipeline: Funūn invites a specific artist → the artist submits an eligible Vault project → the artist signs a blanket agreement (via the existing `lib/esign/provider.ts` abstraction, DocuSeal-backed) → Funūn (staff) admits the project → the catalogue query flips `is_public` (or a new equivalent gate) on. This phase is the direct unblock for the already-drafted but gated `22-05-PLAN.md`, whose Task 0 is a blocking decision gate on exactly this deliberation.

The codebase has two directly reusable pieces and one important non-reusable one. Reusable: (1) `lib/esign/provider.ts`'s vendor-agnostic `EsignProvider` contract + `EsignState`/`readEsignState()`/`allSigned()` helpers, designed for exactly this "single document, JSONB-persisted signing state" shape; (2) `capability_grants` (migration 042) — the existing admin-invite/self-serve/approval-queue infrastructure already used for the `artist`/`industry` capability switches, directly reusable pattern for "who may submit to the sync-library." Non-reusable as-is: `esign_envelopes`/`esign_envelope_signers` (migration 062) is hard-FK'd to `split_sheets` and `split_sheet_parties` — it is the split-sheet-specific multi-party negotiation schema Phase 17 built, not a generic envelope table. The blanket agreement (single artist signer, no negotiation) does not need that machinery and should NOT extend those tables; the simpler `vault_documents.document_data.esign` JSONB path `provider.ts` was originally designed for is the right fit, gated behind a new `vault_documents.type` value.

The single hardest brownfield finding: **DocuSeal webhooks are account-wide, not per-document-type.** `app/api/webhooks/docuseal/route.ts` today looks up the inbound `submission_id` exclusively against `esign_envelopes` (split-sheet only) and runs split-sheet-specific fanout/certificate/notification logic unconditionally. A blanket-agreement submission completing will hit this SAME URL (one `DOCUSEAL_WEBHOOK_SECRET`, one endpoint configured in the DocuSeal dashboard). The webhook route must be extended to dispatch by document kind (try `esign_envelopes` first, fall back to a `vault_documents`-linked lookup) rather than assuming split-sheet — this is a concrete pitfall requiring a specific task, not an incidental detail.

**Primary recommendation:** Build a new dedicated table (`sync_library_submissions` or similar) as the audit-trailed source of truth for the admission state machine, keyed on `vault_project_id` (project-level, matching the existing `is_public`/readiness granularity — do NOT attempt track-level in v1, see Architecture Patterns). Store the blanket-agreement e-sign state as a new `vault_documents` row (`type = 'blanket_agreement'`) using the lightweight `provider.ts` JSONB path, not `esign_envelopes`. Extend `capability_grants` with a new `sync_library` capability value to represent "this artist is invited/eligible to submit." Replace `isRightsReady`'s `is_public` check with a check against the new submission table's `admitted` status, keeping the readiness+Stage3 checks as additional (not replaced) gates.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Artist invite eligibility ("who may submit") | API / Backend | Database | `capability_grants` row + RLS is the existing pattern for account-level permission gates (artist/industry capabilities); admission UI reads it server-side |
| Artist-facing invite surface ("add your songs" opportunity) | Frontend Server (SSR) | API / Backend | Renders as a dashboard/Antenna-style card; the underlying grant is read server-side, never client-trusted |
| Song submission action | API / Backend | Database | Server-owned write to the new submission table; ownership + eligibility + Vault-readiness preconditions checked server-side before any row is created |
| Blanket-agreement e-sign | API / Backend | External (DocuSeal) | Mint route calls `docusealProvider.createRequest()` server-side; browser only ever sees a scoped embed `slug`, matching the existing split-sheet pattern (`DOCUSEAL_API_KEY` never reaches the client) |
| Blanket-agreement webhook completion | API / Backend | Database | `POST /api/webhooks/docuseal` (existing route, extended) — signature-verified, idempotent, server-only |
| Admission/curation decision | API / Backend | Database | Staff-only (`requireStaff`) write to the submission table's status; mirrors `requireStaff`-gated buyer-org edit pattern from Phase 25 |
| Catalogue visibility gate | Database | API / Backend | `isRightsReady`'s replacement predicate reads the submission table's `admitted` status; `loadCatalogPage`'s query is the single enforcement point (server-side-only, buyers never hit `vault_projects` directly) |

## Standard Stack

This phase adds **no new npm packages, no new external services**. Everything routes through already-installed, already-verified infrastructure:

### Core (existing, reused)
| Library | Version | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------|
| `@docuseal/react` | ^1.0.75 (installed) | Embedded signing UI for the blanket agreement | Already the project's sole e-sign vendor (D-18c: single-provider DocuSeal decision); no second adapter needed |
| `@react-pdf/renderer` | ^4.5.1 (installed) | Render the blanket-agreement PDF before minting | Same renderer used for split sheets (`lib/vault/pdf/split-sheet.tsx`); reuse `lib/vault/pdf/fonts.ts`'s `registerFunuunPdfFonts()` for the Unicode-safe font fix (ESIGN-15) |
| Supabase (`@supabase/supabase-js` 2.45.0) | installed | Schema, RLS, service-role writes | No new backend needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `sync_library_submissions` table | Reuse/extend `esign_envelopes` with a nullable `sync_library_submission_id` alongside `split_sheet_id` | Rejected: `esign_envelopes`'s RLS policies, indexes, and the mint/void/webhook routes are all written assuming a `split_sheets` join; polymorphic-izing it touches more surface area (4 RLS policies, 2 routes, 1 webhook handler) than adding one new small table |
| `capability_grants` extension for invite eligibility | A wholly new `sync_library_invites` table | `capability_grants` already has: admin-approval-queue precedent (Phase 15's capability-request UI), RLS scoped to the profile owner, a `source` CHECK vocabulary, and `hasCapability()` — reusing it is less code and matches "Don't Hand-Roll" (an invite is structurally identical to a capability grant, just admin-initiated instead of self-requested) |
| `vault_documents.document_data.esign` JSONB for the blanket agreement | New `esign_envelopes`-style relational tables for blanket agreements | The blanket agreement is single-signer (artist only) with no negotiation/counter loop — the exact case `provider.ts`'s original lightweight design targeted, before Phase 17 built the richer multi-party schema for split sheets' different needs |

**Installation:** None required — this phase is app code + migrations only.

**Version verification:** No new packages, so the ecosystem-registry verification step is not applicable. `@docuseal/react` and `@react-pdf/renderer` versions confirmed live in `package.json` (read directly, not searched).

## Package Legitimacy Audit

**Not applicable — this phase introduces zero new external packages.** All dependencies (`@docuseal/react`, `@react-pdf/renderer`, `@supabase/supabase-js`) are pre-existing, already-audited project dependencies from Phase 17/22/23.

## Architecture Patterns

### System Architecture Diagram

```
 ARTIST-FACING                         ADMIN/STAFF-FACING
 ┌──────────────────────┐              ┌───────────────────────────┐
 │ Funūn invites artist  │              │ Staff (Leadership/AE) →   │
 │  capability_grants    │              │  reviews /admin/sync-      │
 │  ('sync_library',     │              │  library queue             │
 │   source='admin_invite│              └──────────┬────────────────┘
 │   status='approved')  │                         │
 └──────────┬────────────┘                         │ admits / rejects
            │ notification (createNotification)     │
            ▼                                       ▼
 ┌──────────────────────┐   submits    ┌───────────────────────────┐
 │ Artist dashboard/     │─────────────▶│ sync_library_submissions   │
 │ Vault: "Add to sync-  │  (project_id, │  status: submitted →      │
 │ library" CTA          │   status:     │  agreement_signed →       │
 │ (gated on capability) │   submitted)  │  admitted / rejected /     │
 └──────────┬────────────┘               │  withdrawn                 │
            │                            └──────────┬────────────────┘
            ▼                                        │ on admit
 ┌──────────────────────┐   mint         ┌───────────▼────────────────┐
 │ Blanket-agreement     │───────────────▶│ vault_projects gate flips   │
 │ e-sign (DocuSeal via  │  (server-only,  │  (is_public or dedicated    │
 │ lib/esign/provider.ts)│   API key never │   sync_library_status col)  │
 │ vault_documents row   │   reaches       └───────────┬─────────────────┘
 │ type='blanket_        │   browser)                  │
 │ agreement'             │                             ▼
 └──────────┬────────────┘               ┌─────────────────────────────┐
            │ webhook completion          │ lib/deals/catalog-query.ts   │
            ▼                             │  loadCatalogPage() — the      │
 ┌──────────────────────┐                 │  ONLY buyer-facing read path  │
 │ POST /api/webhooks/   │  DISPATCH BY   │  (server-side only, never     │
 │ docuseal (EXTENDED)   │  submission    │  direct PostgREST)            │
 │ — must branch on doc  │  lookup: split │  isRightsReady() replacement  │
 │ kind, not assume       │  sheet vs      │  checks admitted status        │
 │ split-sheet            │  blanket-agmt  └────────────────────────────┘
 └──────────────────────┘
```

### Recommended Project Structure
```
lib/sync-library/
├── eligibility.ts        # hasSyncLibraryCapability() — wraps hasCapability('sync_library')
├── submission.ts         # buildSubmission(), status-transition validators (submitted→agreement_signed→admitted/rejected/withdrawn)
├── admission.ts          # admitSubmission()/rejectSubmission() — staff-only mutation, mirrors admin/buyer-orgs edit-scope pattern
lib/esign/                # UNCHANGED provider.ts contract; blanket-agreement mint route calls docusealProvider directly
lib/vault/pdf/
└── blanket-agreement.tsx # new PDF renderer, sibling to split-sheet.tsx, reusing lib/vault/pdf/fonts.ts
app/api/sync-library/
├── invite/route.ts               # staff-only: creates the capability_grants invite row + notification
├── [projectId]/submit/route.ts   # artist-only: creates sync_library_submissions row (status='submitted')
├── [projectId]/mint-agreement/route.ts  # artist-only: renders PDF, calls docusealProvider.createRequest(), writes vault_documents row
└── admin/[submissionId]/route.ts # staff-only: admit/reject/withdraw transitions
app/api/webhooks/docuseal/route.ts  # EXTENDED (not new) — must dispatch on split-sheet vs blanket-agreement
app/(artist)/sync-library/          # artist-facing submission flow UI
app/(admin)/admin/sync-library/     # staff curation queue, mirrors admin/buyer-orgs / admin/capability-requests
```

### Pattern 1: Server-owned write doctrine + shared authorization helper
**What:** Every state-changing route (invite, submit, mint, admit) uses the session client ONLY to verify identity/ownership, then a service-role client for the actual write — exactly `mint-envelope/route.ts`'s two-client structure (session client for the ownership `.eq('initiator_user_id', user.id)` lookup, service client for the insert).
**When to use:** Every write path this phase introduces.
**Example:**
```typescript
// Source: app/api/split-sheets/[id]/mint-envelope/route.ts (existing pattern to mirror)
const apiClient = await createApiClient()
const { data: { user } } = await apiClient.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: project } = await apiClient
  .from('vault_projects')
  .select('*')
  .eq('id', projectId)
  .eq('user_id', user.id)   // ownership check on the SESSION client
  .maybeSingle()
if (!project) return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })

const service = createServiceClient()
// ...write with service client after all gates pass
```

### Pattern 2: Single-implementation catalogue gate (avoid drift)
**What:** `lib/deals/request-target.ts`'s `authorizeRequestTarget` already duplicates part of `isRightsReady`'s logic inline (`project.is_public !== true`) rather than calling `isRightsReady` directly — this is a PRE-EXISTING drift risk the codebase's own comments flag ("mirroring the rights-ready definition plan 16-05's ... isRightsReady ... will also express"). Phase 26 must fix this, not just add a third copy: both `lib/deals/catalog-query.ts`'s `loadCatalogPage` AND `lib/deals/request-target.ts`'s `authorizeRequestTarget` need to call the SAME new admission-gate helper.
**When to use:** Any place that currently reads `is_public` directly as a stand-in for "buyer may see this."
**Example:**
```typescript
// Source: lib/deals/catalog.ts (existing isRightsReady, the function to extend/replace)
export function isRightsReady(project: CatalogProjectLike, stage3: Stage3Result): boolean {
  if (project.is_public !== true) return false          // ← REPLACE with admission-status check
  if (project.vault_readiness_score == null) return false
  if (project.vault_readiness_score < CATALOG_READINESS_THRESHOLD) return false
  return stage3.canContinue
}
```

### Pattern 3: Capability-grant-based invite gate
**What:** Reuse `capability_grants` (migration 042) for "who may submit," rather than inventing a parallel invite table. Requires widening the `capability` CHECK constraint (currently `IN ('artist', 'industry')`) and probably the `source` CHECK (currently `IN ('signup', 'self_serve_instant', 'admin_approved', 'backfill')` — needs an `admin_invited` value since this is Funūn-initiated, not artist-requested).
**When to use:** The artist-eligibility gate before any submission route accepts a write.
**Example:**
```sql
-- Source: supabase/migrations/042_capability_grants.sql (existing table to extend via new migration)
ALTER TABLE capability_grants DROP CONSTRAINT capability_grants_capability_check;
ALTER TABLE capability_grants ADD CONSTRAINT capability_grants_capability_check
  CHECK (capability IN ('artist', 'industry', 'sync_library'));
ALTER TABLE capability_grants DROP CONSTRAINT capability_grants_source_check;
ALTER TABLE capability_grants ADD CONSTRAINT capability_grants_source_check
  CHECK (source IN ('signup', 'self_serve_instant', 'admin_approved', 'backfill', 'admin_invited'));
```

### Anti-Patterns to Avoid
- **Extending `esign_envelopes`/`esign_envelope_signers` for the blanket agreement:** These tables' RLS policies, indexes, and the existing mint/void/webhook routes are written assuming a `split_sheets` join at every layer. Polymorphic-izing them (nullable `split_sheet_id` + a second nullable FK) touches 4 RLS policies and re-opens code that Phase 17 hardened through an attorney-review gate. Use the lighter `vault_documents.document_data.esign` path instead.
- **Assuming the DocuSeal webhook route is generic:** It is NOT. It is hard-coded to `esign_envelopes` → `split_sheets` → `split_sheet_parties` fanout logic (fanout to Contract Locker, split-sheet-specific notifications, readiness recompute). A blanket-agreement completion hitting this URL untouched will either 404/no-op silently or (worse) attempt split-sheet fanout logic against a submission_id that isn't in `esign_envelopes`. This MUST be an explicit dispatch-by-lookup task.
- **Per-track sync-library membership in v1:** `vault_projects.is_public` is the ONLY existing visibility toggle and it operates at the PROJECT level; there is no track-level visibility column anywhere in the schema today. Building per-track admission in v1 requires either a new `tracks.sync_library_status` column (touches the readiness trigger, the catalogue query's `tracks` embed, and the EP/album "some tracks ready, some not" UI state) with no existing precedent to build on. Recommend project-level v1, track-level as a documented v2 gap (see Open Questions).
- **Silently reusing `is_public` as the admission flag:** `is_public` predates this phase and its exact current meaning ("artist chose to make this Vault project publicly visible on their profile," unrelated to buyer licensing) is unclear from the schema alone — grep shows it is ALSO read by the public profile releases grid (`app/u/[handle]/page.tsx`) and Phase 16's `isRightsReady`. Flipping `is_public` on admission would make a project publicly visible on the artist's profile as a side effect of sync-library admission, which is a scope collision the CONTEXT doesn't authorize. Recommend a NEW, separate gate column/table rather than overloading `is_public`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Artist-level "may submit" permission | A parallel invite/eligibility table with its own RLS | `capability_grants` (extended with a `sync_library` value) | Existing RLS, `hasCapability()`, admin-approval-queue UI precedent (Phase 15) all transfer directly |
| Single-signer e-sign state | A new relational envelope schema | `lib/esign/provider.ts`'s `EsignState`/`readEsignState()`/`allSigned()` on `vault_documents.document_data` | This is exactly the shape the abstraction was designed for before Phase 17's split-sheet-specific needs justified the heavier `esign_envelopes` schema |
| PDF rendering + Unicode font handling | A new font-registration path | `lib/vault/pdf/fonts.ts`'s `registerFunuunPdfFonts()` | Phase 17 found and fixed a real shipped bug (dropped/mangled non-Latin-1 characters) here; a new renderer that doesn't import this will reintroduce it |
| Staff-only admission gate | A bespoke admin-check | `requireStaff(['leadership', 'ae'])` from `lib/admin/staff-role.ts` (or `getStaffRole`) | Phase 25's staff RBAC is the established authority check for every admin route; a parallel `is_admin` check would fork the permission model |

**Key insight:** Every piece this phase needs (invite gate, e-sign, staff authorization, server-owned writes, PDF rendering) has a working precedent already in the codebase from Phases 15/17/25. The actual net-new work is (1) one new state-machine table, (2) one new `vault_documents.type` value + renderer, (3) the webhook dispatch fix, and (4) wiring the artist-facing invite/submit UI and the staff admission queue.

## Runtime State Inventory

Not applicable — this is a greenfield feature addition (new table, new document type, new UI), not a rename/refactor/migration of existing state. No existing production data references "sync-library," "blanket agreement," or any name this phase would change.

## Common Pitfalls

### Pitfall 1: DocuSeal webhook dispatch collision
**What goes wrong:** A blanket-agreement submission's `submission.completed` webhook hits the same `POST /api/webhooks/docuseal` URL as every split-sheet completion. The current handler's very first DB lookup after signature verification is `esign_envelopes` filtered by `docuseal_submission_id`, joined straight to `split_sheets`/`split_sheet_parties`. A blanket-agreement submission ID will not exist in `esign_envelopes` at all.
**Why it happens:** DocuSeal (like most e-sign platforms) configures one webhook URL per account, not per template/document-type. The codebase's single existing webhook consumer was built before a second document type existed.
**How to avoid:** Extend the handler with an early dispatch: look up `esign_envelopes` first (existing split-sheet path, unchanged); if no match, look up the new blanket-agreement's linking column (e.g. a `vault_documents.document_data->>'esign'->>'requestId'` match, or better, a small indexed lookup table/column mapping `docuseal_submission_id → vault_document_id`) and run the blanket-agreement-specific completion logic (mark `vault_documents.status = 'signed'`, advance `sync_library_submissions.status = 'agreement_signed'`, notify staff for admission review).
**Warning signs:** A completed blanket-agreement submission in the DocuSeal dashboard whose Funūn-side status never advances past "pending."

### Pitfall 2: `is_public` semantic overload
**What goes wrong:** Flipping `vault_projects.is_public` as the sync-library admission signal also makes the project appear on the artist's public profile releases grid (`app/u/[handle]/page.tsx`) and interacts with Phase 9's "Featured" spotlight system — side effects this phase's CONTEXT never authorized.
**Why it happens:** `is_public` predates buyer catalogue functionality; Phase 16 opportunistically reused it as part of `isRightsReady` rather than introducing a dedicated flag, and that reuse is explicitly called out as a "beta placeholder, not a considered inclusion model" in the deliberation doc.
**How to avoid:** Introduce a separate gate (new table/column) for buyer-catalogue admission, distinct from profile-visibility `is_public`. Decide explicitly whether admission REQUIRES `is_public = true` as a precondition (likely yes — an artist who has made a project fully private probably shouldn't have it browsable by buyers) versus admission SETTING `is_public = true` as a side effect (probably no — surprising the artist with new public visibility on their profile).
**Warning signs:** An admitted-but-not-yet-profile-public project appearing (or not appearing) inconsistently between the artist's own profile and the buyer catalogue.

### Pitfall 3: Blocking-gate precedent already exists for this exact plan
**What goes wrong:** Forgetting that `22-05-PLAN.md` is a fully-drafted, currently-blocked plan whose Task 0 IS this deliberation. Replanning Phase 26 without reading it risks re-deriving requirements 22-05 already spelled out (enriched `CatalogCard` fields, tri-state rights mapping, server-side filter/sort/pagination) or contradicting its file-ownership boundaries.
**Why it happens:** 22-05 lives in a different phase directory (`22-buyer-catalogue-light-ui/`) and its `blocked_by` frontmatter field points at the deliberation doc, not at Phase 26 by number — easy to miss during a Phase-26-scoped read.
**How to avoid:** The planner should treat 22-05 as the DOWNSTREAM consumer this phase unblocks, either by resolving its Task 0 decision gate directly (recording the resolution in a form 22-05 can consume) or by explicitly re-scoping 22-05's catalogue-enrichment work into a Phase 26 plan and marking 22-05 superseded.
**Warning signs:** Phase 26 rebuilding `CatalogCard`/`loadCatalogPage` enrichment work that duplicates 22-05's already-planned Task 1/2/3.

### Pitfall 4: Legal-grade agreement without counsel review gate
**What goes wrong:** Phase 17's split-sheet agreement shipped with `assertCounselReviewedForProduction()` — a hard production-mint guard tied to a `COUNSEL_REVIEW_STATUS` flag — specifically because "a blanket... grant is real rights transfer" per the sync-license-signing-model deliberation's own sub-decision #1 ("Requires music/IP counsel — not an engineering decision"). Shipping the blanket-agreement mint route without an equivalent guard risks binding real artists to unreviewed legal language in production.
**Why it happens:** Under schedule pressure it's tempting to treat "authorizing Funūn to shop" as boilerplate; the sync-license-signing-model deliberation explicitly says this is NOT settled — scope (shop-only vs. also pre-authorizing terms), revocation, and per-buyer veto are all still open.
**How to avoid:** Reuse the exact `assertCounselReviewedForProduction()` pattern (a new `BLANKET_AGREEMENT_COUNSEL_REVIEW_STATUS` flag, checked before every production mint) rather than assuming shop-only language is safe to ship without review.
**Warning signs:** A production mint route with no equivalent of Phase 17's `P17-09a` guard.

## Code Examples

### Reading e-sign state via the lightweight provider.ts path (recommended for the blanket agreement)
```typescript
// Source: lib/esign/provider.ts (existing, unmodified)
import { readEsignState, allSigned } from '@/lib/esign/provider'

const state = readEsignState(vaultDocument.document_data)
if (state && allSigned(state)) {
  // blanket agreement fully executed
}
```

### Staff-only route gate (mirror for the admission/curation route)
```typescript
// Source: pattern established in Phase 25 admin routes (lib/admin/staff-role.ts convention)
import { requireStaff } from '@/lib/admin/gate'

export async function POST(request: Request) {
  const staff = await requireStaff(['leadership', 'ae'])
  if (!staff.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // ...admit/reject the submission
}
```

### Server-side-only catalogue enforcement (unchanged pattern to extend, not replace)
```typescript
// Source: lib/deals/catalog-query.ts loadCatalogPage (existing structure)
// The buyer client NEVER queries vault_projects directly — loadCatalogPage
// is the sole enforcement point. Phase 26 changes the isRightsReady() call
// inside this loop to check submission-table admission status instead of
// (or in addition to) is_public, but the "server-side only" boundary itself
// does not change.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Catalogue membership = `is_public + readiness ≥ 60 + Stage3` (a readiness side effect) | Catalogue membership = explicit curated admission (invite → submit → blanket-agreement → admit) | This phase (2026-08, per owner decision 2026-08-05) | `isRightsReady` and `authorizeRequestTarget` both need their `is_public` check replaced/supplemented; `22-05-PLAN.md`'s blocking gate can be resolved |
| No concept of a "blanket agreement" anywhere in the schema | New `vault_documents.type = 'blanket_agreement'` + new state-machine table | This phase | New migration; new `DocumentType` union member in `types/index.ts`; new `DOC_LABELS` entry in `lib/contracts/locker-rows.ts` |

**Deprecated/outdated:** `isRightsReady`'s comment block explicitly labels itself "RESEARCH Open Question 3 / Assumption A4" and "the beta definition ... product may raise or lower it" — this phase is the intended point where that placeholder gets replaced, per the function's own in-source acknowledgment.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The blanket agreement needs only ONE signer (the artist) — no Funūn countersignature required on the document itself | Architecture Patterns, Don't Hand-Roll | If legal counsel requires a visible Funūn-agent countersignature (as the related sync-license-signing-model deliberation discusses for the DOWNSTREAM per-deal license), the single-signer DocuSeal flow needs a second submitter role, changing the mint route's signer array and PDF template |
| A2 | Admission gate should be a NEW table/column, not a repurposed `is_public` | Common Pitfall 2 | If the owner actually wants admission to control profile-level public visibility too (single combined toggle), a separate gate is unnecessary complexity — needs explicit confirmation |
| A3 | Project-level (not track-level) granularity is acceptable for v1 | Anti-Patterns, Don't Hand-Roll | CONTEXT's open question #2 explicitly flags "a project may have some eligible tracks" as unresolved; if the owner wants track-level from day one, the data model and readiness-gate logic both need per-track state, a materially larger schema change |
| A4 | `capability_grants` can be safely extended with a `sync_library` value + `admin_invited` source | Architecture Patterns (Pattern 3) | If capability semantics are meant to stay strictly "artist/industry account-type" (not feature-level entitlements), a new dedicated invite table may be the cleaner separation of concerns — worth an explicit product call |
| A5 | The blanket agreement's scope (shop-only authorization vs. also pre-authorizing licensing terms) can be decided independently for THIS phase (build shop-only now) while the sync-license-signing-model deliberation resolves the full pre-auth question separately | Domain framing, Pitfall 4 | The related deliberation explicitly states this is where the two decisions "meet" — if legal counsel determines the scope can't be split this way, the blanket-agreement document language (and possibly the whole submission flow) needs rework once 16-09 resolves |

**All five assumptions above require explicit owner/product (and for A1/A5, likely legal) confirmation before being treated as locked decisions — none should be silently implemented.**

## Open Questions

1. **Blanket agreement legal scope (shop-only vs. also pre-authorizing terms)**
   - What we know: The owner decided (2026-08-05) that a blanket agreement is required and gates admission; the related `sync-license-signing-model.md` deliberation is explicitly still OPEN pending "music/IP legal counsel," not an engineering decision.
   - What's unclear: Whether Phase 26's blanket agreement can be built now as "authorization to shop" only (buildable without counsel, arguably) or whether any version needs counsel review before minting in production (Phase 17's precedent — `assertCounselReviewedForProduction()` — suggests yes for ANY rights-adjacent legal document).
   - Recommendation: Build the counsel-review gate (Pitfall 4) from day one, defaulting `COUNSEL_REVIEW_STATUS` to unreviewed, so production minting is blocked until sign-off — mirrors the exact precedent Phase 17 established for legally-binding documents.

2. **Data model: new table vs. new column vs. hybrid**
   - What we know: CONTEXT's own open question #1 flags this as "decide before schema hardens." `capability_grants` and `esign_envelopes` both demonstrate the codebase's preference for small dedicated tables with `status` CHECK enums and audit columns (`decided_at`/`decided_by`, `voided_at`/`completed_at`) over boolean flags.
   - What's unclear: Whether the owner wants a single project-scoped row (simple) or something that survives resubmission-after-rejection/withdrawal history (matches the `esign_envelopes` "one row per attempt" precedent).
   - Recommendation: One row per `vault_project_id` with a `status` history NOT modeled as multiple rows (simpler; a project either has an active submission or it doesn't) unless the owner specifically wants a full audit trail of every submit/withdraw cycle — flag as a discuss-phase question, not something to silently decide.

3. **Track-level vs. project-level granularity**
   - What we know: No track-level visibility column exists anywhere in the schema today; `vault_projects.is_public` is project-scoped.
   - What's unclear: Whether an EP/album with some tracks "eligible" and others not is a real near-term case worth building for, or a v2 concern.
   - Recommendation: Project-level v1 (Anti-Patterns); explicitly document the EP/album partial-eligibility case as deferred, not silently unhandled.

4. **The invite/opportunity surface mechanic**
   - What we know: CONTEXT explicitly asks whether this "ties to the existing Antenna/opportunities surface." The existing `opportunities`/`opportunity_matches` tables (migration 001) are industry-pro-created, genre/mood/BPM-matched listings that artists apply to — a fundamentally different flow (pull, algorithmic match) from a Funūn-staff-initiated targeted invite (push, hand-picked artist).
   - What's unclear: Whether product wants this literally inside the Antenna UI (a new `opportunities.type` value, e.g. `sync_library_invite`, with `created_by` = staff and matching bypassed) or as a wholly separate surface (a dashboard card reading `capability_grants`).
   - Recommendation: Treat as a NEW, separate notification/dashboard-card surface backed by `capability_grants` (Pattern 3), not a repurposed Antenna opportunity — the matching/apply semantics don't fit a hand-picked invite, and reusing them would require carving out exceptions in `lib/matching/antenna.ts`.

5. **Revocation semantics**
   - What we know: CONTEXT flags "what happens to in-flight buyer interest" when an artist withdraws as unresolved.
   - What's unclear: Whether a withdrawal should soft-block only NEW `license_requests` against the project, or also affect requests already `in_negotiation`/`terms_agreed`.
   - Recommendation: Withdrawal blocks new requests immediately (catalogue query stops returning the project); existing `license_requests` rows are left untouched (status pipeline continues) unless product explicitly wants an admin-notify-and-decide flow — flag for discuss-phase, don't silently cancel in-flight deals.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `DOCUSEAL_API_KEY` | Minting the blanket-agreement e-sign request | Configured in prod per Phase 17 (`lib/esign/docuseal.ts` reads it at call time) | n/a (env var) | Route throws a descriptive error if unset — no silent no-op, matching existing `requireApiKey()` behavior |
| `DOCUSEAL_WEBHOOK_SECRET` | Verifying the blanket-agreement completion webhook | Configured in prod per Phase 17 | n/a (env var) | Same fail-loud pattern (`requireWebhookSecret()`) |
| Supabase (migrations 001–095 live) | Schema baseline this phase builds on | LOCAL=REMOTE confirmed through 095 per STATE.md | — | New migration claims number 096+; push is human-gated per project convention |

**Missing dependencies with no fallback:** None identified — all required infrastructure (DocuSeal account, Supabase, `capability_grants`, `vault_documents`, staff RBAC) is already live.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (ts-jest, transpile-only), `testEnvironment: 'node'` |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest lib/sync-library` (once the new module directory exists) or targeted `npx jest <file>.test.ts` |
| Full suite command | `npx jest` (currently 135+ suites / 1600+ tests green per STATE.md) |

### Phase Requirements → Test Map
> No `SYNC-LIB-*` or similar requirement IDs exist yet in REQUIREMENTS.md — CONTEXT.md states requirements must be extracted from its own `<decisions>`/`<open_questions>` blocks rather than pre-registered IDs. The planner should register the concrete requirement set (submission flow, blanket-agreement e-sign, admission workflow, catalogue-gate replacement, invite mechanic) in REQUIREMENTS.md as part of this phase, following the existing convention (`REQUIREMENTS.md` gains a new `## v1.4 — Phase 26` section, mirroring Phase 23/25/28's additive sections).

| Behavior (draft, pending requirement-ID registration) | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------|
| `hasSyncLibraryCapability()` gate logic | unit | `npx jest lib/sync-library/eligibility.test.ts -x` | ❌ Wave 0 |
| Submission status-transition validators (submitted→agreement_signed→admitted/rejected/withdrawn, illegal transitions rejected) | unit | `npx jest lib/sync-library/submission.test.ts -x` | ❌ Wave 0 |
| `isRightsReady`'s replaced admission check | unit | `npx jest lib/deals/catalog.test.ts -x` | ✅ existing file, extend |
| `authorizeRequestTarget`'s admission check kept in sync | unit | `npx jest lib/deals/request-target.test.ts -x` (create if absent — grep found no existing test file for this module) | ❌ verify/Wave 0 |
| Webhook dispatch (split-sheet vs. blanket-agreement submission_id lookup) | unit | `npx jest lib/esign/webhook.test.ts -x` (extend) or a new `app/api/webhooks/docuseal/route.test.ts` if a route-level test precedent exists | ❌ Wave 0 — verify whether webhook route tests exist at all today |
| Counsel-review production-mint guard | unit | mirror `lib/split-sheets/agreement.test.ts`'s `assertCounselReviewedForProduction` coverage pattern | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `npx jest <touched-file>.test.ts -x`
- **Per wave merge:** `npx jest` (full suite) + `npx tsc --noEmit`
- **Phase gate:** Full suite green before `/gsd-verify-work`; human-gated migration push + `supabase migration list` LOCAL=REMOTE check before any live UAT

### Wave 0 Gaps
- [ ] `lib/sync-library/eligibility.test.ts` — covers the capability-grant gate
- [ ] `lib/sync-library/submission.test.ts` — covers the state-machine transitions
- [ ] Verify whether `app/api/webhooks/docuseal/route.ts` currently has ANY test coverage — a grep for a colocated `route.test.ts` did not surface one in this research pass; if absent, the dispatch-fix task needs its own test file created, not just extended
- [ ] `lib/deals/request-target.test.ts` — verify existence; if absent, Pattern 2's single-implementation fix needs a fresh test file

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirect) | Existing Supabase session auth via `createApiClient()`; no new auth mechanism introduced |
| V3 Session Management | no | No change to session handling |
| V4 Access Control | yes | Server-owned writes (session client for ownership check, service-role for the mutation) on every new route; `requireStaff()` on admission routes; RLS on the new submission table mirroring `capability_grants`'/`esign_envelopes`' server-owned-write + scoped-SELECT doctrine |
| V5 Input Validation | yes | Every new route param (project id, submission status transition, staff decision) validated server-side with an allowlist pattern, matching `buildCatalogFilter`'s `X_VALUES.includes(...)` convention — never trust raw client input for a status transition |
| V6 Cryptography | yes (indirect, delegated) | Webhook signature verification via `lib/esign/webhook.ts`'s existing HMAC scheme — reused, not reimplemented, for the blanket-agreement completion event |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Buyer bypasses the admission gate via direct PostgREST | Information disclosure | `loadCatalogPage` stays the sole server-side read path (existing doctrine); the new admission check lives inside it, not in a client-reachable table |
| Forged webhook fabricates an "admitted" blanket agreement | Spoofing/Tampering | Raw-body HMAC verification BEFORE any DB write (mirrors the existing `POST /api/webhooks/docuseal` ordering — verify first, touch DB second) |
| A non-invited artist submits a project by guessing the submit-route URL | Elevation of privilege | Server-side `hasSyncLibraryCapability()` check inside the submit route itself, not just UI-hidden — same doctrine as `greenRoomPosterGate` (app-layer) + RLS (DB-layer) double-gate pattern from Phase 28 |
| Staff admission route reachable by a non-staff session | Elevation of privilege | `requireStaff(['leadership', 'ae'])` (or the appropriate role set — confirm which staff roles admit, per account-taxonomy memory: Leadership/AE own Client Partner-adjacent workflows) at the top of every admin route, mirroring Phase 25's established pattern |
| Blanket-agreement PDF renders a party's name with dropped/mangled Unicode | Tampering (data integrity of a legal document) | MUST import `registerFunuunPdfFonts()` from `lib/vault/pdf/fonts.ts` — this is a previously SHIPPED bug (P17-08) on a near-identical renderer; skipping this import reintroduces it |

## Sources

### Primary (HIGH confidence — verified by direct file read this session)
- `.planning/phases/26-sync-library-inclusion/26-CONTEXT.md` — locked decisions + open questions
- `.planning/deliberations/buyer-catalogue-inclusion-model.md` — the deliberation this phase resolves
- `.planning/deliberations/sync-license-signing-model.md` — the adjacent, still-unresolved signing-model deliberation
- `lib/esign/provider.ts`, `lib/esign/docuseal.ts`, `lib/esign/webhook.ts` — the e-sign abstraction and live DocuSeal adapter
- `lib/deals/catalog.ts`, `lib/deals/catalog-query.ts`, `lib/deals/request-target.ts` — the current implicit inclusion gate to replace
- `lib/vault/readiness.ts`, `supabase/migrations/062_split_sheet_esign_envelopes.sql` — Vault readiness + the split-sheet-specific envelope schema (confirmed non-reusable as-is)
- `supabase/migrations/001_initial_schema.sql`, `042_capability_grants.sql` — `vault_projects`/`vault_documents`/`opportunities`/`capability_grants` schema
- `app/api/split-sheets/[id]/mint-envelope/route.ts`, `app/api/webhooks/docuseal/route.ts` — the mint/webhook patterns to mirror and the webhook-dispatch pitfall
- `.planning/phases/22-buyer-catalogue-light-ui/22-05-PLAN.md` — the drafted, currently-blocked downstream consumer plan
- `.planning/STATE.md` — migration currency (LOCAL=REMOTE through 095), account-taxonomy decisions, Phase 16/22/23/25/28 precedent
- `/Users/peterzora/.claude/projects/-Users-peterzora-Desktop-funun/memory/project_account_taxonomy.md` — staff/artist/industry/buyer account lanes, Leadership/AE curation authority signal
- `./.claude/CLAUDE.md` — project conventions (TS strict, no semicolons, `@/` imports, migrations human-gated)

### Secondary (MEDIUM confidence)
- `.claude/skills/spike-findings-funun/` — confirmed NOT relevant (Buffer/social-posting integration, unrelated domain)

### Tertiary (LOW confidence)
- None — no web search was performed for this phase; it is entirely internal/brownfield with no new external library or API to verify against public documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all reused infrastructure directly read from source
- Architecture: MEDIUM — the reuse-vs-new-table recommendations are well-grounded in existing patterns, but the exact data model is explicitly still an open owner/product decision (CONTEXT open question #1)
- Pitfalls: HIGH for the webhook-dispatch and `is_public` overload findings (both directly observed in source); MEDIUM for the counsel-review pitfall (inferred from Phase 17 precedent, not confirmed as required by counsel for THIS document)

**Research date:** 2026-08-07
**Valid until:** Stable domain (internal schema/architecture, no external API version drift risk) — revisit if migrations 096+ land before this phase plans, or if the sync-license-signing-model deliberation resolves in a way that changes the blanket agreement's scope (Assumption A5).
