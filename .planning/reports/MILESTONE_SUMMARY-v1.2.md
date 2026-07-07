# Milestone v1.2 — Project Summary

**Generated:** 2026-07-07
**Purpose:** Team onboarding and project review
**Status:** 🚧 In progress — 2 of 6 roadmap phases complete, 1 cross-domain phase complete-pending-UAT, 4 phases not started

---

## 1. Project Overview

Funūn is "the operating system for an independent music career" — a platform that takes an artist from release-ready assets, through rights registration, into a post-release launch playbook, and (this milestone) into a professional network. Three prior waves shipped: **Wave 1** (asset readiness), **v1.0/Wave 2** (rights & registration rails, Phases 1–4), and **v1.1/Wave 3** (Launchpad — post-release playbook, curator pitching, social campaign planning, Phases 5–7).

**v1.2 — "The Green Room"** is the current milestone. Its goal: turn Funūn's thin existing social layer (follow, wall, endorsements, comments, 1:1 DMs, public `/u/[handle]` profiles) into a full professional network — "LinkedIn for the music industry" — with rich member profiles, discovery/search, connections, real-time presence, and messaging. It opens membership to industry roles (producers, songwriters, music supervisors, A&R, execs) alongside artists. The design is locked to a hi-fi handoff (`docs/design/wave-4-social-layer/`), so this is a UI-forward milestone meant to be recreated pixel-faithfully.

A second, unrelated body of work — **Phase 14: Playback Room Refinement** — is tracked alongside v1.2 for scheduling purposes only. It is explicitly **not** part of The Green Room; it's a Wave 1 Sound Vault feature (the artist's private playback/upload room) that surfaced as needing its own pass during Phase 9 discussion, with zero dependency on the Green Room's schema or UI.

**Where things stand right now:**

| Track | Phases | Status |
|---|---|---|
| Green Room (Wave 4) | 8–13 | Phase 8 (schema foundation) ✅ complete. Phases 9–13 (all user-facing) not started. |
| Sound Vault (cross-domain) | 14 | Code-complete, code-reviewed, fixes applied — awaiting human UAT on a real deployment before it can close. |

In other words: **the database is ready to support a professional network, but no networking UI has shipped yet.** Phase 8 built the entire schema substrate (identity, connections, blocks, notifications, presence-read tables) with security lockdowns baked in, but every user-visible Green Room feature (rich profiles, search, connect requests, presence, messaging, block/report) is still ahead. In parallel, an unrelated Sound Vault feature (stems/instrumental upload, Export Pack) was built essentially to completion and is one deployment-verified UAT session away from shipping.

## 2. Architecture & Technical Decisions

- **Decision:** Single unified member-identity table — extend `artist_profiles` with a `member_type` discriminant (`'artist' | 'industry'`), not a parallel `industry_profiles` table.
  - **Why:** The existing (dead) `industry_profiles` table from migration 001 has zero writers; a second live identity table would fork query logic across every social feature. One table with a discriminant column keeps follows/DMs/search/RLS uniform regardless of member type.
  - **Phase:** 8

- **Decision:** Row-level RLS is not enough — column-level `REVOKE`/`GRANT` privilege lockdown must ship in the same migration as any new/existing private column.
  - **Why:** Discovered in Wave 3 (migration 031, curators) that `FOR SELECT USING (true)` policies leave PII readable to any authenticated caller via direct PostgREST, regardless of row policy. Phase 8 retroactively found and fixed this exact gap on `artist_profiles` itself — 11 PII columns (legal name, contact info, PRO/IPI/publisher/MLC/SoundExchange IDs) had been readable by any authenticated or anonymous caller since the fields were added, unrelated to Wave 4. This is now project-wide doctrine, not a one-off fix.
  - **Phase:** 8 (migration 040), pattern established in Wave 3

- **Decision:** Block enforcement (`no_block()` SECURITY DEFINER helper) is wired into every socially-exposed table's RLS *now* (Phase 8), even though the block feature itself (UI, block button) doesn't ship until Phase 13.
  - **Why:** Zero behavior change today (the `blocks` table is empty), but means Phases 10/11/13 inherit enforcement for free instead of each needing their own RLS retrofit migration — and closes the window where a feature could ship without block support.
  - **Phase:** 8

- **Decision:** Industry-member accounts are created via admin-invite only (v1) — `app_metadata.role` set atomically inside `admin.createUser()`, never a post-insert `UPDATE`.
  - **Why:** A post-insert role update creates a race where `handle_new_user()` fires before the role is set, producing a phantom/wrong-shaped `artist_profiles` row. This mirrors the Wave 3 curator-account pattern exactly, extended to a second account type.
  - **Phase:** 8

