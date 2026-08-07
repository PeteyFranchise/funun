---
phase: 19-profile-identity-model-cleanup
plan: 07
status: complete
completed: 2026-07-24
requirements: [R1, R2, R4]
autonomous: false
---

# Plan 19-07 Summary — Human-gated schema cutover

**The single human-gated migration checkpoint for Phase 19.** Pete pushed the authored migrations via Codex; the executor/orchestrator never ran `supabase db push`.

## Outcome

- **Migrations 071 → 072 → 073 → 074 → 075 applied to the remote DB in filename order.**
- `supabase migration list` shows **LOCAL = REMOTE for every migration 001–075** (primary verification evidence).
- Historical migrations **001–070 byte-unchanged**; no reset/repair/destructive CLI flags used.

## What went live

- `user_profiles` **dropped** (073) — only after the semantic-blank rescue (071) and both-reader re-point (072).
- `artist_profiles.claim_prefill` JSONB column + R2 reverse pre-fill logic (072).
- `claim_collaborators()` **and** `backfill_claimed_collaborators()` re-pointed to read `artist_profiles` (072).
- `split_sheet_identity_flags` table + RLS (074).

## Deviation — migration 075 added during preflight (in scope per the checkpoint contract)

The 19-07 plan authored 071–074; the checkpoint's resume-signal explicitly allows "correct as a NEW file before re-push." Codex's first preflight **stopped before pushing** and found two default-grant gaps, both fixed as a NEW migration 075 (071–074 untouched), mirroring migration 070's privilege-sweep pattern:

1. **072 gap** — `claim_collaborators()`/`backfill_claimed_collaborators()` are `SECURITY DEFINER` cross-user-write functions whose default `PUBLIC` EXECUTE was never revoked (026/051) and `CREATE OR REPLACE` preserved it. 075 revokes EXECUTE from `PUBLIC`/`anon`/`authenticated` and grants it to `service_role` only. Verified safe: the `/api/claim-collaborators` route uses the service-role client and the signup trigger invokes as its own owner definer — neither needs an authenticated grant.
2. **074 gap** — the `split_sheet_identity_flags` INSERT policy only checked `auth.uid() = flagged_by` (not party-ownership / frozen-status), so a direct authenticated PostgREST insert could bypass the route and spam flags. 075 drops the weak policy and revokes direct authenticated/anon writes. Verified safe: **all** runtime access to the table is service-role (route insert + owner staged-flag read at `split-sheets/[id]/page.tsx:135`).

Second preflight + push (after 075): PASS.

## Reporting limitation (documented, non-blocking)

Migration 071's `RAISE NOTICE` rescue counts (candidate / stranded / updated rows — the intended R1 audit trail, a plan must_have) were **not surfaced by Supabase CLI v1.226.4**, and are unrecoverable now that 073 dropped `user_profiles`. Mitigation: the rescue applied successfully; its logic is unit-tested (the 14-test `__tests__/rescue-semantic-blank.test.ts` twin the migration mirrors); on beta data the stranded-value count is almost certainly 0. No counts were invented.

## must_haves

- ✅ Migrations 071/072/073/074/075 applied in strict filename order; rescue (071) + re-point (072) before drop (073); flags table (074) additive; hardening (075) last.
- ✅ `supabase migration list` LOCAL=REMOTE 001–075.
- ⚠️ 071 rescue/stranded counts — not surfaced by the CLI (see limitation); rescue applied + unit-tested.
- ✅ `user_profiles` dropped only after zero runtime references (19-05) and both DB readers re-pointed (072).
- ✅ Prohibition (no executor `supabase db push`) — honored; human-only push.

## Verification

- Pre-push gate (Task 1) GREEN: all migration files present + ordered; zero runtime `user_profiles`/`UserProfile`/`/api/user-profiles` references outside `supabase/migrations/` + `__tests__/`; `tsc --noEmit` clean; full Jest suite green (89 suites / 1109 tests) throughout Waves 1–2.
- Live push verified LOCAL=REMOTE 001–075.

## Follow-ups (live UAT — needs the running app, not this checkpoint)

End-to-end UAT of the now-live behavior (claim pre-fill confirm round-trip; correction-flag → owner bell/email → void guided-apply) against the live DB is the remaining browser-UAT item — the schema it depends on is now live.
