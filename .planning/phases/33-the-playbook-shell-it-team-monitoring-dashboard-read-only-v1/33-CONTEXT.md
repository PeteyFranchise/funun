# Phase 33: The Playbook shell + IT Team monitoring dashboard (read-only v1) - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver **The Playbook** — a new internal Team-Member admin surface (company wiki) — as a **double-sidebar nav under `/admin/playbook/*`**, and ship the **IT Team room read-only**.

- Rail 1 (existing main admin sidebar) gets a **"The Playbook"** entry, visible to all staff; clicking it opens **Rail 2** (a secondary sidebar of rooms/sub-rooms).
- The **IT Team room** renders the 4 existing `docs/observability/` docs as pages **plus a live single-pane Monitoring Dashboard** as its opening page.
- Nested Next.js layout, **URL-driven, no client state**, reusing the existing `requireStaff` role-gating from `app/(admin)/layout.tsx`.
- **READ-ONLY viewing only.**

**Explicitly OUT (deferred to follow-on phases):** in-app authoring (block editor / create-edit-publish), the rooms→sub-groups→entries RBAC permission model **and any room×role access editor**, DB-stored entry content, the other rooms' content, and Observability Dashboard **v2** (live metrics/charts, vendor-status APIs, live spend/threshold readings, stored digest history).

</domain>

<decisions>
## Implementation Decisions

### Access & Roles (Area 1)
- **D-01:** Introduce a new **`it` StaffRole now.** Add `'it'` to the `StaffRole` union + `ALL_STAFF_ROLES` and recognize it in `getStaffRole()` (`lib/admin/staff-role.ts`), mirroring the `anr` precedent. Requires an **OWNER-RUN migration** widening the `funun_staff` `staff_role` CHECK (pattern: `108_anr_staff_role.sql`). Recognizing `it` in code before the migration is safe — no `funun_staff` row can hold `it` until the owner assigns it (same reasoning as `anr`).
- **D-02:** Gate the **entire IT Team room** (all 4 doc pages **+ the Monitoring Dashboard**) to **`leadership + it`** via `requireStaff(['leadership','it'])`, enforced by an **inline guard on the IT-room route segment** — not the shell layout gate alone (mirrors the established "every gated page carries its own inline self-guard; the layout gate is deliberately not the sole authority" pattern). Owner/admin (`is_admin=true → leadership`) is admitted via the leadership branch.
- **D-03:** **Single-role model stands for v1.** `staff_role` remains one value per account; the multi-role "set of togglable roles" model is NOT built here (deferred RBAC work). Adding `it` is one more possible value of the single slot — a person is `it` **or** `leadership`, not both, until the multi-role work lands.

### The Playbook shell + Rail 2 rooms (Area 2)
- **D-04:** Rail 1 **"The Playbook"** entry is visible to **all staff** (per roadmap), opening the nested `/admin/playbook/*` surface.
- **D-05:** Rail 2 shows **all six mockup rooms**: Company-wide, A&R, AE/Sales, **IT Team**, TMS, Leadership. The five non-IT rooms render as **disabled, non-clickable "Coming soon" ghosts** (no destination) — "show the vision."
- **D-06:** IT room visibility is **role-conditional**: the IT Team room (active, enterable, with its 5 sub-pages) renders **only for `leadership + it`**. Non-authorized staff (`ae`/`bd`/`anr`) see Rail 2 with **just the five "Coming soon" ghosts — the IT room is hidden from them entirely** (not shown locked). So for non-authorized staff, The Playbook is entirely "coming soon" in v1.
- IT room sub-pages (5, in order): **Vendor Directory · Incident Runbook · Operating Rhythm · Thresholds & Severity · Monitoring Dashboard** (the opening/index page).

