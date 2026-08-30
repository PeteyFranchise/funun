# External audit disposition — 2026-08-30

**Source:** external read-only audit against `main` @ `a0bfdd9` (11 findings + 1 accepted risk).
**Triaged by:** Claude, same day. Two findings independently verified by reading code/policies; the rest assessed and dispositioned below.
**Rule for this doc:** it is the durable record so the backlog isn't lost. Fixing an item means moving its row to Done with a commit ref, never deleting it.

---

## Done this session

| Finding | Sev | What it was | Fix | State |
|---|---|---|---|---|
| **C-01** | Critical | A shared editor/contributor could `PATCH` `user_id` on `works` / `vault_projects` directly via PostgREST and take ownership (WITH CHECK reuses the membership test; passes against the value just written). Confirmed real. | Migration `139` — `BEFORE UPDATE` guard pins `user_id` on both parent tables. Text-locked (`__tests__/migration-139.test.ts`). Commit `93fabf1`. | **Code committed; `supabase db push` PENDING (human-gated).** Push before the first cross-account collaboration on any work/project. |
| **M-03** | Medium | Contract AI verification was fail-open: unparseable/all-pending model output → status `verified` on an unassessed legal doc. Confirmed real. | `decideVerification()` made pure + fail-closed; malformed → new `unverified` state (existing DB enum). 12 tests. Commit `feb7d74`. | **Done, on `main`.** Ships on next deploy. |

**Note on C-01 scope:** child tables (tracks, work_versions, lyric_blocks, ai_entries) are **not** vulnerable the same way — their authorization resolves through the parent `work_id`/`project_id`, never the row's own `user_id` — so `139` correctly guards only the two parent tables.

---

## Backlog — real, all pre-existing (none from Phase 37)

| Finding | Sev | My read | Recommended action |
|---|---|---|---|
| M-01 | Medium | Selects engagement cap (migration 132) uses an unlocked `COUNT(*)` — concurrent inserts can exceed 5,000. Real. **The fix pattern already exists in migration 126** (`pg_advisory_xact_lock` on the reaction cap). | New migration mirroring 126 for `selects_engagement`. Low effort, known pattern. |
| M-02 | Medium | Public Selects telemetry inserts one row per event; the cap keys off a caller-controlled `viewerKey`, so key-rotation defeats it; staff rollups load raw rows into Node and don't paginate. Plausible, not independently re-verified. | Aggregate in SQL (`GROUP BY`/counters), cap independent of `viewerKey`, dedupe opens, retention policy. Larger; schedule as its own slice. |
| M-04 | Medium | Older AI routes (tools, pitchplug, launchpad, contracts, documents/generate) have no per-user/credit/concurrency limits. Real, pre-existing. **Audit confirms our new catalogue AI-entry route already rate-limits.** | Extend the existing `lib/security/rate-limit.ts` to the older routes; consider a shared AI gateway. |
| M-05 | Medium | Several upload routes (vault assets, track audio, contract verify, avatar) call `request.formData()` before auth; `/api` is outside middleware. Plausible, pre-existing. **Audit confirms our new version-upload + earnings-import use safe ordering.** | Authenticate + rate-limit before parsing on the four named routes; confirm Vercel body limits. |
| L-01 | Low | Selects toast renders `body.error` through `dangerouslySetInnerHTML`. No confirmed user-controlled path today; fragile. | Render toast as React text; drop the HTML sink. |
| L-02 | Low | `is_project_owner` / `project_member_role` / `is_work_owner` / `work_member_tier` are `GRANT EXECUTE` to `authenticated` and accept an arbitrary `p_uid` — a low-value membership-boolean probe (needs valid work/project UUID + target UUID). Touches our new 136 helpers too. | Bind to `auth.uid()` inside, or reject when `p_uid <> auth.uid()`. Fold into a future migration. |
| L-03 | Low | `typecheck:strict` reports 10 unused declarations (scattered, mostly pre-existing). Housekeeping. | Confirm each is dead vs. unfinished; remove or wire up; keep `typecheck:strict` in CI. |
| L-04 | Low | Contract verify uploads the PDF before the AI/DB step; a later throw orphans the storage object. | Delete the object on failure, or record a pending doc before the AI call. |

---

## Accepted

- **AR-01** — TMS is intentionally trusted to provision team members and assign/remove leadership. Correct call. Keep the recommended safeguards (immutable staff audit log, last-leader protection, MFA, periodic access review).

---

## Needs verification (from the audit; not chased this session)

1. Confirm deployed migration state via `supabase migration list` — 078 (live, Phase 21), 135–139 (135–138 pushed today; **139 pending**), 132 (Selects — confirm).
2. Vercel effective request-body / concurrency limits for the M-05 multipart routes.
3. `handle_new_user()` SECURITY DEFINER does not explicitly `SET search_path` — confirm whether authenticated users can create objects in a schema on the search_path (audit item #3).
4. Direct-PostgREST RLS smoke tests on a disposable Supabase env across owner / editor / contributor / viewer / stranger sessions — the regression net C-01 argues for.

---

## Recommended order

1. **`supabase db push` for 139** — the only time-sensitive item; do it before enabling real collaboration. *(M-03 already ships on the next deploy.)*
2. Direct-PostgREST RLS regression tests (needs-verification #4) — proves 139 and guards the next parent table.
3. M-01 (cheap, pattern exists in 126) and L-04 (small).
4. M-04 / M-05 systemic passes (extend the limiter; auth-before-parse).
5. M-02 (telemetry aggregation) as its own slice; L-01, L-02, L-03 housekeeping.
