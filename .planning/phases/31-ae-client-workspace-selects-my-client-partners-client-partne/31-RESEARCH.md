# Phase 31: AE Client Workspace + Selects (My Client Partners / Client Partners) - Research

**Researched:** 2026-08-15
**Domain:** Internal B2B sales-ops console (Next.js 15 App Router, Supabase) + a public token-addressed audio player with content protection
**Confidence:** MEDIUM — the internal Team Console build (CRUD rooms, RLS, notifications) is HIGH confidence (dense shipped precedent, Phases 16/23/25/28/30 all touch the same substrate). The watermarking/content-protection pipeline and the multi-role Team model are LOW confidence — both are genuinely net-new to this codebase and need their own spikes before Slice 1 can fully ship.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (watermarking):** Layered watermark — preview stream carries a subtle audible tag (non-intrusive, a 30s+ evaluative listen must stay meaningful for R13); the download carries a **clean-sounding forensic watermark** (no audible tag).
- **D-02:** Download **defaults to full-length**, forensically marked; AE can cap length or disable download per Selects at send time.
- **D-03:** The forensic payload encodes **both the Selects and the recipient/share-token** — a leak traces to the grantee it was issued to. *Note: watermarking mechanism/tooling is net-new — a research task. Per-recipient forensic marking implies a per-share render.*
- **D-04 (build order):** Slice the phase; **outbound Selects motion first**.
  - **Slice 1:** My Client Partners list + person/company workspaces, CRM-lite contacts + relationship log, role-aware nav (AE sees own book), Crate Requests, Selects builder, watermarked player. Goal: a client actually receives a Selects.
  - **Slice 2:** computed health + rules config, leadership tower + assign/route + assignment email + The Playbook, engagement telemetry (R13), Game Plan (R14), saved/team-shared searches.
- **D-05:** Slice 1 includes the CRM-lite people layer (not deferred). "Own book" filtering in slice 1 uses the **existing `buyer_orgs.ae_user_id`** (mig 090) — assign/reassign UI + email + log-write stay in slice 2.
- **D-06 (health freshness):** Health is **computed live on read**, never stored/scheduled. No cron, no staleness. Makes R4's "recompute on rule save" a non-issue.
- **D-07 (assignment handoff):** Locked email + SOP checklist + start-task link, **plus** an in-app notification **and** an auto-created Intro/Onboarding task from the Playbook SOP dropped into the AE's queue, pre-linked to the account. Uses existing `lib/notifications`; task-queue model may be net-new. Email-delivery failure must not block the assignment.
- **D-08 (contacts):** Multiple contacts per company, one flagged primary (drives default email/call); the Clients tab lists all people across companies.
- **D-09:** Rich contact record — name, title/role, company, email(s), phone(s), LinkedIn/social, timezone, tags, address, notes, **+ custom fields**. Export-friendly for a future real CRM.
- **D-10:** Relationship pipeline stages are **leadership-configurable** with a seeded default (New lead → Contacted → Active → Negotiating → Closed/Dormant); "days in stage" measures against it. Same "one place to adjust as we grow" pattern as health rules and the engagement threshold.
- **D-11 (AI draft):** AI Selects-draft is a rights-ready-first, ~10-track reviewable starter (tracklist + cover note + per-track "why it fits") off the brief; AE curates/edits before send. Not a hard rights-ready-only filter — badges shown, rights-ready prioritized. "AI drafts, AE curates."
- **D-12 (saved searches):** Any AE saves privately and can flip one to team-shared; all AEs can recall team searches, no leadership gate.
- **D-13 (player UI):** The shareable player is the one client-facing, brand-critical surface; it runs through `/gsd-ui-phase` before build (done — `31-UI-SPEC.md` Family B, built reference `.planning/design/phase-31-shareable-music-player.html`).

