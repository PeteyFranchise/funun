# Phase 19: Profile & Identity Model Cleanup — Specification

**Created:** 2026-07-23
**Revised:** 2026-07-23 (corrected against Codex verification; R6 rename split to Phase 20 — see Interview Log)
**Ambiguity score:** 0.13 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

Collapse Funūn's overlapping "you" tables into **one canonical account profile**, delete the duplicate that silently breaks split-sheet rights, and formalize the collaborator-becomes-user reconciliation — while preserving the existing live-identity behavior and keeping signed documents immutable. *(The relation's honest rename `artist_profiles`→`user_profiles` is Phase 20.)*

## Background

Grounded in the live schema + the Phase 18 UAT bug, corrected against a Codex reference sweep.

**Three tables describe a user today:**
- `artist_profiles` (migration 001) — the *real* universal profile. Auto-created on signup for **every non-curator** member by `handle_new_user()`: ordinary artists get a row + subscription + `claim_collaborators()`; industry accounts get a row + subscription but **do not** run claiming; curator accounts early-return with no row (migrations 001/027/030/039). Already holds name/genre/socials/stats **plus** `pro`/`ipi`/`publisher` (migration 020), `contact_phone`/`mailing_address` (migration 021), and `administrator` (migration 063). Split sheets, metadata, and registration all read it. Misnamed — it is not artist-only. *(Migration 040 is column-privilege hardening, not the column adder.)*
- `user_profiles` (migration 026, defensively re-created in 053 after live-schema drift) — a thin duplicate of the rights subset (`pro`/`ipi`/`publisher`/`phone`/`mailing_address`) **plus `display_name` and `bio`**. **Not** auto-created; written only by the Settings "Rights Identity" section (`PATCH /api/user-profiles`).
- `industry_profiles` (migration 001) — an older industry-only extension (title, company, verification, genres-seeking) used by Antenna/opportunities. Overlaps the newer `member_type='industry'` flag on `artist_profiles`. **Out of scope this phase.**

**Consumers of `user_profiles` (all of them):** `app/(artist)/settings/page.tsx`, `app/api/user-profiles/route.ts`, `components/profile/ProfileForm.tsx` (runtime) and **two** DB functions — `claim_collaborators()` (026/051) **and** `backfill_claimed_collaborators()` (026) — plus its own RLS/trigger definitions (026/027/053). Both DB functions read `pro/ipi/publisher/phone/mailing_address` from `user_profiles`.

**The bug (Phase 18 UAT):** Settings has *two* rights inputs — "Rights & Royalties" (`PATCH /api/profile` → `artist_profiles`, which the split-sheet party-1 row reads) and "Rights Identity" (`PATCH /api/user-profiles` → `user_profiles`, which it does **not**). A user who fills the wrong one saves a PRO that then reads "None" on their split sheet. Worse: because `user_profiles` is rarely populated, the claim/backfill functions that read it usually fill nothing, so the "your PRO auto-fills onto credits others added you to" feature is quietly half-broken.

**Live-identity already exists (corrects a prior draft of this spec):** `resolvePartyIdentity` ([lib/split-sheets/live-identity.ts](lib/split-sheets/live-identity.ts)) already live-links **every claimed collaborator** (the non-initiator parties) to their CURRENT `artist_profiles` values — resolved live for `draft`/`pending_approval`/`approved`/`countered`, and returning the frozen snapshot at `esign_pending`/`executed`. The [split-sheets/[id]/page.tsx](app/(artist)/split-sheets/[id]/page.tsx) server component batch-loads claimed users' profiles by server-verified `collaborators.claimed_by` and applies the resolver to **those parties only**; the initiator's self-row is built from a separate current-profile read. The resolver's freeze boundary is **aligned with** [lifecycle.ts](lib/split-sheets/lifecycle.ts)'s edit boundary (both treat `esign_pending`/`executed` as frozen). This phase must **preserve** the claimed-collaborator behavior, not rebuild it.

**Reconciliation flow (`claim_collaborators`, 026/051):** on signup and via the middleware-triggered `/api/claim-collaborators` route (which runs only while `artist_profiles.claimed_at` is null, and sets `claimed_at` after a successful run — so it does **not** re-run on every later login), it stamps `claimed_by` on unclaimed `collaborators` rows matching the user's email, copies the user's rights from `user_profiles` into blank collaborator fields (COALESCE — never overwrites), and grants the claimed user SELECT visibility ("Claimed users see own credits", 026/052 — SELECT-only). It is one-way (profile→credit), and email-dependent.

