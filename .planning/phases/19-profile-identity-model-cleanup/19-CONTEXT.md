# Phase 19: Profile & Identity Model Cleanup - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Delete the duplicate `user_profiles` table so there is **one canonical account profile** (`artist_profiles`) reaching split sheets, re-point both DB readers, and build the collaborator-becomes-user reconciliation UX: a confirmable profile pre-fill on claim, a flag-for-fix path for wrong identity on frozen sheets, and a licensee note on split-sheet documents. The `artist_profiles`→`user_profiles` rename is **Phase 20**, not this phase.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `19-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `19-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Delete the duplicate `user_profiles`; single canonical rights input in Settings; re-point **both** `claim_collaborators()` and `backfill_claimed_collaborators()` to `artist_profiles` (R1)
- Semantic-blank data-rescue migration (rights + `phone`→`contact_phone` + `display_name`/`bio`) before drop, with pre/post counts (R1)
- Confirmable reverse pre-fill of a new user's profile on claim, idempotent + provenance-tracked (R2)
- Preserve the existing claimed-collaborator live-link + `esign_pending`/`executed` freeze boundary (R3)
- Flag-for-fix path for a claimed user's own identity on frozen sheets, executed→amendment-only (R4)
- "Note to licensees" on newly-generated split-sheet PDFs (R5)

**Out of scope (from SPEC.md):**
- The relation rename `artist_profiles`→`user_profiles` — **Phase 20** (R1 here frees the name as its prerequisite)
- `industry_profiles` vs `member_type='industry'` reconciliation
- Tier-2 live "current payee snapshot" at sync/license time
- `curators` table
- Ownership/`split_percentage`/`role` semantics, the approval/counter/e-sign flow, or the freeze boundary itself
- Regenerating/altering any already-executed PDF/Certificate
- The email-mismatch claiming limitation
- Songtrust / PRO / MLC / SoundExchange API integrations

</spec_lock>

<decisions>
## Implementation Decisions