### Claude's Discretion
- The audible-tag's exact character (lean tonal/soft over spoken, to preserve evaluability — UI-SPEC defaults to "a brief, soft sub-audible tonal pulse at fixed intervals," flagged for owner confirmation before the watermarking spike locks it in).
- Crate Requests' exact Hot/Warm/New-lead thresholds (SPEC locks only the ordering: briefs > repeat searches > re-opens > browsing).
- The leadership-config surface's exact form (health rules, pipeline stages, engagement threshold).
- Everything in the UI-SPEC tagged "Source: default — Claude's discretion" (e.g., Crate Requests' Hot-chip color choice, the 12px insight-row padding).

### Deferred Ideas (OUT OF SCOPE)
- AI-guided company knowledge wiki (searchable, ask-a-question) — own future phase; The Playbook is its seed.
- GTM metrics dashboards + the Deals room rebuild — separate rooms/phases (this phase surfaces only a per-AE performance summary in the tower).
- Peripheral admin rooms (Artist Invites, Industry Members, PitchPlug·Curators, Checklist Items, Tips, E-Sign Usage, Directory).
- Green Room Placements.
- Buyer-facing Brief Builder / My Briefs (already shipped, this session).
- **Vibe Match** (outside-reference → catalogue matcher in the Brief Builder) — explicitly future; Suggested Songs is its seed, do not build it here.
- Client-authored playlists living in The Crate as a distinct "My Playlists" surface — mentioned in project memory as a separate future Crate feature; only the co-edit-on-an-existing-Selects behavior is in scope here.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are yet registered in `REQUIREMENTS.md` for Phase 31 (consistent with the project's own noted pattern for Phases 16/22/23/25/28 — registration lags; a future `/gsd-docs-update` pass closes the gap). Requirement numbers below are `31-SPEC.md`'s R1–R14; the planner should register them in `REQUIREMENTS.md` under a new "v1.4/v1.2 — Phase 31" section using the same traceability-table convention as Phase 30.

| ID | Description | Research Support |
|----|-------------|------------------|
| R1 | My Client Partners list (Clients/Companies tabs) + person/company workspace (4 jobs) | Existing `MyCompanies.tsx`/`BuyerOrgsAdmin.tsx`/`ClientPartnerDetail.tsx` are the surfaces to REPLACE, not extend (see Architecture Patterns). `buyer_orgs` schema audited; `website` column and CRM-lite contacts table are net-new. |
| R2 | Insight columns — show/hide/reorder/sort, per-AE persisted | `@dnd-kit` already installed & proven (ChecklistAdmin.tsx, CuratorAdmin.tsx) — reuse for column reorder. Persistence mechanism = console-theme's cookie pattern (see Code Examples). |
| R3 | Relationship health (computed live, override/snooze with expiry) | D-06 locks "computed on read, never stored" — only override/snooze rows need a table. Pure-function scoring pattern mirrors `lib/deals/stage-machine.ts`'s pure-predicate style. |
| R4 | Health-rules config (leadership-only, live preview) | Net-new config table; D-06 makes "recompute on save" a non-issue since nothing is cached. |
| R5 | Role-aware nav + leadership hold-queue | Existing `getStaffRole()`/`requireStaff()` pattern (Phase 25) already does AE-vs-leadership branching identically in `my-client-partners/page.tsx`, `lead-engine/page.tsx`, `client-partners/[orgId]/page.tsx`. Hold-queue = the same list query with `.is('ae_user_id', null)`. |
| R6 | Client Partners leadership tower (any client, same list/column model) | `buyer-orgs/page.tsx` is today's tower — rebuild on the R1/R2 list component. |
| R7 | Assign-to-AE (atomic, logged, notified) | Precedent exists: `lib/staff/scope.ts` (`isAssignedToOrg`), `lib/staff/notifications.ts` (`buildAeAssignedNotification`/`buildAeUnassignedNotification`), `PATCH .../ae` route pattern from Phase 25 (25-05/25-09). Needs a new relationship-log write. |
| R8 | Automated assignment email + SOP checklist + task | `lib/email/staffInvite.ts` + `lib/notifications/index.ts` are the templates to mirror. The auto-created task queue is net-new (see Don't Hand-Roll). |
| R9 | The Playbook (SOP library, leadership/ops-editable) | Net-new schema (`playbook_sops`, ordered steps). Introduces the "ops" role term used nowhere else in the current `StaffRole` union — see Common Pitfalls #1. |
| R10 | Crate Requests demand inbox (absorbs Lead Engine) | `lead-engine/page.tsx` + `buyer_briefs` (migration 106, drafted not pushed) is the direct precedent to extend into a ranked, multi-source feed. |
| R11 | Selects builder (build/AI-draft/from-brief, auto-save, saved searches) | `crate-lead-engine-BUILD-SPEC.md` §1–§4 is the authoritative schema/route sketch; `lib/buyer/brief-ai.ts` is the exact Anthropic SDK pattern to reuse for AI-draft. |
| R12 | Shareable Selects player (`/selects/[token]`, watermarked, no login) | `CatalogBrowserLight.tsx` currently has **no real preview audio** (simulated playhead — see Common Pitfalls #2); real signed-URL streaming precedent lives in `app/(artist)/vault/[projectId]/play/page.tsx`. Watermarking pipeline is net-new (D-01/D-03). |
| R13 | Selects engagement tracking (qualified listen ≥30s audible time) | Net-new event/telemetry schema; needs a client-side audible-time accumulator, not a naive play-duration timer (see Common Pitfalls #4). |
| R14 | Game Plan (pre-call topics, log conversation → relationship log) | Net-new schema (`game_plan_topics`/`game_plans`); ties into The Playbook's Topics asset type and the Selects pipeline room's "+ Game Plan" action (per UI-SPEC). |
</phase_requirements>

## Summary

Phase 31 is a large, design-complete internal-tools build on top of a codebase that already has every access-control, notification, and migration convention this phase needs — **except** two genuinely net-new pieces: (1) audio content-protection/watermarking, and (2) a multi-role ("roles as a set") Team Member model that the locked mockups (`phase-31-team.html`, folded into the main mockup 2026-08-15) now require but that today's `funun_staff`/`app_metadata.staff_role` schema does not support (it's a single-value union: `'leadership' | 'ae' | 'bd' | 'anr'`).

Everything else — role-scoped list pages, staff-only tables with zero RLS policies reachable only by service role, column-privilege GRANT/REVOKE discipline, best-effort notification+email side effects, owner-run migrations, Anthropic-SDK structured drafting — has 3–5 phases of dense, load-bearing precedent in this exact repo (Phases 16, 23, 25, 26, 28, 30). The planner should treat those phases' shipped code as the primary "how," not general Next.js/Supabase knowledge.

The three rooms currently live as thin scaffolding that must be **replaced**, not extended: `app/(admin)/admin/my-client-partners/page.tsx` + `components/admin/MyCompanies.tsx` (card list, inline rename, no drill-in), `app/(admin)/admin/buyer-orgs/page.tsx` + `components/admin/BuyerOrgsAdmin.tsx` (same shape, leadership-only), `app/(admin)/admin/client-partners/[orgId]/page.tsx` + `components/admin/ClientPartnerDetail.tsx` (a bare member list, no four-job workspace), and `app/(admin)/admin/lead-engine/page.tsx` (a read-only brief feed with zero actions). All four already implement the exact `ae_user_id`-based own-book scoping this phase needs — reuse the *scoping pattern*, replace the *rendering*.

**Primary recommendation:** Build Slice 1 (D-04) in this order — (a) migrations for `selects`/`selects_tracks`/`selects_reactions` (revised to key on `tracks.id`, not a generic `text` ref) + the CRM-lite contacts/relationship-log tables + `buyer_orgs.website`, all owner-run per this repo's standing convention; (b) staff-gated API routes over that schema, reusing `requireStaff()`/`isAssignedToOrg()`; (c) the My Client Partners / Client Partners list+workspace components (net-new, informed by but not copy-pasting the old `MyCompanies`/`BuyerOrgsAdmin`); (d) the Selects builder wired to `lib/deals/catalog.ts`'s `isRightsReady` for badges and `lib/buyer/brief-ai.ts`'s Anthropic pattern for AI-draft; (e) the `/selects/[token]` SSR player LAST within slice 1, gated behind its own watermarking spike (a stream-only "Preview" tag pass can ship before the forensic-download pipeline is ready — sequence the download-gate as a fast-follow if the spike runs long).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| My Client Partners / Client Partners list + workspace | API / Backend (Next.js server components + service-role Supabase) | Browser/Client (interactive table, tabs, popovers) | Server components fetch scoped data (own-book vs. all); client components own drag/sort/popover interaction state — matches every existing `/admin/*` room in this codebase. |
| Relationship health scoring | API / Backend (computed at request time, pure TS function) | — | D-06 locks "computed live on read" — no caching tier, no cron, no Edge Function. A pure predicate module (mirroring `lib/deals/stage-machine.ts`) run inside the server component/route. |
| Health-rules / pipeline-stage / engagement-threshold config | Database / Storage (config table) + API (leadership-gated write) | Browser/Client (live-preview form) | "One place to adjust as we grow" — persisted config, not env vars, so leadership can tune without a deploy. |
| Assignment + notification + audit | API / Backend (atomic route: write `ae_user_id`, insert relationship-log row, call `createNotification`, best-effort `sendEmail`) | — | Mirrors Phase 25's `PATCH .../ae` route exactly; email/notification are side effects that must never block the primary write. |
| Selects builder (curate, AI-draft, auto-save) | API / Backend (persistence, AI call) | Browser/Client (drag-add tracks, per-track notes, auto-save debounce) | Anthropic calls and rights-ready evaluation must run server-side (API keys, DB reads); the curation UI itself is client-heavy. |
| `/selects/[token]` shareable player | Frontend Server (SSR) | CDN/Static (OpenGraph image, watermarked audio via signed URL) | Locked as SSR + service-role read (BUILD-SPEC §4) so a valid token needs no login and RLS is bypassed deliberately (the token itself is the authorization). |
| Watermarking / forensic marking pipeline | API / Backend (a dedicated render step, likely async/queued) | Database/Storage (a private "rendered previews" bucket, keyed by selects_track + share_token) | Compute-heavy audio transcode; must NOT run inline inside a Vercel Hobby 10s serverless request (see Common Pitfalls #5). |
| Engagement telemetry (qualified listens) | Browser/Client (audible-time accumulator, batched POST) | API / Backend (event ingestion + aggregation) | Must distinguish real audible playback from seek/scroll — client owns the timer, server owns the trustworthy record and the qualified-listen threshold check. |
| Team roles-as-a-set model | Database/Storage (role storage: array column or join table) | API / Backend (`hasStaffRole()`/room-gating) | A genuinely new cross-cutting change to the existing single-value `StaffRole` — see Common Pitfalls #1; touches every existing `getStaffRole(user) === X` call site. |

## Standard Stack

### Core (all already installed — no new packages required for Slice 1's data/API layer)

| Library | Version (installed) | Purpose | Why Standard (this repo) |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 | Service-role + session Supabase clients | Every existing `/admin/*` room and every migration in this repo |
| `next` | 15.0.0 | App Router server components, API routes | Project-wide |
| `@anthropic-ai/sdk` | 0.52.0 [VERIFIED: npm registry — installed version confirmed via `package.json`; the AI-draft/rerank pattern in `lib/buyer/brief-ai.ts` is the reuse target] | AI-drafted Selects starter + Suggested Songs ranking | Reuses the EXACT pattern already shipped for Brief Builder v1.1's `rerankCandidates()` |
| `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | 6.3.1 / 10.0.0 / 3.2.2 [VERIFIED: npm registry — `npm view @dnd-kit/core version` returns 6.3.1, matching the installed range] | Column reorder (R2), SOP-step reorder (The Playbook), Selects Board manual-override drag | Already used in `components/admin/ChecklistAdmin.tsx` and `components/admin/CuratorAdmin.tsx` — no new dependency |
| `resend` | 4.0.0 | Assignment handoff email (R8) | `lib/email/index.ts`'s `sendEmail()` wrapper is the only email path in the codebase — reuse, do not add a second provider |
| `zod` | 3.23.0 | API input validation for new routes (contacts, Selects, health-rules config) | Project-wide convention (`CLAUDE.md`) |

**Note:** `@anthropic-ai/sdk` 0.52.0 and `resend` 4.0.0 are both several minor/major versions behind the current registry latest (0.117.1 and 6.20.0 respectively, checked 2026-08-15). Upgrading either is **out of scope for this phase** — flagged only so the planner doesn't assume the installed API surface matches the newest SDK docs if researching further.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| existing `lib/notifications/index.ts` `createNotification()` | n/a (in-repo) | In-app bell notification + optional email copy | Every cross-user event this phase introduces (assignment, SOP task, "today's play" is a UI banner, not a notification row) |
| existing `lib/staff/audit.ts` `logStaffAction()` | n/a (in-repo) | Staff-write audit trail | Every leadership-only mutation (health-rules save, SOP edit, assignment) — mirrors Phase 25's doctrine |
| existing `lib/deals/catalog.ts` (`isRightsReady`, `isAdmittedToSyncLibrary`) | n/a (in-repo) | Rights-ready badge in the Selects builder | Single source of truth — do not re-derive rights-ready logic inside the Selects builder |
| existing `lib/deals/stage-machine.ts` pattern | n/a (in-repo) | Selects status pipeline (draft→sent→approved/changes_requested) + the cross-client Selects room's event-derived stage transitions | Pure forward-pipeline validator — mirror this shape, don't hand-roll a new one |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A pure-TS "computed live" health scorer (D-06) | A stored/cached health column + a recompute trigger | Rejected by the user's own decision (D-06) — "founder/small-team scale... revisit only if the book gets large." Do not build the cached version. |
| One `funun_staff.staff_role` TEXT column widened with more CHECK values | `TEXT[]` roles array or a `staff_member_roles` join table | The mockup's "a person can hold several roles" model needs a genuine set, not a wider single-value enum — see Common Pitfalls #1 for the recommended approach. |
| A generic polymorphic `activity_log` table for all of relationship-log + assignment log + Game Plan log | A dedicated `client_relationship_log` table scoped to `buyer_orgs`/contacts | This repo's convention is one purpose-built table per concern (`staff_audit_log`, `verification_audit_log`) rather than a shared polymorphic log — follow that precedent. |

**Installation:** none required for Slice 1's data/API layer. A watermarking dependency (ffmpeg wrapper or a forensic-watermarking service SDK) is a **research/spike output**, not a locked recommendation — see Package Legitimacy Audit and Common Pitfalls #5.

**Version verification:** `@dnd-kit/core` (6.3.1) and `@anthropic-ai/sdk` (0.52.0) confirmed present in `package.json` and current on the npm registry as of 2026-08-15 checks above.

## Package Legitimacy Audit

**No new external packages are required to build Slice 1's data model, API routes, or the internal Team Console rooms.** Every library needed (Supabase, Next.js, Anthropic SDK, dnd-kit, Resend, Zod) is already installed and already has a load-bearing precedent elsewhere in this codebase (cited above).

The one genuinely open external dependency is the **watermarking/forensic-marking pipeline** (D-01/D-02/D-03). This is explicitly called out in `31-CONTEXT.md` as "a research task" and nothing in `package.json`, `node_modules`, or the codebase references ffmpeg, sox, or any audio-watermarking library today (confirmed via grep — zero matches). Any specific package name for this (e.g. an `ffmpeg` wrapper like `fluent-ffmpeg`, or a third-party forensic-watermarking API/SDK) has **not** been verified against an authoritative source in this research session and must be tagged `[ASSUMED]` if surfaced in planning, with a `checkpoint:human-verify` gate before install, per this phase's own content-protection stakes (this is exactly the kind of "compliance/security-adjacent, multiple valid approaches" claim the provenance rules ask to hold back from presenting as fact).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none required for Slice 1's core data/API/UI layer) | — | — | — | — | — | Not applicable |

**Packages removed due to [SLOP] verdict:** none — no packages were proposed.
**Packages flagged as suspicious [SUS]:** none — no packages were proposed.

*A watermarking dependency choice is deferred to a dedicated spike (see Open Questions #1). When that spike names a candidate package, it MUST go through the Package Legitimacy Gate (`gsd_run query package-legitimacy check`) before being written into a plan, and any install must be gated behind `checkpoint:human-verify`.*

## Architecture Patterns

### System Architecture Diagram

```text
                     ┌─────────────────────────────────────────────┐
                     │              Team Console (.fncon)            │
                     │         app/(admin)/layout.tsx (role-gated)    │
                     └───────────────┬─────────────────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        │                              │                               │
        ▼                              ▼                               ▼
 My Client Partners            Client Partners (tower)          Crate Requests
 (AE: own book only)           (leadership: all + assign)       (intent-ranked feed)
   getStaffRole() != 'leadership'   getStaffRole() == 'leadership'   buyer_briefs +
   → .eq('ae_user_id', user.id)     → unscoped query                 search activity +
        │                              │                              Selects re-opens
        └──────────────┬───────────────┘                                    │
                        ▼                                                   │
              Company / Person workspace                                    │
        (Contacts CRM · Activity · Curation/Selects · Notes+status)         │
                        │                                                   │
                        ▼                                                   │
                 Selects builder  ◄───────────── "Build Selects" action ────┘
        (from scratch / off a brief / AI-drafted via Anthropic SDK)
                        │
                        │  Send (mints share_token)
                        ▼
        ┌───────────────────────────────────────────────────┐
        │   selects / selects_tracks / selects_reactions       │
        │   (Supabase, service-role writes, owner-run migration)│
        └───────────────────────┬───────────────────────────┘
                                 │  GET /selects/[token]  (SSR, no login)
                                 ▼
                  Shareable Selects player (public route)
        watermarked preview stream ◄── watermark render pipeline (net-new)
        forensic-marked download   ◄── (per-Selects/share_token render)
        reactions (love/pass) → selects_reactions
        engagement events → selects_track_events (audible-time accumulator)
                                 │
                                 ▼
              back into the AE's Selects workspace view
        (per-track plays/qualified-listens/replays, Selects-level summary)
```

### Recommended Project Structure

```text
app/(admin)/admin/
├── my-client-partners/page.tsx        # rebuild: list+tabs, own-book scoped
├── client-partners/page.tsx           # NEW: leadership tower list (today's buyer-orgs/page.tsx)
├── client-partners/[orgId]/page.tsx   # rebuild: 4-job workspace (Contacts/Activity/Curation/Notes)
├── clients/[personId]/page.tsx        # NEW: person workspace (mirrors company, + Game Plan)
├── crate-requests/page.tsx            # rebuild of lead-engine/page.tsx (absorbs it, R10)
├── selects/page.tsx                   # NEW: cross-client Selects pipeline room (List/Board)
├── selects/[id]/page.tsx              # NEW: Selects builder detail
├── playbook/page.tsx                  # NEW: SOPs + Topics + Plays editor
└── team/page.tsx                      # rebuild of team-members/ per phase-31-team.html (roles-as-set)

app/selects/[token]/page.tsx           # NEW: the public shareable player (SSR, outside (admin))
app/api/admin/client-partners/         # NEW: assignment, contacts, relationship-log routes
app/api/admin/selects/                 # NEW: builder CRUD, AI-draft, send
app/api/admin/health-rules/            # NEW: leadership-only config CRUD
app/api/admin/playbook/                # NEW: SOPs/Topics/Plays CRUD
app/api/selects/[token]/               # NEW: react, respond, engagement-event ingest (public, token-gated)

lib/client-partners/                   # NEW domain module: contacts, relationship-log, health scoring, pipeline stages
lib/selects/                           # NEW domain module: builder persistence, ai-draft (mirrors lib/buyer/brief-ai.ts), status pipeline
lib/playbook/                          # NEW: SOPs/Topics/Plays CRUD helpers
lib/watermark/                         # NEW: the content-protection pipeline (spike output)

components/admin/
├── ClientPartnersList.tsx             # NEW: shared list+column component (R1/R2/R6 reuse the same component)
├── ClientWorkspace.tsx                # NEW: 4-job workspace shell (company + person)
├── SelectsBuilder.tsx                 # NEW
├── SelectsPipelineRoom.tsx            # NEW: List/Board toggle
├── PlaybookAdmin.tsx                  # NEW
└── TeamRolesAdmin.tsx                 # rebuild of StaffAdmin.tsx for the roles-as-set model

components/selects-player/             # NEW: the Family B client-facing player components
```

### Pattern 1: Own-book scoping (role × room)

**What:** Every staff-facing list/route branches on `getStaffRole(user)`: AE/BD/A&R see only rows where `ae_user_id === user.id`; leadership sees everything unscoped.

**When to use:** Every new route/page this phase adds that touches `buyer_orgs`-rooted data (companies, contacts, Selects, Crate Requests, health).

**Example (existing, verbatim shape to reuse):**
```typescript
// Source: app/(admin)/admin/my-client-partners/page.tsx (this repo)
const role = getStaffRole(user)
if (!role) redirect('/')

let query = service.from('buyer_orgs').select(ORG_COLUMNS).order('created_at', { ascending: false })
if (role !== 'leadership') {
  query = query.eq('ae_user_id', user.id)
}
```
Detail-page scope-denial pattern (also reuse — 404, not 403, so org existence is never leaked):
```typescript
// Source: app/(admin)/admin/client-partners/[orgId]/page.tsx (this repo)
if (!orgRow) notFound()
if (staffRole !== 'leadership' && !isAssignedToOrg(orgRow, user.id)) notFound()
```

### Pattern 2: Server-owned writes + column-privilege GRANT/REVOKE

**What:** Every new table this phase adds gets RLS enabled; buyer-facing tables (if any) get a narrow SELECT policy via the existing `is_buyer_org_member()` helper; every write is REVOKEd from `authenticated`/`anon` and only reachable through a `requireStaff()`-gated service-role route. Purely internal/staff tables (contacts, relationship-log, health-rules config, Playbook, Game Plan) should follow `funun_staff`/`staff_audit_log`'s **zero-RLS-policy + full REVOKE** shape — reachable only by service role — since no buyer ever needs to read them directly.

**When to use:** Every net-new migration in this phase.

**Example:**
```sql
-- Source: supabase/migrations/089_funun_staff_and_audit.sql (this repo) — the "staff-only, zero policy" shape
ALTER TABLE public.funun_staff ENABLE ROW LEVEL SECURITY;
-- No policies created for any role — RLS-enabled + zero policies denies ALL row access by construction.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.funun_staff FROM authenticated, anon;
```
```sql
-- Source: supabase/migrations/106_buyer_briefs.sql (this repo) — the buyer-readable-arm shape (for selects when the client co-edits it)
CREATE POLICY "buyer_briefs_select_own_org" ON public.buyer_briefs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_buyer_org_member(buyer_briefs.buyer_org_id, auth.uid())));
REVOKE UPDATE, INSERT, DELETE ON public.buyer_briefs FROM authenticated, anon;
```

### Pattern 3: Best-effort notification + email side effects that never block the primary write

**What:** The primary DB mutation (assignment, e.g.) commits first; notification + email are wrapped and their failure is swallowed/logged, never surfaced as a write failure. This is what makes R8's "an email-delivery failure does not block the assignment" acceptance criterion trivial to satisfy — it is already this repo's default posture.

**Example:**
```typescript
// Source: lib/staff/notifications.ts + lib/notifications/index.ts (this repo) — pure builder, then a best-effort call
const payload = buildAeAssignedNotification({ recipientId, orgId, orgName, actorId })
// call site wraps this in try/catch per CLAUDE.md's documented convention (lib/social/activity-emit.ts)
await createNotification(service, payload) // returns {ok, error} — never throws
```

### Pattern 4: Pure predicate/state-machine modules for anything with legality rules

**What:** Status pipelines (Selects draft→sent→approved/changes_requested; the deal-stage-style Selects room funnel Lead→Build→Move→Close) and health-band computation should be pure, I/O-free TypeScript functions unit-testable without a DB — mirroring `lib/deals/stage-machine.ts`.

**Example:**
```typescript
// Source: lib/deals/stage-machine.ts (this repo) — the shape to mirror for Selects status + health-band derivation
export function isLegalTransition(from: DealStage, to: DealStage): boolean { /* pure, no I/O */ }
```

### Anti-Patterns to Avoid

- **Re-deriving rights-readiness inside the Selects builder:** `lib/deals/catalog.ts`'s `isRightsReady()`/`isAdmittedToSyncLibrary()` are the single named authority (T-26-24 doctrine in this repo — "no third inline copy"). Import them; do not re-implement the threshold check.
- **Storing computed health:** D-06 is explicit — no cached/stored health column, no cron. A stored value would silently drift the moment health-rules config changes (defeating R4's "saving new rules recomputes health across all accounts," which is automatically true only because nothing is cached).
- **Treating `ae_user_id`-style ownership columns as a GRANT-safe default:** Postgres column GRANTs are an explicit allowlist — a new private/staff-only column (e.g. any new `client_relationship_log.internal_note` type field) is private by default and must be *deliberately excluded* from any GRANT, not just "not yet added." Migration 090's own comment calls this out as the pattern to follow.
- **Copy-pasting the old `MyCompanies.tsx`/`BuyerOrgsAdmin.tsx` card-list components and bolting drill-in onto them:** the UI-SPEC's list+tabs+insight-columns+workspace shape is different enough (tabs, 10–12 sortable/hideable columns, a four-job workspace) that these should be net-new components informed by the old scoping logic, not incremental patches to the existing thin scaffolding.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rights-ready badge on a catalogue track | A new "is this track licensable" check inside the Selects builder | `lib/deals/catalog.ts`: `isRightsReady(project, stage3)`, `isAdmittedToSyncLibrary()` | Already the single source of truth for three other callers (`catalog-query.ts`, `request-target.ts`, `shortlists.ts`); a fourth inline copy WILL drift |
| Signed, time-limited audio URLs | A custom signing scheme | Supabase Storage `createSignedUrl`/`createSignedUrls` (2hr TTL precedent in `app/(artist)/vault/[projectId]/play/page.tsx` and `lib/sync-library/hub-access.ts`) | Already proven at scale in this repo for private audio delivery |
| Staff-only, zero-buyer-access tables | Ad-hoc RLS policies that "just don't grant to authenticated" | The zero-RLS-policy + full REVOKE shape (migration 089) | An RLS-enabled table with zero policies is fail-closed by construction; a hand-rolled "deny" policy is one bug away from an accidental allow |
| Assignment/audit trail | A bespoke event table per feature | `lib/staff/audit.ts`'s `logStaffAction()` + `staff_audit_log` | One centralized write-through call already exists and is the established review surface for every staff mutation |
| Drag-and-drop reordering (columns, SOP steps, Selects Board override) | A new drag library or hand-rolled pointer-event reordering | `@dnd-kit/core`/`sortable`/`utilities` (already installed, already proven in `ChecklistAdmin.tsx`/`CuratorAdmin.tsx`) | Zero new dependency; consistent interaction feel across the console |
| AI-structured drafting (Selects starter, "why it fits" reasons) | A new prompt/response scaffolding | `lib/buyer/brief-ai.ts`'s pattern: `new Anthropic({apiKey})`, `model: 'claude-sonnet-4-6'`, filter `TextBlock`s, single-shot structured JSON | Already shipped, already handles the "AI drafts, an expert curates" framing this phase's D-11 wants |
| Transactional email | A new email template system | `lib/email/index.ts`'s `sendEmail()` (Resend) + the `lib/email/*Invite.ts` template pattern | The only configured email provider in the app; `RESEND_API_KEY`/`RESEND_FROM_EMAIL` gate already handles "not configured" as a safe no-op |

**Key insight:** Nearly every "hard part" of Slice 1 already has a named, tested, single-source-of-truth helper somewhere in this repo from an adjacent phase (16/23/25/26/28/30) that shipped the exact same *class* of problem (rights-ready gating, staff scoping, audit trails, best-effort notifications). The actual net-new engineering surface is narrower than the SPEC's 14 requirements suggest — it's the CRM-lite schema, the Selects/telemetry schema, and the watermarking pipeline. Everything else is "wire the existing pattern to new tables."

## Common Pitfalls

### Pitfall 1: The "roles as a set" Team model breaks the current single-value `StaffRole` union
**What goes wrong:** `31-CONTEXT.md`'s canonical refs point at `components/admin/console-theme.ts`'s "role model (leadership/ae/bd/anr, roles-as-data)" as already supporting "roles as data" — but the actual enforcement point, `lib/admin/staff-role.ts`, is a **single-value** resolver:
```typescript
export type StaffRole = 'leadership' | 'ae' | 'bd' | 'anr'
export function getStaffRole(user): StaffRole | null { /* returns exactly one */ }
```
and `funun_staff.staff_role` (migration 089) is a single `TEXT CHECK (staff_role IN ('leadership','ae','bd'))` column. The Phase 31 mockup (`phase-31-team.html`, folded into the main mockup 2026-08-15) explicitly requires **multiple simultaneously-held roles** — `{ae:true, leadership:true, ops:false, admin:false}` per account, with a distinct **"Admin/Owner"** role (manages team roles + billing) layered on top of the existing `leadership`/`ae`/`bd`/`anr` set, and renames/adds an **"Ops"** role that `31-SPEC.md`'s own R9 acceptance criteria already assume ("only leadership/ops can edit" The Playbook).
**Why it happens:** This model was locked in this session's design work (2026-08-15, same day as the UI-SPEC approval) but the underlying `StaffRole` schema predates it (Phase 25, 2026-08-06/07).
**How to avoid:** Treat this as its own migration + refactor task, not a side effect of building the Team page. Recommended shape: widen `app_metadata` to carry `staff_roles: string[]` (plural) and `funun_staff` to a `TEXT[]` column (or a `staff_member_roles` join table if per-role metadata like "granted by/when" is wanted — the mockup's audit log ("Ava Chen turned ON Leadership for Marcus Webb") suggests the join-table shape pays for itself). Add a `hasStaffRole(user, role)` predicate alongside (not replacing) `getStaffRole()` so every existing `getStaffRole(user) === 'leadership'` call site can be migrated incrementally; keep `getStaffRole()` as a "primary/highest-privilege role" compatibility shim during the transition so unmigrated call sites don't silently break. Reconcile "bd" (code) vs. "Ops" (SPEC/mockup) as the SAME role slug before writing the migration — do not ship both `bd` and `ops` as separate values.
**Warning signs:** Any plan that treats the Team page as "just render `funun_staff` rows with a toggle UI" without touching `lib/admin/staff-role.ts`, `lib/admin/gate.ts`'s `requireStaff()`, and every existing per-page `getStaffRole(user) === 'leadership'` equality check (at least 5 call sites today: `my-client-partners`, `buyer-orgs`, `lead-engine`, `client-partners/[orgId]`, plus `lib/tagging/tag-merge.ts`'s `TAG_APPROVER_ROLES`).

### Pitfall 2: `CatalogBrowserLight.tsx` has no real preview audio today — it's a fixture
**What goes wrong:** A plan that assumes "the shareable player reuses The Crate's existing preview playback" will discover mid-build that there is no existing preview playback to reuse. The codebase's own comment says it plainly: *"simulated playhead (the fixture has no preview audio)"* (`components/buyer/CatalogBrowserLight.tsx`).
**Why it happens:** The Crate's buyer-facing catalogue browse (Phase 22/30) was built UI-first against sample/fixture data; real audio streaming was never wired into that specific component.
**How to avoid:** Reuse the Sound Vault's REAL signed-URL playback pattern instead — `app/(artist)/vault/[projectId]/play/page.tsx` mints `createSignedUrls(paths, 60*60*2)` against actual storage paths and is the closest real precedent for "stream real audio to an authorized viewer." The Selects player needs its own variant: signed URLs must point at **watermarked renders**, not the original master paths, and must work for an unauthenticated (token-only) viewer — a genuinely new code path, not a call to the existing helper.
**Warning signs:** A plan task titled "wire the player to CatalogBrowserLight's existing audio" — verify first whether it means the fixture or a genuinely new streaming path.

### Pitfall 3: `selects_tracks.track_ref` in the BUILD-SPEC's sketch schema is under-specified
**What goes wrong:** `crate-lead-engine-BUILD-SPEC.md`'s migration sketch (§2) types `selects_tracks.track_ref` as a generic `text` ("catalogue track id / vault_project ref (match your catalogue key)") and flags it explicitly as "confirm the catalogue track key" under §7 Open Before Build. Meanwhile the actual catalogue admission model shipped in Phase 30 (`sync_listings`, migration 096) is **song/track-level**, not project-level: `sync_listings.track_id UUID REFERENCES tracks(id)`.
**Why it happens:** The BUILD-SPEC predates Phase 30's catalogue work by ~2 days and was written before the track-level admission model was finalized.
**How to avoid:** `selects_tracks` should reference `tracks(id)` directly (`track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE`), matching `sync_listings`' key — not a generic text ref. This also makes rights-ready re-evaluation at read time (the same "stale entry degrades loudly, never silently drops" pattern `lib/deals/shortlists.ts` already implements for `buyer_shortlists`) straightforward to reuse for Selects tracks.
**Warning signs:** A migration that copies the BUILD-SPEC's `track_ref text` column verbatim without cross-checking it against migration 096.

### Pitfall 4: "Qualified listen ≥30s of audible time" is not the same as a naive playback timer
**What goes wrong:** R13's acceptance criteria are explicit: *"scrubbing/seeking past the threshold without audible playback does NOT record a listen"* and *"only actual audible time counts... scrub/seek excluded."* A naive implementation (start a 30s `setTimeout` on `play`, or compare `currentTime` before/after) will both over-count (a user who scrubs to 0:29 without listening) and under-count (a user who pauses and resumes, whose elapsed wall-clock time includes the pause).
**Why it happens:** "Time listened" sounds like a simple timer but is actually an accumulator gated on genuine `playing` state with `timeupdate` deltas, explicitly excluding any delta caused by a `seeking`/`seeked` event.
**How to avoid:** Client-side: accumulate `audibleMs += delta` only between consecutive `timeupdate` events where `!audio.seeking` and the delta is small/contiguous (reject jumps that indicate a seek even if the `seeking` flag was missed); batch-POST periodic ticks (e.g. every 5s of accumulated audible time, plus on `pause`/`ended`/`beforeunload`) to an idempotent event-ingestion route keyed by `(selects_track_id, viewer_key)`. Server-side: a qualified listen fires the first time cumulative audible time for that (track, viewer) pair crosses the configurable threshold; a "replay" is a distinct completion-then-restart, counted separately per the AC.
**Warning signs:** Any implementation that stores only a single `listened_at`/`duration_seconds` column per (track, viewer) with no underlying event/tick log — it cannot distinguish a genuine listen from a scrub, and cannot support "a replay is counted distinctly."

### Pitfall 5: Forensic per-share watermark rendering will not fit inside a Vercel Hobby serverless request
**What goes wrong:** This project runs on Vercel **Hobby** tier — a hard 10-second `maxDuration` and a 4.5MB request body cap, both non-configurable (documented in `STATE.md`'s Infrastructure scaling note, Phase 14). D-03 requires a **per-Selects (share_token) forensic watermark render** of every track's full-length download. Audio watermarking (even a lightweight approach) transcodes the whole file — for anything beyond a short clip, this will not complete inside a single 10s Hobby function invocation, especially with `ffmpeg`-class tooling cold-starting on Vercel.
**Why it happens:** The constraint is infrastructural, not implementation-quality — this is the same class of problem the STATE.md note already flags generally ("routes around it via direct-to-storage uploads... no migration needed yet, but a container PaaS is the next tier if it recurs").
**How to avoid:** Design the watermark render as an **async, pre-computed step**, not an inline request handler: render once per (track, share_token) pair at Send time (or lazily on first player open, with a "processing" interim state), store the result in a private bucket, and serve it via signed URL thereafter. If a render genuinely cannot fit in 10s even chunked, this phase's watermarking spike should evaluate whether a queue/background-job pattern (or the Vercel Pro tier's Fluid Compute) is needed BEFORE committing to the per-share-token render design in D-03 — flag this as a decision point for the owner, not something to silently work around.
**Warning signs:** A plan task that calls a watermarking function synchronously inside `POST /api/admin/selects/[id]/send` and expects the send request itself to return only once every track is rendered.

### Pitfall 6: `buyer_orgs`'s existing `contact_name`/`contact_email`/`contact_phone`/`contact_role` (migration 095) is a SINGLE legacy contact, not the new CRM-lite people layer
**What goes wrong:** A plan might assume the "Contacts CRM" job (R1) can just surface these four existing columns. They are staff-only, single-valued, captured once at buyer signup (Phase 23) — they do not support D-08's "multiple contacts per company, one flagged primary."
**Why it happens:** Both are "contact info for the company," easy to conflate.
**How to avoid:** Build the new `buyer_org_contacts` (or similar) table as described in D-08/D-09 as a genuinely separate, richer table. Decide explicitly (and flag to the owner, not silently) whether the legacy `buyer_orgs.contact_*` columns get one-time migrated into the first `buyer_org_contacts` row (marked primary) per org, or left untouched as historical lead-capture data with the new table starting empty. Either is defensible; picking neither and leaving both live with no stated relationship is the failure mode.
**Warning signs:** A migration that adds `buyer_org_contacts` but never mentions the existing `contact_*` columns in its comment/rationale.

## Code Examples

### Own-book scoped list read (verbatim pattern to extend)
```typescript
// Source: app/(admin)/admin/my-client-partners/page.tsx (this repo, live code)
const service = createServiceClient()
let query = service
  .from('buyer_orgs')
  .select(ORG_COLUMNS)
  .order('created_at', { ascending: false })
if (role !== 'leadership') {
  query = query.eq('ae_user_id', user.id)
}
const { data: orgs } = await query
```

### Staff-only, zero-RLS-policy table (mirror for contacts / relationship-log / health-rules / Playbook / Game Plan)
```sql
-- Source: supabase/migrations/089_funun_staff_and_audit.sql (this repo, live shape to mirror)
CREATE TABLE IF NOT EXISTS public.<new_table> ( ... );
ALTER TABLE public.<new_table> ENABLE ROW LEVEL SECURITY;
-- No policies for any role — RLS-enabled + zero policies denies ALL row access by construction.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.<new_table> FROM authenticated, anon;
-- Reachable only via the service role, from a requireStaff()-gated route.
```

### AI-structured drafting (the pattern for "Draft from brief" and Suggested Songs ranking)
```typescript
// Source: lib/buyer/brief-ai.ts (this repo, live shape to mirror)
const anthropic = new Anthropic({ apiKey })
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  // ...structured-output prompt describing the target JSON shape...
})
const text = response.content
  .filter((b): b is Anthropic.TextBlock => b.type === 'text')
  .map(b => b.text)
  .join('')
