# Project Research Summary — Funūn Wave 3: Launchpad

## Key Findings

### Stack

- **3 new runtime packages:** `svix` ^1.96.1 (Resend webhook signature verification), `validator` ^13.15.35 + `@types/validator` (curator email format validation), `csv-stringify` ^6.8.0 (Buffer-compatible CSV export)
- **5 new Supabase tables:** `launchpad_checklist_items` (admin-managed tip definitions), `launchpad_progress` (per-user per-project completion), `curators` (playlist curator directory), `pitch_history` (pitch log per project), `social_campaigns` (AI calendar metadata + posts JSONB)
- **Resend bounce webhook:** `POST /api/webhooks/resend` with Svix HMAC signature validation. `bounce.type === 'Permanent'` → set `curators.email_valid = false`. Must call `request.text()` before any JSON parse — calling `.json()` first breaks signature verification.
- **No Anthropic SDK upgrade needed:** Installed version (0.107.0) sufficient. Use existing JSON-prompt pattern from `lib/tools/registry.ts`. `messages.parse()` / `zodOutputFormat` not available and not needed.
- **Later does not support CSV import.** It is an open community feature request as of 2026. V1 export must be scoped to Buffer-only (4 columns: `Text`, `Image URL`, `Tags`, `Posting Time`).

### Features

**Launchpad Checklist:**
- Table stakes: pitch curators, Spotify editorial, social campaign, email newsletter, rights registrations, Canvas/Clips, save-to-stream push in post-release window
- Per-item tips are DB-backed, admin-approved, and genre-aware — not generic
- Completion auto-checking from tool run events is a key differentiator vs. manual checklists
- 75% of a release's first-year streams happen after month one — frame items around sustaining the post-release Spotify algorithmic window (weeks 1–4)

**Curator Pitching:**
- Directory table stakes: genre filter, platform filter, response rate visible per curator, pitch history, no-duplicate-send protection
- Pitch email must force personalization — 48% of all submissions include zero personalization; a 150-word email naming a specific playlist track outperforms a 500-word bio
- Cold email acceptance: 5–10%; platform-mediated (SubmitHub): 20–32%; timing 21–40 days before release = 4.5x better acceptance than last-minute
- Curator claim link in pitch email footer = growth loop for industry onboarding

**Social Campaign Planner:**
- TikTok and Instagram Reels are highest priority for most genres; Instagram converts to streams at higher rate, TikTok drives discovery
- Genre → platform nudge: start as static lookup table (5–6 genre buckets × 3 platform priorities) — no ML needed for V1
- 4-week calendar: Week 1 (7 posts: release day announce + repost), Week 2 (6 posts: behind-the-scenes, reaction push), Week 3 (5 posts: lyric pull, user-generated content push), Week 4 (4 posts: streaming milestone, catalog bridge)
- DropReady and SoundBait need two integration points each: inline calendar slot action + standalone quick tool. State is separate — standalone runs don't affect calendar slots unless artist explicitly saves.
- Buffer CSV: columns `Text`, `Image URL`, `Tags`, `Posting Time` (YYYY-MM-DD HH:mm). Column names are case-sensitive. Do not claim Later compatibility.

### Architecture

- **Existing `/launchpad` route is already scaffolded.** Wave 3 adds `app/(artist)/launchpad/[projectId]/` sub-routes — this per-project route is the spine shared by all three pillars
- **Build order:** Launchpad checklist (Phase 1) → Curator pitching (Phase 2) → Social campaign (Phase 3). Checklist must exist before pitching and campaign pages can live under the shared route
- **Curator claim = Wave 2 collaborator claim pattern** — `join/[inviteToken]` public route, 64-char hex token in pitch email footer, service client for lookup. No new patterns to invent
- **AI calendar generation: batch, not streaming.** Same `anthropic.messages.create` + `JSON.parse()` pattern used in `app/api/tools/[slug]/route.ts`. Calendar is only useful once complete; streaming a JSON array mid-parse adds complexity with no UX payoff
- **10 new API endpoints:** checklist progress CRUD, curator list/get/claim, pitch send, bounce webhook, campaign generate/PATCH/export
- **10 new client components:** LaunchpadChecklist, ChecklistItem, CuratorBrowser, PitchComposer, PitchHistory, CuratorClaimPage, CampaignPlanner, CalendarGrid, PostSlot, PlatformSelector

### Pitfalls