### Claim pre-fill confirmation (R2)
- **D-01:** Confirmation surface = **Settings, reusing Phase 18's legal-name confirm-and-lock pattern** — pre-filled fields render in an "unconfirmed — review" state, with a gentle first-login nudge pointing there. No new modal or onboarding-step flow.
- **D-02:** **Per-field** confirm/edit (matches the legal-name lock granularity) — the user can fix one wrong value without rejecting the rest.
- **D-03:** Provenance is **named** — e.g. "We filled this from a credit Maya added you to," where the name is **the person who added you** (the `collaborators.user_id` owner's display name), NOT the song (owner decision 2026-07-24). Not a new disclosure: a claimed user can already see the sheets they're credited on.
- **D-04:** Pre-filled values are **live-but-flagged** — they populate the profile immediately (so a new split sheet isn't blank) but carry an "unconfirmed" flag until reviewed. Confirming clears the flag; the flag never gates the value out of the user's own new drafts. (Consistent with SPEC R2's "never present as authoritative without the confirm step" — the flag IS the not-yet-owned marker.)

### Correction flag flow (R4)
- **D-05:** Flag entry point = the **Contract Locker credit view** (Phase 18 per-party view) — a "this info is wrong" action on the claimed user's own row, on a frozen (`esign_pending`/`executed`) sheet.
- **D-06:** Owner notified via **both** the Phase 10 in-app notification bell **and** email (Resend).
- **D-07:** Flag payload is a **structured field + suggested value** (P18-13 — no free-text channel).
- **D-08:** **Guided apply** — the notification deep-links to the sheet with the suggested change staged and the correct next step: **void-first** for `esign_pending`; for `executed`, a **guided pointer to start a correction** (a first-class amendment mechanism — lineage/re-sign — is **deferred to a follow-up phase**, owner decision 2026-07-24). Never mutates the signed document or regenerates the PDF/Certificate.

### Licensee note (R5)
- **D-09:** Placement = a **boxed callout beside the parties/rights block** on the split-sheet PDF (where the stale-able payee info is).
- **D-10:** Wording = the **full version** (working draft, pending counsel) — verbatim in Specific Ideas.
- **D-11:** Surfaces = the note appears on the **generated PDF AND the read-only share/export views** (travels with the record wherever a recipient sees it).

### Settings rights section (R1)
- **D-12:** Keep the "Rights & Royalties" section; **add one help line** — "Used on your split sheets, metadata, and registrations." No regroup of the contact fields into a new section.

### Claude's Discretion
- Exact "unconfirmed" badge styling, the Locker "this is wrong" affordance placement, R4 notification copy, and the R1 rescue migration's verification/log surface — follow existing patterns; not user-facing decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements
- `.planning/phases/19-profile-identity-model-cleanup/19-SPEC.md` — the 5 locked requirements, boundaries, acceptance criteria, Edge Coverage, and Prohibitions. MUST read before planning. Twice Codex-verified.

### Split-sheet design source
- `.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md` — split-sheet data model, Contract Locker IA, per-party access, and the block-exception / structured-actions (P18-13) rules that constrain R4's flag surface.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 18 legal-name confirm-and-lock** (Settings + `artist_profiles.legal_name_locked_at`, migration 066) — the exact pattern R2's per-field pre-fill confirm should mirror (D-01/D-02).
- **`resolvePartyIdentity`** (`lib/split-sheets/live-identity.ts`) + the claimed-party batch loader (`app/(artist)/split-sheets/[id]/page.tsx:137-197`) — R3 preserves this as-is; only its `artist_profiles` read is affected (and only cosmetically by Phase 20's rename). The initiator self-row is a SEPARATE current-profile path (`page.tsx:113-133`), not the resolver.
- **Contract Locker per-party view** (Phase 18, `components/contracts/ContractLocker.tsx`) — R4's flag entry surface (D-05).
- **Phase 10 notification bell + Resend email** — R4's dual notification (D-06).
- **Split-sheet PDF renderer** (`lib/vault/pdf/split-sheet.*`) — R5's boxed callout is added here (D-09/D-11).
- **`claim_collaborators()` (051) + `backfill_claimed_collaborators()` (026)** — BOTH re-pointed to `artist_profiles` in R1; the claim path is also where R2's reverse pre-fill hooks in.
- **`ProfileForm.tsx` "Rights & Royalties" section + `/api/profile`** — the single surviving rights write target (R1/D-12).

### Established Patterns
- **Live-linked identity, overwrite-pre-mint / frozen at `esign_pending`+`executed`** (`live-identity.ts`) — the freeze boundary R3 must not move; R4's "frozen sheet" = exactly these two statuses.
- **Structured actions, no free-text channel** (P18-13) — governs R4's flag payload (D-07).
- **Human-gated migrations** — every schema change (R1 rescue, drop, re-point) is a NEW migration Pete pushes via Codex (071+); executors never run `supabase db push`. Historical migrations are immutable.
- **Semantic-blank rescue** — NULL / trimmed-empty text / empty-JSON `{}`, canonical-wins, `phone`→`contact_phone`, `display_name`→`artist_name`, `bio`→`bio` (SPEC R1).

### Integration Points
- `/api/profile` → `artist_profiles` becomes the sole rights write path (remove `/api/user-profiles` rights writes + the "Rights Identity" section).
- The middleware `/api/claim-collaborators` route (`claimed_at`-guarded) is where R2's confirmable pre-fill runs — idempotent, never re-overwrites confirmed/edited values.
- Lifecycle routes (send-for-approval / mint / void / webhook completion) own status transitions; R4's guided apply routes INTO void/amendment, never bypasses them.

</code_context>

<specifics>
## Specific Ideas

**Licensee note — full wording (D-10, working draft pending counsel), verbatim:**
> "Ownership shares in this split sheet are fixed as of the date signed. A songwriter's PRO, publisher, or administrator may change over time — before licensing this work or remitting payment, confirm each writer's current affiliation and payee details with the writer or via their PRO / the MLC. Funūn provides this record but does not warrant the current accuracy of contact or payment information."

**Settings rights help line (D-12), verbatim:**
> "Used on your split sheets, metadata, and registrations."

**Pre-fill provenance phrasing (D-03), pattern:**
> "We filled this from a credit [the person who added you — the `collaborators.user_id` owner's display name] added you to."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The rename is already carved into Phase 20; Tier-2 payee snapshot and `industry_profiles` reconciliation are recorded as out-of-scope in the SPEC.)

</deferred>

---

*Phase: 19-profile-identity-model-cleanup*
*Context gathered: 2026-07-23*
