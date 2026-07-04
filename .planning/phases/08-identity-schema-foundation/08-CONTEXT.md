# Phase 8: Identity & Schema Foundation - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Schema/migration foundation phase — one small internal admin route (D-02), plus (per D-19, added via research) companion code fixes to 4 existing pages/routes so the column-privacy migration doesn't break production; otherwise no new UI surface. Extends `artist_profiles` into the single unified member-identity table. **Research correction (2026-07-04):** only `member_type` and `search_vector` are genuinely new columns — `pronouns`, `banner_url`, `open_to`, `featured_project_id` (plus `roles`, `verified`, `is_public`) were already added in migration `010_public_showcase_profile.sql` and are live in production with real data; `location` and `bio` predate that. The phase adds the 2 new columns (`IF NOT EXISTS` no-ops document intent for the other 6 without risk). The phase also stands up `connections` and `blocks` tables with RLS, extends `notifications` with actor-snapshot columns + realtime publication, adds `dm_thread_reads`, creates a `no_block()` SECURITY DEFINER helper, retrofits column-level privilege lockdown onto `artist_profiles` (with the D-19 companion fix), and adds a `reserved_handles` table. Success criteria are locked in `.planning/ROADMAP.md` §"Phase 8" — this discussion clarifies HOW, not whether. No user-facing requirement is mapped to this phase (per REQUIREMENTS.md traceability note); every Phase 9–13 requirement depends on this schema.

</domain>

<decisions>
## Implementation Decisions

### Industry-Member Identity & Signup
- **D-01 (amended via research + user decision 2026-07-04):** Industry accounts are created via **admin-invite only** for v1 — no public self-serve signup this phase. A server-side `createIndustryMember()` helper calls `supabase.auth.admin.createUser()` with `app_metadata.role='industry'` set **atomically at creation time** (resolved to `createUser()` only — see D-03; `inviteUserByEmail()` cannot carry `app_metadata`, so it is no longer an option, closing the race D-01 exists to prevent). `handle_new_user()` gets an industry branch — **not** a bare early-return like the curator branch (migration 030). Industry members **do** get an `artist_profiles` row (`member_type='industry'`, populated per D-01/D-04/D-08 below), just built without `claim_collaborators()`. The curator precedent is mirrored for "set role atomically at creation," not for "skip the row entirely."
- **D-02:** Build a **minimal internal admin route** (e.g. `/admin/members`) rather than a one-off script — gated by the same `is_admin` pattern as `/admin/curators`/`/admin/checklist`. This is the one small UI surface in an otherwise UI-free phase; justified because it's a real, reusable, repeatable path to onboard real industry contacts now, not a throwaway.
- **D-03 (RESOLVED via research + user decision 2026-07-04 — supersedes original text):** Research (`08-RESEARCH.md` Pitfall 2, verified directly against installed `@supabase/auth-js` SDK types) proved `inviteUserByEmail()` structurally cannot carry `app_metadata`, making it incompatible with D-01's race-free requirement as originally paired. **User chose:** use `admin.createUser()` (carries `app_metadata` atomically, no race, no extra side-channel table) and send a **custom Resend invite/magic-link email** instead of Supabase's built-in invite email — Resend is already wired in this project (see CLAUDE.md `resend` dependency). This changes the original "no new email template or Resend wiring needed" framing: a new email template IS needed. `createIndustryMember()` sequence: (1) `admin.createUser({ email, app_metadata: { role: 'industry' }, email_confirm: true, ... })`, (2) generate a magic-link (e.g. `admin.generateLink({ type: 'magiclink', email })`) and send it via a custom Resend template.
- **D-04:** The invite form collects **email + display name + initial role badge(s)** at creation time (role picks from the existing `INDUSTRY_ROLE_GROUPS` list in `lib/industry-roles.ts`) — so the invited member's profile has at least one role badge to render on day one (Phase 9 needs this to look real immediately, not sit at "no roles selected"). **See D-08 amendment — this must populate `roles` (JSONB), not just `industry_roles`, to actually render as a badge.**
- **D-05: Forward-compatible design for future self-serve (not built this phase).** `createIndustryMember()` must be a standalone, reusable function — not inlined into the admin route handler — so a future self-serve flow (application + manual approval, or invite-code gated; user is open to either direction, undecided between the two) can call the exact same function later without redesigning the identity-race-avoidance logic (app_metadata-at-creation via `createUser()` + `handle_new_user()` industry branch). Capture this as an explicit forward-looking constraint for the planner: build the helper as a clean, callable unit.
- **D-06:** The existing `industry_profiles` table (migration 001, zero writers anywhere in the app, only read in 2 Antenna files where it always resolves null) is **left untouched**. No migration, no drop, no data move. It's dead-but-harmless; revisit only if a future phase actually needs it.