- **CRITICAL — Email domain contamination:** Using `funun.studio` for cold curator outreach will damage transactional email deliverability. Must set up `pitch.funun.studio` subdomain with DKIM/SPF/DMARC before Phase 2 ships. 2-week warmup lead time required.
- **CRITICAL — RLS not enabled by default:** Every new table in every Wave 3 migration must include `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE`. CVE-2025-48757 exploited this exact pattern.
- **AI calendar prompt injection:** User-supplied release data (title, story) must be isolated in a `<release_data>` XML block in the user turn, never the system prompt
- **AI hallucinated platform limits:** Hard-code a `PLATFORM_CONSTRAINTS` block in the system prompt with current character/duration limits. Platform limits change quarterly — add a review item to QA checklist
- **Curator claim token security:** 32-byte crypto-random token, 72-hour expiry, one-time use. Do NOT wire curator claim into `handle_new_user()` — curator claim must be explicit link-click only (unlike collaborator claim which auto-runs on signup)
- **Buffer CSV fragility:** Column names case-sensitive, dates break in Excel, emojis need UTF-8 BOM. Manual test with real Buffer import before Phase 3 ships
- **CAN-SPAM / CASL compliance:** Every pitch email needs unsubscribe link, physical address, and explicit `From` domain matching `pitch.funun.studio`. CASL (Canada) requires explicit opt-in — consider consent capture at curator onboarding

## Implications for Roadmap

1. **Phase 1 = Launchpad checklist** with no external dependencies. Establishes the per-project route and DB pattern that Phases 2–3 build on. Lowest risk, immediate value.
2. **Phase 2 = Curator pitching.** Resend integration is already in place. Claim flow pattern exists from Wave 2. Primary infrastructure work: separate `pitch.funun.studio` domain setup + bounce webhook.
3. **Phase 3 = Social campaign planner.** Most complex (AI + CSV). No hard dependency on Phase 2, but shares the per-project route container from Phase 1.
4. **SOCIAL-07 requirement must drop "Later-compatible"** — Later has no CSV import. Reword to "Buffer-compatible CSV export."
5. **PITCH-02 has a prerequisite:** `pitch.funun.studio` domain + warmup must be complete before sending any curator emails. Plan this as an infrastructure task at the start of Phase 2.
6. **PITCH-05 (curator claim) and PITCH-06 (bounce detection) should ship together** — a claimed curator who can't see pitches, or a bounced address that stays active, are both trust-breaking bugs.
7. **Curator directory seeding needs a product decision** before Phase 2 kicks off: manual curation (safest), vendor partnership, or community-sourced. Hybrid (seed ~50 manually, grow via claim links) is the recommended V1 path.
8. **`suggested_week` field on checklist items** — build into the schema from the start so items can be sequenced by post-release week (Week 1, 2, 3–4) to align with Spotify algorithmic window.
9. **Genre → platform lookup table** for social nudges: static JSON in the codebase (no DB), 5–6 genre buckets. Ship in Phase 3 before AI calendar generation.
10. **Admin authentication decision needed for curator directory:** use a service-role-protected admin route (check hardcoded admin email list), or add `is_admin` to `raw_app_meta_data`. Schema can accommodate either — decide before Phase 2 planning.

## Open Questions

1. **Curator directory seeding strategy** — manual curation, vendor, or community-sourced for initial 50–500 entries?
2. **Admin access model** — hardcoded admin email list vs. `is_admin` metadata field?
3. **Tip refresh cadence** — monthly sufficient for all platforms, or more frequent for TikTok/X?
4. **Genre bucket depth** — 5 buckets (Pop, Hip-hop/R&B, Indie/Alternative, Electronic, Country) sufficient for MVP?
5. **Pitch email signature** — auto-include artist social links and website from profile?
6. **Soft bounce handling** — separate logic vs. rely on Resend's internal retry handling?
7. **Response rate window** — last 90 days only, or all-time average with decay weighting?
8. **Later CSV (Wave 4)** — plan Later API integration in Wave 4 or defer entirely?
9. **Curator account type on claim** — limited viewer-only or full industry-equivalent role?

## Sources

- `.planning/research/STACK.md` — New packages, Supabase schema, webhook wiring, Claude API pattern, CSV format
- `.planning/research/FEATURES.md` — Checklist items, curator pitch email anatomy, platform content map, 4-week calendar structure
- `.planning/research/ARCHITECTURE.md` — New routes, API endpoints, components, data flows, build order
- `.planning/research/PITFALLS.md` — 25 pitfalls across email deliverability, AI guardrails, admin tips, security, CSV, RLS
