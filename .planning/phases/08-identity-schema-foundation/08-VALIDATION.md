---
phase: 8
slug: identity-schema-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test runner in this repo (`package.json` has no devDependency test framework, no `tests/`/`__tests__/` dirs). This phase is pure SQL/migration + a handful of server-side data-access edits (D-19) with one small admin page (D-02); verification is manual SQL assertions + manual click-through, not an automated suite. |
| **Config file** | none — see Wave 0 Requirements below |
| **Quick run command** | `npx supabase db push --dry-run` (validates migration SQL parses/applies cleanly before touching the live project) |
| **Full suite command** | Manual SQL assertions (see Per-Task Verification Map) run via the Supabase SQL editor or `psql "$SUPABASE_DB_URL"` after push |
| **Estimated runtime** | ~10s (dry-run) / ~5 min (full manual assertion + click-through pass) |

---

## Sampling Rate

- **After every task commit:** Run `npx supabase db push --dry-run` (syntax/apply validation) for that migration file
- **After every plan wave:** Run the full manual SQL assertion pass (table below) against the pushed state
- **Before `/gsd-verify-work`:** All 5 success-criterion assertions below must pass, including the D-19 companion-fix click-through
- **Max feedback latency:** ~10s per task (dry-run), immediate for SQL assertions post-push

---

## Per-Task Verification Map

Phase 8 carries no mapped REQUIREMENTS.md ID (foundation phase — see `.planning/REQUIREMENTS.md` Phase note). Verification instead maps to the phase's 5 ROADMAP.md success criteria. The planner should attach the relevant SC-ID(s) below to each plan's `must_haves` and reference the matching `<threat_model>` T-08-xx ID once assigned.

| SC ID | Success Criterion | Verification | Automated? | File Exists? | Status |
|-------|--------------------|---------------|------------|--------------|--------|
| SC-1 | Extended identity columns (`member_type`, `search_vector`) + GIN index | `\d artist_profiles` shows `member_type`, `search_vector`; `SELECT * FROM pg_indexes WHERE tablename='artist_profiles' AND indexname LIKE '%search%'` returns a row | Manual SQL | ❌ Wave 0 | ⬜ pending |
| SC-2 | `connections`/`blocks` RLS + `no_block()` wired into existing socially-exposed tables | `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('connections','blocks')` returns `true` for both; manual test as two distinct users confirms a blocked party cannot INSERT into `wall_posts`/`endorsements`/`dm_messages`/`follows` against the blocker | Manual SQL + manual client test | ❌ Wave 0 | ⬜ pending |
| SC-3 | `notifications` extended + added to realtime publication; `dm_thread_reads` exists | `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications'` returns a row; `\d dm_thread_reads` succeeds | Manual SQL | ❌ Wave 0 | ⬜ pending |
| SC-4 | Column REVOKE/GRANT (D-10/D-11) + D-19 companion fix — no `SELECT *` breakage | As `authenticated` role: `SELECT legal_first_name FROM artist_profiles LIMIT 1` → expect `42501`; manual click-through as the profile owner on Settings, `/profile`, and a PATCH via the Settings form → expect success (200, not 500); manual visit to a public `/u/[handle]` page → expect success showing only PUBLIC columns | Manual SQL + manual click-through (4 sites: settings, /profile, u/[handle], profile PATCH route) | ❌ Wave 0 | ⬜ pending |
| SC-5 | Industry-member identity created without `handle_new_user()` phantom-row race | Invite a test industry email via `createIndustryMember()` (uses `admin.createUser()` per resolved D-03, not `inviteUserByEmail()`); confirm `artist_profiles` row exists with `member_type='industry'`, `roles` and `industry_roles` both populated (D-08), and a `subscriptions` row with `tier='free'` (D-18); confirm the custom Resend invite email was sent (not Supabase's built-in template) | Manual (requires a real or staging Supabase Auth call + Resend send confirmation) | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No automated test harness exists for Postgres migrations in this repo — a lightweight `supabase/tests/` SQL assertion script (`pgTAP` or plain `DO $$ ... RAISE EXCEPTION ...` blocks) is NOT required to build from scratch for Phase 8 alone (matches project convention of manual verification for prior migrations), but flag as a recurring cost if this pattern repeats unaddressed across Phases 9–13.
- [ ] No staging Supabase project confirmed distinct from production — before pushing the column-REVOKE migration (SC-4, behavior-changing against a live table with real user data), confirm whether a staging push-and-verify pass is possible, or whether the D-19 companion code fix must be verified via a fast sequential deploy (migration + code fix in the same release window, per D-19's "ship together" requirement).

*Existing infrastructure (manual SQL + `supabase db push --dry-run`) covers all phase requirements given this project's no-test-framework convention; the two items above are process gaps, not missing test code.*

---

## Manual-Only Verifications

| Behavior | Success Criterion | Why Manual | Test Instructions |
|----------|--------------------|------------|--------------------|
| Owner can still read/edit their own private fields (legal name, contact, PRO/IPI/publisher/MLC/SoundExchange) after D-10's REVOKE lands | SC-4 | No test framework; requires an authenticated browser session against Settings page | Log in as a real/seeded artist account with private fields populated → visit `/settings` (or the rights-registry metadata screen) → confirm legal name/contact/PRO fields render and save without a 500/`42501` error |
| Blocked party cannot DM, wall-post, endorse, or follow the blocker | SC-2 | Requires two distinct authenticated sessions/users; no test framework | Seed two test accounts, A blocks B (insert into `blocks`), then attempt as B: send a DM to A, post on A's wall, endorse A, follow A → all four must be rejected by RLS |
| Industry invite end-to-end (admin route → email → magic-link → profile) | SC-5 | Requires a real Supabase Auth admin call + Resend send + email inbox check; no test framework | From `/admin/members`, invite a test email with display name + role badge(s) → confirm Resend email arrives → click magic-link → confirm `artist_profiles` row with `member_type='industry'`, both role columns populated, and a `subscriptions` row exist |
| Public profile page shows only PUBLIC columns, never PRIVATE ones, even via direct API inspection | SC-4 | Requires inspecting actual HTTP response, not just UI rendering | Visit `/u/[some-handle]` as a logged-out visitor → inspect network response / page source → confirm no `legal_*`, `contact_phone`, `mailing_address`, `pro`, `ipi`, `publisher`, `mlc_id`, `soundexchange_id` values appear anywhere in the payload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (dry-run push) or an explicit Wave 0 / manual-only entry above
- [ ] Sampling continuity: no 3 consecutive tasks without at least a dry-run push verify
- [ ] Wave 0 covers both process gaps identified above
- [ ] No watch-mode flags (N/A — no test framework)
- [ ] Feedback latency < 10s per task (dry-run), manual pass < 5 min per wave
- [ ] `nyquist_compliant: true` set in frontmatter once the planner confirms every task in every PLAN.md maps to a row in this table or an explicit manual-only entry

**Approval:** pending