- **Decision:** Role badges (Artist/Producer/Songwriter/A&R/Exec/custom) are cosmetic-only — self-tagging a badge from "the other world" does not unlock that world's capabilities.
  - **Why:** Keeps `member_type` (auth-level, gates Vault vs. Antenna access) and `roles`/`industry_roles` (profile-level, freely editable display taxonomy) as two genuinely separate layers, avoiding an access-control feature nobody asked for yet.
  - **Phase:** 8

- **Decision (Phase 14, Sound Vault):** Stems are a single bundled ZIP per track (not per-instrument files), and are a *download-only* artifact — a new, separate "Instrumental" upload slot is the one added *playable* toggle option.
  - **Why:** A ZIP can't stream through an `<audio>` element; rather than build a multi-stem player, the phase splits the concern: "Download stems" is a button, "Master ↔ Instrumental" is the playback toggle.
  - **Phase:** 14

- **Decision (Phase 14):** Export Pack assembles the ZIP server-side, uploads the finished archive to Storage, then returns a signed URL — the route never streams the archive as the HTTP response body.
  - **Why:** The project runs on Vercel Hobby (hard 10s function ceiling, 4.5MB request body cap). Streaming a multi-hundred-MB archive as a response risks both the timeout and the body cap; assemble-then-sign keeps the function's own output tiny regardless of pack size.
  - **Phase:** 14

- **Decision (Phase 14):** Large uploads (stems ZIP up to 250MB) go direct-to-Supabase-Storage via `tus-js-client` resumable upload — the Next.js API route only ever receives a small JSON reference (`{ path, size, name }`) after the browser upload completes.
  - **Why:** Same Vercel Hobby 4.5MB body cap — proxying file bytes through a serverless function isn't viable at this size. This JSON-only metadata-route pattern is now the template for any future large-file feature.
  - **Phase:** 14

## 3. Phases Delivered

| Phase | Name | Status | One-Liner |
|-------|------|--------|-----------|
| 1 | Collaborator Profiles | ✅ Complete (v1.0) | Global collaborator roster with auto-fill into split sheets and contracts |
| 2 | Document Lifecycle | ✅ Complete (v1.0) | Signed-PDF upload and per-document/per-project signer status tracking |
| 3 | Rights Guidance | ✅ Complete (v1.0) | Guided registration checklists (copyright, PRO, SoundExchange, Songtrust) |
| 4 | Collaborator Identity Reconciliation | ✅ Complete (v1.0) | Email-based claim system linking pre-signup collaborators to real accounts |
| 5 | Launchpad Checklist | ✅ Complete (v1.1) | Per-project post-release guided checklist room with AI-drafted, admin-approved tips |
| 6 | Playlist Curator Pitching | ✅ Complete (v1.1) | Curator directory, AI-drafted pitch emails, claim flow, bounce/drift handling |
| 7 | Social Campaign Planner | ✅ Complete (v1.1) | AI-generated 4–6 week content calendar with Buffer-compatible CSV export |
| **8** | **Identity & Schema Foundation** | ✅ **Complete** (v1.2) | Unified member-identity schema, connections/blocks/notifications tables, column-privilege lockdown — no user-facing surface |
| 9 | Rich Member Profile | Not started | Hi-fi profile header, roles, stats, Featured spotlight, owner-vs-visitor views |
| 10 | Connections & Notifications | Not started | Follow/Connect request flow, notifications bell with unread badge |
| 11 | Presence & Messaging | Not started | Realtime presence dots, floating DM widget, rate-limited cold-message requests |
| 12 | Discovery & People Search | Not started | Global people search, Discover tab by role/genre |
| 13 | Network Tab & Trust & Safety | Not started | Network tab, hard blocks, reporting, admin verified badge, visibility controls |
| **14** | **Playback Room Refinement** *(cross-domain, Sound Vault)* | 🔶 **Code-complete, awaiting UAT** | Playback room as project landing page, real stems/instrumental upload, Export Pack (ZIP + PDFs, download or 7-day link) |

## 4. Requirements Coverage

v1.2's 28 requirements (PROFILE, DISCOVER, CONNECT, NOTIF, PRESENCE, SAFETY) are all mapped to Phases 9–13, none of which have started implementation yet:

- ⚠️ **PROFILE-01..09** (9 reqs) — mapped to Phase 9, not started
- ⚠️ **DISCOVER-01..03** (3 reqs) — mapped to Phase 12, not started
- ⚠️ **DISCOVER-04** — mapped to Phase 13, not started
- ⚠️ **CONNECT-01,02** — mapped to Phase 10, not started
- ⚠️ **CONNECT-03,04,05** — mapped to Phase 11, not started
- ⚠️ **NOTIF-01,02,03** — mapped to Phase 10, not started
- ⚠️ **PRESENCE-01,02,03** — mapped to Phase 11, not started
- ⚠️ **SAFETY-01,02,03,04** — mapped to Phase 13, not started

