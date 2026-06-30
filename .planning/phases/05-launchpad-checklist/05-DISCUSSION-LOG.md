# Phase 5 — Launchpad Checklist: Discussion Log

**Phase:** 5 — Launchpad Checklist
**Session date:** 2026-06-30 (updated 2026-06-30 with LAUNCH-05)
**Gray areas covered:** 5 of 5

---

## Area 1: Route Architecture

**Question:** Should `/launchpad` stay global-only, or add a per-project route alongside it?

**Decision:** Keep `/launchpad` global (no changes to existing page) + add `/launchpad/[projectId]` per-project.

**Follow-up:** Where do projects appear on the global page?
**Decision:** Project cards at the top of `/launchpad`, above the existing static playbook content.

**Rationale:** Artists need both a high-level reference (global) and an action-focused room (per-project). Adding per-project via sub-route keeps URLs clean and sets up Phases 6 and 7 to slot into the same container.

---

## Area 2: Checklist Structure

**Question:** Keep existing pre/week/post structure or reorganize?

**Decision:** Fully reorganize into week-based structure with sub-labels for verbal clarity.

**Sections:**
- **Before release** (sub-label: "Pre-release prep") — retrospective block; collapses after release date
- **Week 1 — Release week** (sub-label: "Algorithm window opens") — announce, email list, save-to-stream push, curator pitches, engagement sprint
- **Week 2** (sub-label: "Keep the momentum") — BTS content, reactions, playlist follow-up, benchmark check
- **Weeks 3–4** (sub-label: "Sustain and expand") — lyric posts, UGC, discovery mode, ads, rights cleanup, catalog bridge

**"Before release" behavior clarified:** Always visible. After the release date passes, collapses into a "Did you handle this?" confirmation block — each item shows as a checkbox for retroactive confirmation.

**Algorithm-pushing items in Week 1:** Save rate tip included; framing is that Spotify's save-to-stream ratio is evaluated in weeks 1–4 post-release, with save rate in week 1 being the strongest signal for Discover Weekly candidacy.

**Alignment with research:** Research noted 75% of first-year streams happen after month 1; week-based sequencing aligns the checklist with the algorithmic window.

---

## Area 3: Tips UX

**Question:** Where and how do per-item tips appear?

**Decision:** Side panel / drawer (right side), matching existing `ToolSidePanel` Vault UX.

**Panel trigger:** Clicking the item row opens the panel. Panel content: tip body + step-by-step instructions + action CTA.

**Checkbox behavior:** Independent. Checkbox marks complete without opening the panel. Artist can mark done on repeat visits without reading the tip again.

**Unapproved tips:** Panel still opens (shows instructions + CTA only). Tip body section is hidden if no approved tip exists.

**Rationale for side panel:** Consistent with existing Vault UX pattern. Gives enough real estate for guidance + CTA without navigation away from checklist.

**Rationale for independent checkbox:** Repeat visits should be fast. Forcing the panel on every checkbox click adds friction. The panel is on-demand guidance, not a mandatory gate.

---

## Area 4: Admin Tip Pipeline

**Question:** Who approves tips and how — hardcoded email, `is_admin` flag, or `/admin/tips` route?

**Decision:** `/admin/tips` in-app route with edit + Approve/Reject UI.

**Access gate:** `is_admin` flag in `raw_app_meta_data` (set via Supabase dashboard).

**Schema note:** `author` and `contribution_type` fields should be included in `launchpad_checklist_items` from the start so the row can distinguish AI drafts from future industry expert contributions without a schema migration.

**Future direction:** Wave 4 goal is for industry experts on Funūn to contribute tips alongside AI drafts. The admin UI should be designed with this expansion in mind — not just "approve AI output" but "manage a knowledge pipeline."

---

---

## Area 5: Admin Checklist Item CRUD (LAUNCH-05)

**Question:** What fields should an admin be able to set on a checklist item?
**Decision:** All four — Label (required), Section (dropdown), Action CTA (type + href + label), Sort order.

**Question:** How should item reordering work?
**Decision:** `@dnd-kit/core` drag-and-drop on desktop; up/down arrow buttons on mobile as fallback. No drag library existed in the codebase — user opted to add `@dnd-kit/core` for the better desktop UX.

**Question:** What happens when an admin deletes an item?
**Decision:** Hard delete. Progress rows cascade. No soft delete or tombstone. Admin data doesn't warrant the query complexity of soft deletion.

**Question:** Should `/admin/checklist` and `/admin/tips` share a layout?
**Decision:** Yes — shared `app/(admin)/layout.tsx` with nav between Checklist Items and Tips. `is_admin` gate applied at layout level. Designed to grow.

**Admin layout:**
```
/admin             → redirect to /admin/checklist
/admin/checklist   → item CRUD
/admin/tips        → tip approval
```

---

## Deferred / Out of Scope for Phase 5

- Auto-completion of items based on tool run events (stretch goal — not in Phase 5 plan)
- AI monthly tip generation cadence (operational workflow — tips seeded manually for first batch)
- Industry expert tip contribution flow (Wave 4)
- Changes to existing global `/launchpad` playbook render (only project cards added at top)
