# Funūn — Wave 4: The Green Room

**Project type:** Brownfield milestone (Wave 4 of an existing platform)
**Milestone:** The Green Room (v1.2)
**Owner:** Pete (peter.zora@gmail.com)
**Started:** 2026-07-03
**Platform:** funun.studio — the operating system for an independent music career

---

## What This Is

Wave 4 builds **The Green Room** — Funūn's professional network layer, a "LinkedIn for the music industry." Waves 1–3 made an artist release-ready (assets), rights-secured (registration), and launch-ready (post-release playbook). Wave 4 makes them **connected**: rich member profiles, discovery, and networking that turn real industry access into the moat tools alone can't copy.

A thin social layer already ships (follow · wall · endorsements · release comments · activity feed · 1:1 DMs · `/u/[handle]` public profiles). Wave 4 elevates it into a full professional network and opens membership to industry roles — producers, songwriters, music supervisors, A&R, execs — not just artists.

Three pillars:

1. **Rich member profiles & identity** — a hi-fi public profile (banner, avatar, pronouns, location, tenure, verified check) with multi-role badges (Artist, Producer, Songwriter, Music Supervisor, A&R, Exec, or custom title — one "lead" highlighted), "Open to" status chips (sync, co-writes, features, brand deals), a Featured spotlight, a stats sidebar (followers, monthly listeners, placements, avg. readiness), endorsements, wall, and "Worked with" collaborators. Owner-vs-public view switching (Follow/Message ↔ Edit profile / Share / View analytics).
2. **Discovery & networking shell** — a top-level Feed / Discover / Opportunities / Network experience with public member activity, global people search across artists and industry pros, follow + message + connect, and notification/message surfacing with unread badges.
3. **Presence & real-time messaging** — a floating DM widget with live presence ("Active now") and unread badges — closing the social backlog and making the network feel alive.

Design is locked: a hi-fi handoff (`docs/design/wave-4-social-layer/`, hero screen `user-profile.html`) defines final colors, typography, spacing, and every profile section. This is a UI-forward milestone, recreated pixel-faithfully in Next.js/Tailwind against the existing `app.css` design tokens.

---

## Core Value

Funūn is where an independent artist's whole career lives — and where the industry comes to find them. The Green Room turns a profile into a professional identity and a network: artists connect with producers, supervisors, A&R, and execs, and real relationships — not just tools — are what keep them on the platform.

---

## Current Milestone: v1.2 The Green Room

**Goal:** Turn Funūn's thin social layer into a full professional network for the music industry — rich member profiles, discovery, and real-time connection — recreated pixel-faithfully from the locked hi-fi design handoff.

**Target features:**
- Rich hi-fi member profile: banner + avatar (owner-editable), pronouns, location, tenure, verified check, multi-role badges, "Open to" chips, Featured spotlight, stats sidebar, "Worked with"
- Industry members as first-class: role identity beyond artist (Producer, Songwriter, Music Supervisor, A&R, Exec, custom title)
- Owner-vs-public profile view switching (Edit profile / Share / View analytics)
- Discovery & networking shell: Green Room feed + Discover / Opportunities / Network nav + global people search
- Follow / Message / Connect actions across member types
- Notifications & messages surfacing with unread badges
- Presence + real-time DM widget ("Active now")

**Design reference:** `docs/design/wave-4-social-layer/` (hero: `user-profile.html`; tokens: `app.css`; rendered: `screens-reference.pdf`)

---

## Context

### Existing codebase (brownfield — what Wave 4 builds on)

| Layer | What exists |
|---|---|
| Public profile | `/u/[handle]` public artist profile + `/profile` self-view. Elevated to the hi-fi networked profile in Wave 4. |
| Social graph | `app/api/follows/`, `app/api/wall/`, `app/api/endorsements/` — follow, wall posts, endorsements already live. |
| Comments & activity | Threaded release comments + auto-emitting activity feed (`lib/social/activity-emit.ts`). |
| Direct messages | 1:1 artist↔industry DMs, realtime + polling fallback. Wave 4 adds presence + unread badges. |
| Track player | `/r/[projectId]` — public shareable player, embedded in Featured spotlight / release cards on profiles. |
| Collaborators | `collaborators` table with `claimed_by`/`claimed_at`; powers "Worked with" on profiles. |
| Industry roles | `lib/industry-roles.ts` — role taxonomy; Wave 4 surfaces multi-role badges (Artist/Producer/Songwriter/Supervisor/A&R/Exec + custom). |
| Profiles table | `artist_profiles` (genre, links, PRO). Wave 4 extends identity: banner, pronouns, location, "Open to", stats. |
| Design tokens | `docs/design/wave-4-social-layer/app.css` — locked dark theme, indigo→fuchsia gradient, Inter type scale. |

### Tech stack (inherited)
Next.js 15 App Router · TypeScript · Supabase (PostgreSQL + RLS + Storage + Realtime) · Tailwind · Anthropic SDK · Resend

### What Wave 4 does NOT include
- Social media post execution / scheduling (OAuth to Meta/TikTok — later wave)
- Deep external integrations (Songstats, SoundCloud, Bandsintown, YouTube, Buffer API — later wave)
- Industry Round Table live panels (💡 in notes; candidate for a follow-on social milestone)
- Dropbox Sign live implementation (deferred from Wave 2 — account needed)
- Songtrust API integration (pending BD conversation)

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

## Current State

**In progress:** v1.2 The Green Room (started 2026-07-03) — scoping requirements → roadmap via `/gsd-new-milestone`.

**Shipped:** v1.1 Launchpad — Phases 5–7, 18 plans, 19/19 Wave 3 requirements validated. Artists have a structured post-release room: a week-sequenced Launchpad checklist with admin-approved tips, playlist curator pitching (directory, AI-drafted emails, claim flow, bounce/drift handling), and an AI-generated 4–6 week social campaign planner with Buffer CSV export.

Cumulative platform state: v1.0 (Rights & Registration Rails, Phases 1–4) + v1.1 (Launchpad, Phases 5–7). Next.js 15 · TypeScript · Supabase (PostgreSQL + RLS + Storage + Realtime) · Tailwind · Anthropic SDK · Resend · svix.

## After This Milestone (candidates)

Deferred to a later wave (see `.planning/STATE.md` Deferred Items):
- Industry Round Table — live panels / replays / Q&A (💡 the "real industry access" differentiator; natural follow-on to The Green Room)
- Deep external integrations — Songstats, SoundCloud, Bandsintown, YouTube, Buffer API push (SOCIAL-08 spike)
- Direct social post scheduling / publishing via Meta/TikTok OAuth
- Dropbox Sign live e-sign · Songtrust API integration (both blocked on external prerequisites)

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

*Last updated: 2026-07-03 — v1.2 The Green Room milestone started*
