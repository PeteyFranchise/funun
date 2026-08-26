---
created: 2026-08-22T00:00:00Z
title: Security audit remediation (2026-08-22) — findings #3–#17 open
area: security
---

## Source

Full codebase security + architecture audit, 2026-08-22 (17 findings: 4 Critical,
10 Medium, 3 Low; full text pasted by Pete in the 2026-08-22 session). Verified
baseline: lint / tsc / build / test all pass (2476 tests after #1); `npm audit` =
1 critical + 7 high (5 high are prod deps); strict `--noUnusedLocals` = 23 findings.

## Dispositioned (do NOT redo)

- **#1 Stored XSS — Selects player toast** — ✅ FIXED this session. `lib/security/escapeHtml`
  + all 8 user-controlled toast interpolations escaped + unit tests (audit payloads).
  Deployed.
- **#2 TMS can grant/remove Leadership** — ✅ ACCEPTED by owner: intentional. TMS is a
  privileged identity-admin role (owns onboarding/role-config/offboarding). **No code
  change to the authority.** Future safeguards ONLY IF APPROVED: document TMS in an
  access-control matrix; MFA + recent-reauth for TMS; notify Leadership on Leadership
  grant/removal; dual-confirm Leadership removal; add tests that ae/bd/anr/it/legal/
  accounting/marketing CANNOT manage the team. (Last-Leadership + self-removal guards +
  `logStaffAction` audit already exist — keep them.)

## Status: 14 of 17 resolved — batch DEPLOYED 2026-08-22 (main @ 288f430)

Criticals #1/#3/#4/#9/#10 shipped earlier. Codex Mediums #6/#7/#11/#12/#14 (migrations
123–127) + Lows #15/#16/#17 + the #12 build fix shipped 2026-08-22 (origin/main
630439c→288f430; migrations 123–127 applied to prod FIRST, then the FF). #2 accepted.
Still open: #5, #8, #13.

## Shipped

3. **[Critical] Duplicate identifier race** — ✅ migration 122 (partial unique indexes;
   route 409 on 23505; prod dupe-free). FOLLOW-UP: row-locked reservation RPC to remove the
   retry/gap (unique index is the hard guarantee meanwhile).
4. **[Critical] Stale branches** — ✅ local `main` FF'd. PENDING owner confirm: delete 3
   local-only stale branches (`backup/local-main-pre-reset-20260713-0739`,
   `codex/harden-document-token-workflows`, `gsd-reviewfix/10-80913`) — unique local commits,
   no remote backup, so deletion is permanent; low risk to leave (only `origin/main` deploys).
6. **[Med] Job worker lease** — ✅ migration 123 (lease_expires_at + claim_token fencing +
   expired-claim recovery; Codex, reviewed). OWNER: schedule `/api/cron/process-jobs` in
   vercel.json (needs a Vercel plan) before calling the queue durable.
7. **[Med] DocuSeal completion non-atomic** — ✅ migration 124 (conditional-UPDATE claim +
   unique submission-id/fan-out indexes; idempotent 200; Codex, reviewed; prod dupe-free).
9. **[Med] Earnings import parses before auth** — ✅ auth 401 + rate-limit 429 before parse;
   size cap 10MB.
10. **[Med] Selects respond race** — ✅ compare-and-swap + 409 on no-op.
11. **[Med] Rate-limit unbounded growth** — ✅ migration 125 (retention) + `/api/cron/
    cleanup-rate-limits` route (Codex, reviewed). OWNER: add the cron to vercel.json
    (`0 4 * * *`, needs CRON_SECRET).
12. **[Med] Selects reaction cap race** — ✅ migration 126 (per-track advisory lock; Codex,
    reviewed) + build fix 288f430 (moved isSelectsReactionCapError to
    lib/selects/reaction-cap — a route file may not export it; only `next build` caught it).
14. **[Med] Checklist reorder not atomic** — ✅ migration 127 (set-based RPC + position
    validation; Codex, reviewed; "atomic" comment fixed).
15. **[Low] Unused symbols** — ✅ safe subset removed; 6 ambiguous left (unfinished UI wiring:
    MetadataStudio genre/subGenre/collaborators, artistName, partyName, MAX_DOC_SIZE).
16. **[Low] ArtistInvitesAdmin dead prop** — ✅ removed `initialInvites` + its fetch.
17. **[Low] typecheck script** — ✅ added `npm run typecheck` (+ `typecheck:strict`).

## Still open

5. **[Med] Dependency advisories** — next / postcss / sharp / nanoid / brace-expansion
   (prod high) + node-tar via Supabase CLI (dev critical). Upgrade + re-test; run both
   `npm audit` and `--omit=dev` in CI.
8. **[Med] AI routes lack quotas/cost controls** — durable per-user/org quotas + ceilings
   + rate limits; authenticate before parsing large multipart (`contracts/verify` buffers 20MB).
13. **[Med] Email failure creates undelivered records** — `pitch_history` inserted before
    send; separate delivery status from record; outbox. Blocked on the invalid RESEND_API_KEY
    (see 2026-08-23-invite-email-resend-config.md).

## Owner decisions (post-deploy)

- Schedule `/api/cron/cleanup-rate-limits` daily in vercel.json (`0 4 * * *` + CRON_SECRET). [#11]
- Schedule `/api/cron/process-jobs` — needs a Vercel plan that supports crons. [#6]
- Decide which hot endpoints the rate-limiter should fail CLOSED on (currently fail-open).
- Delete the 3 stale local-only branches (permanent). [#4]

## Protocol (audit + owner guardrails)

Reproduce/confirm each on the current branch BEFORE changing. Atomic commits; don't
combine unrelated fixes; add regression tests for security fixes; run tsc/lint/tests/build.
**NEVER edit `.claude/launch.json`.** Migrations are owner-gated (`supabase db push`).
Report files/lines, threat scenario, fix, tests, verification, deploy/migration needs.
