---
phase: 16
reviewers: [claude]
reviewed_at: 2026-08-02T00:00:00Z
plans_reviewed: [16-00-PLAN.md, 16-01-PLAN.md, 16-02-PLAN.md, 16-03-PLAN.md, 16-04-PLAN.md, 16-05-PLAN.md, 16-06-PLAN.md, 16-07-PLAN.md, 16-08-PLAN.md, 16-09-PLAN.md, 16-10-PLAN.md, 16-11-PLAN.md]
review_type: freshness-drift-pass
---

# Cross-AI Plan Review — Phase 16

## Claude Review — Freshness / Drift Pass (post Phases 17–21)

**Context:** The Phase 16 plans were drafted 2026-07-18. Phases 17 (Split-Sheet E-Sign), 18 (Split-Sheet Home), 19 (Profile/Identity cleanup), 20 (Profile Table Rename), and 21 (Cross-Account Collaboration) have all shipped since. This review checks whether the plans still hold against the current codebase and migration state (live through migration **079**). It is a staleness audit, not a scope re-litigation — the phase design is sound; these are drift corrections that MUST be applied before execution.

### Strengths (still valid — do not change)

- The overall phase shape is intact: buyer orgs/members, `license_requests`/deals, buyer shortlists, Stripe Connect payouts, DDEX identifiers, catalog visibility, deals room, and the e-sign handoff.
- **E-sign strategy already converged correctly.** D-18c (2026-07-20) supersedes the SignWell decision and commits **DocuSeal for every document type, reusing Phase 17's 17-06 adapter with no new credentials.** Phase 17 shipped that DocuSeal stack (`lib/esign/*`, `esign_envelopes`, provider abstraction). The *decision* is current and ahead of the plan bodies — keep D-18c, fix the bodies to match it.
- No plan creates/drops/alters an RLS policy on `vault_projects`, so there is **no policy clash** with Phase 21's migration-078 rewrite.

### Concerns

**[HIGH] C1 — `artist_profiles` was renamed to `user_profiles` (Phase 20, migration 076); 47 references across 7 plans + CONTEXT/RESEARCH are now stale.**
The most dangerous instance is **16-01**, which rewrites `handle_new_user()` and instructs "copy from migration 039" and add a buyer branch that avoids "the default `artist_profiles` insert." Migration 039's `handle_new_user` was **superseded by migration 076**, which now inserts into `user_profiles`. Copying 039 verbatim would **re-introduce `artist_profiles`** — reversing the rename and re-opening the phantom-row bug class 076 closed.
- Fix 16-01 to rebase the buyer branch on the **current/live `handle_new_user`** (migration 076's `user_profiles` version), NOT migration 039. Read the live function, don't hand-copy the old one.
- Apply `artist_profiles → user_profiles` globally across the plan set (16-00, 16-01, 16-03, 16-08, 16-10, 16-11, CONTEXT, RESEARCH), including sanity-query snippets and acceptance criteria (e.g. 16-01's "SELECT COUNT(*) FROM artist_profiles …" must target `user_profiles`).

**[HIGH] C2 — Migration number collisions. Phase 16 authors migrations 062–066; all are now taken (live through 079).**
The planned files `062_buyer_orgs_members`, `063_license_requests_deals`, `064_buyer_shortlists`, `065_stripe_connect_payouts`, `066_ddex_party_release_identifiers` collide with live migrations 062–066 (split-sheet e-sign, legal-grade, RLS recursion fix, cert path, identity foundation).
- Renumber the phase's five migrations to **080–084** (next free block after 079).
- Update every cross-reference: migration file paths, `__tests__/migration-0NN.test.ts` names, and any plan text that cites the old numbers.

**[MEDIUM] C3 — 16-09's plan body is stale (SignWell), even though its decision (DocuSeal) is current.**
16-09 is banner-marked SUPERSEDED, but its body and ~82 `SignWell` references still describe building a SignWell adapter. An executor following the body would build the wrong thing.
- Rewrite 16-09 to match D-18c: **reuse Phase 17's 17-06 DocuSeal adapter behind `lib/esign/provider.ts`; write no new adapter and no new credentials.** Its first checkpoint stands: verify DocuSeal sequential signing (`order: 'preserved'`), which is unexercised.
- Purge stale SignWell implementation instructions from the body; keep only the (now historical) rationale in CONTEXT's D-18a/D-18b, clearly marked superseded by D-18c.

**[LOW] C4 — Phase 21 (migration 078) changed `vault_projects` SELECT from owner-only to owner-OR-member; verify 16-04's deals-room filter.**
16-04 filters the deals room to "the caller's **own** `vault_projects` (RLS-backed)." Post-078, an RLS-visible `vault_projects` SELECT now also returns projects the caller is a *member* of (viewer/editor/co-owner), not just ones they own.
- Confirm 16-04 filters by **ownership explicitly** (`user_id = auth.uid()` or an owned-project set) where it means "the seller's own catalog," rather than relying on bare RLS visibility — otherwise a seller could see license requests tied to projects they're merely a collaborator on.

### Summary

Incorporate C1–C4 before execution. C1 and C2 are execution-breaking and non-negotiable; C3 prevents an executor from building the abandoned SignWell path; C4 is a one-line correctness check. None require re-scoping the phase.
