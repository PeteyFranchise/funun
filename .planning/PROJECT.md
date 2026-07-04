# Funūn — Wave 3: Launchpad

**Project type:** Brownfield milestone (Wave 3 of an existing platform)
**Milestone:** Launchpad
**Owner:** Pete (peter.zora@gmail.com)
**Started:** 2026-06-30
**Platform:** funun.studio — the operating system for an independent music career

---

## What This Is

Wave 3 builds the **Launchpad room** — a structured post-release environment where artists take the actions that turn a released song into traction. Wave 1 tightened asset readiness. Wave 2 locked in rights and registration. Wave 3 closes the loop on what happens after release day.

Three pillars:

1. **Launchpad checklist** — a guided checklist (mirroring release readiness) where each item links to an in-Funūn tool or an external action. Per-item tips are DB-backed, AI-drafted monthly, and admin-approved before publish.
2. **Playlist pitching** — a lean curator directory. Artists select tracks and pitch curators by email (Resend). Pitch emails include a link to the in-app track player (`/r/[projectId]`) as a growth loop for curator onboarding. Curator emails collected via lightweight onboarding form. Bounce detection, response-rate tracking, curator-claimed profiles, genre drift alerts, and admin view all ship in this wave.
3. **Social campaign planner** — AI-generates a 4–6 week content calendar from release data. Platform selector (Instagram, TikTok, X, YouTube Shorts, Facebook, Threads) with best-practice nudges toward highest-impact platforms. DropReady and SoundBait are embedded in the calendar as inline actions and also accessible as standalone quick tools. Export path: V0 = Funūn calendar view, V1 = CSV (Later/Buffer-compatible), V2 = direct API push (user connects account).

---

## Core Value

An artist finishes a release and immediately knows their next moves — who to pitch, what to post, and when — without leaving Funūn. The Launchpad turns release day into a 6-week playbook.

---

## Context

### Existing codebase (brownfield — what Wave 3 builds on)

| Layer | What exists |
|---|---|
| Track player | `/r/[projectId]` — public shareable player page. Used in Wave 3 as curator pitch email link. |
| DropReady | `components/tools/DropReady.tsx` — caption generator (partial). Promoted to Launchpad social tool. |
| SoundBait | `components/tools/SoundBait.tsx` — short-form video hook writer (partial). Promoted to Launchpad social tool. |
| Tools registry | `lib/tools/registry.ts` — plugin registry for tool runs. Launchpad tools will register here. |
| Collaborators | `collaborators` table with `claimed_by`, `claimed_at`, identity reconciliation complete (Wave 2). |
| Rights Coach | Per-project registration checklists with status tracking (Wave 2). |
| Resend | Email delivery configured — used for notifications and pitches. |
| Industry roles | `lib/industry-roles.ts` — 23 roles across 4 groups. Needs "Playlist Curator" added. |
| Artist profiles | `artist_profiles` table with genre, links, PRO affiliation. |

### Tech stack (inherited)
Next.js 15 App Router · TypeScript · Supabase (PostgreSQL + RLS + Storage) · Tailwind · Anthropic SDK · Resend

### What Wave 3 does NOT include
- Dropbox Sign live implementation (deferred from Wave 2 — account needed)
- Social media post execution / scheduling (OAuth to Meta/TikTok — Wave 4)
- Songtrust API integration (pending BD conversation)
- Sync licensing marketplace (Wave 4)
- SoundCloud / Bandsintown / YouTube integrations (Wave 4)

---

## Requirements

### Validated (Wave 1 — already shipped)

- ✓ Master WAV + shareable MP3 upload slots
- ✓ Artwork 3000×3000 spec validation
- ✓ Lyrics .txt export
- ✓ Distributor-selected gate
- ✓ ISRC generation and assignment
- ✓ DDEX ERN 3.5.1 + RDR-N XSD-validated exports
- ✓ Contract PDF upload + AI verification
- ✓ E-sign provider abstraction

### Validated (Wave 2 — already shipped)

