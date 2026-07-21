# Deliberation: Split-Sheet Identity, Collaborators & Groups Model

**Opened:** 2026-07-21 by Pete, during the Phase 17 live signing checkpoint
**Status:** DECIDED — full shape agreed across 8 numbered questions plus the originating design points. Not yet scoped into a phase plan — this is a decision record, ready to feed real planning.
**Scope estimate:** larger than a Phase 18 amendment. Genuinely comparable in size to standing up Collaborators itself, mainly because of the Groups feature (§3) and the live-link reconciliation engine (§1). Recommend its own dedicated planning pass rather than folding into an existing phase.

---

## Why this exists

While running Phase 17's live signing checkpoint, Pete hit what looked like a bug: adding a second party to a split sheet appeared to corrupt the first party's data instead of creating a new row. A live, step-by-step reproduction (see "Originating bug" at the bottom) later confirmed the underlying state logic is correct — the real cause was confusion from the current flow itself, and is resolved by this redesign rather than needing a separate fix. Investigating it surfaced a much bigger question: the split-sheet builder asks every user — initiator and collaborator alike — to manually re-type identity data (legal name, PRO, IPI, publisher, administrator) that, for a Funūn user, already exists in their own Settings. That observation grew into a full redesign of how identity flows through split sheets, collaborators, and a new Groups concept. This document is the full, decided shape of that redesign.

**Relationship to the earlier-captured gap:** `esign-split-sheet-economics.md`'s 2026-07-21 entry ("recipient has no self-correction path") is **superseded by §7 of this document**. That entry should be marked resolved-by-reference once this deliberation is scoped into a real plan.

---

## 1. Live-linked identity for Funūn-user parties

**Decision:** for any split-sheet party who is a Funūn user, their identity fields (PRO, IPI, publishing designee, administrator) stay **live-linked to their account** — resolved from current data — right up until the sheet is minted for signature (`esign_pending`). Nothing freezes before that. Once minted, the **existing freeze boundary** (`lib/split-sheets/lifecycle.ts`) already blocks further writes — no new snapshot mechanism is needed; the freeze boundary IS the snapshot moment, for free.

**Why:** a wrong or stale PRO/IPI shouldn't sit uncorrected on a pending legal document just because it was typed in weeks ago. If the real, current value is one Settings save away, the pending sheet should reflect it.

**Implementation shape:** the linking chain already exists in full — `split_sheet_parties.collaborator_id → collaborators.id → collaborators.claimed_by → auth.users.id → user_profiles`. This is the exact chain migration 026 built for collaborator reconciliation. What's needed is a new function, modeled directly on the existing `backfill_claimed_collaborators()`, called from the same Settings-PATCH trigger point, that additionally updates any linked party's row on any **pre-`esign_pending`** split sheet.

**Deliberate departure from existing convention — OVERWRITE, not additive:** migration 026's existing backfill is additive-only (`COALESCE(existing, new)` — never overwrites a populated field), specifically so one person's data entry can't silently clobber another's. This new mechanism is different on purpose: it's the person's **own verified identity correcting itself**, not one person's data being overwritten by someone else's, so a real update should **win outright**, replacing whatever was there. This is a genuine, intentional divergence from the existing pattern — not an inconsistency to be "fixed" later.

---

## 2. Legal-name locking

**Decision: Option A** — a one-time "confirm and lock" step in Settings. The user types their legal name once, confirms it, and it becomes locked (editable only by deliberately returning to Settings). **No automated/external verification** against PRO records.

**Why not automated verification:** investigated and rejected as impractical right now. No major US PRO (ASCAP, BMI, SESAC) exposes a public API for identity/IPI matching — their public tools are song-repertoire search, not identity verification. Building real cross-referencing would require a formal, negotiated data-sharing relationship per PRO (legal, likely fees, a vetting process) — a business-development undertaking, not an engineering task. Even with such a relationship, matching would be inherently fuzzy (name variants, diacritics) and would require an ongoing **human-review function Funūn does not have and would need to fund** — a second, independent reason to avoid it beyond the data-access problem alone.

**Future idea, captured separately and NOT active:** `.planning/research/PRO-MLC-identity-verification-api.md` records the shape of a possible future PRO/MLC data-relationship pitch — Pete has a real MLC contact — for if/when this becomes worth pursuing. This document's decision (Option A, self-attested) stands regardless of whether that relationship ever materializes.

---

## 3. Groups (new feature)

**Decision: full structured Groups**, not just a flat list of alternate names. A group is a real entity with real, time-bounded membership — because band lineups change, and a song written while someone was a member should still credit them after they leave, while a song written after they left should not.

