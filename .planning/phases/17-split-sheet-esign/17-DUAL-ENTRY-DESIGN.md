# Split Sheets: Dual Entry Points (Vault-first + Contract-Locker-first)

**Status:** DESIGN PROPOSAL — not yet planned. Written 2026-07-20 at Pete's request.
**Grounded in:** migration 001 (`vault_documents`), migration 018 (`split_sheets`), 17-05's shipped attach route, 17-02's readiness tiering, P17-05/P17-05a/AM-2a.

---

## 0. What already exists (do not rebuild)

| Capability | State |
|---|---|
| `split_sheets.vault_project_id` nullable | ✅ shipped (migration 018) — standalone was anticipated from the start |
| `vault_documents.project_id` **and** `.track_id` | ✅ **both exist** (migration 001) — the signed artifact can already be song-specific with no migration |
| Signed doc → sheet linkage | ✅ `document_data.split_sheet_id` (17-05) |
| Contract Locker sees project-less docs | ✅ shipped (17-05 fixed the join-only query) |
| Attach route | ✅ shipped (17-05) — `POST /api/split-sheets/[id]/attach`, gated on `status='executed'`, party-AND-owner authorized, moves the doc rows and fires readiness recalc |
| Cross-account fan-out | ✅ shipped (17-05) |

**Three gaps** stand between this and the dual-entry product:
1. `split_sheets` has **no `track_id`** — the sheet itself cannot be song-specific (only the resulting document can).
2. The attach route is **project-only** — it cannot target a track.
3. **The readiness gate is wrong for song-specific sheets** — see §6. This is the most consequential finding.

---

## 1. Product / UX proposal

### The mental model to hold (Pete's framing, adopted)

- **Contract Locker = the cabinet.** Every split sheet lives here, always, for its whole life. This is custody.
- **Sound Vault Documents = the shipping checklist.** A project shows the sheets that govern *its* songs. This is a *view*, not a second home.
- **Attaching does not move a document. It creates a relationship.** The sheet never leaves the Locker.

That single reframe resolves most of the "two paths" tension: there is one document, one identity, one home, and one optional relationship to a release.

### Path A — Vault-first (song in hand)

Artist is in a project that already has tracks. From the project's Documents area or a track row: **"Create split sheet"** → the composition title, artist, album, and label prefill from the project; the track is preselected. Everything else is the existing approve → sign flow. Sheet is born with `project_id` + `track_id` set.

### Path B — Contract-Locker-first (song in the room, release doesn't exist yet)

Artist is in the studio at 2am. Contract Locker → **"New split sheet"** → types the song title free-text, adds collaborators, sends. No project, no track, no friction. The sheet is born with both links null and lives in the Locker as an **Unattached** document.

Later, when the project exists in the Vault, the artist attaches it — from either side (see §3).

**This path must never be the degraded one.** It's the path that matches when split sheets actually get signed: at the moment of creation, before anyone has thought about a release.

---

## 2. Data model proposal

### 2a. Song-specific by default — `track_id` on the sheet

Add `split_sheets.track_id UUID REFERENCES tracks ON DELETE SET NULL` (nullable).

Rationale for Pete's instinct being right: **a split sheet governs one composition.** A 5-track EP nearly always has 5 different split configurations. Project-level split sheets are the exception (rare co-writing arrangements covering a whole body of work), not the default.

`ON DELETE SET NULL`, not CASCADE — deleting a track must never delete the legal record of who wrote it.

### 2b. Attachment: a join table, not a foreign key

**Recommendation: `split_sheet_attachments`**

```
split_sheet_id  UUID NOT NULL REFERENCES split_sheets ON DELETE CASCADE
vault_project_id UUID NOT NULL REFERENCES vault_projects ON DELETE CASCADE
track_id        UUID REFERENCES tracks ON DELETE SET NULL   -- nullable: project known, track not yet
attached_at     TIMESTAMPTZ NOT NULL DEFAULT now()
attached_by     UUID REFERENCES auth.users
UNIQUE (split_sheet_id, vault_project_id, track_id)
```

**Why a join table here, when I argued AGAINST speculative polymorphism for the contract library?** Because the second case is *known and common*, not hypothetical: the same composition routinely appears on a single **and** an album — two `tracks` rows, one composition, one split sheet. A `track_id` column alone forces either a duplicate sheet (which Pete explicitly rejected) or an unattachable second release. The contract-library case had no known second instance; this one has one on nearly every artist's catalog.

