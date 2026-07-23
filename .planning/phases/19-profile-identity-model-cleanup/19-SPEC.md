# Phase 19: Profile & Identity Model Cleanup — Specification

**Created:** 2026-07-23
**Ambiguity score:** 0.12 (gate: ≤ 0.20)
**Requirements:** 6 locked

## Goal

Collapse Funūn's three overlapping "you" tables into **one canonical account profile**, delete the duplicate that silently breaks split-sheet rights, and formalize the collaborator-becomes-user reconciliation — while keeping signed documents immutable.

## Background

Grounded in the live schema + the Phase 18 UAT bug.

**Three tables describe a user today:**
- `artist_profiles` (migration 001) — the *real* universal profile. Auto-created on signup for **every** member (artist AND industry) by `handle_new_user()` (migrations 030/039; curator accounts early-return with no row). Already holds name/genre/socials/stats **plus** `pro`/`ipi`/`publisher`/`administrator`, `contact_phone` (migration 040), and `mailing_address` (migration 021). Split sheets, metadata, and registration all read it. Misnamed — it is not artist-only.
- `user_profiles` (migration 026, dropped and **restored** in 053) — a thin duplicate of the rights subset (`pro`/`ipi`/`publisher`/`phone`/`mailing_address`). **Not** auto-created; only written by the Settings "Rights Identity" section (`PATCH /api/user-profiles`). Its **only** consumer is `claim_collaborators()`.
- `industry_profiles` (migration 001) — an older industry-only extension (title, company, verification, genres-seeking) used by Antenna/opportunities. Overlaps the newer `member_type='industry'` flag on `artist_profiles`. **Out of scope this phase.**

**The bug (Phase 18 UAT):** Settings has *two* rights inputs — "Rights & Royalties" (`PATCH /api/profile` → `artist_profiles`, which the split-sheet party-1 row reads) and "Rights Identity" (`PATCH /api/user-profiles` → `user_profiles`, which it does **not**). A user who fills the wrong one saves a PRO that then reads "None" on their split sheet. Worse: because `user_profiles` is rarely populated, `claim_collaborators()` — which reads rights from it — usually fills nothing, so the "your PRO auto-fills onto credits others added you to" feature is quietly half-broken.

**Fragility flag:** both `user_profiles` (053) and `collaborators.claimed_by` (052) have already been dropped-and-restored once. Any deletion/rename must be preceded by a full reference sweep.

**Reconciliation flow (`claim_collaborators`, migrations 026/051):** on signup and on each login (middleware route), it stamps `claimed_by` on unclaimed `collaborators` rows matching the user's email, copies the user's rights from `user_profiles` into blank collaborator fields (COALESCE — never overwrites), and grants the claimed user SELECT visibility ("Claimed users see own credits", 026/052). It is one-way (profile→credit), one-time, and email-dependent.

The primary deliverables that do NOT exist yet: one canonical rights source reaching split sheets; a reverse profile pre-fill on claim; live-linked claimed-collaborator identity; a flag-for-fix path; and a licensee note on exports.

## Requirements

1. **Delete the duplicate `user_profiles` + re-point the claim-fill (the bug fix)**: One rights source of truth reaches split sheets, and the claim-fill actually works.
   - Current: two Settings rights inputs write two tables; only `artist_profiles` reaches split sheets; `claim_collaborators()` reads the rarely-populated `user_profiles` and usually no-ops.
   - Target: the Settings "Rights Identity" section and `/api/user-profiles` rights writes are removed; exactly one rights input remains (writing the canonical profile); `claim_collaborators()` reads rights from the canonical profile; a **data-safety migration** copies any values stranded in `user_profiles` into the canonical profile **only where the canonical column is null** (canonical wins); the `user_profiles` table is dropped **after** that copy.
   - Acceptance: Settings renders exactly one PRO/IPI/publisher input; saving it makes the value appear on the initiator's split-sheet party-1 row; a fresh claim fills a collaborator's blank rights from the canonical profile; the "saved PRO reads None" repro cannot reproduce; a row with rights only in old `user_profiles` retains those values on the canonical profile after migration.