**Schema shape:** a `groups` table (id, name, creator, created_at) and a `group_members` join table (group_id, member reference, `joined_at`, `left_at`).

**3a. Group creation & membership — hybrid/unilateral (§4):** the creator can add anyone to a group immediately, with **no upfront acceptance required**. The added member gets notified and can **leave at any time** — removal/leaving is the safety valve, not an upfront consent gate. This matches the "fast for the person creating things, safe because nothing's locked in" principle running through the whole rest of this design.

**3b. Mixed membership (§5):** a group can include both real Funūn accounts and non-Funūn people (name/email only), using the **same claim-on-signup reconciliation** collaborators already use (migration 026's `claim_collaborators()`, extended to cover group membership).

**3c. No independent rights identity for the group itself (§6):** a group does **not** get its own PRO/IPI/publisher fields right now. Reasoning: a split sheet legally requires individual attribution — it can never credit "the band" with one lump percentage the way it credits a person, so nothing in split sheets would ever read group-level rights data anyway. On a split sheet, a group affiliation displays exactly like a personal stage name: one individual's row, shown as "Legal Name, p/k/a member of [Group Name]." Building unused PRO/IPI fields for the group now would be speculative complexity with no near-term driver. **This is a strict subset of the fuller model** — adding group-level rights fields later, if a real use case emerges (e.g., a joint-publishing-entity document type), is a clean additive migration, not a rework.

**3d. Alternate names generally (§3, resolved before the groups-vs-flat-list question):** whether a personal stage name or a group affiliation, a **per-sheet override gets saved permanently** into the person's list of alternates afterward — with **the ability to remove it later** if it's no longer used. Nothing in this identity model is ever permanently locked in except the legal name itself (§2).

---

## 4. Fast collaborator-add (the initiator's side)

**Decision:** adding a new (not-yet-in-roster) party should require **only an email or phone number** from the initiator — not their legal name, PRO, IPI, publisher, or administrator. Those get filled in by the collaborator themselves.

**UI shape:** the visible, default fields are minimal. An **"Advanced information" section, collapsed by default**, lets the initiator optionally supply more (full name, the other contact method) as a courtesy if they happen to know it — never required.

**Required change to existing validation:** today, submit-time validation requires `'Every party needs a legal name.'` for every party before a sheet can be sent. This needs to relax specifically for parties who aren't yet linked to a Funūn account/collaborator record — split % and an email/phone are the only hard requirements for them.

---

## 5. SMS delivery — sequencing confirmed safe

**Decision:** start with the **small build**: the collaborator receives the identical `/approve/{token}` link, just delivered via SMS instead of email. The signing experience itself doesn't change at all — this is purely a second delivery channel (an SMS-sending provider, e.g. Twilio, added alongside the existing Resend email integration), not a new interaction model.

**Confirmed non-wasteful to sequence this way:** the small version touches only the invite/delivery layer (a new `sendSignatureInviteSMS()`-shaped function sitting beside 17-10's existing `sendSignatureInvite()`) — it doesn't touch `split_sheet_parties`, the mint route, the webhook, or DocuSeal integration at all. A later, richer build — phone-number verification, native reply-to-approve via text, full carrier registration — is purely additive on top; nothing built now needs to be reworked.

**Honest caveat, recorded so it isn't a surprise later:** carrier compliance (10DLC registration, TCPA consent language) is likely required even for the **small** version once used at real volume in the US — it's tied to sending business SMS at all, not to how sophisticated the interaction model is. Don't assume the small version defers all compliance work.

**Also implied:** phone number becomes a first-class contact field, not just a courtesy fallback — some collaborators may have no email on file at all, and the invite path needs to work from phone alone.

---

## 6. Auto-collaborator creation — blended, status-based

**Decision:** adding a party via the fast path (§4) **immediately creates a `collaborators` row** for them, even with just an email — but marked with a **status**: `pending/invited` until they respond, flipping to `confirmed` once they do.

**Why blended, not one or the other:**
- **Immediate creation's real value isn't convenience, it's that reconciliation starts working right away.** `claim_collaborators()` fires on signup regardless of what triggered the row's creation — if the row exists the moment the invite is sent, that person gets auto-linked the instant they ever sign up to Funūn for *any* reason, even if they never respond to this particular invite.
- **Waiting for a response keeps "collaborator" meaningful** — a roster full of never-answered invites stops being a trusted list and starts looking like a contacts dump.
- **The status field gets both:** repeat-add speed is fully preserved (the initiator never retypes an email for someone already invited, even unanswered), the reconciliation engine fires immediately regardless of engagement, and the roster stays honest by visually distinguishing pending from confirmed. It also surfaces something useful on its own — a natural "people you've invited who haven't responded yet" view.

---

## 7. Recipient-side data completion — the piece that closes the original gap

**Decision: Option B** — `/approve/[token]` gets a small, **optional**, collapsed-by-default "Advanced information" section where the recipient can fill in or correct their own legal name, PRO, IPI, publishing designee, and administrator. Never required to approve or sign.

**Why this over "only via full account signup":** the existing shipped pre-signature prompt already tells a signer to *"check that your legal name, PRO, publishing designee, and administrator are correct... if anything is wrong, decline and let the sender know."* That's the exact gap this whole deliberation started from — decline, then fix it out-of-band, manually, with no record tying the correction to the document. This decision replaces that weak fallback with the thing the existing copy was always gesturing at, using the **same self-attested identity model** already decided everywhere else here (no new trust machinery needed).

**Symmetry with §4, confirmed deliberately:** both sides of the flow now use the identical UX shape. The initiator adding a collaborator sees only the required minimum with an optional expand; the recipient approving/signing sees the same — basic info only, "Advanced information" to expand if they want to add or correct something. Neither side is ever required to enter more than the bare minimum.

**Data flow:** anything the recipient fills in here flows back through §1's reconciliation mechanism (overwrite semantics) into their collaborator record / account data, visible to the initiator automatically for future collaborations.

**Follow-up implementation note, not yet drafted:** the existing `PRE_SIGNATURE_REVIEW_PROMPT` copy in `lib/split-sheets/agreement.ts` needs updating to reflect this new capability — from "decline and let the sender know" to something reflecting "you can correct this yourself, right here."

---

## 8. Reverse onboarding

**Decision (stated early, consistent with everything above):** if a non-Funūn party accurately fills in their own info — whether supplied by the initiator as a courtesy (§4) or self-entered via §7 — and **later signs up** for a full Funūn account, that already-entered information should carry into their new Settings automatically, rather than forcing them to re-enter everything from scratch. This is the same claim-on-signup + backfill reconciliation as §1, just running in the direction of "data existed before the account did."

---

## 9. Initiator's own row — the originating design point

**Decision, now fully specified by §1–§8 above:**
- **Legal name:** read-only, sourced from Settings, locked per §2.
- **PRO / IPI / publishing designee / administrator:** sourced live from Settings per §1 — no manual re-entry, no manual "Use my info" click required (today this is **entirely manual**; nothing auto-prefills on page load).
- **Incomplete Settings data:** a soft nudge is shown; "None yet" remains an acceptable, non-blocking default — a PRO is not a prerequisite for creating a split sheet.
- **P/K/A / stage name:** binary toggle, sourced from the Settings default, overridable per-sheet, with multiple stage names and group affiliations available via dropdown per §3.
- **Split % and Role:** unchanged — remain fully editable per party, per song, as they are today.

---

## Originating bug — investigated live, resolved by this redesign (not a separate code defect)

The bug that started this investigation (adding a second party appeared to corrupt the first party's `professionalName` field instead of creating a new row) was reproduced step-by-step, screenshotting at each stage, on 2026-07-21. **The underlying state logic is not broken:** a clean, deliberate reproduction (type song name → "+ Add party" once → screenshot → "+ Add party" again → screenshot) produced two correctly independent rows, each with its own Legal Name/Role/PRO/IPI fields, splitting cleanly to 50%/50%. No corruption occurred.

**Root cause: not a code defect, but confusion caused by the current flow itself.** Today, the initiator has to manually click "+ Add party" and then "Use my info" to populate *their own* row before they can add a real collaborator — there is no auto-included first party. Combined with the cramped, badly-positioned collaborator-picker popup (already flagged elsewhere in this document), it's easy to lose track of which row is being edited, producing exactly the "my info landed on the wrong row" symptom originally reported.

**This is fully addressed by §9 as already specified** — the initiator should never have to manually add or fill in their own row at all; they're party 1 automatically, with legal name locked and identity live-linked from Settings. Once that ships, the confusing manual "add yourself first" step this bug depended on no longer exists. **No separate debugging pass or interim patch is needed** — building §9 (and the identity-locking in §1/§2 it depends on) resolves this bug as a side effect, not a parallel task.

## Next step

This is a decision record, not a plan. Recommend routing through `/gsd-discuss-phase` or `/gsd-plan-phase` as its own phase (or a substantial Phase 18 amendment) given the real size here — Groups alone is comparable in scope to the original Collaborators feature.
