# Phase 18: Split-Sheet Home - Context

**Gathered:** 2026-07-20 (initial design session) · **Updated:** 2026-07-21 (reconciled against the identity/collaborator redesign)
**Status:** Ready for planning — **existing plans 18-01 through 18-04 are STALE and require a replan pass before execution.** They were drafted against the pre-redesign `CollaboratorPicker`; see "What changed" below.
**Sequencing:** after Phase 17, before Phase 16. Phase 17's live signing checkpoint is deliberately paused pending this phase's replan and execution — see `.planning/phases/17-split-sheet-esign/17-RESUME-HERE.md`.

<domain>
## Phase Boundary

Phase 17 makes split sheets **signable**. Phase 18 makes them **livable**: a working draft that survives the studio, a Contract Locker that behaves like a workspace instead of a filing cabinet, song-level attachment so a sheet created before a release binds to the right track later, and — as of this update — an identity model where the initiator and their collaborators never manually re-type data Funūn already has.

This phase covers:
- The living-draft surface: sheet list, `/split-sheets/[id]`, builder in edit mode, collaborator picker on an existing draft, add-and-redistribute.
- Contract Locker as workspace: attention-first landing that reads BOTH `vault_documents` and in-flight `split_sheets`, create CTAs, browse-complete, now showing per-party pending/confirmed status (see "What changed").
- Song-level attachment: `split_sheets.track_id`, the `split_sheet_attachments` join table, attach from both directions with track selection.
- Coverage-based readiness scoring (shipped as its own plan — user-visible score change).
- `split_sheets.source` provenance field (`'funun' | 'uploaded'`).
- **NEW:** the initiator-identity and fast-collaborator-add redesign from `split-sheet-identity-and-collaborator-model.md` §1, §2, §4, §6, §7, §9 — live-linked identity, legal-name locking, email/phone-only collaborator add, pending/confirmed status, recipient-side advanced info, initiator auto-included as party 1.

This phase does NOT cover: extraction of structured data from uploaded PDFs (Contract Locker Intelligence), the `ask`/natural-language query surface (same), free-text messaging in any form, e-sign mechanics (Phase 17 owns those), **Groups** (deliberation §3 — pulled out to its own future phase, see below), **SMS invite delivery** (deliberation §5 — its own small future addition to 17-10's territory, not this phase).

</domain>

<decisions>
## AUTHORITATIVE DESIGN — two documents now, read both before planning

**`.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md`** — original source of truth: full data model, state transitions, attach flow, Locker IA, per-party access rules, block exception, structured-actions communication, third-party-upload direction, edge-case table, implementation order. Every decision in it is still settled. Do not re-litigate.

**`.planning/deliberations/split-sheet-identity-and-collaborator-model.md`** (NEW, 2026-07-21) — the identity/collaborator redesign. §1 (live-linked identity), §2 (legal-name locking), §4 (fast collaborator-add), §6 (pending/confirmed collaborator status), §7 (recipient-side advanced info), and §9 (initiator auto-included as party 1) are **all in scope for THIS phase** — they touch the exact same builder/collaborator-picker surface Phase 18 already rebuilds. §3 (Groups) and §5 (SMS) are explicitly **OUT of scope** for Phase 18 — see below.

## What changed since the original design session (2026-07-20 → 2026-07-21)

**Why:** preparing to run Phase 17's live signing checkpoint surfaced a confusing flow — the initiator has to manually add-and-fill their own party row before adding a real collaborator, compounded by a genuinely broken, cramped collaborator-picker popup. What looked like a state-corruption bug was live-reproduced and proven to be a UX/flow problem, not a code defect (full trace in the deliberation doc's "Originating bug" section). Fixing that flow grew into the full identity redesign. Pete decided to build the redesign before resuming the checkpoint, rather than test the current flow and redo the test after.

**Concrete conflict this created: `18-01-PLAN.md` is stale.** Its Task 1 body says *"CollaboratorPicker is rendered on every party row exactly as it is in create mode"* — meaning it was drafted to extend the CURRENT picker onto the living-draft edit surface unchanged. That picker is being replaced. 18-01 needs its collaborator-picker integration rewritten against the new design (fast email/phone add, collapsed "advanced information," pending/confirmed status), not executed as originally drafted.

**Scope decisions made in this reconciliation session:**