2. **Confirmable profile pre-fill on claim (Q1)**: A newly-joined user's blank profile is seeded from what others already entered about them, as a suggestion they confirm and edit.
   - Current: claiming copies profile→collaborator blanks only; it never seeds the new user's own (blank) profile from claimed records.
   - Target: on claim, for each canonical-profile field that is blank, pre-fill from the claimed collaborator records (most-recent value on conflict) and surface a confirm-and-edit prompt; never silently lock; the user can edit any pre-filled value (e.g. new phone/address/publisher); existing non-blank profile fields are never overwritten; re-running the claim on a later login never clobbers a value the user has confirmed/edited.
   - Acceptance: a new user claimed onto records containing rights data lands on a profile pre-filled from those records and visibly flagged for confirmation; confirming/editing persists; a second login does not re-overwrite confirmed values; a user whose profile was already populated sees no overwrite.

3. **Live-link claimed-collaborator identity on drafts; freeze on lock (Q3-adjacent, Q2)**: A claimed collaborator's identity behaves like the sheet owner's — live while editable, frozen once locked.
   - Current: `resolvePartyIdentity` live-links only the sheet **owner** (live pre-mint, frozen at `esign_pending`); a claimed collaborator's identity on a sheet is a static copy.
   - Target: a claimed collaborator's identity resolves live from their canonical profile while the sheet is a **draft**, and freezes when the sheet locks (`pending_approval`/`countered` out-for-approval, `esign_pending`, `executed`) — the same freeze boundary the owner already uses.
   - Acceptance: editing a claimed collaborator's canonical profile updates their identity on a DRAFT sheet they appear on; the identical edit does NOT change a sheet that is out-for-approval, `esign_pending`, or `executed`; an executed sheet's signed PDF/Certificate is byte-unchanged.

4. **Flag-for-fix on locked sheets; no cross-user edits (Q3)**: A claimed user can propose a correction to their own identity on a locked sheet, but never edits another user's sheet or the deal terms.
   - Current: claimed users can SEE their credits (SELECT-only RLS) but have no in-app path to correct wrong identity info on a locked sheet; only the owner can edit.
   - Target: a claimed user can submit a flag ("this is wrong" + suggested value) against the identity fields of a locked sheet they appear on; the owner is notified and decides whether to apply it (and owns the consensus-reset / amendment consequence). No non-owner may write another user's `split_sheet_parties` row directly. Deal terms (`split_percentage`, `role`) are never editable by a collaborator — that stays the approve/counter flow.
   - Acceptance: a claimed user can submit a flag on a locked sheet; the owner receives it; applying it is exclusively the owner's action; no code path lets a non-owner mutate another user's `split_sheet_parties` row or terms.

5. **"Note to licensees" on split-sheet exports (Tier 1)**: Recipients are told the contact/payment data may be stale.
   - Current: exported/shared split sheets carry party rights/contact info with no guidance about staleness.
   - Target: the generated split-sheet PDF/export includes a standard note advising recipients (e.g. music supervisors) that ownership shares are fixed as of the signing date but each writer's current PRO/publisher/administrator/payee must be re-verified at license time — framed as informational guidance, **not** a Funūn warranty.
   - Acceptance: the generated split-sheet PDF contains the note; its wording frames re-verification as the recipient's responsibility and makes no accuracy guarantee.

6. **Rename `artist_profiles` → `user_profiles` (canonical name, staged last)**: The one true profile carries an honest name so this confusion cannot recur.
   - Current: `artist_profiles` is the universal profile but misnamed; the name `user_profiles` is occupied by the duplicate (removed in R1).
   - Target: after R1 frees the name, `artist_profiles` is renamed to `user_profiles` across the DB (table, RLS policies, FKs, triggers incl. `handle_new_user`, the curator/industry branches, `claim_collaborators`) and all application code (`from('artist_profiles')`, server components, generated types, public-profile pages). Highest blast radius — sequenced last; may be split into its own sub-phase at plan time if risk warrants.
   - Acceptance: no code or SQL references `artist_profiles` after the change; `tsc --noEmit`, lint, and production build pass; `handle_new_user()` inserts a `user_profiles` row for a new artist AND a new industry account; a curator signup still creates no profile row; split sheet / metadata / registration read unchanged data.

## Boundaries