Phase 8 carries **no mapped requirement by design** — it's the schema foundation every requirement above depends on, and its own 5 success criteria (unified identity columns, connections/blocks tables + `no_block()`, notifications/dm_thread_reads, column-privilege lockdown, race-free industry signup) are all verified in code (`08-VERIFICATION.md`: 5/5 truths verified), pending only a live database push (see Tech Debt below).

Phase 14 has no `REQUIREMENTS.md` IDs (it predates/sits outside this requirement set) but tracks its own 4 ROADMAP success criteria, all verified in code (`14-VERIFICATION.md`: 15/15 truths verified) pending human UAT on a real deployment.

**Coverage: 0/28 v1.2 requirements validated so far** (28/28 mapped to phases; implementation has not started on any of them).

## 5. Key Decisions Log

### Phase 8 (Identity & Schema Foundation)

- **D-01/D-03:** Industry accounts via admin-invite only; `admin.createUser()` with `app_metadata.role='industry'` set atomically, paired with a custom Resend magic-link email (Supabase's built-in invite email deliberately bypassed since a new branded template was needed anyway)
- **D-06:** The dead `industry_profiles` table (migration 001, zero writers) is left untouched — no drop, no migration, revisit only if a future need arises
- **D-07/D-08:** `member_type` (auth-level, gates capability) and `industry_roles`/`roles` (profile-level, cosmetic display taxonomy) are two separate layers; `createIndustryMember()` populates both from the same invite-time role picks so a new industry member's profile shows a badge on day one
- **D-10/D-11:** Column-privacy lockdown is retroactive — applies to `artist_profiles`' pre-existing PII exposure, not just new Wave 4 columns
- **D-13/D-14:** Reserved handles live in a growable `reserved_handles` table (not a hardcoded list), seeded with system/brand/impersonation-risk words
- **D-15:** `no_block()` wired into `follows`/`wall_posts`/`endorsements`/`dm_threads`/`dm_messages` now, ahead of the Phase 13 block UI — plus an unplanned extension to `dm_messages` resolved via its parent `dm_threads` row, closing a gap where a block placed mid-thread wouldn't have covered further messages
- **D-16:** `featured_project_id` is DB-enforced to reference public/released projects only — a visitor can never land on a private draft via someone's profile spotlight
- **D-19:** The column-privilege REVOKE/GRANT migration shipped in the same PR as a companion code fix to 4+ existing read/write call sites — without it, `SELECT *` against the now-restricted table would hard-error in production the instant the migration landed

### Phase 14 (Playback Room Refinement)

- **D-01/D-02:** Sound Vault project cards now land directly on the playback room (not the management page); a readiness-score widget (topbar chip + inline) links back to management
- **D-03/D-04/D-06:** Stems ship as a single ZIP (download-only); a new Instrumental slot is the second playable toggle option alongside Master
- **D-05:** Stems/instrumental uploads write to the same canonical track record regardless of entry point (playback room or management page) — no duplicate storage model
- **D-10/D-11/D-12:** Export Pack bundles everything available (master, MP3, stems, instrumental, credits PDF, metadata PDF); delivery is the artist's choice (immediate download or 7-day expiring shareable link — genuinely more sensitive than Phase 9's stream-only public player link, so it must expire)
- **D-13 (deferred):** An in-app request/approve flow for industry members to request an Export Pack directly is a real, wanted feature but explicitly deferred until Phase 10's notification infrastructure exists — no throwaway parallel mechanism was built to fake it early

## 6. Tech Debt & Deferred Items

**Blocking environment gap (Phase 8 & 14):** This sandbox has no `supabase/config.toml`, no linked Supabase project, and no `SUPABASE_ACCESS_TOKEN`. **Migrations 034–041 (8 migrations across both phases) have been written, reviewed, and grep/structurally verified — but have never been pushed to a live database.** A human with real project credentials must run `supabase db push` and the SC-4/SC-5 smoke assertions documented in `08-05-SUMMARY.md` before Phase 8 can be marked verified. This is the single largest open item blocking v1.2 progress — Phases 9–13 all depend on this schema being live, not just written.