### member_type vs. Role Badges (two separate layers)
- **D-07:** `member_type` (`'artist' | 'industry'`) is the **auth-level account type** — set once at account creation (mirrors `app_metadata.role`), and is what actually gates capability access: `artist` accounts get Vault/Launchpad/PitchPlug; `industry` accounts get Antenna/opportunities. It does not change based on profile edits.
- **D-08 (amended via research + user decision 2026-07-04):** The existing `industry_roles` TEXT[] column (already on `artist_profiles`, used today for split-sheet auto-fill) remains the **profile-level taxonomy/auto-fill list** — freely editable, independent of `member_type`. **Research correction:** `industry_roles` is NOT what the profile page actually renders as badges — `ProfileView.tsx` renders from a separate `roles` (JSONB, `ProfileRole[]`) column instead. **User-confirmed resolution:** `createIndustryMember()` populates **both** columns at creation — `industry_roles` from the D-04 invite-time picks (taxonomy/split-sheet auto-fill, as before), AND a mapped `roles` (JSONB) entry (matching an existing `PROFILE_ROLES` preset where one exists, else `{kind:'custom', label}`) so the invited member's profile actually shows a badge on day one, fulfilling D-04's stated goal. Same identity row, both array/JSONB columns, no new table needed.
- **D-09:** Role badges are **cosmetic only** — self-tagging a badge from "the other world" (e.g. an artist tagging "A&R," or an industry member tagging "Recording Artist") does **not** unlock the other world's capabilities (no auto-provisioned Vault access, no auto-provisioned Antenna posting). Cross-capability access requests are explicitly out of scope for Phase 8 — a future access-control decision, not a schema one.