**Fragility flag:** both `user_profiles` (053) and `collaborators.claimed_by` (052) were each defensively re-created after live-schema drift. Any deletion must be preceded by a full reference sweep, and must add a NEW migration (never edit historical ones — a fresh DB replays them).

## Requirements

1. **Delete the duplicate `user_profiles` + re-point ALL its DB readers (the bug fix)**: One rights source of truth reaches split sheets, and the claim/backfill functions actually work.
   - Current: two Settings rights inputs write two tables; only `artist_profiles` reaches split sheets; `claim_collaborators()` **and** `backfill_claimed_collaborators()` read the rarely-populated `user_profiles` and usually no-op.
   - Target: the Settings "Rights Identity" section and `/api/user-profiles` rights writes are removed; exactly one rights input remains (writing `artist_profiles`); a NEW migration re-points **both** `claim_collaborators()` and `backfill_claimed_collaborators()` to read from `artist_profiles` (mapping `phone`→`contact_phone`); a **data-rescue migration** copies any values stranded in `user_profiles` into `artist_profiles` using **semantic-blank** rules (target is NULL, trimmed-empty text, or empty-JSON `{}`), maps `phone`→`contact_phone`, and audits/copies `display_name`→`artist_name` and `bio`→`bio` where the canonical value is semantically blank; the migration captures pre/post row + stranded-value counts; `user_profiles` is dropped **only after** that rescue.
   - Acceptance: Settings renders exactly one PRO/IPI/publisher/phone/address input; saving it makes the value appear on the initiator's split-sheet party-1 row; both DB functions read `artist_profiles` after the migration; a `user_profiles` row whose real rights/phone/address/display_name/bio sit over a semantically-blank canonical value has them present on `artist_profiles` after migration (the `{}`-address and `''`-PRO cases specifically covered); the rescue migration logs a stranded-value count; the "saved PRO reads None" repro fails to reproduce.

2. **Confirmable profile pre-fill on claim (Q1)**: A newly-joined user's blank profile is seeded from what others already entered about them, as a suggestion they confirm and edit.
   - Current: claiming copies profile→collaborator blanks only; it never seeds the new user's own (blank) profile from claimed records. Claiming runs on signup and via the `claimed_at`-guarded claim route — not on every login.
   - Target: within the existing claim path, for each canonical-profile field that is semantically blank, pre-fill from the claimed `collaborators` records (on conflict, the most-recent by `collaborators.updated_at` wins) and record per-field provenance + a persisted "unconfirmed" flag; surface a confirm-and-edit prompt; never silently treat pre-filled values as owned; the user can edit any pre-filled value (e.g. new phone/address/publisher); existing non-blank profile fields are never overwritten; the operation is idempotent — re-running the claim never overwrites a value the user has confirmed or edited.
   - Acceptance: a new user claimed onto records with rights data lands on a profile pre-filled from those records with a visible "confirm" state and recorded provenance; confirming/editing persists and flips the field to confirmed; re-running the claim (or the guarded route) does not overwrite a confirmed/edited value or a pre-existing non-blank value; conflicting sources resolve to the most-recent record.

3. **Preserve live-linked party identity through the consolidation (Q2)**: The existing claimed-collaborator live-link + freeze behavior survives the table changes unchanged.
   - Current: `resolvePartyIdentity` already live-links **every claimed collaborator** (the non-initiator parties) from `artist_profiles`, live for `draft`/`pending_approval`/`approved`/`countered` and returning the frozen snapshot at `esign_pending`/`executed`. The **initiator's own self-row** is built from a separate current-profile path, not the resolver. This is exactly the Q2 intent for claimed collaborators — already implemented.
   - Target: after R1 (dropping the duplicate), the claimed-collaborator resolver and the `[id]/page.tsx` batch read resolve from the canonical `artist_profiles` with the **same freeze boundary** — `esign_pending`/`executed` only, not moved earlier; the initiator's separate self-row path is likewise unchanged. *(When Phase 20 renames the relation, both reads move with it.)* Freezing the initiator's *displayed* identity on a frozen sheet is NOT in scope — the signed PDF is already the immutable record.
   - Acceptance: editing a claimed collaborator's canonical profile updates their identity on a `draft`/`pending_approval`/`approved`/`countered` sheet, and does NOT change an `esign_pending` or `executed` sheet; an executed sheet's signed PDF/Certificate is byte-unchanged; a regression test asserts the claimed-collaborator freeze boundary is unchanged from today.

