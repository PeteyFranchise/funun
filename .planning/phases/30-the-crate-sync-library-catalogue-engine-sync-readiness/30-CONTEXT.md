# Phase 30: The Crate + Sync Library — Catalogue Engine & Sync Readiness - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning
**Source:** /gsd-explore — Team Member rooms review (`.planning/notes/team-member-rooms-review.md`, Deep Dive #1)

<domain>
## Phase Boundary

Turn the represented catalogue into a **managed engine** with three faces of ONE catalogue:
- **The Crate** (buyer storefront) — clean browse/search/filter of live, rights-ready tracks (already built, Phase 22).
- **The Crate + staff layers** (team view) — the SAME surface, role-aware, with staff-only info; where AEs curate Selects.
- **Sync Library** (backstage) — the inclusion gate, the Sync-Readiness worklist, and tag curation.

**In scope:** the inclusion gate, the Sync Readiness pipeline + worklist, layered tagging, and role-aware Crate layering.
**Out of scope:** the AE workspace / Selects / Client Partners rooms and the shareable Selects player — those are **Phase 31**.
</domain>

<decisions>
## Implementation Decisions

### Inclusion
- **Both, with a gate:** artists submit (mark a Vault track for sync) AND staff curate tracks in; everything passes a **staff review gate** before it goes live.
- **Incomplete ≠ rejected:** incomplete tracks enter a completion pipeline, not a bin.

### The gate checks
- **Rights are clear** → drives the rights badge (ready / partial / contact).
- **Quality bar** → audio quality + genuine sync fit.
- **Metadata complete** → tags, splits, ISRCs, etc.

### Sync Readiness (the completion pipeline)
- A **sync-specific readiness checklist** — a *subset* of the existing Sound Vault readiness engine (Wave 1). **Reuse that engine; do not rebuild it.**
- The **Funūn team guides the artist / artist team** to close gaps (collaborative — not just kick-it-back).
- A **worklist queue** in Sync Library lists every incomplete track + exactly what's missing, worked down over time.

### Tagging (the mood/genre/energy/etc. behind filters, search, brief-matching)
- **Layered, all three:** AI suggests (auto-listen), artist provides/confirms, staff curate/refine for consistency.

### Role-aware Crate (admin ↔ buyer split)
- **ONE catalogue surface** (The Crate). **Buyers** see the clean storefront; **team members** see the same surface with **staff-only layers** (rights details, readiness status, artist notes, in-progress tracks).
- **Sync Library** = backstage management of that same catalogue.

### Access
- **Sync Library curation:** leadership = full curation; **AE = browse & pull only** (into Selects). Two ability levels, one room.
- Staff-layered Crate view = team members; clean Crate = public/buyer.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope + decisions
- `.planning/notes/team-member-rooms-review.md` — the exploration this phase is scoped from (Deep Dive #1 = the catalogue). Read the "Catalogue summary" block.

### Existing systems to EXTEND / REUSE (do NOT rebuild)
- **Phase 26** (`.planning/phases/26-sync-library-inclusion/`) — the existing Sync Library inclusion work; extend it, don't duplicate.
- **Wave 1 readiness engine** (`lib/vault/readiness.ts` + `types/index.ts` READINESS_ITEMS) — Sync Readiness is a *subset* of this.
- **The Crate UI** — `components/buyer/CatalogBrowserLight.tsx`, `components/buyer/fnbl-theme.ts` — the surface staff layers attach to.
- **Catalogue data layer** — `lib/deals/catalog*.ts` (query / sample / filter) + `lib/sync-library/*`.
- **AI tagging** — the existing Anthropic SDK usage (`lib/anthropic/`, `lib/buyer/brief-ai.ts`) as the pattern.
- **Staff gate** — `lib/admin/gate.ts` (`requireStaff`) for the Sync Library room + staff layers.
</canonical_refs>

<specifics>
## Specific Ideas
- Rights badge (ready/partial/contact) is a function of the gate's rights check.
- AEs build Selects from the staff-layered Crate — Phase 31 consumes this surface.
- The Sync Library room's access was set in the review: leadership curates, AE browses & pulls.
</specifics>

<deferred>
## Deferred Ideas
- AE workspace, Selects build/send, Client Partners rooms → **Phase 31**.
- Peripheral admin rooms (Green Room, etc.) → tabled (see review note).
- 22-05 scope BEYOND "live rows show their authored tags + staff layers" → stays separate.
</deferred>

<resolved_after_research>
## Resolved after research (2026-08-12) — planner MUST honor these

- **Staff-layered Crate location:** the **same `/sync/catalog` surface, role-aware** — team members see extra layers (rights details, readiness status, artist notes, in-progress tracks) on the very page buyers browse. NOT a separate `/admin/crate` route.
- **Live-data enrichment (Phase 22 "22-05"):** **INCLUDE the minimal slice** Phase 30 needs — live catalogue rows must render their real authored tags + the staff layers. The role-aware Crate and visible tagging cannot be delivered on fixtures alone. Defer any broader 22-05 scope.
- **Sync Library access (fix shipped mismatch):** implement the review decision — **leadership = full curation (admit/reject/remove); AE = browse & pull only.** The shipped `app/api/sync-library/admin/[listingId]/route.ts` currently grants AE full admit/reject via `requireStaff(['leadership','ae'])` — **tighten admit/reject to leadership-only**; AE keeps browse + pull-into-Selects (no curation writes).
- **Readiness granularity:** Sync Readiness is **per-track** (`sync_listings` is track-level). **Derive** per-track readiness from the existing project-level readiness engine + legal-doc gate (compose them — do NOT invent a 4th independent readiness signal); Phase 18's `coverageTier()` is the closest precedent for the track-vs-project reconciliation. Planner resolves the exact derivation.
- **Quality bar signal:** treat as a **manual staff judgment** at the gate for v1 (no automated audio-quality analysis) unless the planner finds a cheap existing signal.
- **Tag curation + approval (Pete, 2026-08-13):** AEs **CAN propose/refine** a song's tags — but an AE's refinement is a **PROPOSAL that requires approval**, approved by **Leadership OR a new "A&R" role**. Tag proposals made *by* leadership/A&R auto-confirm; **AE proposals sit `pending` until a leadership/A&R approve action** confirms (or rejects) them. This supersedes the earlier "leadership-only tag curation" note.
- **NEW staff role "A&R" (`anr`):** introduce alongside `leadership`/`ae`/`bd` (the role model is extensible — see review note). Widening `funun_staff.staff_role`'s CHECK + `lib/admin/staff-role.ts` (`StaffRole` union + `ALL_STAFF_ROLES`) is an **OWNER-RUN migration** change. A&R's Phase-30 power = approve/reject AE tag proposals (+ inherits nothing else here). NOTE: admit/reject curation stays **leadership-only** (unchanged); A&R is a tag-approval authority, not a full curator, in this phase.
- **Dependency fix (plan-checker blocker):** `30-07` `depends_on` must be `[30-01, 30-02]` (it reuses `rightsBadge` from 30-01's `gate.ts`).
</resolved_after_research>

---

*Phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness*
*Context gathered: 2026-08-12 via /gsd-explore*