`split_sheets.vault_project_id`/`track_id` stay as the **origin** fields (where it was born, if anywhere). Attachments are the relationship set. Migrate existing rows by writing an attachment row for any sheet with a non-null `vault_project_id`.

### 2c. The signed artifact

`vault_documents` rows already carry `project_id`, `track_id`, and `document_data.split_sheet_id`. On attach, the existing project-less rows get `project_id`/`track_id` populated — **updated in place, never duplicated.** One canonical signed PDF per signer, exactly as 17-05 built it.

For a sheet attached to *two* projects, the doc row points at the primary attachment; the second project surfaces the sheet through the attachment join (§5). One PDF, two views.

---

## 3. The attach flow

### Entry points (both directions)

- **From Contract Locker** on an unattached sheet: `Attach to a release`
- **From a Vault project's Documents area**: `Link an existing split sheet` — with a picker of the artist's unattached sheets, fuzzy-matched by song title against the project's tracks

The second one matters more than it looks: the artist is usually in the Vault when they realize the sheet is missing, not browsing the Locker.

### The picker

Project first, then track. Track selection lists the project's tracks with a **suggested match** when `song_name` fuzzy-matches a track title (see §7 on renames). Allow **"This covers the whole release"** (project-level, `track_id` null) for the genuine exception case.

### Authorization

Reuse 17-05's rule exactly: caller must be **a party on the sheet AND the owner of the target project.** Do not loosen. A collaborator can attach a sheet to *their own* project; they cannot attach it to someone else's.

---

## 4. State transitions

```
                    ┌──────────── Contract-Locker-first ───────────┐
                    │                                              │
  draft ──► pending_approval ──► approved ──► esign_pending ──► executed
              │  ▲                                                  │
              └──┘ countered                                        │
                                                                    ▼
                                          UNATTACHED ──attach──► ATTACHED
                                                          ▲          │
                                      Vault-first is born ┘      detach
                                        already ATTACHED         (§7)
```

**Attachment is orthogonal to the signing lifecycle.** A sheet can be attached at any stage — draft, mid-approval, or years after execution. That orthogonality is the whole design: one axis is *legal progress*, the other is *release association*. Conflating them is what forces duplicate documents.

Vault-first sheets are simply born on the right-hand side of the second axis.

---

## 5. How signed documents surface after attachment

- **Contract Locker** (always): every sheet the user is a party to, attached or not. Unattached ones carry an `Unattached` chip with an inline attach CTA.
- **Project Documents area** (after attach): the sheet appears in the project's document list, grouped under its track when `track_id` is set. The row links back to the Locker record — *one document, surfaced in two places*, never copied.
- **Track view**: the governing split sheet shows on the track itself, which is where a collaborator or supervisor would look.

Implementation note: the project Documents query joins `vault_documents` **plus** `split_sheet_attachments` so a sheet attached to a second project surfaces there too, even though the doc row's `project_id` points at the first.

---

## 6. Readiness — and the flaw this design exposes

**Current gate** (`signedOf('split_sheet')`): looks at all `split_sheet` documents for the project. None → `missing`. Some unsigned → `warning`. All signed → `complete`.

**With song-specific sheets this silently over-credits.** A 5-track EP with **one** signed split sheet has `total=1, signed=1` → **`complete`, 15/15**. The artist sees a fully-green readiness item while four songs have no documented splits — the exact failure the readiness score exists to prevent, and it fails in the dangerous direction.

**Proposed fix — coverage-based scoring:**

```
tracksNeedingSheet = project's tracks
tracksCovered      = tracks with an attached, executed split sheet
coverage           = covered / needing

0 covered            → missing  (0)
some covered         → warning  (partial credit, proportional)
all covered          → complete (15)
```

Plus the 17-02 pipeline tiers (5/10/15) applying per-track rather than per-project, taking the **minimum** across tracks — a project is only as documented as its least-documented song.

**Open sub-decision:** does *every* track need a split sheet? A solo-written song arguably doesn't (though best practice says document it anyway). Options: (a) every track, strict; (b) only tracks whose metadata shows >1 composer; (c) artist marks per-track "not needed." I lean **(a) with an explicit per-track "solo-written, no split sheet needed" acknowledgment** — it prompts the right thought without punishing the honest answer.