- ✓ **COLLAB-01**: Artist can add a collaborator with full rights and contact data
- ✓ **COLLAB-02**: Collaborator data auto-fills into split sheet and contract forms
- ✓ **COLLAB-03**: Collaborator list is reusable across all projects
- ✓ **COLLAB-05**: Email-based claim system links pre-signup collaborators to new Funūn accounts
- ✓ **DOC-01**: Artist can upload a signed PDF and status flips to "signed" with timestamp
- ✓ **DOC-02**: Split sheet and contract cards show signer list with pending/signed status
- ✓ **DOC-03**: Readiness score gates on signed (not just uploaded) documents
- ✓ **RIGHTS-01**: Guided copyright registration checklist with copyright.gov eCO deep-link
- ✓ **RIGHTS-02**: Guided PRO registration checklist (ASCAP/BMI/SESAC/SOCAN) with ISWC tracking
- ✓ **RIGHTS-03**: Guided SoundExchange registration checklist; auto-ready when RDR-N data present
- ✓ **RIGHTS-04**: All registration checklists show per-project status on Rights page
- ✓ **SONGTRUST-01**: Songtrust guide card with CWR export action

### Validated (Wave 3 — Phase 5)

- ✓ **LAUNCH-01**: Artist sees a Launchpad room with a guided post-release checklist per project
- ✓ **LAUNCH-02**: Each checklist item links to an in-Funūn tool or opens an external action with instructions
- ✓ **LAUNCH-03**: Per-item tips surface contextual guidance; tips are DB-backed and updated monthly via AI research draft → admin approval
- ✓ **LAUNCH-04**: Checklist item completion is tracked per project and persisted
- ✓ **LAUNCH-05**: Admin can add, edit, reorder, and delete checklist items from an in-app UI without touching the database directly

### Validated (Wave 3 — Phase 6)

- ✓ **PITCH-01**: Artist can browse a curator directory filtered by genre and platform
- ✓ **PITCH-02**: Artist can select a track and send a pitch email to one or more curators (via Resend); email includes `/r/[projectId]` player link
- ✓ **PITCH-03**: Pitch history is tracked per project (curator, sent date, response status)
- ✓ **PITCH-04**: Curator directory shows response rate and genre focus per curator
- ✓ **PITCH-05**: Curators can claim their directory profile via a link in pitch emails (lightweight onboarding)
- ✓ **PITCH-06**: Bounce detection marks curator emails invalid after hard bounce; genre drift alerts flag when a curator's genre focus shifts
- ✓ **PITCH-07**: Admin view for managing curator directory (add, edit, flag, review claimed profiles)
- ✓ **PITCH-08**: "Playlist Curator" is added to industry occupation options in Settings

### Validated (Wave 3 — Phase 7)

- ✓ **SOCIAL-01**: Artist selects which platforms they are active on (Instagram, TikTok, X, YouTube Shorts, Facebook, Threads) per project
- ✓ **SOCIAL-02**: Funūn surfaces best-practice nudges toward highest-impact platform combinations for the artist's genre
- ✓ **SOCIAL-03**: AI generates a 4–6 week content calendar from release data (title, genre, collaborators, release date, story)
- ✓ **SOCIAL-04**: Calendar shows posts by week and platform, each with a draft caption/hook and content type tag
- ✓ **SOCIAL-05**: DropReady and SoundBait are accessible as inline calendar actions ("Generate caption", "Generate hook") and as standalone quick tools in the Launchpad tools view
- ✓ **SOCIAL-06**: Artist can check off calendar posts as they go live; completion tracked per project
- ✓ **SOCIAL-07**: Artist can export the campaign calendar as a CSV compatible with Later and Buffer (V1)

### Out of Scope (this wave)

- Social post scheduling / direct publishing — requires Meta/TikTok OAuth; Wave 4
- Direct API push to Later/Buffer — V2, deferred until social feature matures
- Songtrust API integration — BD conversation pending
- Dropbox Sign live implementation — account needed
- Sync licensing marketplace — Wave 4
- Curator email crawling or automated discovery — manual onboarding only (lean approach)

