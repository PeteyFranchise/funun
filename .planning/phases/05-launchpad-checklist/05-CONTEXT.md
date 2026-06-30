# Phase 5 — Launchpad Checklist: Design Context

**Phase:** 5 — Launchpad Checklist
**Requirements:** LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04
**Discussed:** 2026-06-30
**Status:** Decisions locked — ready for planning

---

## What This Phase Builds

A per-project Launchpad room (`/launchpad/[projectId]`) that gives artists a guided, week-sequenced post-release checklist. Each item is actionable (in-Funūn tool or external step), has a contextual tip in a side panel, and tracks completion per project. Tips are admin-approved before surfacing to artists. An admin route (`/admin/tips`) manages tip drafts.

---

## Locked Decisions

### 1. Route Architecture

- **`/launchpad`** — existing global static playbook page. No changes to this page in Phase 5.
- **`/launchpad/[projectId]`** — new per-project Launchpad room. This is the spine that Phases 6 and 7 will also live inside.
- **Global `/launchpad` page** — shows project cards at the top so artists can click into their per-project room. Cards appear above the existing static playbook content.

**Why:** Artists need both a high-level playbook reference AND a focused per-project action list. The global page stays as an evergreen reference; the per-project room is where actual work happens.

### 2. Checklist Structure

The per-project checklist is organized by post-release week to align with the Spotify algorithmic evaluation window (weeks 1–4 post-release are when save-to-stream ratios and playlist adds are weighted most heavily).

**Sections:**

```
Before release          ← retrospective block; collapses after release date
  Sub-label: "Pre-release prep"
  Items: pre-save link, Spotify editorial pitch, Canvas/Clips, social teasers, EPK

Week 1 — Release week   ← algorithm window opens
  Sub-label: "Algorithm window opens"
  Items: announce across platforms, email list push, save-to-stream prompt,
         first curator pitches, engagement sprint (comments/shares)
  Tips: focus on save rate — Spotify reads save-to-stream ratio in weeks 1–4

Week 2                  ← keep momentum
  Sub-label: "Keep the momentum"
  Items: behind-the-scenes content, listener reactions, playlist follow-up,
         benchmark readiness check

Weeks 3–4               ← sustain and bridge
  Sub-label: "Sustain and expand"
  Items: lyric pull posts, UGC push, discovery mode setup, Spotify ads,
         rights registrations cleanup, catalog bridge (mention earlier releases)
```

**Before release behavior:** Always visible as a section. After the project's release date passes, the section collapses into a "Did you handle this?" confirmation block — each item shows as a checkbox so the artist can retroactively confirm what was done. It does not disappear.

**Why week-based:** Research shows 75% of first-year streams happen after month one. The algorithmic window (weeks 1–4) is the highest-leverage period. Sequencing by week makes the priority order obvious and removes decision fatigue.

### 3. Tips UX

- **Surface:** Side panel / drawer (right side), consistent with the existing Vault `ToolSidePanel` component pattern.
- **Trigger:** Clicking anywhere on an item *row* opens the side panel. The panel shows: tip body, step-by-step instructions, action CTA (in-Funūn link or external URL).
- **Checkbox:** Independent from the panel. Clicking the checkbox marks the item complete; it does NOT open the side panel. Artist can mark done without reading the tip on repeat visits.
- **Tips are gated:** Unapproved tip drafts never appear. If no approved tip exists for an item, the panel opens without a tip body (shows instructions and CTA only).

**Why side panel:** Matches existing Vault UX pattern (`ToolSidePanel`). Gives enough room for contextual guidance, steps, and a CTA in one view without navigating away from the checklist.

**Why checkbox is independent:** Repeat visits should be fast. Forcing the panel on every checkbox click adds friction for artists who remember what to do. The panel is on-demand guidance, not a gate.

### 4. Admin Tip Pipeline

- **Route:** `/admin/tips` — a protected admin-only page in the app.
- **Access gate:** Admin check based on `is_admin` in `raw_app_meta_data` (set via Supabase dashboard). API routes check this flag before permitting any tip mutations.
- **UI:** List of draft tips (pending approval), each showing: item key, tip text (editable), AI-drafted metadata (date, model), Approve and Reject buttons.
- **Designed to expand:** Wave 4 goal is industry expert contributions alongside AI drafts. The schema and UI should make `author` and `contribution_type` first-class fields even in V1 so expansion doesn't require a migration.

