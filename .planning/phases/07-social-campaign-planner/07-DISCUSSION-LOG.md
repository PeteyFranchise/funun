# Phase 7: Social Campaign Planner - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 7-Social Campaign Planner
**Areas discussed:** Calendar generation & editing, Genre→platform nudge table, DropReady/SoundBait ↔ calendar wiring, CSV export & posting time, Completion tracking UI, Launchpad checklist integration, Fixed day/time defaults per platform, Direct social posting (scope boundary)

---

## Calendar Generation & Editing

| Option | Description | Selected |
|--------|-------------|----------|
| Platforms locked pre-generation | Select platforms first, changing after requires explicit regenerate | |
| Platforms editable anytime | Add/remove platforms anytime; only new/removed platform's slots regenerate | ✓ |

**User's choice:** Platforms editable anytime.

| Option | Description | Selected |
|--------|-------------|----------|
| Regenerate that platform only | Scoped AI call for the new platform, other slots untouched | ✓ |
| Full regenerate, edits lost | Whole calendar recalculated on any platform change | |

**User's choice:** Regenerate that platform only.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, inline edit | Click into any slot's caption/hook and edit directly | ✓ |
| No, AI-output only | Only regenerate via DropReady/SoundBait, no hand-edit | |

**User's choice:** Yes, inline edit.

| Option | Description | Selected |
|--------|-------------|----------|
| One campaign per project | UNIQUE constraint, regenerate updates in place | |
| Multiple campaigns allowed | No uniqueness constraint, needs picker/list UI | ✓ |

**User's choice:** Multiple campaigns allowed.

| Option | Description | Selected |
|--------|-------------|----------|
| Most recent campaign is active | Order by created_at desc | |
| Explicit is_active flag | Boolean per campaign, artist can switch | ✓ |

**User's choice:** Explicit is_active flag.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed at 4 weeks | Matches Phase 5 checklist week structure | ✓ |
| Artist picks 4, 5, or 6 | Adds a length selector | |

**User's choice:** Asked for recommendation ("which is recommended based on the research?"). Claude recommended fixed 4 weeks (matches existing checklist structure, one-click generation). User confirmed fixed 4 weeks.

| Option | Description | Selected |
|--------|-------------|----------|
| Delete allowed | Hard-delete inactive campaigns from history list | ✓ |
| No delete, history only | All campaigns persist read-only | |

**User's choice:** Delete allowed.

| Option | Description | Selected |
|--------|-------------|----------|
| 1 slot per platform per week | Simple grid, 4 × N slots total | |
| Variable (AI decides pacing) | AI varies frequency per platform | ✓ |

**User's choice:** Variable (AI decides pacing).

| Option | Description | Selected |
|--------|-------------|----------|
| AI assigns per slot | Content type varies by release context | ✓ |
| Derived from platform | Fixed platform→type mapping | |

**User's choice:** Asked for recommendation. Claude recommended AI assigns per slot (more variety, uses release context). User confirmed.

**Notes:** This area needed several "more questions" rounds before the user was ready to move on — no additional substantive decisions beyond what's listed above.

---

## Genre → Platform Nudge Table

| Option | Description | Selected |
|--------|-------------|----------|
| Simple hardcoded map in code | TS const, no DB, no admin UI | ✓ |
| Admin-editable DB table | New table + admin CRUD page | |

**User's choice:** Asked for recommendation ("recommendation for best user experience?"). Claude recommended hardcoded map (matches "no ML" note, low-churn data). User confirmed both parts together (see next row).

| Option | Description | Selected |
|--------|-------------|----------|
| Advisory badges only | Badge next to recommended platforms, nothing pre-checked | ✓ |
| Pre-checked recommended platforms | Recommended platforms start checked | |

**User's choice:** No preference stated; Claude recommended advisory badges (platforms are editable anytime, pre-checking could fight later edits). User confirmed "Yes, both (recommended)" — hardcoded map + advisory badges.

---

## DropReady/SoundBait ↔ Calendar Wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Direct write, one click | Overwrites slot immediately, no preview | |
| Preview then accept/discard | Shows preview, artist confirms before writing | ✓ |

**User's choice:** Preview then accept/discard.

| Option | Description | Selected |
|--------|-------------|----------|
| "Save to calendar" picker | Picker (platform/week/slot) after standalone run, same preview/accept pattern | ✓ |
| No save path, view only | Manual copy-paste only | |

