# Deliberation — The Playbook content model (expressiveness, adoption, stocking the rooms)

**Status:** OPEN — brief prepared for a full phase discussion (Phase 35)
**Opened:** 2026-08-26 (owner — "document all of this and get it ready for a full phase discussion")
**Feeds:** Phase 35 (`/gsd-discuss-phase 35`)
**Builds on:** Phase 33 (Playbook shell, shipped) · Phase 31.2 (authoring + RBAC, shipped)
**Related:** `.planning/deliberations/team-member-rbac-access-model.md` · `docs/sales/LEAD-TO-AE-HANDOFF-SOP.md` (the first real article candidate)

---

## The question

The Playbook has shelves but almost nothing on them. **How does content get in, who can put it
there, and how expressive is a page allowed to be?**

---

## Current state — audited 2026-08-26, not assumed

| Thing | State |
|---|---|
| Playbook shell + double-sidebar nav | ✅ shipped (Phase 33) |
| IT Team room, rendering `docs/observability/*.md` | ✅ shipped (Phase 33) |
| In-app authoring (create/edit SOP + Topic) | ✅ shipped (Phase 31.2) |
| Draft → approve, role-tiered publishing | ✅ shipped (Phase 31.2) |
| Room × role access editor | ✅ shipped (Phase 31.2) |
| Rooms seeded in prod | ✅ 6: Company-wide · A&R · AE/Sales · IT Team · TMS · Leadership |
| **Entries written so far** | **0** |
| Other rooms' content | ❌ deferred by Phase 33, **never given a follow-on phase** until 35 |

**Two content mechanisms exist and do not meet:**
- **Files** — `docs/observability/*.md` rendered via `lib/playbook/read-doc.ts`, which is
  **hardcoded to that one folder**. `docs/sales/` does not render anywhere today.
- **Database** — `playbook_entries` + `components/playbook/EntryEditor.tsx`.

---

## Already decided (owner, 2026-08-26) — do not re-litigate

1. **BOTH mechanisms**, and **both editable from inside The Playbook**, without breaking the
   look, feel, and design of the room.
2. **Adoption, not sync.** A file doc is **imported once** into `playbook_entries`; from then
   on the DB row is the source of truth and the file is its origin. Forced by a hard
   constraint: the app runs serverless on Vercel with a **read-only filesystem** and cannot
   write back to `docs/` — editing files in place would require committing via the GitHub API,
   turning every wiki edit into a deploy.
3. **Unified rendering.** File-origin and natively-authored entries must render through the
   **same room components** — an adopted doc must be visually indistinguishable from one
   written in the editor.
4. **UI mockups are not article material.** They expire on ship; only durable process/policy
   docs get adopted (see the artifacts→Playbook memory).

---

## THE CENTRAL DECISION — how expressive is a Playbook page?

Everything else follows from this, and it must be settled **before** the importer is designed:
an imported doc has to land in whatever format the editor natively edits, or adopted pages
become second-class and un-editable — defeating decision #1 above.

### What a page can hold today

An entry is **a title plus a flat list of lines**:
- `sop` → `{ items: string[] }` (a checklist)
- `topic` → `{ questions: string[] }` (coaching questions)

**No paragraphs, headings, callouts, tables, or diagrams.** The sales SOP written 2026-08-26 —
two stages, numbered steps, coloured callouts, a roles matrix — **cannot be expressed**. It
would flatten to a checklist.

### Vocabulary (agreed with the owner)

- **Callout** — a boxed, coloured aside that breaks out of the text to say *pay attention*.
  Elsewhere called an admonition (MkDocs/Docusaurus), an alert (GitHub `> [!WARNING]`), a panel
  (Confluence), or a callout block (Notion). Typed by **intent**, colour follows:
  note (blue) · tip (green) · caution (amber) · warning (red).
  *Why it matters:* an SOP author needs "never assign an AE before first contact is done" to be
  impossible to miss, not buried in paragraph four.
- **Process flow / vertical timeline (stepper)** — numbered steps down a spine. What the sales
  SOP artifact uses.
- **Flowchart** — strictly, boxes + arrows + decision diamonds. Distinct from the above.

### Three candidate models

| | How an author adds a callout | Cost | Trade-off |
|---|---|---|---|
| **1. Markdown + syntax** | types `> [!WARNING]` | Low | Headings/tables/lists come free; author learns a little syntax |
| **2. Block editor (Notion-style)** | clicks **+** → Callout → picks type | High | Best authoring UX; much the largest build |
| **3. Diagrams-as-text** | describes boxes/arrows in a few lines, renders as a diagram | Low–med | Covers flowcharts without building a drawing tool |

**Orchestrator recommendation: (1) + (3).** Markdown covers headings, tables, and callouts
almost free; text-described diagrams cover flowcharts; a block editor can be layered on later
*without changing the stored content*. **Not decided — this is the discussion.**

---

## Open sub-decisions for the phase discussion

1. **Expressiveness model** — (1), (2), (3), or a combination. *The central one.*
2. **Stored content shape** — if markdown wins, does `content` become a markdown string, or
   stay JSONB with a markdown field? Affects the existing `sop`/`topic` entries and the
   importer.
3. **Do `sop` and `topic` survive?** They are currently *structural* types (checklist,
   questions) that Game-Plan topic-sourcing reads (31.2's `buildPickerTopics` pulls published
   `topic` entries). A free-form page type may need to coexist with them rather than replace
   them — **this is a real coupling, not a cosmetic one.**
4. **Source-changed handling** — when an adopted doc's origin file later changes in git:
   surface a "source changed" notice? ignore it? (Proposal: notice, **never** auto-overwrite
   in-app edits.)
5. **Which rooms get stocked first**, and with what. Sales is the obvious first (the SOP
   already exists); IT Team is already served by files.
6. **Does the IT room migrate?** It works today on the file path. Adopt it into entries for
   consistency, or leave it alone (and accept two paths persisting)?

---

## Cheapest way to sharpen this before the discussion

**Write one real entry in the AE/Sales room** (`/admin/playbook/ae-sales`) with the current
editor. Five minutes of real use will reveal how much expressiveness is actually needed better
than further theorising — and if a plain checklist turns out to be enough for most real SOPs,
that materially changes the recommendation above.