---

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Upload-only e-sign (Wave 2 decision) | Dropbox Sign Standard ~$300/mo; abstraction is in place | Artists upload pre-signed PDFs; Dropbox Sign slots in when ready |
| Collaborators as separate table (Wave 2) | Same producer appears on multiple projects | `collaborators` table keyed by `artist_id` |
| Launchpad as checklist, not tool junk drawer | Artists need a post-release playbook, not another tool list | Guided checklist; tools surface as actions within items |
| Playlist pitching: lean curator directory | Build traction before investing in crawling or API integrations | Manual curator onboarding + organic growth via player link in pitch emails |
| Pitch emails link to `/r/[projectId]` player | Curators experience Funūn directly; growth loop to industry onboarding | Resend sends emails; player URL is the natural showcase format |
| Social planning only (no execution) | Meta/TikTok OAuth is meaningful scope; Wave 3 focuses on planning | Calendar + quick tools; scheduling integrations in Wave 4 |
| Calendar as social spine | Standalone tools stay accessible but campaign view is the organizing frame | Two entry points: campaign calendar + quick tool access |
| Later/Buffer CSV as V1 export | Largest indie artist tool adoption; CSV avoids OAuth complexity | Export format derived from Later's column schema |
| Admin gate centralized (Phase 5) | Every `/api/admin/*` route must independently re-verify admin status, not just rely on the `(admin)` layout redirect | `verifyAdmin()` helper in `lib/admin/gate.ts`, called first in every admin API handler |
| Admin pages read via service client (Phase 5) | Admin pages need full data visibility (e.g. unapproved tips) that RLS would otherwise block for a non-owner read | Admin pages query Supabase directly via `createServiceClient()`, gated by the `(admin)` layout; mutations still route through re-verified API endpoints |
| `svix` added as a direct dependency (Phase 6) | Resend signs webhooks via Svix under the hood; the pinned `resend@^4.0.0` predates Resend's own `webhooks.verify()` helper, and a 4→6 major upgrade was judged higher-risk than adding the dependency directly | `svix` installed after a blocking human-verify checkpoint reviewing package legitimacy (5yr-old official-org package, ~4.88M weekly downloads) |
| RLS row policies alone are not enough (Phase 6) | Migration 030's row-level RLS policies restricted rows but not columns — any authenticated client could bypass app-layer column allowlists via direct PostgREST access, exposing `claim_token`/`response_token` | Migration `031_curators_column_privileges.sql` adds explicit `REVOKE`/`GRANT` column-level privileges on top of RLS; found and fixed via `/gsd-code-review`, not caught by planning |
| Curator accounts isolated from artist auth model (Phase 6) | Curators need a lightweight magic-link account without becoming `artist_profiles` rows or being subject to `middleware.ts`'s artist route protection | `app_metadata.role='curator'` set at `admin.createUser()` time (not a post-insert UPDATE) so `handle_new_user()` early-returns; `(curator-portal)` routes deliberately excluded from `middleware.ts`'s protected-path list, with the portal's own layout as sole auth authority |
| AI calendar output treated as untrusted input (Phase 7) | The model's JSON could hallucinate out-of-range platforms/content-types/weeks that would corrupt stored slots or the CSV export | Every AI-generated slot is routed through `readCalendarPosts()`→`readPosts()` enum/range validation before it can be persisted or rendered; user release data isolated in a `<release_data>` prompt block so a malicious note can't restructure platform rules |
| One active campaign per project enforced at the DB (Phase 7) | Two concurrent "set active" requests could both flip `is_active` on without a DB backstop | Partial unique index `ON social_campaigns (project_id) WHERE is_active` in migration 033, layered on an app-level flip-old-off-then-set-new inside one request |

---

## Current Milestone: v1.1 Launchpad

**Goal:** Give artists a structured post-release room where they can pitch playlists, plan social campaigns, and track the actions that turn a release into traction — all from Funūn.

**Target features:**
- Launchpad checklist with per-item tips
- Playlist pitching via curator directory
- Social campaign planner with AI-generated calendar

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-07-04 — after Phase 7 (Social Campaign Planner) — milestone v1.1 Launchpad complete*