### Column-Privacy Lockdown (retroactive, not just new fields)
- **D-10:** Phase 8 **retroactively fixes the existing exposure**, not just new Wave 4 columns. `artist_profiles` currently has a `FOR SELECT USING (true)` policy with zero column-level REVOKE/GRANT — meaning `legal_first_name`, `legal_middle_name`, `legal_last_name`, `legal_name_suffix`, `contact_phone`, `mailing_address`, `pro`, `ipi`, `publisher`, `mlc_id`, and `soundexchange_id` are ALL readable today by any authenticated (or anon) caller via direct PostgREST — a live, pre-existing CRITICAL-1-class gap unrelated to Wave 4 that happens to live in the exact table this phase is already migrating. One migration applies the full REVOKE/GRANT column-privilege pattern (per migration 031's precedent) across the whole table in the same pass.
- **D-11 (column list corrected via research 2026-07-04 — classification itself unchanged):** Column classification —
  - **PUBLIC** (readable by anyone): `artist_name`, `genres`, `location`, `bio`, `career_stage`, `instagram_handle`, `threads_handle`, `tiktok_handle`, `spotify_url`, `monthly_listeners`, `total_streams`, `industry_roles`, `handle`, `roles`, `verified`, `is_public`, `avatar_url`, `created_at`, `updated_at`, and the Wave 4 columns — genuinely new: `member_type`, `search_vector`; pre-existing from migration 010, not new: `pronouns`, `banner_url`, `open_to`, `featured_project_id`.
  - **PRIVATE** (owner + service-role only): `legal_first_name`, `legal_middle_name`, `legal_last_name`, `legal_name_suffix`, `contact_phone`, `mailing_address`, `pro`, `ipi`, `publisher`, `mlc_id`, `soundexchange_id`.
- **D-12:** This column-privilege lockdown is a **fixed tier**, distinct from Phase 13's SAFETY-04 per-user visibility toggle (public vs. connections-only profile, hide "Open to" from public view) — that's a row-level, user-configurable setting built later; it doesn't conflict with or depend on this migration.

### Reserved Handles
- **D-13:** Reserved handles live in a **new `reserved_handles` table** (`handle TEXT PRIMARY KEY, reason TEXT`), not a hardcoded constant list — seeded in this migration with an initial set, but growable later via a plain `INSERT` (no new migration needed as the list grows). Handle-claim validation does a lookup against it.
- **D-14:** Scope is **broad** — system/brand words (`admin`, `api`, `settings`, `signin`, `signup`, `dashboard`, `vault`, `launchpad`, `help`, `support`, `about`, `terms`, `privacy`, `funun`, `funun-official`, `official`) **plus** a curated set of well-known music-platform/brand names to prevent impersonation-style squatting. Exact expanded brand-name list is Claude's discretion during planning (seed data, not a schema decision).

### Block Enforcement Scope
- **D-15:** Phase 8 creates the `blocks` table + `no_block()` SECURITY DEFINER helper **and wires it into existing socially-exposed tables' RLS now** — `wall_posts`, `endorsements`, `dm_threads`/`dm_messages`, and `follows` INSERT policies all get the `no_block()` check added in this migration, even though the block *feature* (UI, block button) doesn't ship until Phase 13. This is zero-behavior-change today (the `blocks` table is empty until Phase 13 populates it) but means Phases 10/11/13 inherit enforcement for free instead of each needing their own RLS-policy retrofit migration.

### Featured Spotlight Eligibility
- **D-16:** `featured_project_id` (PROFILE-05) is **restricted to public/released projects only**, enforced at the DB level (CHECK or trigger) — a visitor can never land on a private draft via someone's profile spotlight. If a featured project is later unpublished, the reference should null itself out rather than silently exposing or breaking.

### People-Search Composition
- **D-17:** `search_vector` (the new GIN tsvector column) is built from `artist_name`, `genres`, `location`, `industry_roles` (role badges), `handle`, **and `bio`** — broader recall for self-described specialties not captured in role badges, at the cost of slightly noisier matches. Directly serves DISCOVER-01/02's "name, role, or keyword" + location/genre filters (Phase 12 consumes this; Phase 8 only creates the column + index).

### Subscriptions & Column-Privacy Companion Fix (added via research + user decision 2026-07-04)
- **D-18:** Industry members DO get a `subscriptions` row (`tier='free'`, `status='active'`) inserted at creation time, same as artists — a cheap, safe default that doesn't foreclose a future industry-tier gating feature and costs nothing to have and ignore in the meantime.
- **D-19:** D-10's column-privilege REVOKE/GRANT migration MUST ship in the same phase (same PR) as a companion code fix to the existing call sites that would otherwise hard-error (`42501 permission denied for column`) the instant the REVOKE lands, because Postgres fails the WHOLE query on `SELECT *` against a column-restricted table, not just the restricted columns. Confirmed call sites: `app/(artist)/settings/page.tsx` (2 sites), `app/profile/page.tsx`, `app/u/[handle]/page.tsx` (public path), and `app/api/profile/route.ts` PATCH handler (owner path) — plus any other `select('*')`/bare `.select()` against `artist_profiles` found by a fresh project-wide grep at implementation time. Fix pattern: the public path (`u/[handle]`) gets an explicit column list matching D-11's PUBLIC set; owner self-service paths (Settings, `/profile`, profile PATCH) switch to `createServiceClient()` with an explicit `auth.uid() === id` ownership check performed first (mirrors the project's existing "admin routes independently re-verify `is_admin` server-side" pattern, applied here to self-service ownership). This is not optional polish — without it, D-10 breaks production between the migration deploy and the code-fix deploy.

### Claude's Discretion
- Exact expanded reserved-brand-name list for `reserved_handles` seed data (D-14).
- Exact wording/shape of `no_block()` (function signature, which tables' policies get the literal SQL edit vs. a shared helper call) — implementation detail, pattern is decided (D-15).
- Full migration numbering/file breakdown (this phase likely spans multiple migration files, e.g. one per: artist_profiles extension, connections/blocks, notifications/dm_thread_reads, column-privilege lockdown, reserved_handles) — planner's call, following the codebase's one-file-per-concern convention.
- Exact `notifications` actor-snapshot column set (e.g. `actor_name`, `actor_avatar_url` denormalized onto each row) — standard reuse of the existing `notifications` table extension pattern, no product decision needed.
- `/admin/members` UI polish/layout — minimal is fine, follow existing `/admin/curators`/`/admin/checklist` visual conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 8: Identity & Schema Foundation" — goal, 5 success criteria, explicit "no user-facing requirement" framing
- `.planning/REQUIREMENTS.md` §"Phase note" (bottom of Traceability) — confirms Phase 8 is verified structurally, not against a mapped requirement
- `.planning/PROJECT.md` §"Key Decisions" — unified-identity-table architectural bet; column-privilege and block-enforcement precedent language
- `.planning/STATE.md` §"Pending Todos" — the exact open items this discussion resolved (industry signup/routing, reserved-handle list, verified-badge deferral confirmation)
- `.planning/research/SUMMARY.md` — full research rationale for schema-first sequencing, the 3 CRITICAL pitfalls (column exposure, block bypass, identity race), and Phase 8's exact deliverable list
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` — deeper detail behind the SUMMARY.md findings, if planner wants more context on any pitfall

### Prior-phase patterns to reuse (in-codebase precedent)
- `supabase/migrations/031_curators_column_privileges.sql` — the EXACT REVOKE/GRANT column-privilege pattern to replicate for `artist_profiles` (D-10/D-11)
- `supabase/migrations/030_curators_pitch_history.sql` — the `handle_new_user()` curator branch (lines ~92-110) to mirror for the industry early-return branch (D-01); also the RLS-immediately-after-CREATE-TABLE convention
- `supabase/migrations/027_fix_handle_new_user_exception_isolation.sql` — most recent `handle_new_user()` edit before 030; read alongside 030 to understand the current full function body before adding the industry branch
- `.planning/phases/06-playlist-curator-pitching/06-CONTEXT.md` — curator claim-account pattern (magic-link, lightweight account, `admin.createUser()` at creation time) — direct precedent for D-01/D-03
- `.planning/phases/05-launchpad-checklist/05-CONTEXT.md` — `/admin` layout pattern (`is_admin` gate, shared nav) — direct precedent for the new `/admin/members` route (D-02)

### Codebase integration points
- `supabase/migrations/001_initial_schema.sql` — current full `artist_profiles` schema (lines 10-31) and `industry_profiles` (lines 34-58, confirmed dead — D-06) and `handle_new_user()` (lines 354-366)
- `supabase/migrations/020_artist_profile_rights_fields.sql`, `021_artist_profile_legal_contact_roles.sql`, `022_artist_profile_genres_array.sql` — all prior `artist_profiles` column additions; D-11's private-column list is sourced directly from 021 (legal name, contact, mailing address) and 020 (PRO/IPI/publisher/MLC/SoundExchange IDs)
- `supabase/migrations/009_antenna_notifications.sql` — current `notifications` table schema to extend with actor-snapshot columns
- `supabase/migrations/012_social_layer.sql` — `follows`, `wall_posts`, `endorsements`, `dm_threads`, `dm_messages` — all the existing RLS INSERT policies that need the `no_block()` check added (D-15)
- `supabase/migrations/033_social_campaigns.sql` — most recent migration; new Phase 8 migrations start at `034`
- `lib/industry-roles.ts` — existing `INDUSTRY_ROLE_GROUPS` list, reused for D-04's invite-time role picks and D-08's badge display
- `middleware.ts` — current auth/routing logic; the industry early-return branch (D-01) and any new protected `/admin/members` path need this updated
- `app/(auth)/signup/page.tsx` — current client-side `supabase.auth.signUp()` call; confirms why D-01's admin-invite path needs a NEW server-side mechanism (this existing flow can't set `app_metadata` atomically)
- `app/u/[handle]/page.tsx`, `supabase/migrations/010_public_showcase_profile.sql` — existing `handle` column + case-insensitive unique index; D-13's `reserved_handles` lookup slots into whatever claims/validates a handle today

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/industry-roles.ts` (`INDUSTRY_ROLE_GROUPS`) — direct reuse for both the invite-time role picker (D-04) and ongoing badge display (D-08); no new taxonomy needed
- `components/admin/ChecklistAdmin.tsx`, `app/(admin)/layout.tsx` — direct structural pattern for the new `/admin/members` page (D-02)
- Curator claim/invite flow (Phase 6) — direct precedent for admin-triggered account creation + Supabase magic-link entry (D-01/D-03)

### Established Patterns
- Every new table gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE` (CVE-2025-48757 convention, enforced project-wide) — applies to `connections`, `blocks`, `dm_thread_reads`, `reserved_handles`
- `app_metadata.role` set at `admin.createUser()`/`inviteUserByEmail()` time (never a post-insert UPDATE), paired with an early-return branch in `handle_new_user()` — proven pattern (migration 030), now applied to industry members (D-01)
- Admin routes independently re-verify `is_admin` server-side (not just layout-level gating) — applies to the new `/admin/members` API route

### Integration Points
- New `/admin/members` route joins the existing `/admin` layout alongside `/admin/checklist` and `/admin/curators`
- `handle_new_user()` gets a new industry early-return branch, appended after the existing curator branch (migration 030) — same function, additive branch
- `artist_profiles` gets both new columns (member_type, pronouns, banner_url, open_to, featured_project_id, search_vector) AND retroactive column-privilege lockdown (existing + new columns) in coordinated migrations
- Existing `follows`/`wall_posts`/`endorsements`/`dm_threads` INSERT policies get a `no_block()` check appended (D-15) — additive RLS policy edits, not table recreation

</code_context>

<specifics>
## Specific Ideas

- The `/admin/members` invite flow should feel like a real, permanent internal tool (not a script) — Pete plans to use it repeatedly to onboard real industry contacts starting now.
- `createIndustryMember()` must be written as a clean, standalone, reusable function specifically so a not-yet-designed future self-serve flow (application+approval, or invite-code — direction still open) can call it later without touching the identity-race-avoidance internals again.

</specifics>

<deferred>
## Deferred Ideas

- **Future self-serve industry signup UX** (application + manual approval, or invite-code gated — undecided between the two) — explicitly deferred past Phase 8/this milestone; only the underlying `createIndustryMember()` function needs to be built in a way that doesn't foreclose it (D-05).
- **Cross-capability access** (an industry member requesting Vault access, or an artist requesting Antenna-posting access, based on self-tagged role badges) — explicitly out of scope; badges are cosmetic only for now (D-09).
- **`industry_profiles` table repurposing/migration** — left untouched (D-06); revisit only if a concrete future need arises.

</deferred>

---

*Phase: 8-Identity & Schema Foundation*
*Context gathered: 2026-07-04*