**User's choice:** "Save to calendar" picker.

| Option | Description | Selected |
|--------|-------------|----------|
| Slot-scoped prompt (new variant) | New prompt builder with platform/week/content-type context | ✓ |
| Reuse existing prompt as-is | Same multi-field prompt, artist picks a field | |

**User's choice:** Asked for recommendation. Claude recommended slot-scoped prompt (existing prompts return fixed multi-field JSON not tailored to one slot). User confirmed.

---

## CSV Export & Posting Time

| Option | Description | Selected |
|--------|-------------|----------|
| Derive from release date + fixed time | Auto-computed, no picker | |
| Artist sets exact date/time per slot | Picker on every slot, required before export | |
| Hybrid (both) | Auto default + per-slot override | ✓ |

**User's choice:** Asked "recommendation? possibly both?" Claude recommended the hybrid. User confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Blank / omitted | No Image URL populated | |
| Link to artwork or player | Populate with artwork/player link | |
| Content-type-aware hybrid | Artwork URL for static-image/lyric-graphic only, blank otherwise | ✓ |

**User's choice:** Asked for recommendation ("recommendation? hybrid?"). Claude recommended content-type-aware population. User confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Platform + content type | Derived from slot fields, always available | ✓ |
| AI-generated hashtags | Requires hashtags on every slot | |

**User's choice:** Asked for recommendation. Claude recommended platform + content type (no dependency on AI runs). User confirmed.

| Option | Description | Selected |
|--------|-------------|----------|
| Export everything | One button, full active campaign | |
| Selectable subset | Checkboxes for platforms/weeks before export | ✓ |

**User's choice:** Selectable subset.

---

## Completion Tracking UI (SOCIAL-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox per slot, JSONB field | completed/completed_at on slot object, no new table | ✓ |
| Separate completion table | New table mirroring launchpad_progress | |

**User's choice:** Asked for recommendation. Claude recommended JSONB field (posts already JSONB, avoids duplicate structure). User confirmed.

---

## Launchpad Checklist Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Deep-link relevant items | Update action_href on existing checklist items via admin CRUD | ✓ |
| Fully separate section | No cross-reference between checklist and calendar | |

**User's choice:** Leaned toward deep-linking, asked for confirmation. Claude recommended deep-linking (low-cost, uses existing admin CRUD, ties features together). User confirmed.

---

## Fixed Day/Time Defaults Per Platform

| Option | Description | Selected |
|--------|-------------|----------|
| Claude's discretion | Planner picks sensible defaults from best practice | ✓ (via hybrid framing) |
| I'll specify exact values | User types exact day/time per platform | |

**User's choice:** Asked "does a hybrid work here?" Claude clarified this is inherently hybrid: Claude sets defaults at planning time, per-slot edit (already locked as D-03/D-15) serves as the override. User confirmed.

---

## Direct Social Posting (Scope Boundary)

**User's question:** "How do posts actually, physically get posted? Will Funūn have a direct connection to their socials for posting?"

**Claude's answer:** No — within Funūn, the artist posts manually and checks the slot complete. Via CSV export, the artist can import into Buffer (a separate third-party tool with its own account connections), which handles actual scheduled publishing. Funūn does not authenticate with or post to any social platform in this phase; that requires Meta/TikTok OAuth, explicitly deferred to Wave 4 per PROJECT.md.

**User's response:** Confirmed the boundary matches intent, but asked to note direct posting as a "must build for wave 4" idea.

---

## Claude's Discretion

- Exact fixed default day-of-week + time per platform (D-15) — grounded in general social-timing best practice, decided during planning.
- Full `social_campaigns` schema details beyond the decided fields — planner designs the complete migration.
- Exact genre list and platform rankings in the hardcoded nudge map (D-08) — derive from existing genre values already used in the codebase.
- UI placement of the campaign calendar section within `/launchpad/[projectId]` (new tab vs. section) — follow existing Launchpad room patterns.
- History/list view UI for switching/deleting inactive campaigns — minimal list, no strong preference expressed.

## Deferred Ideas

- **Direct social posting / scheduling (Meta/TikTok OAuth)** — raised during discussion, confirmed out of scope for Phase 7, explicitly flagged by the user as a Wave 4 candidate.