4. **Flag-for-fix on frozen sheets; no cross-user edits (Q3)**: A claimed user can propose a correction to their own identity on a *frozen* sheet, but never edits another user's sheet or the deal terms.
   - Current: for live states, a claimed user's profile edits already flow (R3). For frozen states (`esign_pending`/`executed`) they cannot, and they have no in-app path to request a fix; they can only SEE their credits.
   - Target: a claimed user can submit a persisted flag ("this is wrong" + suggested value) against the identity fields of a frozen sheet (`esign_pending`/`executed`) they appear on; the owner is notified. Applying is the owner's action and routes to the correct lifecycle path — **`esign_pending` requires voiding the envelope first; `executed` directs the owner to start a correction via a guided pointer (a first-class amendment mechanism — lineage + re-sign — is DEFERRED to a follow-up phase, owner decision 2026-07-24); the signed PDF/Certificate is never edited or regenerated**. No non-owner may write another user's `split_sheet_parties` row. Deal terms (`split_percentage`, `role`) are never editable by a collaborator — that stays the approve/counter flow.
   - Acceptance: a claimed user can submit an identity-correction flag on an `esign_pending`/`executed` sheet; the owner receives a notification carrying the suggested value; there is no code path by which a non-owner mutates another user's `split_sheet_parties` row or any term; applying a fix to an executed sheet directs the owner to start a correction (guided pointer only — no auto-generated amendment this phase) and leaves the original signed PDF/Certificate byte-unchanged.

5. **"Note to licensees" on newly-generated split-sheet PDFs (Tier 1)**: Recipients are told the contact/payment data may be stale.
   - Current: generated split-sheet PDFs carry party rights/contact info with no staleness guidance.
   - Target: the split-sheet PDF **generated going forward** includes a standard note advising recipients (e.g. music supervisors) that ownership shares are fixed as of the signing date but each writer's current PRO/publisher/administrator/payee must be re-verified at license time — framed as informational guidance, **not** a Funūn warranty. Already-executed PDFs/Certificates are never regenerated or altered.
   - Acceptance: a newly generated split-sheet PDF contains the note framed as guidance (no accuracy guarantee); no already-executed document is regenerated. *(Whether the note also renders on read-only share/export surfaces is deferred to discuss-phase.)*

## Boundaries

**In scope:**
- Delete the duplicate `user_profiles`; single canonical rights input in Settings; re-point **both** `claim_collaborators()` and `backfill_claimed_collaborators()` to `artist_profiles` (R1)
- Semantic-blank data-rescue migration (rights + `phone`→`contact_phone` + `display_name`/`bio`) before drop, with pre/post counts (R1)
- Confirmable reverse pre-fill of a new user's profile on claim, idempotent + provenance-tracked (R2)
- Preserve the existing claimed-collaborator live-link + `esign_pending`/`executed` freeze boundary (R3)
- Flag-for-fix path for a claimed user's own identity on frozen sheets, executed→amendment-only (R4)
- "Note to licensees" on newly-generated split-sheet PDFs (R5)

**Out of scope:**
- **The relation rename `artist_profiles`→`user_profiles` — split to Phase 20** (owner decision 2026-07-23; ~79 runtime files + ~23 migrations + a live deploy race = a different risk class). R1 (dropping the duplicate) is Phase 20's prerequisite, since it frees the target name.
- `industry_profiles` vs `member_type='industry'` reconciliation — separate follow-up; touches Antenna/marketplace + signup trigger, higher risk, unrelated to the rights bug
- Tier-2 live "current payee snapshot" companion surfaced at sync/license time — larger feature; after core cleanup
- `curators` table — unaffected
- A **first-class amendment mechanism** for executed split sheets (lineage, re-sign) — deferred to a follow-up phase; R4 stops at flag + notify + void-first + a guided pointer for executed sheets (owner decision 2026-07-24)
- Changing ownership/`split_percentage`/`role` semantics, the approval/counter/e-sign flow, or the freeze boundary itself — untouched
- Regenerating or altering any already-executed split-sheet PDF/Certificate — prohibited (immutability)
- Fixing the email-mismatch limitation of claiming (sign-up email ≠ collaborator email) — documented limitation
- Songtrust / PRO / MLC / SoundExchange API integrations — deferred items

## Constraints

