---
phase: 18-split-sheet-home
phase_name: "Split-Sheet Home"
project: "Funūn"
generated: "2026-07-23"
counts:
  decisions: 4
  lessons: 3
  patterns: 3
  surprises: 4
sources_read:
  - 18-CONTEXT.md
  - 18-DISCUSSION-LOG.md
  - 18-RESEARCH.md
  - 18-VALIDATION.md
  - 18-01-PLAN.md through 18-05-PLAN.md
  - 18-01-SUMMARY.md through 18-05-SUMMARY.md
  - 18-VERIFICATION.md
  - 18-REVIEW.md
  - 18-SECURITY.md
  - 18-UAT-CHECKLIST.md
  - .planning/STATE.md (phase-18 sections)
code_spot_checks:
  - lib/split-sheets/live-identity.ts
  - lib/vault/coverage.ts
  - lib/contracts/locker-attention.ts
  - "app/(artist)/split-sheets/[id]/page.tsx"
  - "app/api/split-sheets/[id]/mint-envelope/route.ts"
  - "git log: supabase/migrations/064_fix_split_sheet_rls_recursion.sql, 065_esign_certificate_path.sql, mint-envelope/route.ts"
missing_artifacts: []
---

# Phase 18 Learnings: Split-Sheet Home

Five plans (living-draft surface, Contract Locker workspace, song-level attachment, coverage-based readiness, identity foundation) plus a same-week identity/collaborator redesign that forced a mid-stream replan of two of them. Verified against the actual shipped code, not just the reports describing it.

## Decisions

### Separate `PartyPicker` instead of rewriting `CollaboratorPicker` in place
`components/split-sheets/PartyPicker.tsx` was built as a wholly new, standalone component rather than modifying `CollaboratorPicker.tsx` to support the new fast email/phone-only add flow. Research found `CollaboratorPicker` had a third caller nobody had scoped for — `components/vault/MetadataStudio.tsx`'s `ComposerEditor` (Wave 1/2 metadata credit entry) — a different feature with the opposite UX intent (full identity capture up front) and zero automated test coverage referencing either component. A mode-prop was the other option on the table; the sibling component won because it makes the non-regression claim provable (`git diff --stat` on both files across every Phase 18 commit is empty) instead of merely argued.

**Rationale:** When a shared component has an untested caller outside the current phase's radar, duplicating rather than rewriting turns "we think it still works" into "the diff proves it wasn't touched."
**Source:** 18-RESEARCH.md Architecture Patterns §1; 18-01-SUMMARY.md key-decisions; 18-VERIFICATION.md (independently re-ran the empty-diff check); confirmed again in this pass via `git log --oneline` on both paths.

---

### Read-time live-identity resolver, not a push/trigger model
`resolvePartyIdentity()` (`lib/split-sheets/live-identity.ts`) is a pure, no-I/O function invoked at read time by whatever page needs to display a party's identity — not a database trigger and not a write-time backfill fired from a Settings save. The alternative (mirroring `backfill_claimed_collaborators()`'s push model) would have required wiring a brand-new call into `app/api/profile/route.ts` (which fires no backfill today) with overwrite semantics foreign to every other backfill in the codebase, plus a query to find every non-frozen sheet touched by that user.

**Rationale:** A read-time resolver needs no new route wiring, and the freeze boundary (`lib/split-sheets/lifecycle.ts`) already blocks writes past `esign_pending` — it becomes the snapshot moment for free instead of needing one built.
**Source:** 18-RESEARCH.md Architecture Patterns §2; `lib/split-sheets/live-identity.ts` header comment, verified by direct read.

---

### Proportional readiness points, strict all-covered status (P18-16)
`coverageTier()`'s `earnedPoints` are a proportional average across a project's needing tracks; `status` reaches `'complete'` only when every track is covered. The original design doc asserted both "proportional partial credit" and "minimum across tracks" for points — a direct contradiction the planner caught before writing code: MIN-for-points alone would score a 5-track EP with 4-of-5 sheets executed at 0/15, indistinguishable from a project with nothing done.

