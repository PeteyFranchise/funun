# Phase 18 (Split-Sheet Home) — Human UAT Checklist

**Created:** 2026-07-22 · **Status:** pending human run
**Why human:** every item below needs a live browser + a real logged-in Supabase session (or a demo seed that covers split sheets). Automated agents verified the *code* (84 suites / 1043 tests, `tsc`/lint/`npm run build` all clean; security audit 34/35 closed, 0 high/critical) but cannot exercise rendered UI behavior or live-data parity. The automation sandbox additionally cannot launch a local dev server (`process.cwd()` is blocked), so the demo-mode smoke test could not be attempted there.

**How to run:** log in as a real artist with at least one multi-track project, or locally try `NEXT_PUBLIC_VAULT_DEMO=true npm run dev` if the demo seed covers `/split-sheets` and `/contracts`. This file doubles as a repro script if any related issue surfaces later.

---

## A. Living draft — 18-01 (HOME-01..05 + identity redesign)

- [ ] **Draft round-trip (HOME-01/02).** Create a split sheet, save as draft. Confirm it appears in the `/split-sheets` list (previously orphaned — nothing linked to it) and opens for edit at `/split-sheets/[id]`.
- [ ] **Auto-included self row on mount, create AND edit (§9).** On a *brand-new* sheet and on an *existing* draft's edit view, confirm you are already party 1 on load — no "+ Add party → Use my info" step. Your **legal name is read-only** (locked from Settings), and PRO/IPI/publisher/administrator are pre-filled live from your profile. Confirm there is **no remove control** on your own row.
- [ ] **Legal-name lock in Settings (§2).** In Settings, confirm-and-lock your legal name (one-time). Confirm it then renders read-only in the builder's self row. A first-time user with no locked name should get a soft nudge, not a hard block.
- [ ] **Fast-add a co-writer by email only (§4).** Add a party via the new PartyPicker using just an email (no name). Confirm it **saves without a "legal name required" error**, shows a **pending badge**, and the "Advanced information" fields are collapsed by default.
- [ ] **Proportional redistribution (HOME-03).** On a 50/30/20 draft, add a fourth party. Confirm the existing three scale proportionally and the total lands exactly on 100%.
- [ ] **Consensus-reset change summary (HOME-05, P18-09).** After parties have approved, add a party or change a split, then re-send. NOTE: today the "what changed" note only shows in *your own* builder (code-review WR-03, deferred to a follow-up) — parties don't yet see it on `/approve/[token]`. Confirm your side shows the summary; flag if you expected the parties to see it (that's the tracked follow-up).
- [ ] **Consensus is NOT reset by a no-op save (WR-04 fix).** Open a draft that parties approved, save it again **without changing the party set or splits**. Confirm approvals are **preserved** (not reset to draft) — this is the WR-04 fix.
- [ ] **Live-identity change does NOT reset consensus (P18-09).** Have a party update their PRO in Settings. Confirm this does **not** reset consensus / re-trigger approval.
- [ ] **Read-only share (HOME-04).** Share a draft's read-only link. Confirm the recipient sees proposed splits with **no approve/counter** controls and **no** §7 advanced-info form (that section is only for a real approval, not a preview).
- [ ] **§7 recipient self-correction (HOME-04/05).** As a recipient on `/approve/[token]`, open the optional "Advanced information" section and correct your own legal name / PRO. Confirm it saves and only affects *your* party row.
- [ ] **Freeze boundary (HOME-05).** Confirm an `esign_pending`/`executed` sheet renders read-only and explains why edits are blocked (not just silently disabled).

## B. Contract Locker — 18-02 (HOME-06..08)

