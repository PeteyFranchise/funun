# Phase 21 — Cross-Account Collaboration & Split-Sheet ↔ Project Sync

**Status:** SPEC (pre-plan) · authored from `/gsd-explore` session 2026-08-01
**Owner decisions:** Pete (all ✅ items below decided in-session)

---

## Goal

Turn a song into a single source of truth shared by the people on it. A split sheet
and its Sound Vault project stay linked (writers/roles/splits) while the sheet is a
draft, and every collaborator **with a Funūn account** can see the shared project and
the tasks waiting on them — from their own account — without any re-entry of data.

This is the **first concrete slice of the post-beta access model** (previously flagged
for review; owner confirmed ④: build now, not deferred).

**Core value:** "One song, one source of truth for who wrote what" — visible to everyone
on it, editable by its owner, with money/signature actions never missed.

---

## Decision log (locked — do not re-litigate)

### ① Access model
- **Shared visibility, owner-controlled editing.** Collaborators see the project and
  their own piece; only owner (or a named co-owner) mutates the project itself.
- **Splits are the exception** — always negotiated through the sheet's existing
  approve/counter flow, never edited silently on the project.

### ② Membership foundation (load-bearing)
- New **`project_members` guest-list table** — `(project_id, user_id, role)`.
- RLS on `vault_projects` (and related child rows) rewritten from "you own it" to
  **"you own it OR you're on its guest list."**
- **Four roles from day one:**
  | Role | View | Edit project | Manage guest list | Delete project |
  |------|:---:|:---:|:---:|:---:|
  | owner | ✓ | ✓ | ✓ | ✓ |
  | co-owner | ✓ | ✓ | ✓ | ✗ |
  | editor | ✓ | ✓ | ✗ | ✗ |
  | viewer | ✓ | ✗ | ✗ | ✗ |
- **Auto-membership:** being a writer on a linked split sheet adds you as **viewer**.
  Promotion to editor/co-owner is a deliberate owner action.

### ③ Keeping "mine" vs "shared" straight
- **Separate "Shared with me" lane** in the vault (not mixed into the owned grid).
- Shared cards badged (e.g. "Shared · Maya's project" + "You're a viewer"); no edit
  affordances a viewer can't use.
- **Shared projects stay OUT of personal scoreboard math** (dashboard counts/averages
  describe *your own* catalog).

### ④ Dashboard rework
- **Kill "Avg readiness"** headline stat (judged a vanity metric — blends released +
  draft, drives no action, punishes starting new work).
- **Replace with "Closest to ready"** — action-oriented nudge + link to that project.
- **Add "Your next moves" action feed** — home for cross-account tasks. Inclusion rule:
  **"is this waiting on you?"**, regardless of who owns the song.
  - **Launch set:** complete a split-sheet draft · review/approve a split sheet ·
    respond to a counter-proposal · sign a document.
  - **Ranking:** **money & signatures always pinned on top** (locked tier, not
    reorderable — platform protects the user from burying the contract).
  - Extensible: fold in more action types as they become clear (invites to accept,
    audio-missing on a project you're editor on, etc.).
- **Configurability = fast-follow, not first cut.** Design data so per-user prefs
  (order, muted categories) can bolt onto the *flexible* tier later; ship fixed
  priority + sensible defaults now.

### Identity: dedupe vs claim (keep distinct)
- **Roster dedupe** (per-owner, keyed on typed email) — keeps one owner's roster clean;
  reuses an existing collaborator instead of creating a duplicate. Trusts typed email.
- **Claim** (cross-owner, keyed on *verified* email at signup) — reunites the same real
  person's credits across owners into their account; surfaces their credits/shared
  projects. **Shared access keys off VERIFIED identity, never an unverified typed email.**
- Cross-account membership is granted at **claim/signup time**, not on typed-email match.
- Open design point (for planning): when three separate collaborator rows resolve to one
  new signup — keep owners' private roster notes, but rights data (PRO/IPI/legal name)
  comes from the person's real verified profile. Lean: private notes stay, rights data
  federates.

---

## Build slate

1. **`project_members` table + RLS rewrite** — the foundation (security-critical migration).
2. **Auto-membership** from linked-sheet writers (viewer).
3. **"Shared with me" lane** + shared-card badge in the vault.
4. **Dashboard rework** — remove Avg readiness; add "Closest to ready"; add "Your next
   moves" feed (money/signatures pinned; launch action set; configurability deferred).
5. **Sheet ↔ project sync** — writers/roles/splits linked while the sheet is a draft;
   link snaps on send-for-signature (signed sheet frozen, project keeps evolving);
   now membership-aware.
6. **Dedupe (roster) + claim (cross-account)** wiring per identity rules above.

---

## Sequencing (recommended)

- **Wave 1 — #1 alone.** The `project_members` table + RLS rewrite lands and **soaks
  first**. It is the security-critical foundation; everything else is safe only once
  it is proven. Includes `NOTIFY pgrst` reload + access smoke tests (owner sees own,
  viewer sees shared, non-member is blocked).
- **Wave 2 — #2, #3, #5** build the sharing + sync surface on the proven foundation.
- **Wave 3 — #4, #6** dashboard action feed + identity wiring.

(Exact plan split to be set by `/gsd-plan-phase`.)

---

## Interaction with existing systems

- Builds on the existing **dual-entry attach flow**: `split_sheets.vault_project_id` /
  `track_id` + `split_sheet_attachments` join table (migration 067). Membership is
  additive — it does not replace attach; it reads from it (a linked sheet's writers
  drive auto-membership).
- Respects the **split-sheet freeze** on send-for-signature (migration 062 lifecycle):
  sync only runs while status = `draft`.
- Split negotiation stays on the sheet's **approve/counter** flow — no new money path.

---

## Deferred / fast-follow (explicitly NOT in first cut)

- Per-user configurability UI for the "Your next moves" feed (order, muted categories).
- Additional action-feed types beyond the launch set.
- Co-owner/editor promotion UX polish (roles exist in data day one; rich management UI
  can follow).

---

## Open questions for planning

- Exact RLS policy shape for child rows (tracks, assets, documents) under shared access.
- Whether "editor" can trigger sheet actions or only project edits.
- Migration ordering vs any in-flight Phase 20 work (077 drop-view soak).
- Real-time vs refresh-on-load for the "live sync" indicator in the sheet↔project UI.
