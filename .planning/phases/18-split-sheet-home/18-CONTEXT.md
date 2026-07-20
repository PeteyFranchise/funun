# Phase 18: Split-Sheet Home - Context

**Gathered:** 2026-07-20 (design session; no separate discuss-phase needed — every decision below was settled in conversation and recorded in the design doc)
**Status:** Ready for planning
**Sequencing:** after Phase 17, before Phase 16.

<domain>
## Phase Boundary

Phase 17 makes split sheets **signable**. Phase 18 makes them **livable**: a working draft that survives the studio, a Contract Locker that behaves like a workspace instead of a filing cabinet, and song-level attachment so a sheet created before a release binds to the right track later.

This phase covers:
- The living-draft surface: sheet list, `/split-sheets/[id]`, builder in edit mode, collaborator picker on an existing draft, add-and-redistribute.
- Contract Locker as workspace: attention-first landing that reads BOTH `vault_documents` and in-flight `split_sheets`, create CTAs, browse-complete.
- Song-level attachment: `split_sheets.track_id`, the `split_sheet_attachments` join table, attach from both directions with track selection.
- Coverage-based readiness scoring (shipped as its own plan — user-visible score change).
- `split_sheets.source` provenance field (`'funun' | 'uploaded'`).

This phase does NOT cover: extraction of structured data from uploaded PDFs (Contract Locker Intelligence), the `ask`/natural-language query surface (same), free-text messaging in any form, e-sign mechanics (Phase 17 owns those).

</domain>

<decisions>
## AUTHORITATIVE DESIGN

**`.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md` is the source of truth for this phase.** It carries the full data model, state transitions, attach flow, Locker IA, per-party access rules, the block exception, structured-actions communication, third-party-upload direction, edge-case table, and implementation order. Every decision in it is settled. Do not re-litigate; read it before planning.

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
- **P18-07:** Adding a collaborator to a living draft is one click from the collaborator list (`CollaboratorPicker` already exists in the builder — it needs the *edit* path). Add-and-redistribute: adding a party redistributes proportionally or evenly rather than making the artist retype every percentage.
- **P18-08:** Read-only draft share, so a collaborator can see proposed splits BEFORE a formal signing request. Today the only way to show someone is `send-for-approval`, which is a formal ask.
- **P18-09:** When a consensus reset occurs, tell parties **what changed** — "Rapper added at 20%; your share 40% → 32%" — not merely "please re-approve."

**Locker IA:**
- **P18-10:** Attention-first landing: (1) what needs your attention — awaiting signature with per-party progress, drafts in progress, unattached executed sheets, songs with no sheet; (2) create CTAs; (3) browse complete. **The highest-value version is pure structured queries — no AI.** A reserved slot for `ask` exists in the layout; build nothing there.
- **P18-11:** Every Funūn-user party gets their own Locker view. One document, N lockers, each in the viewer's context ("your share 30%" vs "your share 45%"). Drafts stay initiator-only until sent. Soft-hide, never hard-delete — one party may not destroy a shared legal record. Attach is independent per party.

**Trust & safety:**
- **P18-12 (BLOCK EXCEPTION):** Shared executed agreements are an explicit exception to Phase 13's block doctrine. Two co-writers who block each other still co-own the composition; neither may lose the record of what they signed. Verified: the Locker query and 17-05's fan-out apply no block filtering today, so behavior is already correct **by omission** — this phase makes it deliberate and documents it at the query, so a future block-enforcement audit does not "fix" it. Scope is narrow: the agreement and its parties' details *on that agreement*; no other Phase 13 surface reopens.
- **P18-13 (STRUCTURED ACTIONS ONLY):** Communication across a block is limited to structured, document-scoped actions — propose amendment, raise dispute, existing nudges. **No user-supplied free text crosses a block, including optional note fields** (that field is the harassment vector). Notifications are system-worded. Disputes escalate to a human admin, consistent with Phase 16's D-14b. The general DM block remains fully in force.

**Readiness:**
- **P18-14:** Coverage-based scoring replaces the current gate: `covered / needing` across the project's tracks, taking the MINIMUM tier across tracks. Ships as **its own plan** — it is a user-visible score change (projects reading `complete` today may drop to `warning`), and it touches BOTH `readinessItemsForProject()` and `calculate_vault_readiness()` with a shared parity fixture, same dual-implementation pattern as 17-02.

## Open (resolve during planning)

- Does *every* track need a split sheet for full coverage, or only tracks with >1 composer? Design doc leans strict-with-acknowledgment (a per-track "solo-written, no sheet needed" marker). Planner should propose; Pete confirms at the checkpoint.
- May a sheet attach before execution? 17-05's route currently requires `executed`; P18-04 says attachment is lifecycle-orthogonal. Design doc leans relax. Resolve in the attachment plan.
- Does attaching notify the other parties? Design doc leans no for v1 (organizational, not legal).

</decisions>

<canonical_refs>
- `.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md` — AUTHORITATIVE design.
- `lib/split-sheets/lifecycle.ts` — the shipped freeze boundary this phase's UI must respect.
- `supabase/migrations/018_collaborators_split_sheets.sql` — sheets/parties schema + RLS.
- `supabase/migrations/001_initial_schema.sql` — `vault_documents` (has `project_id` AND `track_id`).
- `app/api/split-sheets/[id]/attach/route.ts` — 17-05's shipped attach route (project-only; this phase extends it).
- `components/split-sheets/SplitSheetBuilder.tsx`, `components/collaborators/CollaboratorPicker.tsx` — the builder and picker to extend.
- `app/(artist)/contracts/page.tsx`, `components/contracts/ContractLocker.tsx` — the Locker to rebuild.
- `lib/vault/readiness.ts` + `calculate_vault_readiness()` (migration 016 lineage, redefined in 062) — both need the coverage change.
- `lib/trust-safety/block-check.ts` — the doctrine P18-12 excepts.
</canonical_refs>

---

*Phase: 18-split-sheet-home · Context: 2026-07-20*