**In scope:**
- Delete the duplicate `user_profiles`; single canonical rights input in Settings; re-point `claim_collaborators()` to the canonical profile (R1)
- Data-safety migration rescuing stranded `user_profiles` rights into the canonical profile before drop (R1)
- Confirmable reverse pre-fill of a new user's profile on claim (R2)
- Live-linked claimed-collaborator identity on drafts with freeze-on-lock (R3)
- Flag-for-fix path for a claimed user's own identity on locked sheets (R4)
- "Note to licensees" on split-sheet exports (R5)
- Rename `artist_profiles` → `user_profiles`, staged last (R6)

**Out of scope:**
- `industry_profiles` vs `member_type='industry'` reconciliation — separate follow-up; touches Antenna/marketplace + signup trigger, higher risk, unrelated to the rights bug
- Tier-2 live "current payee snapshot" companion surfaced at sync/license time — larger feature; after core cleanup
- `curators` table — unaffected by this phase
- Changing ownership/`split_percentage`/`role` semantics or the approval/counter/e-sign flow — untouched; this phase is identity plumbing, not deal logic
- Songtrust / PRO / MLC / SoundExchange API integrations — deferred items, not this phase
- Fixing the email-mismatch limitation of claiming (a user signing up with a different email than their collaborator used) — documented limitation, not addressed here

## Constraints

- **Human-gated migrations.** Every schema change is a migration Pete pushes via Codex; executors must NEVER run `supabase db push`. LOCAL=REMOTE is verified via `supabase migration list`. Next migration number is **071+** (070 is latest).
- **Signed documents are immutable.** No requirement may mutate an `executed` split sheet or its signed PDF/Certificate. Live-link (R3) must be off for locked statuses.
- **No data loss.** The `user_profiles` drop (R1) must be preceded, in the correct order, by the data-safety copy migration; the copy uses "canonical wins" (fill only where the canonical column is null).
- **Sweep before delete/rename.** `user_profiles` and `collaborators.claimed_by` were each dropped-and-restored once (052/053); a full reference sweep across `supabase/migrations`, `app`, `lib`, `components` precedes any deletion or rename.
- **Rename ordering (R6).** The duplicate `user_profiles` must be dropped (R1) before `artist_profiles` is renamed to `user_profiles` — the target name cannot be occupied. RLS policies, FKs, triggers (`handle_new_user`, curator + industry branches), and the public-profile read path must survive the rename.
- **Staging order:** R1 (bug fix) → R2/R3/R4/R5 (reconciliation + note) → R6 (rename). R1 ships standalone value.

## Acceptance Criteria

- [ ] Settings renders exactly one PRO/IPI/publisher/phone/mailing-address input (the duplicate "Rights Identity" section is gone)
- [ ] Saving rights in Settings makes the value appear on the initiator's split-sheet party-1 row (the "saved PRO reads None" repro fails to reproduce)
- [ ] A data-safety migration copies stranded `user_profiles` rights → canonical profile (only where canonical is null) BEFORE the table is dropped; no user loses previously-entered rights
- [ ] `claim_collaborators()` reads rights from the canonical profile and fills a claimed collaborator's blank fields
- [ ] On claim, a new user's blank profile fields are pre-filled from claimed records and flagged for confirmation; confirmed/edited values survive a later login (no re-overwrite)
- [ ] Existing non-blank profile fields are never overwritten by claim pre-fill
- [ ] Editing a claimed collaborator's profile updates their identity on a DRAFT sheet but NOT on an out-for-approval / `esign_pending` / `executed` sheet
- [ ] No non-owner code path can write another user's `split_sheet_parties` row or edit `split_percentage`/`role`
- [ ] A claimed user can submit an identity-correction flag on a locked sheet; the owner receives it and is the only one who can apply it
- [ ] The generated split-sheet PDF contains the "note to licensees" framed as guidance, not a warranty
- [ ] After R6, no code or SQL references `artist_profiles`; `tsc --noEmit`, lint, and build pass; `handle_new_user()` creates a `user_profiles` row for new artist + industry accounts; curator signup creates none

## Edge Coverage

**Coverage:** 8/8 applicable edges resolved · 0 unresolved

