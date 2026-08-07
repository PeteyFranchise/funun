# Phase 18: Split-Sheet Home — Research (TARGETED REPLAN: 18-01, 18-02 only)

**Researched:** 2026-07-22
**Domain:** Split-sheet identity/collaborator redesign, as it lands on the living-draft surface (18-01) and Contract Locker (18-02)
**Confidence:** MEDIUM-HIGH — all claims below are grounded in direct reads of the live codebase; the few genuinely undecided points are called out explicitly in Open Questions and the Assumptions Log.

**Scope discipline:** This document only researches what 18-01 and 18-02 need to change. 18-03 (attachment) and 18-04 (readiness) are untouched and out of scope — nothing here should be read as new guidance for those plans.

---

<user_constraints>
## User Constraints (from 18-CONTEXT.md)

### Locked Decisions

**Model (unchanged, prior context):**
- P18-01: Contract Locker = the cabinet; Vault Documents = the shipping checklist. Attaching creates a relationship; it never moves or copies a document.
- P18-02..P18-05: song-specific by default, join-table attachment, attachment orthogonal to lifecycle, `source` provenance field. (18-03/18-04 territory — not touched here.)

**Living draft (18-01's territory):**
- P18-06: Editing is bounded by the freeze boundary already shipped in `lib/split-sheets/lifecycle.ts`. `draft`/`countered` edit freely; `pending_approval`/`approved` reset consensus to draft; `esign_pending`/`executed` are blocked. The UI must respect and explain these, not work around them.
- **P18-07 (SUPERSEDED IN PART):** Adding a collaborator to a living draft is one click, via the **redesigned** collaborator-add flow (deliberation §4: email/phone only, "advanced information" collapsed by default) — NOT the current `CollaboratorPicker` unchanged. Add-and-redistribute still applies.
- **P18-07a (NEW):** The initiator is party 1 automatically on both create and edit surfaces (deliberation §9) — legal name locked (§2), PRO/IPI/publisher/administrator live-linked from Settings (§1). There is no "+ Add party, then Use my info" step for the initiator's own row, on the living draft or on create.
- P18-08: Read-only draft share — a collaborator can see proposed splits BEFORE a formal signing request.
- P18-09: Consensus resets tell parties what changed, not merely that re-approval is needed. A live-linked identity update (§1) is NOT a consensus-resetting change; only party-list and split-percentage changes reset consensus.

**Locker IA (18-02's territory):**
- **P18-10 (EXTENDED):** Attention-first landing includes awaiting-signature-with-per-party-progress **AND per-party pending/confirmed status** (deliberation §6 — "invited, hasn't opened yet" vs "opened, hasn't signed" vs "signed"), drafts in progress, unattached executed sheets, songs with no sheet. Pure structured queries, no AI. Reserved `ask` slot, build nothing there.
- P18-11: Every Funūn-user party gets their own Locker view, in their own context. Drafts stay initiator-only until sent. Soft-hide, never hard-delete.

**Trust & safety (18-02's territory):**
- P18-12: Shared executed agreements are an explicit exception to Phase 13's block doctrine, made deliberate via an in-source comment.
- P18-13: Communication across a block is structured-actions-only; no user-supplied free text crosses a block, including optional note fields.

**Identity/collaborator redesign, all in scope for Phase 18 (deliberation §1/§2/§4/§6/§7/§9; §3 Groups and §5 SMS explicitly OUT):**
- §1 Live-linked identity: for a Funūn-user party, PRO/IPI/publishing designee/administrator stay live-linked to their account up until `esign_pending`. Implementation is modeled on `backfill_claimed_collaborators()`, but uses **overwrite, not COALESCE** semantics — a deliberate divergence from the additive convention, because this is a person's own verified data correcting itself.
- §2 Legal-name locking: one-time "confirm and lock" step in Settings, self-attested, no automated PRO verification.
- §4 Fast collaborator-add: only email or phone required from the initiator; "Advanced information" collapsed by default. Required change to existing validation: "Every party needs a legal name" must relax for parties not yet linked to a Funūn account.
- §6 Auto-collaborator creation: fast-add immediately creates a `collaborators` row, marked with a status (`pending`/`invited` until they respond, `confirmed` once they do).
- §7 Recipient-side data completion: `/approve/[token]` gets an optional, collapsed "Advanced information" section where the recipient can fill in or correct their own legal name/PRO/IPI/publishing designee/administrator. Flows back through §1's reconciliation (overwrite semantics).
- §9 Initiator's own row: legal name read-only from Settings (locked per §2); PRO/IPI/publisher/administrator sourced live (§1) — no manual re-entry, no "Use my info" click. Incomplete Settings data is a soft nudge, not a blocker. Split % and Role remain fully editable.

### Claude's Discretion

None recorded for the identity/collaborator redesign areas — all were decided explicitly in the deliberation and carried forward without re-discussion (per 18-DISCUSSION-LOG.md). The **exact rewrite scope of `CollaboratorPicker.tsx`** is the one genuinely open implementation question CONTEXT.md defers to research/planning (see Architecture Patterns and Open Questions below).

### Deferred Ideas (OUT OF SCOPE)

- **Groups** (deliberation §3) — real entities, time-bounded membership, mixed Funūn/non-Funūn roster. Own future phase.
- **SMS invite delivery** (deliberation §5) — own small future addition to 17-10's territory (`lib/split-sheets/esign-invite.ts`).
- **PRO/MLC identity cross-referencing API** — gated future BD idea, not an engineering task.
- Migration 064/065, song-track attachment, coverage-based readiness scoring — 18-03/18-04's territory, explicitly excluded from this research pass.
</user_constraints>

<phase_requirements>
## Phase Requirements (the 18-01/18-02 subset)

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-01 | Split-sheet list, closing the orphaned-`/split-sheets` finding | No redesign impact — list surface is orthogonal to identity work. See existing `GET /api/split-sheets` (initiator-only today; 18-01 already plans to widen it). |
| HOME-02 | `/split-sheets/[id]` detail page, `SplitSheetBuilder` in edit mode, first UI caller of `PATCH /api/split-sheets/[id]` | Edit-mode initial state must now seed party 1 from `myProfile` automatically (§9) — this is a change to shared builder logic, not edit-mode-only. See Architecture Patterns §3. |
| HOME-03 | `CollaboratorPicker` on an existing draft + add-and-redistribute | The picker referenced here is the **redesigned** one (fast add, collapsed advanced info, pending/confirmed badge) — not the current component unmodified. See Architecture Patterns §1 for the concrete rewrite-scope recommendation (mode-prop or sibling component, because `CollaboratorPicker` has a third caller — `MetadataStudio` — outside Phase 18's radar). |
| HOME-04 | Read-only draft share — no approve/counter action | Unaffected by the identity redesign; `resolvePartyPhase()`'s new `'preview'` branch (already in 18-01-PLAN.md) is unchanged by this research. `/approve/[token]`'s optional §7 advanced-info section is a natural, adjacent addition to the same file 18-01 already touches — see Open Questions #1. |
| HOME-05 | Freeze boundary surfaced in its own words; consensus resets summarized | P18-09's clarification that a live-linked identity update does NOT reset consensus must be encoded explicitly in `summarizePartyChanges()`'s diff logic — see Architecture Patterns §2 and Common Pitfalls. |
| HOME-06 | Attention-first Locker landing, `vault_documents` + in-flight `split_sheets`, per-party progress | The "per-party pending/confirmed status" P18-10 asks for (`"invited, hasn't opened yet"` etc.) is **already fully derivable from existing columns** — no new schema needed for this specific display. See Architecture Patterns §4. |
| HOME-07 | Per-party Locker views, own context, per-viewer soft hide | Unaffected by the identity redesign — already scoped correctly in 18-02-PLAN.md's `buildAttentionSections()` design. |
| HOME-08 | Block exception made deliberate; no free text crosses a block | Unaffected by the identity redesign. |
</phase_requirements>

## Summary

The identity/collaborator redesign (deliberation §1/§2/§4/§6/§7/§9) lands almost entirely on files 18-01 already touches (`SplitSheetBuilder.tsx`, `CollaboratorPicker.tsx`, `app/approve/[token]/page.tsx`) and does not require any new database migration to *display* what P18-10 (18-02) needs — the per-party pending/opened/signed progress the Locker preview describes is already fully computable from columns that shipped in migrations 018 and 062 (`approval_status`, `first_viewed_at`). What the redesign *does* require, and what 18-01/18-02's stale plans did not anticipate, are four structural corrections:

1. **`CollaboratorPicker.tsx` has a third caller the redesign context missed.** It is also used by `components/vault/MetadataStudio.tsx`'s `ComposerEditor` row (Wave 1/2 metadata credit entry) — a completely different, unrelated feature with no relationship to split sheets. CONTEXT.md's framing ("one component, one rewrite, not two separate touches") only accounts for the two split-sheet touch points and did not know about this third caller. An in-place behavioral rewrite for the fast email/phone-first flow risks regressing metadata credit entry, which has **no automated test coverage today** (`grep` for `CollaboratorPicker`/`ComposerEditor` across `__tests__/` returns nothing). Recommend a `mode` prop or a sibling component — see Architecture Patterns §1.

2. **§9's auto-included party 1 requires a change to SHARED create/edit initial-state logic, not just edit-mode.** Today `SplitSheetBuilder` starts with `useState<PartyRow[]>([])` in both create and edit contexts; the initiator must manually click "+ Add party" then "Use my info." §9 requires this to be automatic on mount. Since this initial-state seeding is shared code (not gated behind the `existingSheet` prop 18-01 planned to add), **18-01-PLAN.md's Task 3 line "Create mode behavior is byte-for-byte unchanged when the prop is absent" is now incorrect** and needs revision — create mode's initial party list changes too. The same applies to the "Every party needs a legal name" client validation, which today blocks saving unconditionally and must relax specifically for not-yet-responded fast-added parties (§4), in both modes.

3. **The live-link mechanism (§1) cannot be built on `user_profiles` as CONTEXT.md's chain describes, because `user_profiles` is missing the exact fields that need to live-link.** The codebase has **two parallel identity tables**: `artist_profiles` (holds `legal_first_name`/`legal_middle_name`/`legal_last_name`/`legal_name_suffix`, `pro`, `ipi`, `publisher`, `administrator` — the actual source `SplitSheetBuilder`'s `myProfile` prefill reads from) and `user_profiles` (migration 026/053 — holds only `pro`/`ipi`/`publisher`/`phone`/`mailing_address`/`display_name`/`bio`, **no legal name, no administrator**). `backfill_claimed_collaborators()` reads from `user_profiles`, which is fed only by `PATCH /api/user-profiles` (the Settings page's separate "Rights Identity" sub-form) — a route that is disconnected from the actual Settings identity fields (legal name, administrator) that live on `artist_profiles` and are written by `PATCH /api/profile`, which today **calls no backfill at all**. The concrete, correct mechanism is a **read-time resolver** that joins `split_sheet_parties.collaborator_id → collaborators.claimed_by → artist_profiles` (not `user_profiles`), applied wherever party identity is displayed pre-mint, with the resolved values written into `split_sheet_parties` at mint time (Phase 17 territory) as the actual freeze point. See Architecture Patterns §2 for full detail and trade-offs against the push/trigger alternative.

4. **Three genuine schema gaps exist that have no home yet:** (a) `collaborators` has no `legal_name` column, so a Funūn-user party's self-corrected legal name (§7) has nowhere to persist for reuse in future split sheets; (b) `collaborators` has no `status` column for the pending/invited-vs-confirmed roster distinction §6 describes; (c) `artist_profiles` has no "legal name locked" boolean/timestamp for §2's one-time confirm-and-lock step. None of these are files in 18-01/18-02's current `files_modified` lists (the Settings-side lock UI lives in `ProfileForm.tsx`/`app/api/profile/route.ts`, not touched by either plan). These need an explicit planning decision: fold into 18-01 as new tasks, or flag as a small precursor migration. See Open Questions.

**Primary recommendation:** treat the identity redesign as three separable, sequenceable pieces inside 18-01 — (a) auto-included, read-only party-1 row on both surfaces; (b) a new fast-add party path (new component or new `CollaboratorPicker` mode) with collapsed advanced info and a pending/confirmed indicator; (c) a read-time live-identity resolver used by the builder's edit-mode display. 18-02 needs no identity-redesign-specific work beyond what its existing plan already specifies — the pending/confirmed-status Locker requirement (P18-10 extension) is a pure derivation over already-shipped columns.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Auto-included initiator party-1 row | Browser/Client (SplitSheetBuilder initial state) | Frontend Server (myProfile prefill fetch, already SSR) | Purely a client-state seeding change fed by data the server component already fetches. |
| Fast collaborator-add (email/phone only) | Browser/Client (new picker UI) | API/Backend (`POST /api/collaborators`, relaxed validation) | New UI component; existing API route already accepts partial fields (only `name` is required server-side — see Common Pitfalls). |
| Live-linked identity resolution (§1) | API/Backend (read-time resolver / server component data fetch) | Database (join across `collaborators.claimed_by → artist_profiles`) | Must run server-side — `artist_profiles`' rights columns are private-by-column-grant (migration 040); only service-role or an ownership-checked route can read another user's row. |
| Legal-name lock (§2) | Frontend Server (Settings/ProfileForm) | Database (new lock column) | Not owned by 18-01/18-02's files — a genuine scope gap, see Open Questions. |
| Pending/confirmed collaborator status (§6) | Database (new `collaborators.status` or equivalent) | API/Backend (fast-add route sets it; claim/response flips it) | New persisted state, not derivable from existing columns. |
| Per-party sheet progress (pending/opened/signed) for the Locker (P18-10 extension) | API/Backend (`buildAttentionSections()`, pure derivation) | Database (already-shipped `approval_status` + `first_viewed_at`) | Zero new schema — a pure function over existing columns, matching `lib/contracts/locker-attention.ts`'s existing "no I/O" convention. |
| Recipient-side advanced info (§7) | Browser/Client (`/approve/[token]`, `SplitApprovalView.tsx`) | API/Backend (a new PATCH-like action on the approval token route) | Adjacent to 18-01's existing `app/approve/[token]/page.tsx` touch, but not currently mapped to any HOME-0x requirement — see Open Questions #1. |

## Standard Stack

No new external packages. This is entirely internal application code against the existing stack (Next.js 15 server components, Supabase, Zod-free hand validation matching the codebase's established sanitize-allowlist convention). No `npm install` is needed for either plan.

## Package Legitimacy Audit

Not applicable — no packages are installed by this research's recommendations.

## Architecture Patterns

### §1. `CollaboratorPicker.tsx` rewrite scope — the concrete answer to Open Question 1

**Confirmed current shape (read directly, 2026-07-22):**
- `components/collaborators/CollaboratorPicker.tsx` — a 244-line dropdown: fetches `GET /api/collaborators` on mount, groups Favorites/Recently Added/All, search-to-flat-list, and an "Add new collaborator" bottom action that opens the **full** `CollaboratorForm` inline (first name, last name, email, phone, PRO, IPI, publisher, MLC ID, SoundExchange ID, mailing address — `firstName`/`lastName` marked `required`). The dropdown panel is `min-w-[240px] max-w-[320px]` — confirmed cramped, matching 18-CONTEXT's note.
- **Two existing callers, not one:** `components/split-sheets/SplitSheetBuilder.tsx` (line 395) AND `components/vault/MetadataStudio.tsx` (line 750, inside `ComposerEditor`). The second caller is outside every document this phase's context references — it belongs to Wave 1/2 metadata credit entry, has nothing to do with split sheets, and has **zero automated test coverage** referencing either `CollaboratorPicker` or `ComposerEditor`.

**Why this matters:** the deliberation's fast-add flow (§4 — email/phone only, no name, collapsed advanced info) and the roster-management use case in `MetadataStudio` (full credit entry, presumably wants complete identity data up front) are different UX intents for the same underlying roster. Rewriting `CollaboratorPicker` in place to become "fast, minimal-fields-first" would degrade the `MetadataStudio` composer-credit flow, with no test to catch the regression.

**Recommendation (planner should pick one, both are viable):**
- **(a) Mode prop** — `CollaboratorPicker({ onSelect, mode = 'full' }: Props)`. `MetadataStudio` passes nothing (unchanged, defaults to `'full'`); `SplitSheetBuilder`'s party rows pass `mode="quick"`. The quick mode swaps the bottom "Add new collaborator" action from opening the full `CollaboratorForm` to a new, minimal fast-add sub-form (email/phone only + collapsed "Advanced information" disclosure) and adds a pending/confirmed badge next to roster entries whose `claimed_by` is null vs set (or the new `status` column, see Open Questions). The cramped-popup CSS (`max-w-[320px]`) fix benefits both modes and should be widened/repositioned regardless of which mode is active.
- **(b) Sibling component** — extract the roster-fetch-and-outside-click logic (lines 33–56 of the current file) into a small shared hook (e.g. `useCollaboratorRoster()`), leave `CollaboratorPicker.tsx` completely untouched for `MetadataStudio`, and build a new component (e.g. `components/split-sheets/PartyPicker.tsx`) for `SplitSheetBuilder` that reuses the hook but implements the fast-add UI natively. This has zero regression risk on `MetadataStudio` at the cost of some duplication.

Either way, **the planner must add or note the absence of a regression check for `MetadataStudio`'s `ComposerEditor` row** — there is no existing test to lean on, and the plan-checker should treat "does the metadata-credit picker still work" as a required manual verification step if 18-01 goes with option (a).

### §2. Live-linked identity — the concrete mechanism (Open Question 2)

**The two-table problem, confirmed by direct reads:**

| Table | Holds | Fed by | Read by |
|---|---|---|---|
| `artist_profiles` | `legal_first_name/middle/last_name/suffix`, `pro`, `ipi`, `publisher`, `administrator`, `contact_phone`, `mailing_address` (migrations 021, 040, 063) | `PATCH /api/profile` (`app/api/profile/route.ts`) — the Settings page's main form | `SplitSheetBuilder`'s `myProfile` prefill (`app/(artist)/split-sheets/page.tsx`, lines 32–46), `composeLegalNameFromProfile()` (`lib/split-sheets/agreement.ts`) |
| `user_profiles` | `pro`, `ipi`, `publisher`, `phone`, `mailing_address`, `display_name`, `bio` — **no legal name, no administrator** (migrations 026, 053) | `PATCH /api/user-profiles` — Settings page's separate "Rights Identity" sub-form (`ProfileForm.tsx`, saved independently) | `backfill_claimed_collaborators()` SQL function only |

`backfill_claimed_collaborators()` (called from `/api/user-profiles`'s PATCH, fire-and-forget) is additive (`COALESCE`) and writes into `collaborators` rows claimed by the user — but it can only ever propagate `pro`/`ipi`/`publisher`/`phone`/`mailing_address`, because that is all `user_profiles` has. It structurally **cannot** carry legal name or administrator, and `/api/profile` (the route that actually owns those fields) has no backfill call at all today.

**Recommendation — read-time resolver, not a new push-trigger:**

Build a pure resolver, e.g. `lib/split-sheets/live-identity.ts`, in the same "no I/O" style as `lib/split-sheets/redistribute.ts` and `lib/contracts/locker-attention.ts`:

```ts
export type LivePartyIdentitySource = {
  pro: string | null
  ipi: string | null
  publishing_designee: string | null
  administrator: string | null
  legal_name: string | null   // only meaningfully non-null for the initiator's own row
}

export function resolvePartyIdentity(
  frozenSnapshot: LivePartyIdentitySource,
  claimedProfile: LivePartyIdentitySource | null,  // from artist_profiles, joined via collaborators.claimed_by, null if unclaimed
  sheetStatus: SplitSheetStatus
): LivePartyIdentitySource {
  // Pre-esign_pending: claimedProfile (when present) wins outright — overwrite
  // semantics per deliberation §1, NOT the COALESCE convention
  // backfill_claimed_collaborators() uses. Post-esign_pending/executed: the
  // frozen snapshot always wins — the freeze boundary already blocks writes,
  // this function must not silently re-animate a signed document's identity.
}
```

The caller (server component / API route building the builder's edit-mode props, or the Locker's attention derivation if it ever needs to show live PRO) fetches `collaborators.claimed_by` for each party's `collaborator_id`, then a single batched `artist_profiles` read (service client, since `pro`/`administrator`/legal name columns are private-by-column-grant per migration 040) for any claimed users, and passes both into the resolver.

**Why pull, not push:** a push model (mirroring `backfill_claimed_collaborators()`, fired from a Settings PATCH) would require wiring a brand-new call into `app/api/profile/route.ts` (which has never called any backfill) with **overwrite** semantics distinct from every other backfill in the codebase, PLUS a query to find every non-frozen split sheet with a party claimed by this user — real write-amplification and a second code path to keep in sync with the freeze boundary. A read-time resolver needs no new route wiring at all; it only needs read access at the two places that display party identity pre-mint (18-01's builder edit-mode, and optionally 18-02's Locker if it ever surfaces a party's PRO). **The one place this doesn't reach for free is the actual PDF at mint time** (`app/api/split-sheets/[id]/mint-envelope/route.ts` reads `split_sheet_parties` columns directly to render the document) — for the live-link promise to hold at the moment of signing, mint-envelope needs a small addition to run the same resolver and write the resolved values into `split_sheet_parties` immediately before rendering. That is Phase 17 file territory (`mint-envelope/route.ts` isn't in 18-01/18-02's file lists) — **flagged as a cross-phase dependency**, not something 18-01/18-02 should silently skip, but also not something to build inside this replan's scope. Note it in the plan as a known follow-up.

**Consensus-reset interaction (P18-09):** `summarizePartyChanges()` (18-01 Task 1) must diff on the FROZEN snapshot fields it's given, not on live-resolved values — otherwise a party's own Settings edit (no consensus impact per P18-09) could spuriously appear as a "moved" split or a changed party in the diff. Concretely: whatever function assembles the "before" and "after" party sets for `summarizePartyChanges()` must pass the frozen `split_sheet_parties` row values, not the resolver's live-joined output.

### §3. Auto-included party 1 (§9) — the concrete correction to 18-01-PLAN.md

Today, `SplitSheetBuilder` starts `parties` as `useState<PartyRow[]>([])`, and the initiator becomes party 1 only via manually clicking `+ Add party` then `Use my info`. §9 requires this to happen automatically, with the legal name field **read-only** (not just prefilled) for that row.

This means:
- The initial-state seeding logic changes for BOTH create mode (`app/(artist)/split-sheets/new/page.tsx`, once 18-01 moves creation there) and edit mode (`/split-sheets/[id]`) — it is not gated behind the `existingSheet` prop 18-01-PLAN.md describes. **18-01-PLAN.md Task 3's line "Create mode behavior is byte-for-byte unchanged when the prop is absent" needs to be revised** — it is no longer an accurate constraint once §9 is built, because §9 changes what create mode's very first render looks like (party 1 present and locked, not an empty list).
- `PartyRow` needs a new discriminant (e.g. `isInitiator: boolean`, or `kind: 'self' | 'fastAdd' | 'full'`) so the render layer knows: (1) the initiator's own row shows a locked legal-name field and no remove control (or a disabled one — see Open Questions on whether the initiator can remove themselves), and no `CollaboratorPicker`/fast-add control (they aren't picking a collaborator, they ARE the party); (2) a fast-added row shows the minimal email/phone form with collapsed advanced info and a pending badge; (3) an existing/full row renders as today.
- The "Every party needs a legal name" validation in `saveSheet()` is shared, unconditional, client-side code today (`SplitSheetBuilder.tsx` line ~204) and blocks both create and edit paths. Per §4, it must relax specifically for parties whose `collaboratorId` is null / not yet responded — the requirement of a legal name should apply to the initiator's own row (satisfied automatically, since it's read-only-populated from Settings) and to any party who HAS supplied one, but not block on a freshly fast-added, not-yet-responded party. This is a shared-code change touching both surfaces, same as the point above.
- Server-side, no relaxation is needed — `POST`/`PATCH /api/split-sheets*` already only require `p.name` (not `legal_name`) per `sanitizeParty()`. `legal_name` has always been optional at the API layer; only the client-side check needs to change.

### §4. Locker per-party pending/opened/signed status (P18-10 extension) — zero new schema

CONTEXT.md's own preview text —

```
⚠ Awaiting signature (2 of 3 signed)
   ✓ You — signed
   ✓ Jamie — signed
   ○ Alex — invited, hasn't opened yet
```

— is **fully derivable today** from columns that already exist:
- `split_sheet_parties.approval_status` (`'pending' | 'approved' | 'countered'`, migration 018)
- `split_sheet_parties.first_viewed_at` (migration 062, already used by `isNudgeEligible()` in `lib/split-sheets/phase.ts`)

The three-state label maps directly:
- `approval_status === 'approved'` → "signed"
- `approval_status === 'pending' && first_viewed_at !== null` → "opened, hasn't signed"
- `approval_status === 'pending' && first_viewed_at === null` → "invited, hasn't opened yet"

This confirms 18-02-PLAN.md's existing Task 1 design (`buildAttentionSections()` "per-party progress — how many parties have acted... and each party's own state") already has everything it needs; no migration and no new column is required for this specific requirement. **Do not confuse this with deliberation §6's `collaborators.status` (pending/invited vs confirmed on the roster)** — that is a different, genuinely new piece of schema scoped to 18-01/CollaboratorPicker, not to the Locker.

### System diagram — where the redesign's pieces sit

```
Settings (ProfileForm.tsx)
   │  PATCH /api/profile ──────────────► artist_profiles
   │  (legal_name*, pro, ipi,             (the REAL identity source —
   │   publisher, administrator)           private columns, migration 040)
   │
   │  PATCH /api/user-profiles ─────────► user_profiles
   │  (pro, ipi, publisher, phone)         (narrower — feeds ONLY
   │        │                              backfill_claimed_collaborators(),
   │        └─ fires backfill (COALESCE)   COALESCE/additive)
   │                                            │
   │                                            ▼
   │                                      collaborators
   │                                      (claimed_by → auth.users.id)
   │
SplitSheetBuilder (create @ /split-sheets/new, edit @ /split-sheets/[id])
   │
   ├─ party 1 (self): read-only legal name + live pro/ipi/publisher/
   │  administrator ── sourced from artist_profiles via a NEW resolver
   │  (lib/split-sheets/live-identity.ts), NOT via user_profiles
   │
   ├─ fast-add party (§4): new minimal component/mode ── POST /api/collaborators
   │  (email/phone only; relaxed validation) ── new collaborators.status
   │
   └─ existing/full party rows: unchanged CollaboratorPicker 'full' behavior
        (also used, untouched, by MetadataStudio's ComposerEditor)

/approve/[token] (SplitApprovalView.tsx)
   └─ §7: optional "Advanced information" — recipient corrects own
        legal_name/pro/ipi/publisher/administrator ── flows back through
        the SAME resolver/overwrite path into collaborators + split_sheet_parties

mint-envelope/route.ts (Phase 17, NOT this replan's scope)
   └─ freeze point: whatever is in split_sheet_parties at mint time is what
      gets baked into the PDF forever. A future small addition should run
      the resolver here to make the live-link promise hold at signing time.
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Even/proportional split math | A new percentage-scaling routine | `evenSplit()` (`lib/split-sheets/approval.ts`) — already imported by the planned `redistribute.ts` | Single source of truth for the 100.000% invariant; don't recompute independently. |
| Name matching for change-summaries | A new fuzzy-matcher | The trim+lowercase discipline already in `normalizeName()` (`lib/split-sheets/reconciliation.ts`) | Same normalization the codebase already commits to elsewhere; note the function itself isn't exported, so replicate the exact algorithm (trim + `toLowerCase()`), don't invent a different one. |
| Party-lifecycle branching | Ad hoc status checks scattered in components | `resolvePartyPhase()` (`lib/split-sheets/phase.ts`) — already gains a `'preview'` branch in 18-01's plan | Centralizes the token-validity vs. lifecycle-phase distinction; UI components should never re-derive this. |
| Roster claim reconciliation | A brand-new claim mechanism for the redesign | The existing `claimed_by` chain (migration 026) — reused, not replaced, for §1's live-link source | The chain already exists end to end; the gap is only in WHICH table feeds it (see Architecture Patterns §2), not the chain itself. |
| Invite-status tracking | A new invite/response tracking table for §6 | Consider whether `collaborator_invites` (migration 018 — already has `pending`/`accepted`/`expired`) is close enough to extend, before adding a parallel `collaborators.status` column | It's a different table scoped to the educational-IPI-invite flow (`/api/collaborators/[id]/invite`), not literally the same concept, but the planner should evaluate reuse vs. new column rather than assuming a new column is required without checking. |

**Key insight:** almost everything this redesign needs already has a partial implementation somewhere in the codebase (split math, name normalization, phase resolution, claim reconciliation, invite tracking). The actual work is connecting existing pieces correctly — sourcing live identity from the right table, and not regressing the picker's other caller — more than building new primitives.

## Common Pitfalls

### Pitfall 1: Confusing `user_profiles` with `artist_profiles` as the live-link source
**What goes wrong:** building the live-link mechanism against `user_profiles` (as CONTEXT.md's chain literally names) silently fails to propagate legal name and administrator, because that table doesn't have those columns.
**Why it happens:** migration 026's comments and CONTEXT.md's canonical_refs both describe the claim/backfill chain ending at `user_profiles`, which was true for the original collaborator-reconciliation feature but was never extended when migration 021/063 added the actual rights-registry fields to `artist_profiles` instead.
**How to avoid:** any new live-link resolver reads `artist_profiles`, joined via `collaborators.claimed_by`, exactly as `app/(artist)/split-sheets/page.tsx` already does for the initiator's own `myProfile`.
**Warning signs:** a test or manual check where updating a collaborator's PRO in Settings updates their `collaborators` row's `pro` field but NOT their `legal_name` or `administrator` on any linked split sheet.

### Pitfall 2: Rewriting `CollaboratorPicker.tsx` in place breaks `MetadataStudio`
**What goes wrong:** the fast, minimal-fields-first behavior needed for split-sheet parties (§4) is the opposite UX intent of `MetadataStudio`'s composer-credit entry, which shares the exact same component.
**Why it happens:** CONTEXT.md's own framing ("one component, one rewrite") only reasoned about the two split-sheet touch points and never checked for other callers.
**How to avoid:** grep for `CollaboratorPicker` usage before editing; use a mode prop or a sibling component (Architecture Patterns §1).
**Warning signs:** no existing test protects this — treat any change to the shared component as requiring an explicit manual check of `MetadataStudio`'s composer row, not just the split-sheet builder.

### Pitfall 3: `collaborators.name` and `split_sheet_parties.name` are both `NOT NULL`
**What goes wrong:** a fast-add flow that supplies only email/phone cannot satisfy the DB's `NOT NULL` constraint on `name` unless something is written there.
**Why it happens:** migration 018 predates the fast-add concept; `name` was always assumed to be supplied at creation time.
**How to avoid:** populate `name` with the email (or phone, if no email) as a placeholder distinct from `legal_name` (which stays empty until the party or initiator supplies it), consistent with how `SplitSheetBuilder`'s existing fallback already works (`p.professionalName.trim() || p.legalName.trim()` — the same "something displayable, even if not the legal identity" pattern extends naturally to "email as a last-resort placeholder").
**Warning signs:** a fast-added party with no name renders as a blank row anywhere in the UI, or an insert fails with a NOT NULL violation.

### Pitfall 4: Shared client validation silently changes create-mode behavior
**What goes wrong:** relaxing "Every party needs a legal name" and auto-seeding party 1 both touch `SplitSheetBuilder`'s shared logic; a plan that assumes these changes are edit-mode-only (because they're motivated by the "living draft" use case) will actually change what a brand-new sheet's create flow does on first render.
**Why it happens:** 18-01-PLAN.md was drafted before the identity redesign existed, when the builder's only job was create-mode; extending it to edit mode via an optional prop was a clean mental model that the identity redesign doesn't fit as cleanly, because §9 isn't conditional on edit vs. create.
**How to avoid:** treat §9's auto-party-1 and §4's validation relaxation as changes to the builder's baseline behavior, verified in BOTH create and edit contexts, not as edit-mode additions layered onto an unchanged create path.
**Warning signs:** a test suite that only exercises the new edit-mode path and never re-verifies that creating a brand-new sheet still produces a valid, single-party (self), 100%-split draft on load.

### Pitfall 5: Overwrite semantics leaking into the wrong function
**What goes wrong:** if the live-link resolver's overwrite behavior gets implemented by modifying `backfill_claimed_collaborators()` in place (which is COALESCE/additive and used by an unrelated, still-shipping mechanism), it silently changes behavior for every existing caller of that function, defeating the additive guarantee documented in migration 026 (D-09).
**Why it happens:** the deliberation explicitly says "modeled directly on the existing `backfill_claimed_collaborators()`" — easy to read as "modify it" rather than "write a new function shaped like it."
**How to avoid:** the new mechanism must be a distinct function (or distinct resolver logic, per the read-time recommendation above), never a mutation of the existing additive one.
**Warning signs:** a diff that touches migration 026's SQL function body, or `app/api/user-profiles/route.ts`'s existing backfill call.

## Code Examples

### Existing `myProfile` prefill pattern (the model for the live-identity resolver's data source)
```typescript
// Source: app/(artist)/split-sheets/page.tsx (read 2026-07-22)
const service = createServiceClient()
const { data: myProfileRow } = await service
  .from('artist_profiles')
  .select('artist_name, pro, publisher, administrator, legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix')
  .eq('id', user.id)
  .maybeSingle()

const myProfile: MyProfilePrefill | null = myProfileRow
  ? {
      legalName: composeLegalNameFromProfile(myProfileRow),
      artistName: myProfileRow.artist_name ?? '',
      pro: myProfileRow.pro ?? '',
      publishingDesignee: myProfileRow.publisher ?? '',
      administrator: myProfileRow.administrator ?? '',
    }
  : null
```
The same shape, generalized to accept an arbitrary `user_id` (not just the session user), is what a live-identity resolver's data-fetch side needs for any CLAIMED party, not only the initiator.

### Existing per-party progress inputs (already sufficient for P18-10's extension)
```typescript
// Source: lib/split-sheets/phase.ts (read 2026-07-22) — first_viewed_at already exists
export function isNudgeEligible({ firstViewedAt, approvalStatus, nowIso }: NudgeEligibilityInput): boolean {
  if (!firstViewedAt) return false
  if (approvalStatus !== 'pending') return false
  // ...
}
```
The Locker's "invited, hasn't opened yet" vs "opened, hasn't signed" vs "signed" three-state label is the same two inputs (`approval_status`, `first_viewed_at`) recombined into a display label, not a nudge-eligibility boolean.

## State of the Art

| Old Approach (as 18-01/18-02-PLAN.md were drafted 2026-07-20) | Current/Required Approach (post-2026-07-21 redesign) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `CollaboratorPicker` rendered unchanged on every party row in edit mode | A redesigned fast-add path (new mode/component), collapsed advanced info, pending/confirmed indicator | 2026-07-21 deliberation | 18-01 Task 3's collaborator-picker line is stale and must be rewritten, not executed as drafted. |
| Initiator manually adds themselves as party 1 via "+ Add party" → "Use my info" | Initiator is auto-included as party 1, legal name read-only, identity live-linked | 2026-07-21 deliberation (§9) | Touches `SplitSheetBuilder`'s shared initial-state logic in BOTH create and edit modes — not edit-mode-only as 18-01 assumed. |
| "Awaiting signature" progress language, generic acted/not-acted | 3-state pending/opened/signed per party | 2026-07-21 (P18-10 extension) | Zero schema change — already derivable from existing `approval_status` + `first_viewed_at`. |
| Party identity frozen at creation (D-19, migration 018 comment) | Frozen for unclaimed parties; live-linked for claimed Funūn-user parties until `esign_pending` | 2026-07-21 deliberation (§1) | Requires a new read-time resolver; the freeze boundary (`lib/split-sheets/lifecycle.ts`) is unchanged and remains the actual enforcement point once minted. |

**Deprecated/outdated:** the assumption in migration 018's own comment ("email/name are intentionally frozen at creation... legal documents should not change under collaborator edits") is now a partial truth — it still holds for UNCLAIMED parties and for anything past `esign_pending`, but no longer holds unconditionally pre-mint for claimed Funūn-user parties. Don't read that comment as still fully authoritative without this caveat.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Respond" in deliberation §6 ("pending/invited until they respond, flipping to confirmed once they do") means either signing up with a matching email OR taking some action tied to the specific invite (approving, filling in §7 advanced info) — the exact trigger for pending→confirmed is not pinned down in the deliberation itself. | Architecture Patterns §4 note, Open Questions | If the planner picks the wrong trigger, the roster's pending/confirmed badge could read as permanently stuck or flip prematurely. Needs a planning-time decision, not an assumption to build against silently. |
| A2 | A brand-new `collaborators.status` column (rather than deriving pending/confirmed from `claimed_by IS NULL`) is the correct implementation, because `claimed_by` only reflects account signup, not response to a specific invite. | Architecture Patterns §1, Don't Hand-Roll | If `claimed_by IS NOT NULL` is actually an acceptable proxy for "confirmed" (i.e. the product intent is really just "have they signed up," not "have they responded to this particular ask"), a new column is unnecessary schema churn. |
| A3 | The Settings-side legal-name "confirm and lock" UI (§2) is genuinely out of scope for 18-01/18-02's file lists and needs either a new task folded into 18-01 or an explicit deferral note — it is not implicitly covered by anything already planned. | Summary point 4, Open Questions | If the planner assumes this is handled elsewhere, the initiator's legal name field may ship read-only with no way for a first-time user to ever set/lock it, blocking split-sheet creation entirely for new users. |
| A4 | The mint-envelope route's live-identity write-back (a small addition needed for the freeze boundary to actually capture live-linked data at signing time) is Phase 17 territory and should be noted as a follow-up rather than built inside 18-01/18-02. | Architecture Patterns §2 | If nobody ever builds this follow-up, the live-link promise (§1) silently degrades to "live until whenever the party row was last touched," not "live until mint," for any sheet that goes to signature without an intervening edit. |

**All four assumptions above should be surfaced to the planner as explicit decisions to make, not silently resolved by this document** — they were genuinely underdetermined by the source materials (deliberation doc + CONTEXT.md) and depend on product judgment calls this research is not positioned to make unilaterally.

## Open Questions

1. **Where does §7 (recipient-side advanced info on `/approve/[token]`) actually get built, and under which requirement ID?**
   - What we know: 18-01 already touches `app/approve/[token]/page.tsx` and `components/split-sheets/SplitApprovalView.tsx` for HOME-04's read-only preview branch. §7 is declared in-scope for Phase 18 overall.
   - What's unclear: none of HOME-01..05's text explicitly names "recipient corrects their own identity data." It's not clearly any single plan's requirement today.
   - Recommendation: fold it into 18-01 as an addition to the same files it already touches (natural adjacency to the preview-phase work), and flag it to the planner as needing either a requirement-ID amendment or an explicit note that it's covered under HOME-04/HOME-05's existing text.

2. **Does the initiator's auto-included party-1 row ever get removed/replaced, or is it permanently pinned?**
   - What we know: §9 says the initiator is "party 1 automatically" with no manual add-yourself step.
   - What's unclear: whether the UI should disable the remove control on that row, or whether removing it is a legitimate (if unusual) action — and if allowed, whether `redistribute()`'s "zero-total returns even distribution" fallback is the intended behavior for a 1-party sheet dropping to 0.
   - Recommendation: default to disabling removal of the initiator's own row (simplest, matches "you are always party 1" framing) unless the planner has a concrete reason a solo-initiator split sheet needs to exclude them.

3. **Trigger for `collaborators.status` pending→confirmed (Assumption A1).**
   - Recommendation: pin this down explicitly during planning — likely candidates are (a) `claimed_by` becomes non-null (signup), (b) the party's `approval_status` on ANY sheet becomes non-pending, (c) they submit anything via §7's advanced info. Any of the three is defensible; the plan should state which one(s) apply rather than leaving it implicit in code.

4. **Legal-name lock storage (Assumption A3) — new column or existing convention?**
   - Recommendation: a single nullable `artist_profiles.legal_name_locked_at TIMESTAMPTZ` (next available migration number is 066), following the exact pattern of `artist_profiles.claimed_at` (migration 026) and `artist_profiles.verified_at` (migration 040-era) — both are "null until an event happens" sentinel timestamps already established in this table. This keeps the lock check a simple `IS NOT NULL` test, consistent with existing conventions, rather than inventing a new boolean-flag pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (ts-jest, transpile-only) + `@testing-library`-free component conventions already used across `lib/split-sheets/*.test.ts` |
| Config file | `jest.config.js` (root) |
| Quick run command | `npx jest lib/split-sheets/live-identity.test.ts lib/split-sheets/redistribute.test.ts lib/split-sheets/change-summary.test.ts lib/split-sheets/phase.test.ts` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map (18-01/18-02 subset)
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOME-02/HOME-03 (§9 auto party-1) | A newly-mounted `SplitSheetBuilder` (create AND edit) starts with the initiator's own row present, read-only legal name, live PRO/IPI | unit + manual | `npx jest components/split-sheets` (new test file needed) | ❌ Wave 0 — no `SplitSheetBuilder` test exists today |
| HOME-03 (§1 live-link resolver) | Overwrite semantics pre-mint; frozen values post-`esign_pending` | unit | `npx jest lib/split-sheets/live-identity.test.ts` | ❌ Wave 0 — new module |
| HOME-03 (§4 fast-add) | A party added with only email/phone saves without a legal-name error; `name` placeholder satisfies NOT NULL | unit + manual | new test alongside whichever component implements fast-add | ❌ Wave 0 |
| HOME-05 (P18-09 identity update ≠ consensus reset) | `summarizePartyChanges()` produces no record for a party whose PRO/IPI changed via live-link but whose split/membership didn't | unit | `npx jest lib/split-sheets/change-summary.test.ts` (18-01's own planned file — add this case) | ✅ planned in 18-01 already, needs this specific case added |
| HOME-06 (P18-10 pending/opened/signed) | Three-state label derives correctly from `approval_status` + `first_viewed_at` combinations | unit | `npx jest lib/contracts/locker-attention.test.ts` (18-02's own planned file) | ✅ planned in 18-02 already, needs this specific case added |

### Sampling Rate
- **Per task commit:** the quick-run command above.
- **Per wave merge:** `npx jest`.
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `lib/split-sheets/live-identity.test.ts` — new resolver module, no prior coverage.
- [ ] A component-level test (or at minimum a documented manual-check) for `SplitSheetBuilder`'s auto-seeded party-1 row — none exists today for this component at all.
- [ ] A regression check (automated or manual) for `MetadataStudio`'s `ComposerEditor` row after any `CollaboratorPicker` change — no existing test references either component.
- [ ] `change-summary.test.ts` and `locker-attention.test.ts` (both already planned in 18-01/18-02) need one additional case each: live-identity-only updates must NOT appear as a change/reset trigger.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged — session-based via Supabase auth, no new auth surface. |
| V3 Session Management | no | Unchanged. |
| V4 Access Control | yes | The live-identity resolver reads another user's `artist_profiles` row (private-by-column-grant, migration 040) — must go through `createServiceClient()` with the read scoped by a server-verified `collaborator.claimed_by` value, never a client-supplied user id. Mirrors the exact pattern `app/(artist)/split-sheets/page.tsx` already uses for the session user's own row. |
| V5 Input Validation | yes | Fast-add's relaxed validation must still reject a party with neither email nor phone (§4 requires "only email or phone," not "nothing"); server-side `sanitizeParty`/`sanitizeCollaborator` allowlists are the existing enforcement point and should gain no new unvalidated fields. |
| V6 Cryptography | no | No new crypto surface — approval tokens are unchanged (`generateApprovalToken()`, existing 256-bit entropy). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Live-identity resolver leaking a claimed user's private `artist_profiles` data to an unauthorized viewer | Information Disclosure | Resolver must only be invoked server-side, for parties actually named on a sheet the caller is authorized to view (initiator or account-holding party) — reuse the exact authorization check 18-01-PLAN.md already specifies for `/split-sheets/[id]`. |
| Overwrite-semantics identity update applied to the WRONG collaborator/party row (mass-assignment via a batched update) | Tampering | Scope every write strictly by `claimed_by = <verified user id>`, never by a client-supplied party or collaborator id — mirrors migration 026's existing `claim_collaborators()` scoping discipline. |
| Fast-add party's placeholder `name` (email/phone) leaking into a rendered legal document before the real legal name is ever supplied | Information Disclosure / Tampering (wrong data on a legal instrument) | The freeze boundary already blocks minting on drafts with unresolved identity gaps only insofar as `validateApprovalTotal` and the "legal name required to mint" checks hold — confirm whether `mint-envelope`'s existing legal-name requirement (if any) correctly still blocks a fast-added, not-yet-responded party from being minted with only a placeholder name. This is a Phase 17 file but the risk originates from 18-01's relaxed validation, so it must be checked, not assumed safe. |
| `CollaboratorPicker` mode-prop change accidentally exposing fast-add fields (email/phone-only save) to `MetadataStudio`'s composer-credit flow, which expects full identity capture | Tampering (wrong data model for the calling context) | The mode prop (or sibling-component split) must default to the FULL behav0r when unspecified, so `MetadataStudio`'s existing call site is provably unaffected without needing to be edited at all. |

## Sources

### Primary (HIGH confidence — direct codebase reads, 2026-07-22)
- `.planning/phases/18-split-sheet-home/18-CONTEXT.md`, `.planning/deliberations/split-sheet-identity-and-collaborator-model.md`, `.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md`, `.planning/phases/18-split-sheet-home/18-01-PLAN.md`, `18-02-PLAN.md`, `18-DISCUSSION-LOG.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- `components/collaborators/CollaboratorPicker.tsx`, `CollaboratorForm.tsx`, `CollaboratorCard.tsx`
- `components/split-sheets/SplitSheetBuilder.tsx`, `SplitApprovalView.tsx`
- `components/vault/MetadataStudio.tsx` (grep-confirmed second `CollaboratorPicker` caller)
- `lib/collaborators/index.ts`, `lib/split-sheets/lifecycle.ts`, `phase.ts`, `approval.ts`, `reconciliation.ts`, `agreement.ts`
- `lib/profile/load.ts`, `app/api/profile/route.ts`, `app/api/user-profiles/route.ts`, `app/(artist)/settings/page.tsx`, `app/(artist)/split-sheets/page.tsx`
- `app/api/split-sheets/route.ts`, `[id]/route.ts`, `[id]/mint-envelope/route.ts`, `app/api/collaborators/route.ts`, `[id]/invite/route.ts`
- `supabase/migrations/018_collaborators_split_sheets.sql`, `021_artist_profile_legal_contact_roles.sql`, `026_collaborator_identity_reconciliation.sql`, `040_artist_profiles_column_privileges.sql`, `053_restore_user_profiles_table.sql`, `062_split_sheet_esign_envelopes.sql`, `063_split_sheet_legal_grade.sql`
- `.claude/CLAUDE.md`, `.planning/config.json`

No web search or external documentation lookup was needed or used — this research is entirely a targeted internal codebase investigation, consistent with the objective's "targeted replan, not from-scratch research" framing.

## Metadata

**Confidence breakdown:**
- Two-table identity architecture finding (artist_profiles vs. user_profiles): HIGH — confirmed by direct reads of every relevant migration and route.
- `CollaboratorPicker` third-caller finding: HIGH — confirmed by grep across the full non-node_modules tree.
- Exact trigger for `collaborators.status` pending→confirmed: LOW — genuinely underdetermined by source documents, flagged as Assumption A1/Open Question 3.
- Recommendation to use a read-time resolver over a push/trigger model: MEDIUM-HIGH — grounded in codebase conventions (multiple existing pure/no-I/O modules) and in the concrete gap that the push model's natural trigger point (`/api/profile`) doesn't yet call any backfill, but this is a design recommendation, not a discovered fact — the planner should treat it as the default unless there's a reason favoring the push model.

**Research date:** 2026-07-22
**Valid until:** this is tightly coupled to the current state of `SplitSheetBuilder.tsx`, `CollaboratorPicker.tsx`, and the identity migrations — re-verify file line references if 18-01/18-02 execution is delayed materially past this date or if any quick task touches these files in the interim.