- **Human-gated migrations.** Every schema change is a migration Pete pushes via Codex; executors NEVER run `supabase db push`. LOCAL=REMOTE verified via `supabase migration list`. Next migration number is **071+** (070 is latest).
- **Historical migrations are immutable.** All changes land as NEW migrations; no historical migration is edited (a fresh DB must replay history).
- **Signed documents are immutable.** No requirement may mutate an `executed` split sheet or regenerate/replace its signed PDF/Certificate. For `executed` sheets, R4's guided apply points the owner to start a correction (a first-class amendment mechanism is deferred); `esign_pending` corrections require voiding first.
- **No data loss.** The `user_profiles` drop (R1) is preceded, in order, by the data-rescue migration; rescue uses **semantic-blank** detection (NULL, trimmed-empty text, empty-JSON `{}`) with "meaningful canonical value wins," maps `phone`→`contact_phone`, and handles `display_name`/`bio`.
- **Sweep before delete.** All readers of `user_profiles` (3 runtime + `claim_collaborators` + `backfill_claimed_collaborators` + RLS/trigger defs) are enumerated before the drop. *(The ~79-file `artist_profiles` sweep belongs to Phase 20's rename.)*
- **Name-freeing for Phase 20.** R1's drop of the duplicate `user_profiles` is what frees the target name for Phase 20's rename — do not recreate `user_profiles` for any other purpose here.
- **Staging order:** R1 (bug fix) → R2/R4/R5 (reconciliation + note) + R3 (preserve). R1 ships standalone value; Phase 20 (rename) follows.

## Acceptance Criteria

- [ ] Settings renders exactly one PRO/IPI/publisher/phone/mailing-address input (the duplicate "Rights Identity" section is gone)
- [ ] Saving rights in Settings makes the value appear on the initiator's split-sheet party-1 row (the "saved PRO reads None" repro fails)
- [ ] A data-rescue migration copies stranded `user_profiles` values (rights + `phone`→`contact_phone` + `display_name`/`bio`) into `artist_profiles` using semantic-blank rules BEFORE the drop; the `{}`-address and `''`-text cases are covered; a stranded-value count is logged; no user loses previously-entered data
- [ ] Both `claim_collaborators()` and `backfill_claimed_collaborators()` read `artist_profiles` after the migration
- [ ] On claim, a new user's semantically-blank profile fields are pre-filled from claimed records with provenance + an unconfirmed flag; confirming/editing persists; re-running the claim never overwrites a confirmed/edited or pre-existing non-blank value; conflicts resolve to most-recent
- [ ] Editing a claimed collaborator's profile updates their identity on draft/pending_approval/approved/countered sheets but NOT on esign_pending/executed sheets; the freeze boundary is unchanged from today
- [ ] No non-owner code path can write another user's `split_sheet_parties` row or edit `split_percentage`/`role`
- [ ] A claimed user can flag an identity correction on an esign_pending/executed sheet; the owner is notified; applying to an executed sheet creates an amendment and leaves the signed PDF/Certificate byte-unchanged
- [ ] A newly generated split-sheet PDF contains the "note to licensees" framed as guidance; no already-executed document is regenerated

## Edge Coverage

**Coverage:** 8/8 applicable edges resolved · 0 unresolved

> Derived from the design discussion's Failure-Analyst pass + Codex verification (this is a schema/identity-refactor spec — edges are data-state and lifecycle boundaries, resolved inline).

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| Data-loss: non-NULL blanks | R1 | ✅ covered | Semantic-blank rescue (NULL / trimmed-empty / `{}`) — the `{}`-address and `''`-PRO cases; AC line 3 |
| Data-loss: unmapped columns | R1 | ✅ covered | `phone`→`contact_phone` mapping + `display_name`/`bio` audit/copy; R1 target |
| Missed reader | R1 | ✅ covered | `backfill_claimed_collaborators()` re-pointed alongside `claim_collaborators()`; AC line 4 |
| Idempotency / re-run | R2 | ✅ covered | Claim is `claimed_at`-guarded; pre-fill never overwrites confirmed/edited/non-blank; AC line 5 |
| Source conflict | R2 | ✅ covered | Most-recent by `collaborators.updated_at` wins; R2 target |
| Freeze-boundary regression | R3 | ✅ covered | Boundary stays `esign_pending`/`executed`; regression test asserts unchanged; AC line 6 |
| Legal immutability | R3/R4/R5 | ✅ covered | No executed-sheet mutation (guided pointer only; amendment deferred); PDF/Certificate byte-unchanged, never regenerated; AC lines 6/8/9 |
| Cross-user authority | R4 | ✅ covered | No non-owner write path to another party row/terms; AC line 7 |
| Email mismatch | R2 | ⛔ dismissed | Claiming is email-keyed; a different signup email means no claim — documented limitation, explicitly out of scope |

## Prohibitions (must-NOT)

**Coverage:** 6/6 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT mutate an `executed` split sheet or regenerate/replace its signed PDF/Certificate | R3/R4/R5 | resolved | verification: test — assert PDF/Certificate byte-stable; executed edits blocked (lifecycle 409) |
| MUST NOT drop `user_profiles` before the data-rescue migration runs, nor before both DB readers are re-pointed | R1 | resolved | verification: test — migration ordering asserted; post-migration values present on canonical |
| MUST NOT lose non-NULL-but-blank (`{}` / `''`) or unmapped (`phone`, `display_name`, `bio`) data in the rescue | R1 | resolved | verification: test — semantic-blank rescue over `{}`-address and `''`-text fixtures |
| MUST NOT let a non-owner write another user's `split_sheet_parties` row or edit `split_percentage`/`role` | R4 | resolved | verification: test — RLS + route authorization negative test |
| MUST NOT present claim-pre-filled data as authoritative without the confirm step (locking a stranger's typo as identity) | R2 | resolved | verification: judgment — unconfirmed flag + confirm-and-edit prompt required before values are owned |
| MUST NOT accomplish the consolidation by editing historical migrations | R1 | resolved | verification: test — changes land as new migrations; historical files byte-unchanged in the diff |
| Cross-user rights-data exposure beyond the intended claim-fill | R2/R4 | — | canon — owned by RLS + /gsd-secure-phase; not minted here |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                              |
|--------------------|-------|------|--------|----------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Precise, staged goal; canonical table decided       |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | Rename split to Phase 20; out-of-scope explicit      |
| Constraint Clarity | 0.86  | 0.65 | ✓      | Human-gated, immutability, semantic-blank rescue     |
| Acceptance Criteria| 0.80  | 0.70 | ✓      | 9 pass/fail; R2 flag-schema + R4 notify → planning    |
| **Ambiguity**      | 0.13  | ≤0.20| ✓      | Corrected against Codex verification                 |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

Requirements were clarified across an extended design conversation (2026-07-23), then corrected against a read-only Codex verification of the SPEC's factual claims.

| Round | Perspective     | Question summary                                  | Decision locked                                                        |
|-------|-----------------|---------------------------------------------------|------------------------------------------------------------------------|
| 1     | Researcher      | What "profile" tables exist and which reach splits? | 6 tables; `artist_profiles` is the universal one splits read; `user_profiles` is a duplicate feeding only the claim/backfill functions |
| 2     | Researcher      | Where do phone/address/PRO actually live?          | `artist_profiles` already has all of them (020/021/063) — canonical is complete |
| 2     | Simplifier      | Irreducible core?                                  | Delete the duplicate + re-point BOTH DB readers (R1) — fixes the bug and the half-broken claim |
| 3     | Boundary Keeper | What's explicitly NOT this phase?                  | `industry_profiles`/`member_type` deferred; Tier-2 deferred; terms/approval/freeze-boundary untouched; curators untouched |
| 4     | Failure Analyst | What breaks if we get it wrong?                    | Stranded `{}`/`''`/unmapped data; missed `backfill_*`; signed-doc mutation — all resolved in Edge Coverage |
| 5     | Seed Closer     | Reconciliation intent?                             | Q1=C confirmable pre-fill; Q2=preserve existing live-link; Q3=B flag-for-fix (frozen sheets, executed→amendment) |
| 6     | Seed Closer     | Sync/licensing tension?                            | Signed split = frozen ownership; current payee = live profile; Tier-1 "note to licensees" on newly-generated PDFs |
| V     | Verification (Codex) | Are the spec's factual claims true?          | CORRECTED: claimed collaborators already live-linked (R3 was wrong); freeze = esign_pending/executed; `backfill_claimed_collaborators()` added; semantic-blank + display_name/bio rescue; `claimed_at`-guarded claim; executed→amendment-only (R4); column provenance 020/021/063 |
| S     | Scope (owner)   | Keep the rename in-phase or split it?              | R6 rename SPLIT to Phase 20 (~79 files + deploy race = different risk class); Phase 19 = R1–R5 |

---

*Phase: 19-profile-identity-model-cleanup*
*Spec created: 2026-07-23 · Revised: 2026-07-23 (Codex verification + R6 split to Phase 20)*
*Next step: /gsd-discuss-phase 19 — implementation decisions (migration sequencing, semantic-blank rescue, claim pre-fill state, flag surface)*
