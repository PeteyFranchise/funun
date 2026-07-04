# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Wave 3: Launchpad

**Shipped:** 2026-07-04
**Phases:** 3 (Phases 5–7) | **Plans:** 18 | **Timeline:** 2026-06-30 → 2026-07-03 (4 days)

### What Was Built
- **Launchpad checklist room** — per-project post-release playbook, week-sequenced to the Spotify algorithmic window, with DB-backed AI-drafted admin-approved tips and per-project completion persistence.
- **Playlist curator pitching** — filterable directory, AI-drafted 150-word pitch composer with a server-side 3-gate re-validated send route, pitch history, curator claim flow (curator-role magic-link accounts isolated from the artist auth model), svix-verified bounce webhook, and genre-drift alerts.
- **Social campaign planner** — one-click AI-generated 4–6 week content calendar, genre→platform nudges, preview-then-accept slot generation, per-post completion tracking, and Buffer-compatible CSV export.

### What Worked
- **Wave-based parallelization within phases** — each phase decomposed into 6 plans across dependency waves (foundation → API → UI), keeping file overlap near zero and letting Wave-3 plans run in parallel.
- **Foundation-first data layer** — every phase led with the migration + types + pure lib logic (campaigns.ts, platform-nudges.ts) before any route or component, so downstream plans built on a stable typed surface.
- **Security caught by review, not just planning** — `/gsd-code-review` surfaced the column-level RLS gap (claim/response tokens readable via direct PostgREST) that row-level policies alone missed; fixed additively via migrations 031/032.
- **Treating AI output as untrusted input** — routing every generated calendar slot through enum/range validation before persist prevented hallucinated platforms/weeks from corrupting stored data or the CSV export.

### What Was Inefficient
- **Milestone boundary not modeled in tooling** — `milestone.complete` and `init.manager` pool all 7 phases into v1.1 because there's no per-phase milestone tag; the archive (MILESTONES.md counts, roadmap split, accomplishments list) had to be corrected by hand after the CLI ran. Future: tag phases with their milestone at creation.
- **SUMMARY one-liner quality varied** — a few summaries emitted code-review bullet fragments (e.g. "1. [Rule 1 - Bug] …") instead of a clean deliverable one-liner, which polluted the auto-generated accomplishments list.
- **Migrations applied out-of-band** — the executor sandbox has no Supabase credentials, so every migration (030+) was pushed to the live DB by the user manually; confirmation was treated as authoritative but this is a verification gap.

### Patterns Established
- **`app_metadata.role` set at `createUser()` time** (not post-insert UPDATE) so `handle_new_user()` branches correctly — used for curator accounts to avoid creating orphan `artist_profiles` rows.
- **Column-level `REVOKE`/`GRANT` on top of RLS** for any table exposing tokens or secrets — RLS restricts rows, not columns.
- **Dedicated cold-outreach sending domain** (`pitch.funun.studio` with DKIM/SPF/DMARC + warmup) kept separate from the transactional domain.
- **Preview-then-accept for AI generation** — slot-scoped generation returns a preview with no DB write until the user explicitly saves.
- **Prompt builders live outside the ToolSlug dispatcher** — `buildCalendarPrompt`/`buildSlotCaptionPrompt`/`buildSlotHookPrompt` in registry.ts, called directly by routes.

### Key Lessons
1. **Manual milestone-boundary correction is required at close** — the archival CLI treats the whole roadmap as one milestone; always verify MILESTONES.md counts, split the archived roadmap per wave, and prune the accomplishments list before committing.
2. **Row-level RLS is not column-level security** — any new table with tokens/PII needs explicit column privileges, and a code review pass is worth more than plan-time threat modeling for catching it.
3. **Isolate untrusted AI output at the persistence boundary** — validate enums/ranges on the way in, and wrap user-supplied content in a delimited block so it can't restructure system rules.

### Cost Observations
- Model mix: adaptive profile (Opus for planning/review, Sonnet for execution). AI features standardized on `claude-sonnet-4-6` inline (no shared lib import, to avoid stale model constants).
- Notable: 18 plans across 3 phases in 4 days with wave-parallelized execution.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 — Wave 2 | 4 | 14 | Rights & registration rails; email-based collaborator claim system established |
| v1.1 — Wave 3 | 3 | 18 | Denser 6-plan phases with wave parallelization; first webhook route; code-review-driven security hardening |

### Cumulative Quality

| Milestone | Requirements | Coverage | Security Threats Closed |
|-----------|--------------|----------|-------------------------|
| v1.0 — Wave 2 | 12/12 | 100% | — |
| v1.1 — Wave 3 | 19/19 | 100% | 43 (22 Phase 6 + 21 Phase 7), 0 open |

### Top Lessons (Verified Across Milestones)

1. **Email/token-based flows need explicit column privileges and one-time, time-limited tokens** — recurring across the Wave 2 collaborator claim and Wave 3 curator claim.
2. **Foundation-first (migration + types + pure lib) before routes/UI** keeps wave parallelization clean — held across both milestones.