// parse `text` as the structured Selects-draft JSON (tracklist + cover note + per-track "why it fits")
```

### Signed, time-limited private audio URL (the base to build the watermarked variant on top of)
```typescript
// Source: app/(artist)/vault/[projectId]/play/page.tsx (this repo, live code)
const service = createServiceClient()
const { data: signed } = await service.storage
  .from(BUCKET)
  .createSignedUrls(paths, 60 * 60 * 2) // 2hr TTL
```

### Pure forward-pipeline state machine (mirror for Selects status + the Selects-room funnel)
```typescript
// Source: lib/deals/stage-machine.ts (this repo, live code — the shape, not the literal stages)
const FORWARD_PIPELINE: DealStage[] = ['submitted', 'in_negotiation', 'terms_agreed', 'contract', 'closed_won']
export function isLegalTransition(from: DealStage, to: DealStage): boolean {
  // one step ahead only, never backward, never a skip; a same-stage self-transition is illegal
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Binary `is_admin` staff gate | Multi-value `StaffRole` (`leadership`/`ae`/`bd`/`anr`) via `app_metadata.staff_role` | Phase 25 (2026-08-06/07), widened for `anr` in Phase 30 (2026-08-13) | This phase's Team page needs to widen it AGAIN to a roles-as-a-set model — see Pitfall 1 |
| Lead Engine (read-only brief feed) | Crate Requests (ranked, multi-source, actionable inbox) | This phase (R10) — explicitly absorbs/replaces Lead Engine | `app/(admin)/admin/lead-engine/page.tsx` should be treated as the R10 starting point to extend, then retired/redirected, not left as a parallel surface |
| `buyer_orgs.contact_*` single legacy contact | CRM-lite `buyer_org_contacts` (multiple, one primary) | This phase (D-08/D-09) | See Pitfall 6 — needs an explicit migration/reconciliation decision |

**Deprecated/outdated:**
- The `MyCompanies`/`BuyerOrgsAdmin`/`ClientPartnerDetail` component trio (card list + inline rename + bare member list) is explicitly the "thin scaffolding" this phase replaces (per `31-SPEC.md`'s own Background section) — do not extend these, build the new list+workspace components fresh, informed by their scoping logic only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The recommended watermark-tag character ("brief, soft sub-audible tonal pulse") from `31-UI-SPEC.md` is a Claude-discretion default explicitly flagged for owner confirmation, not a locked spec. | Common Pitfalls #5 / User Constraints | If treated as locked, the watermarking spike may build the wrong audible signature and need rework after owner review. |
| A2 | No specific watermarking/forensic-marking package or service has been evaluated in this research session; any name surfaced during planning is unverified. | Package Legitimacy Audit | A planner who names a specific package without running it through the Package Legitimacy Gate risks recommending a slopsquatted or unmaintained dependency for a security/compliance-adjacent feature. |
| A3 | The recommended `funun_staff` roles-as-set schema (array column vs. join table) is this researcher's inference from the mockup's audit-log requirement, not a locked decision from CONTEXT.md/SPEC.md (neither document explicitly specifies the storage shape). | Common Pitfalls #1 | If the join-table shape is wrong for the owner's actual audit needs, a schema rework mid-phase is more costly than deciding this explicitly at plan time. |
| A4 | Vercel Hobby tier (10s `maxDuration`, no configurable timeout) is assumed still current for this deployment as of 2026-08-15 (last confirmed in STATE.md's Phase 14 note, 2026-07-06). | Common Pitfalls #5 | If the project has since upgraded to Vercel Pro, the async-render urgency is lower (though still good practice) and the planner could simplify the watermark-pipeline sequencing. |
| A5 | `selects_tracks` should key on `tracks.id` (UUID) rather than the BUILD-SPEC's generic `track_ref text`, based on cross-referencing migration 096's `sync_listings.track_id` convention — this is a researcher recommendation, not confirmed with the owner. | Common Pitfalls #3 | If a non-tracks-table catalogue key was actually intended (unlikely given Phase 30's shipped model), the FK would need to change. |

**If this table is empty:** N/A — see rows above; all are flagged for planner/owner attention, none block Slice 1's start.

## Open Questions

1. **What is the actual watermarking implementation approach?**
   - What we know: D-01/D-02/D-03 lock the PRODUCT requirements (audible preview tag + clean forensic download tag, per-share encoding, AE-configurable length cap/disable). Nothing in this codebase implements or references any audio watermarking today.
   - What's unclear: whether this is built in-house (ffmpeg-based tone injection for the stream tag + a spread-spectrum/LSB-style forensic encode for downloads) or via a third-party forensic-watermarking API/SDK; and whether rendering happens synchronously at Send time, lazily on first open, or via a background job/queue given the Vercel Hobby constraint (Pitfall 5).
   - Recommendation: schedule this as an explicit Wave-0 spike/research task BEFORE the Selects-builder "Send" flow and the player's download-gate are planned in detail. The player's play/react/approve/request-changes flow can ship without the download feature (UI-SPEC already treats the download control as independently gate-able), so sequence "download to test-sync" as a fast-follow if the spike runs long, rather than blocking all of Slice 1 on it.

2. **What is the exact roles-as-a-set storage shape, and how does the "bd"/"Ops" naming reconcile?**
   - What we know: the mockup locks the INTERACTION model (toggleable role chips, an audit log, guardrails against self-demoting the last Admin). The SPEC's R9 already assumes an "ops" role exists.
   - What's unclear: array column vs. join table (audit/history needs may favor the join table — see Assumption A3); whether `bd` is renamed to `ops` or the two coexist; whether `admin`/`is_admin` collides semantically with the existing `app_metadata.is_admin` leadership-fallback boolean.
   - Recommendation: resolve this as an explicit planning decision (likely its own small plan/wave) before any Playbook/health-rules leadership-vs-ops gating is built, since R4/R9's acceptance criteria depend on the answer.

3. **Does the legacy `buyer_orgs.contact_*` data get migrated into the new CRM-lite contacts table?**
   - What we know: D-08/D-09 want a new, richer, multi-contact table.
   - What's unclear: whether existing orgs' single legacy contact becomes the first (primary) row, or the new table starts empty per org.
   - Recommendation: a one-time backfill (legacy contact → primary contact row, non-destructive, legacy columns left in place as historical record) is the lower-risk default — flag for owner confirmation at plan time.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI / project link | All owner-run migrations (111+) | ✓ (installed, `supabase` 1.200.0 in devDependencies; project already linked per STATE.md history) | 1.200.0 | — |
| `ANTHROPIC_API_KEY` | AI-drafted Selects, Suggested Songs ranking | Assumed ✓ (already required + working for the shipped Brief Builder AI features) | — | — |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Assignment handoff email (R8) | Assumed ✓ (already required + working for staff/artist/buyer invite emails) | — | `sendEmail()` already no-ops safely (`{ok:false}`) if unconfigured — the R8 AC ("delivery failure does not block assignment") is satisfied by design even in a misconfigured environment |
| Audio watermarking tooling (ffmpeg or equivalent) | The forensic download pipeline (D-01/D-02/D-03) | ✗ — nothing installed, no service configured | — | **No fallback with equivalent security properties.** The player's play/react/approve/request-changes flow does not depend on this; only the download-to-test-sync feature does — see Open Question #1 for sequencing. |
| Vercel deployment tier (maxDuration) | Any synchronous watermark render | Assumed Hobby (10s cap) per STATE.md 2026-07-06 note, not re-verified this session | — | Async/queued render design (Pitfall 5) works regardless of tier; re-verify the tier before finalizing the render architecture. |

**Missing dependencies with no fallback:**
- Watermarking tooling — blocks only the download feature, not the core Selects-send/player-view/react/approve flow.

**Missing dependencies with fallback:**
- Email configuration — already fails safely by design; no phase work required to handle its absence.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 (`ts-jest`, transpile-only per `tsconfig.json`'s `isolatedModules: true` — TS type errors do NOT fail Jest; rely on `tsc --noEmit` separately for type-contract enforcement) |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest <path-to-new-test-file>` |
| Full suite command | `npm test` (repo convention — confirm exact script name in `package.json` scripts before first use; historical STATE.md entries reference "full repo suite" counts in the thousands) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R3 | Health scoring: no-data signal → "unknown"; boundary-at-threshold → one documented band | unit | `npx jest lib/client-partners/health.test.ts` | ❌ Wave 0 |
| R4 | Health-rules validation: non-overlapping bands rejected | unit | `npx jest lib/client-partners/health-rules.test.ts` | ❌ Wave 0 |
| R7 | Reassign-to-same-AE is a no-op (no duplicate email/log) | unit | `npx jest lib/staff/scope.test.ts` (extend existing) or a new `lib/client-partners/assignment.test.ts` | ❌ Wave 0 (existing `scope.test.ts` covers `isAssignedToOrg` only, not the no-op-reassign rule) |
| R11 | Selects status pipeline legality (mirrors `stage-machine.test.ts`) | unit | `npx jest lib/selects/stage-machine.test.ts` | ❌ Wave 0 |
| R12 | Invalid/expired token → safe state, leaks nothing | integration | a route/page test asserting no org/track data appears in the response for a bad token | ❌ Wave 0 |
| R13 | Qualified-listen threshold: scrub excluded, replay counted distinctly | unit | `npx jest lib/selects/engagement.test.ts` (pure accumulator logic, no DOM) | ❌ Wave 0 |
| R14 | "0 of N covered" is a valid, non-blank log entry | unit | `npx jest lib/client-partners/game-plan.test.ts` | ❌ Wave 0 |
| Migration text-tests (all new migrations) | Structural + RLS/GRANT assertions | unit | `npx jest __tests__/migration-111*.test.ts` (etc., following the existing `migration-089-090.test.ts` naming convention) | ❌ Wave 0 (per-migration, per this repo's own standing convention) |

### Sampling Rate
- **Per task commit:** the single new/changed test file's `npx jest <file>` run
- **Per wave merge:** `npm test` (or the confirmed full-suite script) + `npx tsc --noEmit` + `npm run build` — this repo's established green-bar convention (referenced throughout STATE.md's phase completions)
- **Phase gate:** full suite green before `/gsd-verify-work 31`

### Wave 0 Gaps
- [ ] `lib/client-partners/health.test.ts` — R3 scoring + no-data/boundary rules
- [ ] `lib/client-partners/health-rules.test.ts` — R4 non-overlapping-band validation
- [ ] `lib/selects/stage-machine.test.ts` — R11 status pipeline legality
- [ ] `lib/selects/engagement.test.ts` — R13 audible-time accumulator (pure logic, framework-agnostic — do NOT require jsdom/a real `<audio>` element for this; extract the accumulation math into a pure function)
- [ ] `lib/client-partners/game-plan.test.ts` — R14 log-conversation shape
- [ ] `__tests__/migration-111*.test.ts` (and subsequent numbers) — one per new migration, per this repo's convention (draft + text-tested before the owner pushes)

*Framework install: none — Jest/ts-jest already fully configured; no new test infrastructure needed.*

## Security Domain

`workflow.security_enforcement` is `true`, `security_asvs_level: 1`, `security_block_on: "high"` in `.planning/config.json` — this section is required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing Supabase session auth (`createServerClient().auth.getUser()`) — no new auth mechanism; the public `/selects/[token]` route is the one deliberate no-login surface, gated by an unguessable random token (`share_token`), not by weak auth |
| V3 Session Management | yes | Existing Supabase cookie session handling — unchanged by this phase |
| V4 Access Control | yes | `requireStaff()` + `getStaffRole()` + `isAssignedToOrg()` (own-book scoping) — extend, do not bypass, for every new route; the roles-as-a-set migration (Pitfall 1) must preserve fail-closed behavior throughout |
| V5 Input Validation | yes | Zod schemas for every new API route body (contacts, Selects tracks/notes, health-rules thresholds, Playbook SOP steps, Game Plan topics) — project convention |
| V6 Cryptography | yes | `share_token` generation reuses the BUILD-SPEC's `encode(gen_random_bytes(16),'hex')` (cryptographically random, unguessable) — never a sequential/predictable ID for the token |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-AE data leak (an AE reads another AE's client/company/contact/brief/Selects/health data) | Information Disclosure | Server-side `.eq('ae_user_id', user.id)` scoping on every list query, `isAssignedToOrg()` on every detail route, enforced BEFORE any service-role read — mirrors the SPEC's explicit prohibition and this repo's existing pattern |
| `ae_user_id` (or other staff-routing internals) leaking to an authenticated buyer | Information Disclosure | Never add `ae_user_id`-equivalent columns to any authenticated buyer GRANT (migration 090's own documented doctrine — "private by default until explicitly GRANTed") |
| Selects/track enumeration without the share token | Information Disclosure / Spoofing | The player route must reject any request lacking a valid `share_token` lookup — no fallback to a guessable numeric/sequential Selects ID; the SPEC's own prohibition table calls this out explicitly |
| Clean master audio served via the shareable player (stream or download) | Information Disclosure (IP leak) | The player's signed URLs must point ONLY at watermarked-render storage paths, never at the original master storage paths used by `uploadTrackAudio`/the Sound Vault — this must be enforced by NEVER granting the player route access to the master bucket's paths, not merely by convention |
| A non-leadership/ops role editing The Playbook or health-rules config | Elevation of Privilege | `requireStaff(['leadership', 'ops'])`-style role-array gating on every write route for R4/R9 — resolve the Pitfall 1 role-model question before implementing this gate, since the array-based check depends on it |
| Account reassignment without an audit trail | Repudiation | Every assignment write MUST pair with a `relationship_log` insert AND (ideally) a `logStaffAction()` call in the same transaction/request — mirrors R7's SPEC prohibition exactly |
| Attributing an anonymous/forwarded Selects listen to a specific named contact without verification | Spoofing / Information Disclosure | Engagement events attribute to the authenticated recipient ONLY when the viewer is logged in as a known org member; otherwise attribute to the link/session, never guess a name — matches R13's SPEC prohibition |

## Sources

### Primary (HIGH confidence — verified via codebase read/grep, this session)
- `app/(admin)/admin/my-client-partners/page.tsx`, `buyer-orgs/page.tsx`, `client-partners/[orgId]/page.tsx`, `lead-engine/page.tsx` — current thin-scaffolding surfaces to replace
- `lib/admin/gate.ts`, `lib/admin/staff-role.ts` — the current single-value `StaffRole` authority
- `lib/staff/scope.ts`, `lib/staff/notifications.ts`, `lib/staff/audit.ts` — assignment/scoping/audit precedent
- `lib/deals/catalog.ts`, `lib/deals/shortlists.ts`, `lib/deals/stage-machine.ts` — rights-ready, stale-degrade, and pure-state-machine patterns
- `lib/buyer/brief-ai.ts` — the exact Anthropic SDK usage pattern
- `lib/notifications/index.ts`, `lib/email/index.ts` — notification/email side-effect patterns
- `lib/storage/index.ts`, `app/(artist)/vault/[projectId]/play/page.tsx`, `lib/sync-library/hub-access.ts` — signed-URL and storage patterns
- `supabase/migrations/080_buyer_orgs_members.sql`, `090_buyer_orgs_ae_assignment.sql`, `095_buyer_org_lead_fields.sql`, `096_sync_library.sql`, `106_buyer_briefs.sql`, `089_funun_staff_and_audit.sql`, `083_buyer_shortlists.sql` — schema/RLS/GRANT conventions
- `components/admin/console-theme.ts`, `ChecklistAdmin.tsx` (dnd-kit usage confirmed via grep) — theme + drag-reorder precedent
- `package.json` — dependency versions confirmed installed
- `npm view @dnd-kit/core version`, `npm view @anthropic-ai/sdk version`, `npm view resend version` — registry currency check, 2026-08-15
- `.planning/config.json` — `nyquist_validation`/`security_enforcement`/ASVS-level confirmation
- `.planning/design/crate-lead-engine-BUILD-SPEC.md` — Selects schema/route/RLS sketch (owner-authored design doc, treated as primary since it is this project's own locked design artifact)
- `.planning/notes/team-member-rooms-review.md` — scope source, room-by-room access model
- `.planning/phases/31-.../31-CONTEXT.md`, `31-SPEC.md`, `31-UI-SPEC.md` — locked decisions, requirements, UI contract
- `git log`/`git show d0206f0` + `.planning/design/phase-31-team.html` — the roles-as-a-set Team model source (this session's design work, 2026-08-15)

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Vercel Hobby-tier infrastructure note (Phase 14, 2026-07-06 — not re-verified live this session, see Assumption A4)

### Tertiary (LOW confidence — flagged, needs its own spike)
- Any specific watermarking/forensic-marking package or service — not researched to a named recommendation this session; deliberately left open per Package Legitimacy Audit and Open Question #1

## Metadata

**Confidence breakdown:**
- Standard stack (internal Team Console layer): HIGH — every library is already installed and already load-bearing elsewhere in this exact repo
- Architecture (own-book scoping, server-owned writes, notification/email side effects): HIGH — 4+ existing phases (16/23/25/28) implement the identical pattern
- Watermarking/content-protection pipeline: LOW — genuinely net-new, no code or dependency precedent exists, explicitly flagged by the user's own CONTEXT.md as "a research task"
- Roles-as-a-set Team model: LOW — the interaction/mockup is locked, but the underlying schema/gate refactor is unscoped and touches a cross-cutting existing system (Phase 25's RBAC)
- Pitfalls: HIGH — sourced from direct codebase inspection (grep/read), not speculation

**Research date:** 2026-08-15
**Valid until:** ~14 days for the internal Team Console findings (stable, slow-moving codebase conventions); ~7 days or "until the watermarking spike completes" for the content-protection findings (explicitly unresolved, will be superseded by spike output)