**Phase 14 human UAT still open:** 9 checkpoints in `14-UAT.md` require a real Vercel Hobby deployment (the 4.5MB body cap and 10s function ceiling don't reproduce in local `next dev`) plus a two-account cross-tenant security check. A collaboration PR ([funun#26](https://github.com/PeteyFranchise/funun/pull/26)) is open tracking these as tasks. Code-review findings (2 critical, 8 warning) were already found and fixed in this milestone — see `14-REVIEW.md` / `14-REVIEW-FIX.md`.

**Known info-level findings left open (Phase 8, not blocking):**
- `REVOKE UPDATE ON artist_profiles` omits `anon` explicitly (defense-in-depth gap only — `anon` can't match the ownership RLS clause anyway, so it's unreachable in practice)
- `handle_new_user()`'s industry branch lacks `SET search_path = ''` on its `SECURITY DEFINER` declaration, inconsistent with the `no_block()` pattern elsewhere (mitigated by fully-schema-qualified references, not currently exploitable)

**Deferred product ideas (not tech debt, intentional scope cuts):**
- Future self-serve industry signup (application+approval or invite-code) — `createIndustryMember()` was deliberately built as a standalone function so this can be added later without touching identity-race-avoidance internals (Phase 8 D-05)
- Cross-capability access (an industry member requesting Vault access, or vice versa, based on self-tagged badges) — explicitly out of scope; badges are cosmetic only (Phase 8 D-09)
- Multiple individual stem files (per-instrument) instead of one bundled ZIP — revisit if artists request it after real-world testing (Phase 14 D-03)
- In-app Export Pack request/approve flow for industry members — deferred until Phase 10 ships (Phase 14 D-13)
- Contract Locker visual restyle — a Wave 4 design bundle exists (`contract-locker.html`) but no roadmap phase currently owns porting the live Document Lifecycle feature to it
- Vercel Hobby → Pro/container-PaaS migration — no action needed yet; Phase 14 already routes around the current 4.5MB/10s limits via direct-to-storage upload + assemble-then-sign. STATE.md has a full scaling-tier writeup (Pro upgrade → container PaaS → AWS) if this becomes a recurring blocker beyond single-phase workarounds.

**Longer-standing deferrals (pre-v1.2, still open):** Dropbox Sign live e-sign (needs paid account), Songtrust API integration (BD conversation pending), SoundExchange direct filing (partner agreement required), direct social post scheduling/publishing via Meta/TikTok OAuth, direct Buffer/Later API push (CSV export shipped as the v1 substitute), Industry Round Table live panels (candidate follow-on milestone).

## 7. Getting Started

- **Run the project:** Standard Next.js 15 app — `npm install`, then `npm run dev`. Demo mode (`NEXT_PUBLIC_VAULT_DEMO=true`) runs a seeded in-memory app for previews without a real Supabase project.
- **Database:** PostgreSQL via Supabase, migrations in `supabase/migrations/` (currently up to `041_track_audio_stems_config.sql`). **Note:** as of this summary, migrations 034–041 exist as SQL files in this repo but have not been pushed to any live Supabase project in this environment — see Tech Debt above before assuming the schema is live anywhere.
- **Key directories:**
  - `app/(artist)/`, `app/(auth)/`, `app/(industry)/`, `app/(admin)/` — route groups by role
  - `app/api/` — API route handlers, mirrors domain structure (`vault/`, `admin/members/`, etc.)
  - `lib/[domain]/` — shared business logic (`lib/industry/`, `lib/vault/`, `lib/metadata/`, `lib/email/`)
  - `components/vault/`, `components/admin/` — feature-specific React components
  - `.planning/` — GSD planning artifacts: `ROADMAP.md` (phase list + success criteria), `REQUIREMENTS.md` (v1.2 requirement IDs), `PROJECT.md` (living project brief), `phases/NN-name/` (per-phase CONTEXT/PLAN/SUMMARY/VERIFICATION/REVIEW artifacts)
- **Tests:** `npx jest` (Jest + ts-jest, introduced in Phase 14 — first test infrastructure in the project). `npx tsc --noEmit` for type checking (strict mode).
- **Where to look first:**
  - For the Green Room's schema foundation: `supabase/migrations/034_member_identity_wave4.sql` through `040_artist_profiles_column_privileges.sql`, and `lib/industry/createIndustryMember.ts`
  - For the Sound Vault playback room work: `components/vault/PlaybackView.tsx`, `app/(artist)/vault/[projectId]/play/page.tsx`, `app/api/vault/[projectId]/export/route.ts`
  - Admin tooling precedent (`/admin/members`, `/admin/curators`, `/admin/checklist`) is a good reference pattern for any future admin surface

---

## Stats

- **Timeline:** 2026-07-03 → 2026-07-07 (in progress, 5 days elapsed so far)
- **Phases:** 2 complete (8 fully done; 14 code-complete pending UAT) / 6 total in the v1.2 roadmap scope (Phases 8–13 + cross-tracked 14)
- **Commits:** 135 (since 2026-07-03)
- **Files changed:** 166 (+28,847 / -4,712)
- **Contributors:** PeteyFranchise