> Derived from the design discussion's Failure-Analyst pass (this is a schema/identity-refactor spec, not an algorithmic one — edges are data-state and lifecycle boundaries, resolved inline rather than via the algorithmic edge-probe engine).

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| Data-loss / stranded state | R1 | ✅ covered | Data-safety copy migration (canonical-wins) runs before the drop; AC line 3 |
| Ordering / name collision | R6 | ✅ covered | Drop duplicate (R1) before rename; "Rename ordering" constraint + AC line 11 |
| Source conflict | R2 | ✅ covered | Two claimed records disagree → take most-recent, flag for confirm; R2 target |
| Idempotency / re-run | R2 | ✅ covered | Claim runs on every login → never clobber confirmed/edited values; R2 acceptance |
| No-overwrite | R2 | ✅ covered | Non-blank profile fields never overwritten by pre-fill; R2 acceptance |
| Legal immutability | R3 | ✅ covered | Live-link off for locked statuses; executed PDF byte-unchanged; R3 acceptance |
| Account-type branch | R6 | ✅ covered | Rename must preserve curator early-return + industry `member_type` insert in `handle_new_user`; R6 acceptance |
| Cross-user authority | R4 | ✅ covered | No non-owner write path to another user's party row/terms; R4 acceptance |
| Email mismatch | R2 | ⛔ dismissed | Claiming is email-keyed; a different signup email means no claim — documented limitation, explicitly out of scope this phase |

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT mutate an `executed` split sheet or its signed PDF/Certificate when a claimed user updates their profile | R3 | resolved | verification: test — live-link gated off for `executed`; assert PDF/Certificate byte-stable |
| MUST NOT drop `user_profiles` before the data-safety copy migration has run | R1 | resolved | verification: test — migration ordering asserted; post-migration rights present on canonical |
| MUST NOT let a non-owner write another user's `split_sheet_parties` row or edit `split_percentage`/`role` | R4 | resolved | verification: test — RLS + route authorization negative test |
| MUST NOT present claim-pre-filled data as authoritative without the confirm step (locking a stranger's typo as the user's identity) | R2 | resolved | verification: judgment — confirm-and-edit prompt required before values are treated as owned |
| Cross-user rights-data exposure beyond the intended claim-fill | R2/R4 | — | canon — owned by RLS + /gsd-secure-phase; not minted here |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                              |
|--------------------|-------|------|--------|----------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Precise, staged goal; canonical table decided       |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | Explicit out-of-scope (industry, Tier-2, terms)     |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Human-gated migrations, immutability, no-data-loss  |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 11 pass/fail criteria                               |
| **Ambiguity**      | 0.12  | ≤0.20| ✓      |                                                    |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

Requirements were clarified across an extended design conversation (2026-07-23) rather than a fresh interview; mapped to perspectives below.

| Round | Perspective     | Question summary                                  | Decision locked                                                        |
|-------|-----------------|---------------------------------------------------|------------------------------------------------------------------------|
| 1     | Researcher      | What "profile" tables exist and which reach splits? | 6 tables; `artist_profiles` is the universal one splits read; `user_profiles` is a duplicate feeding only the claim-fill |
| 2     | Researcher      | Where do phone/address/PRO actually live?          | `artist_profiles` already has all of them (021/040) — canonical is complete |
| 2     | Simplifier      | Irreducible core?                                  | Delete the duplicate + re-point the claim-fill (R1) — fixes the bug and the half-broken claim in one move |
| 3     | Boundary Keeper | What's explicitly NOT this phase?                  | `industry_profiles`/`member_type` reconcile deferred; Tier-2 sync snapshot deferred; terms/approval untouched; curators untouched |
| 4     | Failure Analyst | What breaks if we get it wrong?                    | Stranded data on drop; name collision; signed-doc mutation; source conflict; cross-user edits — all resolved in Edge Coverage |
| 5     | Seed Closer     | Reconciliation intent?                             | Q1=C confirmable pre-fill; Q2=C live-link + freeze; Q3=B flag-for-fix — locked |
| 6     | Seed Closer     | Sync/licensing tension?                            | Signed split = frozen ownership; current payee = live profile lookup; Tier-1 "note to licensees" on exports |

---

*Phase: 19-profile-identity-model-cleanup*
*Spec created: 2026-07-23*
*Next step: /gsd-discuss-phase 19 — implementation decisions (migration sequencing, resolver extension, flag surface, rename mechanics)*
