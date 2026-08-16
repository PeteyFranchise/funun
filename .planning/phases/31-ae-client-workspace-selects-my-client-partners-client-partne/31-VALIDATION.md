---
phase: 31
slug: ae-client-workspace-selects-my-client-partners-client-partne
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-15
---

# Phase 31 (Slice 1) — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated by /gsd-plan-phase from RESEARCH.md ## Validation Architecture + each plan's <verify> block.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.4.2 (`ts-jest`, transpile-only per `isolatedModules: true` — TS type errors do NOT fail Jest; use `npx tsc --noEmit` separately for type contracts) |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `npx jest <path-to-test-file>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | quick < ~15s per file; full suite ~minutes (thousands of tests) |

---

## Sampling Rate

- **After every task commit:** `npx jest <the task's test file>` (+ `npx tsc --noEmit` for type-touching tasks)
- **After every plan wave:** `npm test` + `npx tsc --noEmit` + `npm run build` (this repo's green-bar convention)
- **Before `/gsd-verify-work 31`:** full suite green
- **Max feedback latency:** ~15s (single file)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | R12/D-01/D-03 | T-31-01 | Provider interface returns a NEW path, never the master path | type | `npx tsc --noEmit` (+ grep renderForensicDownload/shareToken) | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | R12/D-01 | T-31-SC | No watermark package installs before the legitimacy gate | checkpoint | (blocking-human — no automated) | — | ⬜ pending |
| 31-02-01 | 02 | 1 | R11/R12/D-02 | T-31-03 | share_token gen_random_bytes UNIQUE; tracks.id FK; REVOKE staff tables | unit (migration text) | `npx jest __tests__/migration-111.test.ts` | ❌ W0 | ⬜ pending |
| 31-02-02 | 02 | 1 | R1/D-08/D-09 | T-31-04 | contacts one-primary; new tables REVOKEd; website not GRANTed | unit (migration text) | `npx jest __tests__/migration-112.test.ts` | ❌ W0 | ⬜ pending |
| 31-02-03 | 02 | 1 | R11/R12 | T-31-03 | Owner push + LOCAL=REMOTE parity (no false-positive off config) | checkpoint | (blocking-human — supabase db push / migration list) | — | ⬜ pending |
| 31-03-01/02 | 03 | 1 | R11 | T-31-06 | Illegal Selects status transitions impossible | unit | `npx jest lib/selects/stage-machine.test.ts` | ❌ W0 | ⬜ pending |
| 31-04-01 | 04 | 2 | R11/R5 | T-31-07 | Cross-AE Selects access → 404 (no leak); PATCH allowlist | unit + route | `npx jest lib/selects/persistence.test.ts` | ❌ W0 | ⬜ pending |
| 31-04-02 | 04 | 2 | R11 | T-31-07 | Idempotent add; soft remove; rights-ready from single authority | type + grep | `npx tsc --noEmit` (grep isRightsReady) | ❌ | ⬜ pending |
| 31-04-03 | 04 | 2 | R11 | T-31-09 | Empty Selects cannot send; legal status move only | unit | `npx jest lib/selects/persistence.test.ts` (send guard) | ❌ W0 | ⬜ pending |
| 31-05-01 | 05 | 2 | R11/D-11 | T-31-10 | AI-draft own-book-scoped; rights-ready-first not hard-filter | type + grep | `npx tsc --noEmit` (grep isRightsReady) | ❌ | ⬜ pending |
| 31-05-02 | 05 | 2 | R11/D-12 | T-31-11 | Team-share read-only to peers; owner-only flip | type | `npx tsc --noEmit` | ❌ | ⬜ pending |
| 31-06-01 | 06 | 2 | R1/D-08/D-09 | T-31-13 | Exactly-one-primary; uncovered org → 404; allowlist | unit | `npx jest lib/client-partners/contacts.test.ts` | ❌ W0 | ⬜ pending |
| 31-06-02 | 06 | 2 | R1 | T-31-14 | Relationship log append-only; author-stamped | type | `npx tsc --noEmit` | ❌ | ⬜ pending |
| 31-07-01 | 07 | 2 | R10 | T-31-18 | Ranking stable under shuffle; guest → new-lead; de-dup | unit | `npx jest lib/crate-requests/ranking.test.ts` | ❌ W0 | ⬜ pending |
| 31-07-02 | 07 | 2 | R10/R5 | T-31-16 | Feed own-book-scoped; guests present | type + grep | `npx tsc --noEmit` (grep rankCrateRequests) | ❌ | ⬜ pending |
| 31-08-01 | 08 | 3 | R2 | T-31-19 | Identity pinned; sort stable on equal keys (R2 backstop) | unit | `npx jest lib/client-partners/columns.test.ts` | ❌ W0 | ⬜ pending |
| 31-08-02 | 08 | 3 | R2 | T-31-20 | Column state persists per-AE; identity unhideable | type + grep | `npx tsc --noEmit` (grep dnd-kit) | ❌ | ⬜ pending |
| 31-08-03 | 08 | 3 | R1/R5 | T-31-19 | Own-book query; Client Partners nav hidden for AE | build | `npm run build` | ❌ | ⬜ pending |
| 31-09-01/02/03 | 09 | 3 | R1/R5 | T-31-21 | Workspace own-book notFound; one-record adjacency | build | `npx tsc --noEmit && npm run build` | ❌ | ⬜ pending |
| 31-10-01/02 | 10 | 3 | R11 | T-31-23/24 | Own-book builder; empty-send disabled client+server | build | `npx tsc --noEmit && npm run build` | ❌ | ⬜ pending |
| 31-11-01/02 | 11 | 3 | R10/R5 | T-31-25/26 | Own-book feed; guest leads visible; Lead Engine retired | build | `npx tsc --noEmit && npm run build` | ❌ | ⬜ pending |
| 31-12-01 | 12 | 4 | R12/D-01 | T-31-28 | Pre-computed render (no inline transcode); private bucket | type + grep | `npx tsc --noEmit` (grep renderStreamPreview) | ❌ | ⬜ pending |
| 31-12-02 | 12 | 4 | R12 | T-31-27 | Accessor resolves previews bucket ONLY — never a master path | unit | `npx jest lib/watermark/signed-url.test.ts` | ❌ W0 | ⬜ pending |
| 31-13-01 | 13 | 4 | R12 | T-31-30 | Token-only resolution; invalid token leaks nothing; legal respond | type + grep | `npx tsc --noEmit` (grep share_token / isLegalSelectsTransition) | ❌ | ⬜ pending |
| 31-13-02 | 13 | 4 | R12/D-13 | T-31-31 | Audio only via getPreviewSignedUrl (no master) | build + grep | `npx tsc --noEmit && npm run build` (grep getPreviewSignedUrl) | ❌ | ⬜ pending |
| 31-13-03 | 13 | 4 | R12/D-02 | T-31-31 | Guest download gated; watermarked-only; length-cap respected | build | `npx tsc --noEmit && npm run build` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/migration-111.test.ts` — mig 111 structural + tracks.id FK + token + REVOKE (31-02)
- [ ] `__tests__/migration-112.test.ts` — mig 112 one-primary + REVOKE + backfill (31-02)
- [ ] `lib/selects/stage-machine.test.ts` — R11 status legality (31-03)
- [ ] `lib/selects/persistence.test.ts` — own-book scope + idempotent add + empty-send guard (31-04)
- [ ] `lib/client-partners/contacts.test.ts` — one-primary + uncovered-org 404 (31-06)
- [ ] `lib/crate-requests/ranking.test.ts` — R10 ranking stability + guest-lead + de-dup (31-07)
- [ ] `lib/client-partners/columns.test.ts` — R2 pinned identity + stable-sort backstop (31-08)
- [ ] `lib/watermark/signed-url.test.ts` — R12 never-master accessor guarantee (31-12)

*Framework install: none — Jest/ts-jest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Watermarked-preview audibility (the soft tag; a 30s+ listen stays meaningful) | R12/D-01 | Audio bytes cannot be asserted in CI | Open a sent Selects link, play a track, confirm the Preview tag is present-but-non-intrusive |
| Player look matches the locked reference | R12/D-13 | Visual fidelity | Compare the running `/selects/[token]` to `phase-31-shareable-music-player.html` (Look 2 default + Glow Up toggle, three-circle bar, dense list, mini-player) |
| Invalid/expired token leaks nothing | R12 | Visual confirmation of absence | Open a bad token; confirm no org/client/AE/track data renders |
| Guest download gate + watermarked-only download | R12/D-02 | End-to-end auth + file inspection | As a guest → gate modal; as a Client Partner → downloads a watermarked file; inspect it is not a clean master |
| Owner migration push parity | R11/R12 | Owner-run, live DB | `supabase db push` + `supabase migration list` LOCAL=REMOTE (31-02 checkpoint) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency (checkpoints exempt)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (single file)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending owner review; populated 2026-08-15 by /gsd-plan-phase.