This is a **derivation change to both `readinessItemsForProject()` and `calculate_vault_readiness()`**, same dual-implementation pattern as 17-02, and it needs the same shared parity fixture.

---

## 7. Edge cases and failure modes

| Case | Handling |
|---|---|
| **Song renamed after the sheet was signed** | The executed PDF is immutable — it says the old title, correctly, because that's what was signed. Store `song_name` as the sheet's own field (already true) and show `Signed as "Old Title" · now "New Title"` in the UI. **Never regenerate the PDF.** Fuzzy match at attach time surfaces likely candidates despite the rename. |
| **Already-executed sheet attached later** | The normal case for Path B, not an exception. Attach sets the links, doc rows gain `project_id`/`track_id`, readiness recalculates. Show `Signed 12 Mar · attached to Neon Hours today` so the timeline is honest. |
| **Same composition, two releases** (single + album) | The join-table case. Attach the same sheet to both; one PDF, two surfaces. This is why §2b is a join table. |
| **Attached to the wrong track** | Detach must exist. Detaching removes the attachment row and nulls the doc row's project/track — it must **never** delete the sheet or the PDF. Readiness recalculates downward, which is correct. |
| **Sheet attached, then track deleted** | `ON DELETE SET NULL` on `track_id`. The attachment survives at project level with a `Track removed` flag; the legal record is never collateral damage. |
| **Sheet attached, then project deleted** | `ON DELETE CASCADE` on the attachment row only. Sheet returns to Unattached in the Locker. |
| **Two sheets claim the same track** | Possible via renames or genuine error. Allow it, flag it loudly: `Two split sheets are attached to this song` with a resolve prompt. Blocking would be worse — the artist may be mid-correction. |
| **Non-owner party attaches** | Blocked by 17-05's party-AND-owner rule. A collaborator attaching to their own project is legitimate and allowed. |
| **Standalone sheet, artist never attaches** | Fine, permanently. It's a valid legal record in the cabinet. Surface a gentle Locker nudge (`3 split sheets aren't linked to a release`), never a warning — the artist may not have released the song and may never. |
| **Attach before execution** | Allowed under this design (attachment ⊥ lifecycle), but 17-05's route currently requires `executed`. Decide: relax to any status, or keep the gate. I lean **relax** — a mid-approval sheet showing on the project as "in progress" is more useful than invisible. |

---

## 8. Recommended implementation order

1. **`split_sheets.track_id`** + song-selection in the Vault-first creation flow (smallest step, makes Path A song-specific).
2. **`split_sheet_attachments` join table** + backfill from existing `vault_project_id` values.
3. **Attach route v2** — accepts `{ project_id, track_id? }`, writes an attachment row, updates doc rows. Extends 17-05's route rather than replacing it.
4. **Attach UI from both sides** — Locker chip + CTA; Vault "Link an existing split sheet" picker with fuzzy title matching.
5. **Readiness coverage scoring** (§6) — the parity-fixture change; do this *after* attachments exist so it has real data to score.
6. **Detach + conflict flags** (§7).
7. Optional: multi-project attachment surfacing (§5's join in the project Documents query).

Steps 1–4 are the product. Step 5 is the one that changes existing scores, so it deserves its own plan and probably its own communication to users.

---

## 9. Open decisions for Pete

1. **CTA naming.** My picks: **`New split sheet`** in Contract Locker (matches "New project"; "Start" implies a wizard), **`Create split sheet`** from a Vault track (it's creating a document *for this song*), **`Attach to a release`** from the Locker, **`Link an existing split sheet`** from the Vault. Deliberately *not* "Attach to Song Vault" — the product is "Sound Vault," and attaching is to a *release*, which is the artist's mental unit.
2. **Does every track need a split sheet for full readiness?** (§6) — I lean strict-with-acknowledgment.
3. **Can a sheet attach pre-execution?** (§7) — I lean yes; 17-05 currently says no.
4. **Project-level sheets allowed at all?** I say yes, as a marked exception ("covers the whole release"), not a default.
5. **Does attaching notify the other parties?** A sheet appearing in someone's release is arguably worth telling co-writers about. I lean **no notification** for v1 — it's an organizational act, not a legal one — but flag it.
6. **Readiness scoring change is user-visible.** Projects that today read `complete` on split sheets may drop to `warning` when coverage scoring lands. That's a correction, not a regression — but it needs to be communicated, not silently shipped.
