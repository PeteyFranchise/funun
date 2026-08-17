# Phase 33: The Playbook shell + IT Team monitoring dashboard (read-only v1) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-17
**Phase:** 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
**Areas discussed:** IT room access, Rail 2 rooms, Dashboard live-ness, Doc rendering

---

## IT room access

Before answering, the owner asked to confirm the identity/role model. Verified from code:
identity = the Supabase auth user (login = company email, stable); role = a **mutable**
`app_metadata.staff_role` attribute; permissions derive from the role via `getStaffRole` +
`requireStaff`. Caveat surfaced: today it's a **single role slot** — the multi-role "set of
togglable roles" model is designed (owner's notes) but **not built**. Follow-up: "can a person
hold multiple roles?" → No today (single slot). Reframe: owner already enters the IT room via
`is_admin → leadership`, so the `it` role is forward-prep for a future non-leadership IT hire.

| Option | Description | Selected |
|--------|-------------|----------|
| Add `it` role now | Add `it` to the staff_role union + owner-run migration widening the funun_staff CHECK (like `anr`); gate IT room to `leadership + it`. Forward-compatible, matches the mockup chip. | ✓ |
| Leadership-only for now | Gate to `leadership`; defer `it` to the RBAC/multi-role follow-on. Zero new role surface. | |

**User's choice:** Add `it` role now
**Notes:** Confirmed identity=work-email / role=mutable-attribute model is correct, with the single-slot-today vs multi-role-future correction. Owner is covered via leadership/admin regardless; `it` gates the room for a future dedicated IT hire.

---

## Rail 2 rooms

| Option | Description | Selected |
|--------|-------------|----------|
| IT + 'more coming' hint | IT room + one muted "More rooms coming soon" line. No dead links. | |
| IT room only | Just the IT Team room; non-authorized staff see a bare empty state. | |
| Full 'Coming soon' ghosts | All six mockup rooms; five non-IT rooms as disabled "Coming soon" ghosts, IT active. Matches mockup, signals the vision. | ✓ |

**User's choice:** Full 'Coming soon' ghosts

### Follow-up — IT room visibility for non-authorized staff

| Option | Description | Selected |
|--------|-------------|----------|
| Locked, visible to all | Everyone sees IT Team with a lock; can't enter. Full-transparency structure. | |
| IT hidden for them | Non-authorized staff (ae/bd/anr) don't see the IT room at all — only the five ghosts. | ✓ |

**User's choice:** IT hidden for them
**Notes:** IT room link is role-conditional (renders only for `leadership + it`). For everyone else, The Playbook is entirely "coming soon" in v1.

---

## Dashboard live-ness

Framing grounded in scouting: `/api/health` is the only code-readable signal; Better Stack has
no API client (only the public status page); the daily digest is email-only, stored nowhere.

| Option | Description | Selected |
|--------|-------------|----------|
| Live health + honest reference | `/api/health` drives App Health live; uptime → "View live status →" link-out; thresholds show real config values; vendor grid = live deep-links; drop fake "updated 12s ago" + sparklines. | ✓ |
| Mockup-faithful, static fillers | Keep full visual with STATIC last-known Better Stack numbers — viewer can't tell live from stale. | |
| Health only, defer rest | Ship only the live health tile + deep-links; omit uptime/thresholds/digest. Sparse. | |

**User's choice:** Live health + honest reference
**Notes:** The owner's honesty line — no fake-live numbers on a monitoring board.

### Follow-up — Daily digest panel

| Option | Description | Selected |
|--------|-------------|----------|
| Live 'today' row + v2 note | One live row (health + threshold classifications via reused cron logic, no email) + "history arrives in v2" note. | ✓ |
| Explainer card only | Small card describing the 06:00 UTC digest; no data wiring. | |
| Omit the panel | Drop the digest section until v2. | |

**User's choice:** Live 'today' row + v2 note

### Follow-up — v2-deferred tiles (Spend, threshold readings, vendor status dots)

| Option | Description | Selected |
|--------|-------------|----------|
| Show with 'v2' badges | Render them as the mockup does, each explicitly badged not-yet-live. Honest + signals roadmap. | ✓ |
| Omit until v2 | Drop them; show only live/real surfaces. Cleaner, diverges from mockup. | |

**User's choice:** Show with 'v2' badges

---

## Doc rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Render from .md (1 source) | Markdown renderer (react-markdown+remark-gfm or marked) reads the 4 docs from docs/observability/. Single source of truth, small dep + theme CSS, styled-markdown (not pixel-identical). Future-proofs v2 DB content. | ✓ |
| Hand-port to React pages | Bespoke React per doc for pixel-match, no new dep — but content duplicated (drift risk) and likely thrown away at v2. | |

**User's choice:** Render from .md (1 source)
**Notes:** Applies to the 4 doc pages only; the Monitoring Dashboard opening page stays bespoke React.

---

## Claude's Discretion

- Exact URL structure under `/admin/playbook/*` (suggested `/admin/playbook/it/{...}`).
- Rail 1 active/expanded state; breadcrumb + "🔒 IT + Leadership" access chip per mockup.
- Double-sidebar responsive/mobile collapse (mockups' `<1000px` single-column fallback).
- Dark Team Console theme inheritance (`ADMIN_CONSOLE_CSS` / `data-theme` no-flash).

## Deferred Ideas

- **Room × role access editor (clickable chart)** — owner's mid-session idea; it's the larger data-driven RBAC build (DB-stored rooms + role grants, write UI, guardrails), not a v1 shortcut. Home: `.planning/deliberations/team-member-rbac-access-model.md`. v1's in-code gates are its forward-compatible primitives.
- In-app authoring / editor; rooms→sub-groups→entries RBAC; DB-stored content; multi-role model; other rooms' content; Observability Dashboard v2 (`.planning/todos/pending/2026-08-17-observability-dashboard-v2-live-metrics.md`).
