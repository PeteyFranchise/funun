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

## observability-dashboard.html

The **Observability Admin Dashboard (v1)** — the in-app monitoring surface for IT + leadership, shown as
the IT Team room's "Monitoring Dashboard" page. Single pane of glass; **honest about v1-now vs. v2-later**.

- **What it shows:** a global status banner; stat tiles (health / uptime / spend / incidents); the Better
  Stack uptime panel (3 routes + sparklines); the vendor grid with site-critical flags + deep links;
  thresholds & severity (tagged **"Live values · v2"**); and the daily digest. Data that exists today is
  live; live metric values are clearly marked as arriving in v2.
- **Published artifact:** https://claude.ai/code/artifact/91287ad5-ed28-408b-b123-ef0ebe655c65
- **Related:** v2 (live metrics) is captured in
  `.planning/todos/pending/2026-08-17-observability-dashboard-v2-live-metrics.md`; data sources live in
  `docs/observability/` (VENDOR-DIRECTORY, THRESHOLDS-AND-SEVERITY, UPTIME-MONITORING).
- **Status:** design reference only — not built. v1 ships as an `/admin/observability` page (leadership
  gate now → + an IT role later).
- **Created:** 2026-08-17.

## playbook-double-sidebar.html

The **two-level ("double sidebar") nav** for The Playbook — how the wiki incorporates into the *real* admin
console. The **main admin sidebar** carries a "The Playbook" item (visible to everyone) that opens a
**secondary sidebar** of the Playbook's rooms + sub-rooms, with content on the right.

- **What it shows:** main rail (real admin items + The Playbook active) → secondary rail (rooms:
  Company-wide, A&R, AE/Sales, IT Team ▸ [Vendor Directory, Runbook, Operating Rhythm, Thresholds,
  Monitoring Dashboard], TMS ▸ Training, Leadership) → content (the Monitoring Dashboard). The pattern
  **generalizes** to any structured main-nav room.
- **Published artifact:** https://claude.ai/code/artifact/9339c72a-978b-4ecc-9a06-c755b13b2aa9
- **Implementation note:** a nested Next.js layout under `/admin/playbook/*` renders the second rail
  (URL-driven, no client state); reuses the existing `requireStaff` role-gating in `app/(admin)/layout.tsx`.
- **Related:** reconciles `playbook-it-team-room.html`'s standalone nav (which was illustrative) with the
  real admin nav; RBAC model in `.planning/deliberations/team-member-rbac-access-model.md`.
- **Status:** design reference only — not built.
- **Created:** 2026-08-17.