**Rationale:** Splitting the two concerns — proportional points for a truthful progress signal, strict minimum for the ship gate (`canSubmit` keys off status, not points) — resolves the contradiction without weakening the gate.
**Source:** 18-CONTEXT.md "P18-16"; 18-04-SUMMARY.md key-decisions; `lib/vault/readiness-coverage.ts`, verified by direct read.

---

### "Correctness over parallelism" — an explicit sequential dependency where waves allowed concurrency
18-02 (Contract Locker) declares `depends_on: ["18-01", "18-03"]` even though its wave assignment (wave 3) would have let it start once either landed. The plan's own frontmatter states the reasoning verbatim.

**Rationale:** 18-02 links to `/split-sheets/[id]` (18-01) and `/split-sheets/[id]/attach` (18-03); building against either before it existed risked linking to a route that wasn't there yet. Stated directly in-plan: "Correctness over parallelism — both run before this plan."
**Source:** 18-02-PLAN.md frontmatter, verified by direct read.

## Lessons

### Verify the free migration number at execute time — a number written at plan time is a snapshot, not a reservation
18-CONTEXT.md and the original 18-03/18-04 plans (drafted 2026-07-20) assumed migrations 064 and 065 were free. By execution time (2026-07-22) both had been consumed by unrelated work shipped in between — `064_fix_split_sheet_rls_recursion.sql` and `065_esign_certificate_path.sql` (confirmed via `git log`, both predate any Phase 18 commit). Both plans needed a dedicated renumbering commit before their real Task 1 (`b132887`: 064→067 for 18-03; `bff9380`: 065→068 for 18-04) — pure scheduling housekeeping, not a design change, but it happened independently to *both* plans in the same phase.

**Context:** This is a different convention from the well-established "human-gated DB push, LOCAL=REMOTE parity as evidence" pattern this project already has precedent for (cited across summaries: 09-01b, 10-02, 15-01, 17-01, 17-09) — that convention is about *verifying* a push; this lesson is about *numbering* a migration before one exists. No earlier phase's artifacts record this specific renumbering problem, so treat it as newly documented here, not as a repeat of an old known issue.
**Source:** 18-03-SUMMARY.md and 18-04-SUMMARY.md key-decisions; independently confirmed via `git log --oneline -- supabase/migrations/064_fix_split_sheet_rls_recursion.sql supabase/migrations/065_esign_certificate_path.sql`.

---

### A design doc's own claimed data chain can be stale — verify it against the live schema, not the prose describing it
The identity-redesign deliberation and 18-CONTEXT.md's canonical_refs described the live-link mechanism as extending migration 026's chain into `user_profiles`. Direct reads during research showed `user_profiles` (migrations 026/053) holds only `pro`/`ipi`/`publisher`/`phone`/`mailing_address` — no `legal_name`, no `administrator`. The fields that actually needed to live-link live on `artist_profiles` (migrations 021/040/063), fed by an entirely different route (`PATCH /api/profile`) that calls no backfill at all. Building the resolver against `user_profiles` as originally described would have shipped a live-link that silently never updated legal name or administrator — precisely the two fields the initiator's party-1 row most needs.