### Monitoring Dashboard live-ness (Area 3)
- **D-07:** Posture = **"live health + honest reference."** `/api/health` is the only code-readable signal, so:
  - **App Health tile + global status banner:** LIVE via a server-side `/api/health` re-check. Reuse the `import { GET as checkHealth }` pattern from `app/api/cron/daily-observability-check/route.ts` (server component calls the check directly — no self-HTTP-fetch, no client fetch).
  - **Uptime tile + per-route uptime panel:** NO live Better Stack data (there is no API client — that's the deferred vendor-API integration). Replace with a **"View live status →" link-out** to the public status page **`https://funun.betteruptime.com`**. Drop the fabricated per-route %s and decorative sparklines.
  - **Thresholds panel:** render the **real** threshold values (warn/crit) from `lib/observability/config.ts` (`THRESHOLDS`). Live readings column = v2 ("awaiting feed").
  - **Vendors grid:** **live deep-links** to each vendor's dashboard + status page. Per-vendor live status dots = v2.
  - **Quick links ("Jump to"):** static deep-links to the other IT docs + the status page.
  - Drop the fake **"updated 12s ago"** freshness chrome. The **"Live" chip is honest** — shown only on health-driven surfaces.
- **D-08:** **Daily digest panel = one LIVE "today" row.** Render today's status (health from `/api/health` + threshold classifications via `classifyThreshold`, currently all `'unknown'` and honestly labeled "no telemetry yet") by reusing the cron's summary logic **without sending email**. Add a muted **"Full digest history arrives in v2"** note. No new storage — the cron stays email-only.
- **D-09:** **v2-deferred tiles are shown with explicit "v2" badges** (not omitted): Spend tile (`$— / $200 cap · v2 live figure`), the threshold "awaiting feed" readings column, and greyed per-vendor status dots — each clearly labeled not-yet-live. Honest because badged; signals the roadmap; matches the mockup.

### Doc-page rendering (Area 4)
- **D-10:** Render the **4 IT doc pages straight from their `.md` files** in `docs/observability/` via a markdown renderer — the `.md` files stay the **single source of truth** (no content duplication; doc edits reflect automatically). Candidate libs: `react-markdown` + `remark-gfm` (GFM tables, React-idiomatic, no `dangerouslySetInnerHTML`) **or** `marked` (tiny, HTML-string). Content is trusted/committed (not user input), so either is safe — **final lib choice = research/planning.** Style rendered markdown to the dark Playbook theme (result is styled markdown, **close to but not pixel-identical** to the mockup).
  - **Scope note:** this applies to the **4 doc pages only.** The Monitoring Dashboard opening page is **bespoke React** built to `observability-dashboard.html`, NOT a markdown render.
  - Page → file map: Vendor Directory → `VENDOR-DIRECTORY.md` · Incident Runbook → `RUNBOOK.md` · Operating Rhythm → `OPERATING-RHYTHM.md` · Thresholds & Severity → `THRESHOLDS-AND-SEVERITY.md`.

### Claude's Discretion
Defaulted rather than asked (owner opted to lock; follow the mockups + existing admin patterns unless planning surfaces a conflict):
- **URL structure** under `/admin/playbook/*` — suggest `/admin/playbook` (index → redirect authorized staff to the IT dashboard) and `/admin/playbook/it/{dashboard,vendor-directory,runbook,operating-rhythm,thresholds}`.
- **Rail 1 active/expanded state** for "The Playbook" when inside the surface; breadcrumb + **"🔒 IT + Leadership"** access chip per mockup.
- **Double-sidebar responsive/mobile** — mockups include a `<1000px` single-column collapse; follow it.
- **Theme** — inherit the dark Team Console theme (`ADMIN_CONSOLE_CSS` / `data-theme` no-flash discipline).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design mockups (locked — build to these)
- `docs/design/playbook-double-sidebar.html` — the two-level nav shell (Rail 1 entry → Rail 2 rooms/sub-rooms); source of the six-room list + "Coming soon" treatment.
- `docs/design/observability-dashboard.html` — the Monitoring Dashboard opening page (tiles, banner, uptime panel, thresholds, vendors grid, digest, quick links); the **v1/v2 split is annotated in-mockup**.
- `docs/design/playbook-it-team-room.html` — the IT room doc-page styling reference.

### IT room content (rendered from `.md` — single source of truth, D-10)
- `docs/observability/VENDOR-DIRECTORY.md` — Vendor Directory page.
- `docs/observability/RUNBOOK.md` — Incident Runbook page.
- `docs/observability/OPERATING-RHYTHM.md` — Operating Rhythm page.
- `docs/observability/THRESHOLDS-AND-SEVERITY.md` — Thresholds & Severity page.
- `docs/observability/UPTIME-MONITORING.md` — reference for the status-page URL (`https://funun.betteruptime.com`) + monitored routes; confirms **Better Stack has no code API** (drove D-07's link-out). Not itself a v1 page.

### Access / role model
- `lib/admin/staff-role.ts` — `StaffRole` union + `getStaffRole()`; **add `it` here** (D-01).
- `lib/admin/gate.ts` — `requireStaff()` role×room gate; IT-room `['leadership','it']` guard (D-02).
- `app/(admin)/layout.tsx` — existing shell gate + Rail 1 nav; the Playbook entry + nested layout attach here (D-04).
- `supabase/migrations/108_anr_staff_role.sql` — the OWNER-RUN precedent for the `it` `staff_role` CHECK-widen migration (D-01).

### Dashboard data sources
- `app/api/health/route.ts` — the **only** live signal (200/503); App Health tile + banner (D-07).
- `app/api/cron/daily-observability-check/route.ts` — reuse its `checkHealth()` + `classifyThreshold` summary logic for the live digest "today" row (D-08).
- `lib/observability/config.ts` — `THRESHOLDS` values + `classifyThreshold()` (D-07, D-08).

### Deferred-work briefs (for follow-on phases, NOT v1)
- `.planning/deliberations/team-member-rbac-access-model.md` — home for the deferred authoring + **room×role access-editor** idea.
- `.planning/todos/pending/2026-08-17-observability-dashboard-v2-live-metrics.md` — Observability Dashboard v2.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getStaffRole()` / `requireStaff()`** (`lib/admin/staff-role.ts`, `lib/admin/gate.ts`) — the exact role-gating primitives; extend the union with `it` and gate the IT room with `requireStaff(['leadership','it'])`.
- **`import { GET as checkHealth }`** pattern (in `app/api/cron/daily-observability-check/route.ts`) — server-side health re-check without self-HTTP; reuse for the App Health tile + digest "today" row.
- **`THRESHOLDS` + `classifyThreshold()`** (`lib/observability/config.ts`) — real threshold values + the null→`'unknown'` classifier for the thresholds table + digest row.
- **Admin theme** (`components/admin/console-theme` → `ADMIN_CONSOLE_CSS`, `lib/admin/theme.ts`) — dark Team Console theme + `data-theme` no-flash discipline the Playbook surface should inherit; matches the mockups' dark palette.

### Established Patterns
- Admin route group `app/(admin)/` with a shared layout gate that admits **any** staff role, plus **inline per-page role self-guards** (layout gate is deliberately not the sole authority). The Playbook = a nested layout under this group; the IT room carries its own `['leadership','it']` inline guard.
- **New staff roles ship live** by (a) widening the `StaffRole` union in code + (b) an owner-run migration widening the `funun_staff` CHECK; code recognizing the role before the migration is safe (no row can hold it yet) — the `anr`/`108` precedent.
- **No markdown renderer exists yet** — adding one is net-new (D-10). The few `dangerouslySetInnerHTML` uses in the repo (messages/selects) are unrelated to markdown.

### Integration Points
- **Rail 1:** add "The Playbook" link in `app/(admin)/layout.tsx` (visible to all staff).
- **Nested layout:** `/admin/playbook/*` layout renders Rail 2 from a static room list (URL-driven, no client state).
- **IT room segment:** `/admin/playbook/it/*` with the inline `requireStaff(['leadership','it'])` guard; dashboard as the index page.
- **Dashboard server component:** fetches health + threshold classifications at request time; links out to Better Stack + vendor dashboards.

</code_context>

<specifics>
## Specific Ideas

- **Owner enters via leadership, not `it`.** The owner is the bootstrap admin (`is_admin=true → leadership`) and reaches the IT room through the leadership branch regardless of the `it` role — the `it` role exists for a **future non-leadership IT hire**.
- **"Show the vision" instinct, confirmed twice:** full "Coming soon" room ghosts (D-05) and v2-badged dashboard placeholders (D-09) — both kept because they're clearly labeled, not fabricated-live.
- **The one honesty line the owner drew:** no fake-live numbers on a monitoring board — this drove the uptime **link-out** over static fillers (D-07).

</specifics>

<deferred>
## Deferred Ideas

- **Room × role access editor (clickable chart).** Owner's idea (raised this session): a surface where IT/Leadership see all rooms and choose which roles can view/access each, as a clickable chart. This is the **data-driven access model** — it needs DB-stored rooms + per-room role grants, **write** operations, an admin UI, and grant guardrails (last-admin protection, audit log). It is the larger deferred **RBAC** build, **not a v1 shortcut**. v1's in-code role×room gates (`it` role + `requireStaff(['leadership','it'])`) are the **forward-compatible primitives** it would later make editable. Home: `.planning/deliberations/team-member-rbac-access-model.md`.
- **In-app authoring** — block editor, create/edit/publish, DRAFT→approve flow. Deferred per phase boundary.
- **Rooms→sub-groups→entries RBAC permission model** — deferred per phase boundary; see the deliberation brief.
- **DB-stored entry content** — v1 renders from committed `.md`; DB content is the editor/v2 phase.
- **Multi-role model** — an account holding a *set* of togglable roles (permissions = union). Deferred; v1 is single-slot (D-03).
- **Other rooms' content** (Company-wide, A&R, AE/Sales, TMS, Leadership) — ghosts only in v1.
- **Observability Dashboard v2** — live metrics/charts, per-vendor status via vendor status APIs, live spend figure, live threshold readings, stored digest history. Todo below.

### Reviewed Todos (not folded)
- **"Observability Dashboard v2 — wire live metrics + charts"** (`2026-08-17-observability-dashboard-v2-live-metrics.md`) — reviewed, **not folded**. It IS the v2 destination this read-only v1 explicitly defers to; v1 renders its v2-bound tiles as badged placeholders (D-09).
- **"Add shared IT/ops account for vendor alert notifications"** (`2026-08-16-shared-it-ops-account-for-vendor-notifications.md`) — reviewed, not folded. Ops/account concern, not a Playbook-shell deliverable; relevant once the `it` role gets a real assignee.
- **"Incident-runbook tabletop (32-10 Task 3)"** + **"Run k6 capacity load test (32-09)"** — reviewed, not folded. Phase-32 follow-ons, unrelated to the read-only shell.
- **"Research watermarking alternatives"** — reviewed, not folded. Unrelated domain (content protection).

</deferred>

---

*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Context gathered: 2026-08-17*