- **Groups → own future phase, NOT Phase 18.** Real entities, time-bounded membership, mixed Funūn/non-Funūn roster — comparable in size to the original Collaborators feature. Folding it into Phase 18 would make an already-large phase materially larger for a capability the living-draft/Locker/attachment work doesn't depend on.
- **SMS invite delivery → own small future addition, NOT Phase 18.** It only touches `lib/split-sheets/esign-invite.ts` (17-10's territory) — a second delivery channel alongside email, no change to the actual signing experience. Nothing about the living draft, Locker, or attachment needs it.
- **Locker attention-first landing (P18-10) now shows pending/confirmed status per party** — e.g. "Awaiting signature (2 of 3 signed): ✓ You — signed · ✓ Jamie — signed · ○ Alex — invited, hasn't opened yet." This is a natural, small extension of the per-party signing progress P18-10 already specifies, not new surface area.

**Stale note corrected:** the original context flagged *"AM-2 cap interaction — FLAGGED, needs Pete's decision"* under P18-15's consequences. **This is already resolved** — AM-2c (`.planning/FINANCIALS.md` §5, decided 2026-07-20) replaced the document-count cap with a 25-new-recipients/month cap specifically because of this exact P18-15 tension. No open decision remains here; downstream agents should read AM-2c as settled, not as a flag to resolve.

## Findings that motivated this phase (verified 2026-07-20)

1. **`/split-sheets` is orphaned** — not in `ArtistNav`, and nothing anywhere in the app links to it. Creation is reachable only by typing the URL.
2. **Drafts are write-only.** `SplitSheetBuilder` can save a draft, but there is no `/split-sheets/[id]` page, no list, and no edit mode — a saved draft becomes permanently unreachable. The PATCH route has **no UI caller at all**.
3. **The Locker cannot see in-flight work.** It queries only `vault_documents` (signed artifacts). Drafts and pending sheets live in `split_sheets`, a table the Locker has never read. Attention-first is therefore a *query* change, not a layout change.
4. **Readiness over-credits song-specific sheets.** `signedOf('split_sheet')` asks "are all split-sheet documents for this project signed?" — so a 5-track EP with ONE signed sheet has `total=1, signed=1` → `complete`, 15/15. Four undocumented songs, fully green. It fails in the dangerous direction and is live today.
5. **`vault_documents` already has `track_id`** alongside `project_id` (migration 001) — the signed artifact can be song-specific with no migration. `split_sheets` does not.

## Locked decisions

**Model:**
- **P18-01:** Contract Locker = the cabinet (every sheet lives there for its whole life). Vault Documents = the shipping checklist (a filtered view of what governs *this* release). **Attaching creates a relationship; it never moves or copies a document.**
- **P18-02:** Song-specific by default — `split_sheets.track_id`, nullable, `ON DELETE SET NULL` (deleting a track must never delete the record of who wrote it).
- **P18-03:** Attachment via the `split_sheet_attachments` join table, NOT a plain FK. Justified by a known, common second case: the same composition appears on a single AND an album (two `tracks` rows, one composition, one sheet). A column alone forces either a duplicate sheet — explicitly rejected — or an unattachable second release.
- **P18-04:** Attachment is **orthogonal to the signing lifecycle**. A sheet may attach at any stage. Vault-first sheets are simply born attached.
- **P18-05:** `split_sheets.source: 'funun' | 'uploaded'`, permanent and surfaced. Ship the field now; build no extraction.

**Living draft:**
- **P18-06:** Editing is bounded by the freeze boundary already shipped in `lib/split-sheets/lifecycle.ts` (quick task 260720). `draft`/`countered` edit freely; `pending_approval`/`approved` reset consensus to draft; `esign_pending`/`executed` are blocked. The UI must respect and explain these, not work around them.
- **P18-07 (SUPERSEDED IN PART — see "What changed" above):** Adding a collaborator to a living draft is one click, via the **redesigned** collaborator-add flow (deliberation §4: email/phone only, "advanced information" collapsed by default) — NOT the current `CollaboratorPicker` unchanged. Add-and-redistribute still applies: adding a party redistributes proportionally or evenly rather than making the artist retype every percentage.
- **P18-07a (NEW):** The initiator is **party 1 automatically** on both create and edit surfaces (deliberation §9) — legal name locked (§2), PRO/IPI/publisher/administrator live-linked from Settings (§1). There is no "+ Add party, then Use my info" step for the initiator's own row, on the living draft or on create.
- **P18-08:** Read-only draft share, so a collaborator can see proposed splits BEFORE a formal signing request. Today the only way to show someone is `send-for-approval`, which is a formal ask.
- **P18-09:** When a consensus reset occurs, tell parties **what changed** — "Rapper added at 20%; your share 40% → 32%" — not merely "please re-approve." Note: a live-linked identity update (deliberation §1 — e.g. a party's PRO changing because they updated Settings) is NOT a consensus-resetting change; only party-list and split-percentage changes reset consensus, per `lib/split-sheets/lifecycle.ts`'s existing boundary.

**Locker IA:**
- **P18-10 (EXTENDED):** Attention-first landing: (1) what needs your attention — awaiting signature with per-party progress **AND per-party pending/confirmed status** (deliberation §6 — "invited, hasn't opened yet" vs "opened, hasn't signed" vs "signed"), drafts in progress, unattached executed sheets, songs with no sheet; (2) create CTAs; (3) browse complete. **The highest-value version is pure structured queries — no AI.** A reserved slot for `ask` exists in the layout; build nothing there.
- **P18-11:** Every Funūn-user party gets their own Locker view. One document, N lockers, each in the viewer's context ("your share 30%" vs "your share 45%"). Drafts stay initiator-only until sent. Soft-hide, never hard-delete — one party may not destroy a shared legal record. Attach is independent per party.

**Trust & safety:**
- **P18-12 (BLOCK EXCEPTION):** Shared executed agreements are an explicit exception to Phase 13's block doctrine. Two co-writers who block each other still co-own the composition; neither may lose the record of what they signed. Verified: the Locker query and 17-05's fan-out apply no block filtering today, so behavior is already correct **by omission** — this phase makes it deliberate and documents it at the query, so a future block-enforcement audit does not "fix" it. Scope is narrow: the agreement and its parties' details *on that agreement*; no other Phase 13 surface reopens.
- **P18-13 (STRUCTURED ACTIONS ONLY):** Communication across a block is limited to structured, document-scoped actions — propose amendment, raise dispute, existing nudges. **No user-supplied free text crosses a block, including optional note fields** (that field is the harassment vector). Notifications are system-worded. Disputes escalate to a human admin, consistent with Phase 16's D-14b. The general DM block remains fully in force.

**Readiness:**
- **P18-14:** Coverage-based scoring replaces the current gate: `covered / needing` across the project's tracks, taking the MINIMUM tier across tracks. Ships as **its own plan** — it is a user-visible score change (projects reading `complete` today may drop to `warning`), and it touches BOTH `readinessItemsForProject()` and `calculate_vault_readiness()` with a shared parity fixture, same dual-implementation pattern as 17-02.

## Resolved after planning (2026-07-20)

- **P18-15 — EVERY track needs a split sheet. No exceptions, no acknowledgment escape hatch.** `tracksNeedingSheet()` returns all of a project's tracks; there is no "solo-written, no sheet needed" marker. Pete's rationale, which supersedes the design doc's softer lean: a solo-written song still needs the document, because **the absence of a split sheet is not proof of sole authorship — it is absence of proof.** A sync licensor running chain-of-title cannot distinguish "solo-written" from "undocumented," and that ambiguity is what kills placements. A one-party sheet is a dated, executed declaration of 100% ownership with an audit trail — precisely the "no loose ends" artifact a licensor wants. This REMOVES 18-04's Task 1 decision checkpoint; the answer is settled.
- **P18-16 — Readiness points are PROPORTIONAL; status requires ALL.** The design doc contained a contradiction (§6 said both "proportional partial credit" and "minimum across tracks"); the planner correctly flagged that MIN alone scores a 5-track EP with 4 executed sheets at **0/15**, which cannot distinguish "done nothing" from "nearly done." Resolution uses structure that already exists: `ReadinessItem.earnedPoints` is proportional (4/5 → 12/15) while `ReadinessItem.status` stays `warning` until every track is covered. `canSubmit` keys off status, so the ship-gate stays strict while the progress signal stays informative.

### Consequences of P18-15 that this phase must handle

- **One-party sheets must work end to end.** `validateApprovalTotal` already passes a single party at 100%. The signing flow should default solo sheets to P17-01's fast lane — sending yourself a formal signature request is absurd UX. The DocuSeal certificate is what makes a self-signed declaration credible (timestamp + audit trail), so it still goes through e-sign rather than being marked complete locally.
- **AM-2 cap interaction — RESOLVED (2026-07-20 → confirmed still current 2026-07-21).** See "What changed" above — AM-2c's 25-new-recipients/month cap is the settled answer. No open decision remains.

## Open (resolve during planning)

- May a sheet attach before execution? 17-05's route currently requires `executed`; P18-04 says attachment is lifecycle-orthogonal. Design doc leans relax. Resolve in the attachment plan.
- Does attaching notify the other parties? Design doc leans no for v1 (organizational, not legal).
- **NEW:** the exact rewrite scope for 18-01's collaborator-picker integration (P18-07/P18-07a) — how much of `components/collaborators/CollaboratorPicker.tsx` gets replaced vs extended is an implementation question for the researcher/planner, not decided here.

</decisions>

<canonical_refs>
- `.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md` — AUTHORITATIVE design for the living-draft/Locker/attachment model.
- `.planning/deliberations/split-sheet-identity-and-collaborator-model.md` — AUTHORITATIVE design for identity/collaborator-add, §1/§2/§4/§6/§7/§9 in scope for this phase, §3 (Groups) and §5 (SMS) explicitly out of scope.
- `.planning/FINANCIALS.md` §5 — AM-2c, the resolved recipient-based cap (corrects the stale "FLAGGED" note from the original context).
- `.planning/phases/17-split-sheet-esign/17-RESUME-HERE.md` — records why Phase 17's live checkpoint is paused pending this phase.
- `lib/split-sheets/lifecycle.ts` — the shipped freeze boundary this phase's UI must respect.
- `supabase/migrations/018_collaborators_split_sheets.sql` — sheets/parties schema + RLS.
- `supabase/migrations/026_collaborator_identity_reconciliation.sql` — the claim/backfill chain (`collaborator_id → collaborators.claimed_by → user_profiles`) that deliberation §1's live-link mechanism extends.
- `supabase/migrations/001_initial_schema.sql` — `vault_documents` (has `project_id` AND `track_id`).
- `app/api/split-sheets/[id]/attach/route.ts` — 17-05's shipped attach route (project-only; this phase extends it).
- `components/split-sheets/SplitSheetBuilder.tsx`, `components/collaborators/CollaboratorPicker.tsx` — the builder and picker to extend/redesign. **Note:** `CollaboratorPicker.tsx`'s current dropdown popup (`max-w-[320px]`) is confirmed broken/cramped — do not preserve its layout.
- `app/(artist)/contracts/page.tsx`, `components/contracts/ContractLocker.tsx` — the Locker to rebuild.
- `lib/vault/readiness.ts` + `calculate_vault_readiness()` (migration 016 lineage, redefined in 062) — both need the coverage change.
- `lib/trust-safety/block-check.ts` — the doctrine P18-12 excepts.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/split-sheets/lifecycle.ts` — freeze-boundary logic already shipped; identity live-linking (deliberation §1) must respect it (updates stop once a sheet is `esign_pending`).
- Migration 026's claim/backfill chain — `split_sheet_parties.collaborator_id → collaborators.id → collaborators.claimed_by → auth.users.id → user_profiles` already exists end to end; deliberation §1's live-link mechanism is a new function on this same chain, not new schema.

### Established Patterns
- Dual-implementation-with-parity-fixture pattern (readiness trigger + TS twin) — P18-14 follows the same shape as 17-02.
- Server-owned write doctrine, freeze-boundary respect — both carry forward unchanged.

### Integration Points
- `CollaboratorPicker.tsx` is the single integration point touched by both the original Phase 18 scope (P18-07, living-draft edit mode) and the new identity redesign (§4, §6) — one component, one rewrite, not two separate touches.

</code_context>

<specifics>
## Specific Ideas

The Locker status extension (P18-10) should read like the preview shown during discussion:
```
⚠ Awaiting signature (2 of 3 signed)
   ✓ You — signed
   ✓ Jamie — signed
   ○ Alex — invited, hasn't opened yet
```

</specifics>

<deferred>
## Deferred Ideas

- **Groups** (deliberation §3) — real entities, time-bounded membership, mixed Funūn/non-Funūn roster. Own future phase; comparable in size to the original Collaborators feature.
- **SMS invite delivery** (deliberation §5) — same `/approve/{token}` link via text instead of email. Own small future addition to 17-10's territory (`lib/split-sheets/esign-invite.ts`), not this phase.
- **PRO/MLC identity cross-referencing API** (`.planning/research/PRO-MLC-identity-verification-api.md`) — gated future BD idea, not an engineering task.

</deferred>

---

*Phase: 18-split-sheet-home*
*Context gathered: 2026-07-20 · Updated: 2026-07-21*