- [ ] **Attention-first landing (HOME-06).** Open `/contracts`. Confirm three zones: (1) needs-your-attention (awaiting-signature, drafts in progress, unattached executed sheets, songs with no sheet), (2) create CTAs, (3) browse-complete. The reserved `ask` slot should render nothing.
- [ ] **3-state per-party status (HOME-06).** On an awaiting-signature sheet, confirm each party shows the right label: **"signed"** (approved), **"opened, hasn't signed"** (viewed but pending), **"invited, hasn't opened yet"** (not viewed).
- [ ] **Locker reads in-flight sheets, not just signed docs (HOME-06).** Confirm a *draft*/pending `split_sheets` row appears in the Locker (it previously read only `vault_documents`).
- [ ] **Per-party views + soft hide (HOME-07).** As a second party on a shared sheet, confirm you see it in *your* context ("your share X%"). Hide it and confirm it soft-hides for you only — the other party still sees it, and the record is not destroyed.
- [ ] **Block exception (HOME-08, P18-12).** Two co-writers who have blocked each other should both still see a shared **executed** agreement and each other's details *on that agreement* — but nothing else about each other reopens.

## C. Song attachment — 18-03 (HOME-09..11) + backfill

- [ ] **Backfill row-count spot-check (deferred at push).** `SELECT count(*) FROM split_sheet_attachments;` should equal `SELECT count(*) FROM split_sheets WHERE vault_project_id IS NOT NULL;` — one attachment per previously project-linked sheet. (Couldn't be verified at migration-067 push time; no SQL client there.)
- [ ] **Attach from both directions.** Attach a sheet to a track from the Locker side, and link a sheet from the Vault/documents side. Confirm both work and fuzzy title matching surfaces sensible suggestions.
- [ ] **Two-project attach (the case 067 was built for).** Attach the same composition's sheet to a single AND an album (two `tracks` rows). Confirm both attachments hold and neither forces a duplicate sheet.
- [ ] **Detach survival + renamed-title display.** Detach a sheet; confirm the sheet itself survives (relationship removed, record kept). Rename a track and confirm the attachment still resolves.

## D. Coverage readiness — 18-04 (HOME-12)

- [ ] **Score parity (deferred at push).** Pick a real multi-track project. Confirm its stored `vault_readiness_score` matches what `/vault/[projectId]/readiness` renders. Disagreement means the SQL and TS derivations drifted — report it, don't reconcile by hand.
- [ ] **Score movement is as expected.** A multi-track project with only ONE track's sheet signed should now read **below** complete (proportional, e.g. ~3/15 on a 5-track EP), not a false 15/15. A genuinely complete project (all tracks covered, or the legacy signed-doc path) still reaches 15.
- [ ] **Every track needs a sheet (P18-15).** Confirm there is **no** "solo-written / no sheet needed" acknowledgment escape hatch anywhere.

## E. Regression eyeballs (fixes that shipped post-review)

- [ ] **WR-01 — attached-elsewhere song not falsely flagged.** In the Locker, a song attached to a *second* release must NOT appear under "songs with no sheet."
- [ ] **WR-02 — readiness page is internally consistent.** The split-sheets gate must never show "Passed" while the coverage widget directly below says "Not fully documented." (The widget now only renders when coverage is the governing branch.)
- [ ] **MetadataStudio composer picker still works.** Open Metadata Studio for a track, add a composer credit via the picker. Confirm the full identity form still appears and saves — the new PartyPicker was built as a *separate* component specifically to protect this untested flow.

## F. Do NOT test yet — minting

- [ ] **Minting is gated pending two things:** (1) the mint-envelope legal-name gate fix (in a separate session — blocks minting a party with a blank legal name), and (2) confirming the counsel-review flip (17-09a) is genuinely backed by an attorney review. **Do not mint real split sheets** (real money + real email + binding documents) until both are settled — see `.planning/phases/17-split-sheet-esign/17-RESUME-HERE.md`.

---

*Source checks: 18-VERIFICATION.md (human_verification), 18-03/18-04-SUMMARY.md (deferred human-checks), 18-REVIEW.md (WR-01/02/04 fixed, WR-03 deferred), 18-SECURITY.md (mint-gate open item).*
