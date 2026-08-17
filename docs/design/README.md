# Design references

Visual mockups for features that are **planned but not yet built**. These are reference artifacts to
guide implementation — **not** shipped UI, and nothing in `app/` imports them.

## playbook-it-team-room.html

A mockup of **The Playbook** (Funūn's internal company wiki) — specifically the **IT Team room** —
rendered in the real Funūn brand tokens (`ink`, `card`, indigo→fuchsia gradient). Self-contained HTML
(inline CSS, no external assets); open it directly in a browser.

- **What it shows:** the IT Team room with the **SaaS & infra vendor directory** as its landing page —
  a left rail of team rooms (IT Team open, its sub-pages mapping 1:1 to the real docs: Vendor Directory,
  Incident Runbook, Operating Rhythm, Thresholds & Severity, + a future Monitoring Dashboard), an
  incident "first move" banner, an at-a-glance list of all 11 vendors tagged by blast radius
  (site-critical / feature / monitoring / deploy-time), and two full vendor entries.
- **Published artifact (same file):** https://claude.ai/code/artifact/bc9ddd19-9458-42b3-8d2c-62739ade4407
- **Source content it visualizes:** `docs/observability/VENDOR-DIRECTORY.md`, plus the sibling
  observability docs (`RUNBOOK.md`, `OPERATING-RHYTHM.md`, `THRESHOLDS-AND-SEVERITY.md`).
- **Status:** design reference only. The real in-app Playbook room is a future build that rides on the
  RBAC / access-model (team rooms) work. Product direction is captured in the memory note
  `project_it_team_playbook_sops`.
- **Created:** 2026-08-17.

## playbook-editor.html

The **page editor** for The Playbook — how a Team Member *adds a content entry*. Same Funūn brand and
shell as the room view. Self-contained HTML; open directly in a browser.

- **What it shows:** a draft SOP being written ("Vercel 5xx spike — response SOP") with rendered blocks
  (callout, paragraph, checklist, link/bookmark card, video embed), plus the open **"/" insert menu**
  listing the full block palette — Text, Heading, Checklist, Bulleted/Numbered list, Divider, Image,
  Video, File, Link/Bookmark, Table, Code, Page-link, and Playbook templates (Callout, SOP steps,
  Vendor card). Top-right shows the **Draft → Publish** flow with a "publishes after room-lead review" gate.
- **Published artifact (same file):** https://claude.ai/code/artifact/06f51cef-613f-43dc-bc61-62b37a914a79
- **Related:** the approval flow it depicts is captured in the memory note
  `project_playbook_permissions_model`; the room view is `playbook-it-team-room.html`.
- **Status:** design reference only — the editor is not built.
- **Created:** 2026-08-17.