**Context:** Caught in RESEARCH (18-RESEARCH.md §2, Common Pitfalls #1) by reading both tables' migrations directly, before any code existed. Confirmed shipped correctly: `app/(artist)/split-sheets/[id]/page.tsx` reads `artist_profiles` at both call sites (verified by direct read), not `user_profiles`.
**Source:** 18-RESEARCH.md Architecture Patterns §2 and Common Pitfalls #1; 18-05-SUMMARY.md; code read of `app/(artist)/split-sheets/[id]/page.tsx`.

---

### A reviewer declining to force a fix is a feature, not a gap (WR-03)
Code review found `summarizePartyChanges()`'s P18-09 "what changed" diff is computed correctly but never reaches the parties it's meant to inform — it renders only in the initiator's own browser session, never persisted or emailed to the people who actually need to re-approve. The review did not propose "have the client POST the change summary alongside send-for-approval" as a quick patch.

**Context:** That fix would reopen exactly the vector P18-13 exists to close — a client-supplied payload flowing to another party across what may be a blocked relationship. The correct fix is server-computed and persisted, which is more work than a review pass covers, so it was recorded as a deferred, well-understood gap (WR-03) instead of patched unsafely. Notably, the phase's post-review follow-up *did* ship fixes for the other three review findings (WR-01, WR-02, WR-04 — confirmed via `git log` showing `fix(18-review)` commits for WR-02/WR-04, and via a direct read of `lib/contracts/locker-attention.ts`, which now carries an in-source comment citing "WR-01" and a working `attachments`-aware coverage check). WR-03 alone stayed open, by design, because its correct fix is structurally bigger than the others.
**Source:** 18-REVIEW.md WR-03; 18-UAT-CHECKLIST.md section A (records the deferral as a known limitation to flag, not a bug to find); direct read of `lib/contracts/locker-attention.ts`; `git log --oneline` (`e4786a7` WR-04, `b7535ff` WR-02).

## Patterns

### Derive from existing columns before reaching for a migration
The Locker's 3-state party label ("invited, hasn't opened yet" / "opened, hasn't signed" / "signed") needed zero schema — `derivePartyProgressState()` is a pure function over two columns that already existed (`approval_status` from migration 018, `first_viewed_at` from migration 062, already consumed elsewhere by `isNudgeEligible()`).

**When to use:** Before adding a column, check whether the fact is already computable from what's shipped. Contrast case in this same phase: `collaborators.status` (pending/invited vs. confirmed — has this person ever engaged with Funūn at all) had no existing proxy and genuinely needed new schema (migration 066); `claimed_by IS NOT NULL` was considered and rejected as a stand-in because it only reflects account signup, not response to a specific invite. Two questions can sound alike ("has this person responded?") while being genuinely different facts about the same person — `lib/contracts/locker-attention.ts`'s own header comment warns future editors not to conflate the two.
**Source:** 18-RESEARCH.md Architecture Patterns §4; `lib/contracts/locker-attention.ts`, verified by direct read; 18-05-SUMMARY.md (the genuine-schema case).

---

### Dual-implementation-with-shared-fixture, now a repeating convention
Coverage-based readiness is computed twice — once in TypeScript (`coverageTier()`) and once in SQL (`calculate_vault_readiness()`, migration 068) — with `lib/vault/coverage-fixtures.ts` as the actual anchor, not either implementation. Both the TS test and the SQL structural-proxy test assert against the same named scenarios (the 5-track/1-signed regression guard, full coverage, mixed-tier, zero coverage, legacy-wins-outright, zero-track degrade).

**When to use:** Any time business logic must exist in both application code and a database function, where drift between the two would be silent. This is the second consecutive phase to use this exact shape (17-02 established it for the original readiness scoring; 18-04 reused it verbatim) — worth treating as a named, standing convention for this codebase rather than re-deriving the approach each time.
**Source:** 18-CONTEXT.md "P18-14"; 18-04-SUMMARY.md key-decisions and tech-stack.patterns; 18-REVIEW.md Summary (independently re-verified by hand-checking every fixture row against both derivations).

---

### When most of a phase's plans carry a human DB-push checkpoint, plan for sequential execution, not worktree parallelism
3 of 5 plans (18-03, 18-04, 18-05 — each marked `autonomous: false`) had their own Task-4 "stop, human runs `supabase db push`" checkpoint. All five plans completed in one linear sequence (18-05 → 18-03 → 18-04 → 18-01 → 18-02, by SUMMARY completion timestamp) despite wave assignments that nominally allowed two plans to run concurrently (18-01/18-03 share wave 2; 18-04/18-02 share wave 3).

**When to use:** Worktree-parallel execution pays off when plans run start-to-finish unattended. When more than half a phase's plans are going to stop mid-execution for a human gate regardless, the coordination overhead of juggling multiple simultaneous "waiting on you" states outweighs the time parallelism would save — sequential, checkpoint-then-resume execution is simpler to manage, and it's the same reasoning 18-02's frontmatter states explicitly for its own dependency edges ("Correctness over parallelism," see Decisions above).
**Source:** 18-0{1..5}-PLAN.md frontmatter (`autonomous`, `wave`, `depends_on`, verified by direct read); 18-0{1..5}-SUMMARY.md duration/completed metadata; `.planning/STATE.md` phase-18 timing table.

## Surprises

### §9's auto-included party-1 row retired a constraint 18-01 had already committed to in writing
18-01-PLAN.md's original Task 3 (drafted 2026-07-20) stated "Create mode behavior is byte-for-byte unchanged when the prop is absent." The 2026-07-21 identity redesign's §9 (initiator auto-included as party 1, no manual "+ Add party → Use my info" step) turned out not to be conditional on edit-vs-create at all: `SplitSheetBuilder`'s initial-state seeding is shared code, so making the living-draft edit surface auto-include party 1 necessarily changed what a brand-new sheet's very first render looks like too.

**Impact:** Caught by research before planning finalized around the stale constraint (18-RESEARCH.md flags the exact plan line as "now incorrect and needs revision"), not discovered mid-execution or in review. The eventual fix was clean — a `kind: 'self' | 'fastAdd' | 'full'` discriminant on `PartyRow` — but it's a reminder that a plan's own "unchanged behavior" guarantee can be invalidated by a decision made after the plan was drafted, even one whose stated scope (an identity redesign) doesn't obviously sound like it touches create-mode's first render.
**Source:** 18-RESEARCH.md Architecture Patterns §3 and "State of the Art" table; 18-CONTEXT.md "What changed since the original design session"; 18-01-SUMMARY.md (confirms the shared-logic implementation shipped as revised).

---

### Phase 18's own new feature made a pre-existing Phase 17 gap newly reachable
`mint-envelope/route.ts` (Phase 17; `git log` shows exactly one commit, `d68fc84`, zero Phase 18 touches) has always filtered signable parties on email only — `parties.filter(p => normalizeRecipient(p.email))`, verified directly at lines 147-150 — with no check that `legal_name` is non-empty. Before Phase 18 this was latent: every party had a legal name by construction, because the only way to add one was the full `CollaboratorForm`. Phase 18's fast-add flow (`PartyPicker`, email/phone only, no name) makes a blank-legal-name party reachable for the first time, and nothing in the mint route blocks that party from being minted onto a legal PDF.

**Impact:** Both VERIFICATION.md and SECURITY.md independently found this, correctly attributed it to Phase 17 (the vulnerable file is untouched), and both stopped short of fixing it — out of this phase's file boundaries. Per `17-RESUME-HERE.md`, minting real split sheets is already gated pending this fix plus a counsel-review confirmation, so nothing ships unsafely in the meantime. The general lesson: a capability added in one phase can make a different phase's dormant gap live; the fix belongs to whichever phase owns the vulnerable file, not whichever phase exposed it — and that ownership boundary is worth stating explicitly (as both reports did) rather than either silently fixing out-of-scope code or silently ignoring the new exposure.
**Source:** 18-VERIFICATION.md "Cross-Phase Finding"; 18-SECURITY.md T-18-01c; direct read of `app/api/split-sheets/[id]/mint-envelope/route.ts:147-150`; `git log --oneline` confirming the file's sole commit is `d68fc84`.

---

### Rigorously verifying the hard math cleared six functions and still missed four real bugs
The code review's stated method was to trace math and control flow through six "priority target" functions (`redistribute`, coverage scoring, `resolvePartyIdentity`, `summarizePartyChanges`, `derivePartyProgressState`, attach fuzzy-matching) rather than read-and-assume. All six came back clean. The four real findings (WR-01 through WR-04) all live one layer up, in how correctly-computed data reaches the UI: the Locker's "no sheet" check never consulted the `split_sheet_attachments` join table (WR-01) even though the coverage math that *does* consult it was independently verified correct one section earlier; the readiness page renders a contradiction because it never checks which branch produced a status before deciding whether to show a widget (WR-02).

**Impact:** A function being provably correct in isolation says nothing about whether every caller wires it in correctly. Future reviews on this codebase should budget explicit time for tracing data from source query to rendered UI as a distinct pass from verifying pure-function math — the two catch different bug classes, and this phase's review is direct evidence that acing one doesn't imply the other.
**Source:** 18-REVIEW.md Summary, WR-01, WR-02.

---

*Extracted from Phase 18 (split-sheet-home) artifacts on 2026-07-23. Every source-file claim above was checked against the actual cited code during extraction, not taken on the strength of the reports' prose alone.*