**Why in-app route (not Supabase Studio):** The admin tip flow will eventually include industry expert contributions where subject-matter experts draft and submit tips through the app. Building the admin UI now creates the foundation for that workflow. Supabase Studio is fine for solo review but doesn't scale to multi-contributor knowledge pipelines.

---

## Existing Code to Reuse

| What | File | Notes |
|---|---|---|
| Static playbook data | `lib/launchpad/playbook.ts` | 18 tasks across pre/week/post. Will be reorganized into the new week structure for the per-project checklist. The `LaunchPhaseKey` type and `PLAYBOOK` export stay for the global `/launchpad` page. |
| Static playbook page | `app/(artist)/launchpad/page.tsx` | Only change: add project cards section at the top linking to `/launchpad/[projectId]`. No changes to the existing playbook render. |
| Tool side panel pattern | `components/vault/ToolSidePanel.tsx` | Reference for the tip side panel component structure. |
| Supabase `createApiClient()` | `lib/supabase/server.ts` | Standard auth pattern for all new API routes. |
| Admin email/flag pattern | `app/api/vault/route.ts` | Check how ownership is verified before writes — same pattern for admin flag check. |

---

## New Tables

### `launchpad_checklist_items`
Admin-managed item definitions with tips.

```sql
CREATE TABLE launchpad_checklist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,          -- e.g. 'presave_link', 'announce_week1'
  label        text NOT NULL,
  section      text NOT NULL,                  -- 'before_release' | 'week_1' | 'week_2' | 'weeks_3_4'
  suggested_week int,                           -- 0=before, 1, 2, 3 (3 covers weeks 3–4)
  sort_order   int NOT NULL DEFAULT 0,
  action_type  text NOT NULL,                  -- 'internal_tool' | 'external_url'
  action_href  text,
  action_label text,
  tip_body     text,                            -- approved tip text; null = no tip yet
  tip_approved boolean NOT NULL DEFAULT false,
  tip_draft    text,                            -- pending AI draft awaiting admin approval
  tip_drafted_at timestamptz,
  author       text,                            -- 'ai' | 'admin' | future: industry expert email
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE launchpad_checklist_items ENABLE ROW LEVEL SECURITY;
-- Public read (approved items only enforced at API layer), admin write via service role
```

### `launchpad_progress`
Per-user per-project completion state.

```sql
CREATE TABLE launchpad_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  item_key     text NOT NULL,
  completed    boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id, item_key)
);
ALTER TABLE launchpad_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own progress"
  ON launchpad_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/launchpad/[projectId]/checklist` | Fetch items with user progress merged |
| PATCH | `/api/launchpad/[projectId]/progress` | Toggle item completion |
| GET | `/api/admin/tips` | List draft tips (admin only) |
| PATCH | `/api/admin/tips/[itemKey]` | Approve or reject a tip draft (admin only) |

---

## Components

| Component | Location | Purpose |
|---|---|---|
| `LaunchpadRoom` | `components/launchpad/LaunchpadRoom.tsx` | Per-project Launchpad container — renders section headers + item list |
| `ChecklistSection` | `components/launchpad/ChecklistSection.tsx` | One week/section: header, sub-label, item list, collapse behavior for Before release |
| `ChecklistItem` | `components/launchpad/ChecklistItem.tsx` | Single item row: checkbox + label + row click → opens side panel |
| `TipPanel` | `components/launchpad/TipPanel.tsx` | Right side panel: tip body + steps + action CTA |
| `ProjectCards` | (inline on `/launchpad` page) | Cards at top of global page linking to per-project rooms |

---

## Scope Fences

- **Do not** change the structure of the existing global `/launchpad` playbook page render. Only add project cards above it.
- **Do not** auto-generate tip drafts in Phase 5 — tips are seeded manually as admin for the first batch. The AI monthly cadence is a future operational workflow, not a shipped feature.
- **Do not** build industry expert contribution flow — that is Wave 4.
- **Do not** auto-complete items based on tool run events in Phase 5 — manual checkbox only. Event-based auto-completion is a Phase 5 stretch or Phase 6.
