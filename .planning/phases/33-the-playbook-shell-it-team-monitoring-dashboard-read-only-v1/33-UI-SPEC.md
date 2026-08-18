---
phase: 33
slug: the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-17
---

# Phase 33 — UI Design Contract

> Visual and interaction contract for The Playbook shell (Rail 2 double-sidebar nav) + the IT Team room (4 rendered-markdown doc pages + the bespoke Monitoring Dashboard opening page), read-only v1.

**This phase is unusually well-specified.** Three locked HTML mockups + `33-CONTEXT.md`'s ten decisions (D-01..D-10) fix almost every visual/UX question already. This document's job is to (a) restate those locked answers in prescriptive, planner/executor-usable form, (b) reconcile the mockups against the codebase's *actual* existing admin shell (which does not match the mockups' Rail 1 chrome), and (c) resolve the handful of states the mockups genuinely leave open (degraded health, doc-page chrome, "Coming soon" ghost treatment). Every decision below cites its source — `CONTEXT.md D-NN`, a mockup file, or "researcher default" for the genuinely unspecified gaps.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none (radix/base-ui not used anywhere in this codebase) |
| Icon library | none — inline SVG `<symbol>`/`<use>` sprite, copied verbatim from the mockups (`i-book`, `i-pulse`, `i-vendor`, `i-shield`, `i-go`) |
| Font | Inter (`var(--font-sans)`, set once at `app/layout.tsx` and inherited app-wide) for UI chrome; `ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace` for mono elements (crumbs, metric values, code) |

**No shadcn.** This codebase has never adopted shadcn across 30+ prior phases — every admin/buyer surface is hand-rolled Tailwind + a scoped CSS custom-property token block (`ADMIN_CONSOLE_CSS`, `components/buyer/fnbl-theme.ts`'s `FNBL_CSS`). `CONTEXT.md`'s locked discretion resolution — "Theme: inherit the dark Team Console theme (`ADMIN_CONSOLE_CSS` / `data-theme` no-flash discipline)" — confirms the intended approach is to extend that existing token system, not introduce a component library. The shadcn init gate is skipped as inapplicable to this project's established convention; do not raise it again for this phase.

**Existing tokens this phase must reuse (already live in `tailwind.config.ts` and `components/admin/console-theme.ts`), do not redeclare:**

| Token | Value | Mockup equivalent |
|---|---|---|
| `--ground` / `ink` | `#0a0a0f` | `--ink` |
| `--panel` / `card` | `#0E0D1E` | `--card` |
| `--panel-2` / `card2` | `#1A1838` | `--card2` |
| `--ink` (text) / `white` | `#FFFFFF` | `--white` |
| `--ink-2` / `lav` | `#C7CBF7` | `--lav` |
| `--ink-3` / `lavdim` | `#7c80b4` | `--lavdim` |
| `--border` / `hair` | `rgba(199,203,247,.12)` | `--hair` |
| `--border-2` / `hairstrong` | `rgba(199,203,247,.22)` | `--hairstrong` |
| `--indigo` | `#818CF8` | `--indigo` |
| `--fuchsia` | `#D946EF` | `--fuchsia` |
| `--grad` | `linear-gradient(105deg,#818CF8 0%,#D946EF 100%)` | `--grad` |
| `--green-fg` / `emerald` | `#34D399` | `--emerald` |
| `--amber-fg` | `#F4C77B` (admin token uses the softer amber) | mockup `--amber:#F59E0B` — **use the mockup's `#F59E0B` for the SEV-3/warning dot** to match the locked severity legend exactly; `ADMIN_CONSOLE_CSS`'s `--amber-fg` stays reserved for its existing generic-warning usage elsewhere in the console |
| `--rose-fg` | `#F9A8C0` (admin) vs mockup `--rose:#F43F5E` — **use the mockup's `#F43F5E`** for this phase's critical/site-critical/degraded semantics (matches the locked mockups exactly; admin's softer `#F9A8C0` is a different, unrelated usage elsewhere) |
| `money` / `money2` | `#F59E0B` / `#F4C77B` | mockup `--money:#F4C77B` |

The Playbook surface renders inside the existing `.fncon` wrapper (`app/(admin)/layout.tsx` already applies `ADMIN_CONSOLE_CSS` + `data-theme`) — no new theme provider, no new `data-theme` toggle logic. This phase adds zero new CSS custom properties to the token block; where the mockups' literal hex (`--rose:#F43F5E`, `--amber:#F59E0B`) differs from the console's existing generic tokens, use the mockup's literal hex value directly via Tailwind arbitrary values (`text-[#F43F5E]`) scoped to Playbook components only, rather than mutate the shared token block.

**No markdown renderer is installed yet** (`react-markdown`+`remark-gfm` vs `marked` — D-10 explicitly defers the library choice to planning/RESEARCH). This UI-SPEC fixes the *rendered contract* (§ Doc-Page Markdown Container below) independent of which library is chosen.

---

## Layout & Shell (extends the template — required for this phase)

### Rail reconciliation — mockups vs. existing code

The three mockups show **two different rail configurations** and neither is what's actually in production. Reconcile as follows:

1. **Rail 1 (main admin sidebar) — DO NOT restyle.** `playbook-double-sidebar.html`'s `.rail1` (210px, gradient "Funūn" wordmark, icon+chevron nav items, gradient active-pill, avatar+name+role footer) is **aspirational mockup chrome that does not match the shipped `app/(admin)/layout.tsx`** (plain `w-48`/192px, text-only links via `NAV_LINK_CLASS`, "Admin" label, `AdminThemeToggle` + `SignOutButton` footer, no active-state anywhere). Per D-04, the only real requirement is: **add one new link, "The Playbook,"** to the existing nav, visible to all staff, using the **existing `NAV_LINK_CLASS` styling** — not the mockup's fancier treatment. Consistency with the other 15 existing links in that sidebar outranks matching the mockup's Rail 1 chrome, which was illustrative, not a literal rebuild target.
   - **Placement:** first item in the nav, directly under the "Admin" label, before "Checklist Items" — mirrors the mockup's placement as the top/primary entry and gives it visual priority appropriate to "every staff member sees this."
   - **Active state (researcher default, resolving CONTEXT.md's open discretion item):** Rail 1 currently has *no* active-state styling anywhere. Add one, scoped to this single link only: when the current path starts with `/admin/playbook`, apply `bg-[color:var(--border)] text-[color:var(--ink)] font-semibold` (i.e., the link's own existing hover treatment, made permanent) rather than inventing new gradient-bar chrome unseen elsewhere in Rail 1. Implement via a small client-side `usePathname()`-based nav-link component wrapping just this entry (the rest of Rail 1 stays server-rendered and stateless).
2. **Rail 2 (Playbook rooms) — net-new, build to `playbook-double-sidebar.html`'s `.rail2` faithfully.** Nothing exists to reconcile against; this is the canonical source. Width **238px**, `background:var(--card)`, `border-right:1px solid var(--hair)`, sticky/full-height. Header block: book icon (14px) + "The Playbook" (15px/800/white) + subhead "Company wiki · SOPs, topics & plays" (11px/lavdim) below a hairline rule.
3. **Content column chrome (sticky top bar + h1 + wrap) — use `playbook-double-sidebar.html`'s `.ctop`/`.cwrap`/`.h1` pattern as canonical**, not `observability-dashboard.html`'s `.top`/`.main` variant. Reasoning: the double-sidebar mockup is the only one of the three that actually renders inside a 3-column (Rail 1 + Rail 2 + content) shell — the other two mockups drop Rail 1 entirely to show more content width and are the canonical source for *internal panel/tile detail*, not for the outer chrome. So: sticky `.ctop` bar (crumb left, ACL chip + Live chip right, `padding:16px 28px`, blurred glass background), then `<h1>` inside `.cwrap` (`max-width:900px`, `padding:22px 28px 60px`), 24px/800/white/`ls:-.02em`.
4. **Internal panel/tile/grid layout (tiles row, `grid2` two-column panels, vendor grid, thresholds table, digest, quick-links) — use `observability-dashboard.html`'s structure and spacing verbatim** (it is the more fully detailed reference for the dashboard's own content). See Component Inventory below.
5. **Doc pages — use `playbook-it-team-room.html`'s page-header pattern** (crumb, `<h1>`, `<p class="lede">`, then content) for the region *above* the rendered markdown, and the § Doc-Page Markdown Container contract below for the rendered `.md` body itself.

### Responsive collapse (CONTEXT.md discretion — locked, follow the mockups)

- Breakpoint: `max-width:1000px` (mockups' literal value — do not use Tailwind's `md`/900px default).
- Below it: `.pb{grid-template-columns:1fr}` — Rail 2 and content stack into a single column; Rail 2 becomes a static (non-sticky) horizontal flex-wrap strip (`flex-direction:row;flex-wrap:wrap;padding:12px`), with `.r2sub`, `.rlabel`, and `.sub` (sub-room lists) **hidden** at this width — only the top-level room row + dot show, tap-through to reach a room's index page.
- `.tiles` collapses from 4 columns to 2 (`grid-template-columns:1fr 1fr`).
- `.grid2` (uptime/thresholds panels) and `.vgrid` (vendor grid) each collapse to a single column.
- No JS-driven collapse/hamburger toggle — pure CSS media query reflow, matching the "URL-driven, no client state" principle in `CONTEXT.md`'s Phase Boundary.
- **Rail 1's own responsive behavior is unchanged / out of scope** — it has no mobile treatment today and this phase does not add one; only the net-new Rail 2 + content get the `<1000px` collapse.

---

## Component Inventory & States

### Rail 2 — room list

- Room row (`a.room` when destination exists): 9px/10px padding, 9px border-radius, 13.5px/500/lav, 9px gap between the leading dot and label. Hover: `background:rgba(199,203,247,.05)`, `color:white`.
- Active room row: `background:var(--card2)`, `color:white`, `font-weight:700`, 3px left gradient accent bar (`::before`, `var(--grad)`), dot recolors to `--fuchsia` with a soft glow.
- Sub-room list (only under an active, enterable room): indented 19px + 10px left-padding, 1px left border (`--hair`), rows 6px/9px padding, 12.5px/lavdim; the current sub-page gets `color:white;font-weight:600;background:rgba(129,140,248,.12)`.
- "Live" badge (only on the Monitoring Dashboard sub-item): trailing, 8.5px uppercase/700/emerald + a 5px pulsing dot. **Static/decorative** — it asserts "this page reads live data," not a live uptime percentage; keep it even though the tile-level numeric "Live" claims elsewhere are being stripped (D-07's honesty rule is about fabricated *numbers*, not this label).

### "Coming soon" ghost rooms (D-05) — genuinely unspecified in the mockup, researcher default

The mockup renders all six rooms as visually identical clickable `<a class="room">` elements — it shows *the room list*, not the specific inert/disabled treatment D-05 requires. Design it as follows:

- Render as a non-interactive `<div>` (never an `<a>`/`<button>` — it has no destination, so it must not be a focusable link semantically or visually).
- Same base row layout as an active room (dot + label), but: `opacity:.45`, `cursor:default`, no hover background change.
- Trailing pill badge reusing the same slot the "Live" badge occupies on Monitoring Dashboard: `Coming soon`, 8.5–9px uppercase/700, `color:var(--lavdim)`, `background:transparent`, `border:1px solid var(--hair)`, `border-radius:20px`, `padding:2px 8px` — visually related to (but clearly less urgent than) the emerald "Live" pill, so the two states read as a family without being confusable.
- No `tabindex`/focus-visible ring (it's inert content, not a disabled interactive control) — the visible "Coming soon" text alone carries the meaning for screen readers.

Applies to: Company-wide, A&R, AE / Sales, TMS, Leadership — always, for every staff member (D-05). For non-`leadership`/`it` staff, the **IT Team room row is omitted from the DOM entirely** (D-06) — not rendered as a ghost, not rendered as locked; Rail 2 for those users shows exactly five ghost rows and nothing else.

### Top bar (`.ctop`)

- Sticky, `z-index:5`, `padding:16px 28px`, `background:rgba(10,10,15,.82)` + `backdrop-filter:blur(8px)`, bottom hairline.
- Left: mono 12px crumb, lavdim, current segment bolded/lav (`The Playbook / IT Team / **Vendor Directory**`).
- Right (flex, `margin-left:auto`, gap 12px): access chip, then Live chip (dashboard page only).
- **Render this top bar identically on all 5 IT-room pages** (the 4 doc pages included) — D-02 gates the *entire room*, so the access chip belongs on every page in it, not just the dashboard. This is a deliberate extension beyond `playbook-it-team-room.html`'s literal markup (which omits the chip row) for gating consistency; the Live chip stays dashboard-only per D-07.
- Access chip: `🔒 IT + Leadership`, 11px/700/indigo, `background:rgba(129,140,248,.10)`, `border:1px solid rgba(129,140,248,.30)`, `border-radius:20px`, `padding:5px 10px`.
- Live chip: 11px/700/emerald/uppercase, 7px pulsing dot, `Live`.

### Global status banner (App Health tile's macro state)

- **Healthy** (matches mockup exactly): `border:1px solid rgba(52,211,153,.35)`, `background:linear-gradient(120deg,rgba(52,211,153,.10),rgba(129,140,248,.04))`, 11px pulsing emerald dot, bold white title "All systems operational", 12.5px lav subtext "3/3 uptime monitors up · /api/health healthy · no open incidents."
- **Degraded (researcher default — not shown in the mockup, but `/api/health` legitimately returns `status:'degraded'`/503, so this state WILL occur and must be designed, not left to improvisation):**
  - Border/background swap to the rose family: `border:1px solid rgba(244,63,94,.35)`, `background:linear-gradient(120deg,rgba(244,63,94,.10),rgba(129,140,248,.04))`, dot recolors to `#F43F5E` (solid, **not** pulsing — pulsing reads as "actively fine," a steady dot reads as "attention needed").
  - Title: "Degraded — /api/health reporting an issue." Subtext: "/api/health → 503 · re-checked at page load · see the Incident Runbook." The subtext becomes a link to the Incident Runbook sub-page (only cross-link the banner ever needs).
  - No numeric uptime% claim changes here — Better Stack's link-out tile is unaffected by this app-level check failing (they're independent signals, per D-07).
- **Unreachable/exception (belt-and-suspenders, since the dashboard imports `checkHealth()` directly rather than doing an HTTP fetch):** if the direct call throws or the response body fails to parse, render the **same visual treatment as Degraded** with subtext "Health check unavailable — treat as degraded until confirmed." Never let an exception here crash the page (wrap in try/catch server-side); never render a blank/undefined state.
- **No loading/skeleton state** — the dashboard is a server component that awaits the health re-check before rendering (D-07: "server component calls the check directly — no self-HTTP-fetch, no client fetch"), so there is no client-side spinner state to design.

### Stat tiles (`.tiles`, 4-up grid)

| Tile | v1 content | Stripe/state color | Notes |
|---|---|---|---|
| App Health | "Healthy" / "Degraded" | emerald / rose (mirrors banner) | live, from `/api/health` |
| Uptime | **Replaced** — see below | indigo/neutral | no live % (D-07) |
| Spend | `$— / $200 cap` · "v2 live figure" | money (`#F4C77B`) | explicitly badged placeholder (D-09) |
| Incidents | `0` · "none active" | indigo | static; no incident-tracking data source exists yet — this is an honest zero, not a live feed; do not imply it's dynamically computed |

- **Uptime tile replacement (D-07):** the mockup's "Uptime 30d — 99.9% · 3/3 up" tile is a fabricated number and must NOT ship as-is. Replace its value slot with a compact external link: keep the tile's `good`/emerald stripe and the "Uptime" label, but the `.tv` slot becomes `View live status →` (14–16px/700/indigo, not the 22–26px numeric treatment) linking to `https://funun.betteruptime.com`, and the `.ts` slot becomes "Better Stack · opens in new tab" (11.5px/lavdim). This is the tile-level expression of the same link-out that also drives the full Uptime panel replacement below.

### Uptime panel (replaces `.panel` "Uptime — production routes")

D-07 drops the per-route %s and sparklines entirely — this is not a restyle of the existing `.urow` list, it's a **structural replacement**:

- Panel header unchanged (`.ph`: pulse icon/emerald, "Uptime — production routes", `.src` tag "Better Stack").
- Body: a single centered call-to-action block, not a row list — icon (pulse, 28–32px, indigo), "No live per-route data in v1" (14px/600/white), "Uptime is monitored externally by Better Stack — view the live status page for real-time numbers across all monitored routes." (12.5px/lavdim, max-width ~44ch, centered), then a prominent link button: `View live status →` (matches the `.ql`/quick-link tile visual treatment: bordered card, hover lift) pointing to `https://funun.betteruptime.com`.
- Do not render the monitored-route *names* (funun.studio / /signin / /sync/catalog) as a fake "coming soon" list either — that implies per-route data is imminent within this panel, which it isn't (v2 is a vendor-API integration, not a schedule commitment). If route names are useful context, they belong in the Vendor Directory doc page's Better Stack entry, not repeated here.

### Thresholds panel

- Header: shield icon/indigo, "Thresholds & severity", trailing badge **`Live values · v2`** (fuchsia pill: `color:var(--fuchsia)`, `background:rgba(217,70,239,.10)`, `border:1px solid rgba(217,70,239,.32)`) — this badge itself is honest labeling of the *readings* column, not of the threshold *values* (which ARE real/live from `lib/observability/config.ts`).
- Rows: render every `ThresholdMetric` from `THRESHOLDS` **except** `monthly_spend_usd` (already its own Spend tile) and `uptime_consecutive_failures` (belongs to Better Stack's own alerting, represented by the Uptime tile/panel, not this table) — 7 rows. This is a deliberate expansion beyond the mockup's illustrative 4 rows, using the *actual* config as the source of truth per D-07 ("render the real threshold values... from `THRESHOLDS`"):

  | Row label | `ThresholdMetric` key |
  |---|---|
  | Vercel 5xx rate | `vercel_5xx_rate` |
  | Function throttles | `function_throttle` |
  | Route p95 latency | `dynamic_route_p95_ms` |
  | Supabase CPU | `supabase_cpu_pct` |
  | DB connections | `db_connections` |
  | Disk usage | `disk_pct` |
  | Auth/API 5xx rate | `auth_api_5xx_rate` |

- Each row: label (13px/lav) · mono value string built from `THRESHOLDS[metric]` as `warn {warning}{unit} · crit {critical}{unit}` (unit inferred per metric: `%` for rate/pct metrics, `ms` for latency, unitless count for throttle/connections) · a trailing `awaiting feed` pill (`.band.await`, fuchsia, matches the mockup's literal class exactly — reuse it verbatim).
- Severity legend footer unchanged: rose dot "SEV-1/2 critical", amber dot "SEV-3 warning", emerald dot "healthy" — this is a static legend, not data-driven.
- No provisional-band caveat needs surfacing here (that's an internal config comment, not user-facing copy) — the "awaiting feed" badge already communicates "not measured yet."

### Vendors panel

- Header: vendor icon/lav, "Vendors", `.src` tag "directory + deep links".
- Grid: **10 cells**, 2-column, matching `observability-dashboard.html`'s exact list — Vercel, Supabase, DNS/Registrar, Sentry, Better Stack, Stripe, Resend, Anthropic, DocuSeal, Google Places. **Deliberately excludes GitHub** (the 11th entry that appears on the separate Vendor Directory doc page) — GitHub is deploy-time-only (source control/build trigger), not a runtime dependency the Monitoring Dashboard's "is something live broken right now" framing needs; it stays a doc-page-only entry.
- Each cell: colored dot (rose `.crit` for the 3 site-critical vendors — Vercel/Supabase/DNS; lavdim `.norm` for the rest), name (13px/600/white), function line (10.5px/lavdim), trailing external-link arrow icon (indigo). Whole cell is a link (`<a>`) to that vendor's real dashboard/status URL.
- Footer note (11.5px/lavdim): "🔴 = site-critical (down = full outage). Per-vendor live status dots arrive in v2 (their status APIs); for now each tile deep-links to that vendor's own dashboard + status page." — copy verbatim from the mockup, it's already accurate to v1.
- **Deep-link URLs:** use each vendor's real dashboard/status page. Two are explicitly flagged as open confirms in `VENDOR-DIRECTORY.md`'s own footer ("⚑ Open gaps to resolve once: DNS registrar · DocuSeal status URL.") — carry that same caveat into planning rather than fabricating a URL for those two; every other vendor has a well-known dashboard/status URL (vercel.com/dashboard + vercel-status.com, supabase.com/dashboard + status.supabase.com, sentry.io + status.sentry.io, betterstack.com + funun.betteruptime.com, dashboard.stripe.com + status.stripe.com, resend.com + status.resend.com, console.anthropic.com + status.anthropic.com, Google Cloud Console + status.cloud.google.com).

### Daily digest panel (D-08)

- Header unchanged: "Daily digest", `.src` tag "cron · 06:00 UTC".
- **Exactly one row** (not the mockup's illustrative 3) — "today," computed live by reusing `checkHealthStatus()` + `classifyThreshold(metric, undefined)` from `app/api/cron/daily-observability-check/route.ts`'s own summary logic, **without invoking `fanOutAlert`/sending email**:
  - Dot: emerald if health `'healthy'`, rose if `'degraded'`, lavdim if `'unknown'` (mirrors the cron's own tri-state, not just healthy/degraded).
  - Text: `**{Healthy|Degraded|Unknown}.** /api/health re-check: {status}. All threshold metrics: no live telemetry yet (v2 wires the feed).` — do not claim "3/3 monitors up" here (that's Better Stack data this route has no access to; the cron's own digest email doesn't claim it either — verified against the cron route's actual `metricLines` construction, which only ever emits `classifyThreshold` results, never an uptime-monitor count).
  - `dwhen` column: today's date, mono, matching the mockup's column treatment.
- Below the single row, a muted note (11.5px/lavdim, `padding:10px 12px`, no border — a plain text line, not another panel): **"Full digest history arrives in v2 — this shows today's live check only; the cron's own email digest is the historical record until then."**

### Quick links ("Jump to")

- Unchanged from `observability-dashboard.html` — 4 cards (Incident Runbook, Vendor Directory, Status page, Operating Rhythm), each an internal deep-link except "Status page" which points to `https://funun.betteruptime.com`. `sechead` label "Jump to" (11px uppercase/700/lavdim) above the grid.
- Card: icon tile (32px, `var(--card2)` bg, indigo icon) + title (13px/600/white) + subtitle (11px/lavdim) + trailing go-arrow (14px/lavdim). Hover: border brightens to `--hairstrong`, `translateY(-1px)`.

---

## Doc-Page Markdown Container Contract (D-10 — the 4 rendered pages)

Applies uniformly to `docs/observability/VENDOR-DIRECTORY.md`, `RUNBOOK.md`, `OPERATING-RHYTHM.md`, `THRESHOLDS-AND-SEVERITY.md`. Content is trusted/committed, not user input — library choice (`react-markdown`+`remark-gfm` vs `marked`) is a planning/RESEARCH decision per D-10; this section fixes the *rendered visual contract* either library must produce.

**Page chrome (outside the rendered markdown):** the shared top bar (crumb + access chip, no Live chip — see Component Inventory § Top bar) + a `.wrap`-style container, `max-width:900px`, `padding:24px 34px 60px`.

**Page title simplification (researcher default):** each source `.md` file already opens with its own `# Title` and a descriptive first paragraph (e.g. `RUNBOOK.md`'s `# Incident Response Runbook` + owner/scope paragraph). Rather than special-case-stripping that leading heading and re-rendering it via separate page-header markup, apply the page-header typography (h1: 28–30px/800/white/`ls:-.02em`/`line-height:1.1`; the immediately-following paragraph as a lede: 15px/lav, `max-width:64ch`) as the container's own default `h1`/first-`p` styling. The markdown's natural structure already matches `playbook-it-team-room.html`'s literal `<h1>` + `<p class="lede">` pattern — no extraction logic needed.

**Element styles for the rendered body:**

| Element | Treatment |
|---|---|
| `h2` (section headers, e.g. "## 1. Where an incident originates") | 19–20px/700/white, `margin-top:32px`, `margin-bottom:12px` |
| `h3` (e.g. "### Idempotency", "### 3a. When NOT to roll back") | 15–16px/700/white, `margin-top:22px` |
| `p` | 14px/400/`var(--lav)`, `line-height:1.6` |
| `strong`/bold | `color:white`, `font-weight:600` |
| `a` (internal + external links) | `color:var(--indigo)`, no underline by default, underline on hover |
| `blockquote` (used for callouts, e.g. `RUNBOOK.md`'s "> **DRAFT STATUS:** ...") | Left 3px accent bar in `--amber` (`#F59E0B` — this is a caution/draft callout, not the brand gradient), `background:rgba(245,158,11,.06)`, `border-radius:0 12px 12px 0`, `padding:12px 16px`, `margin:16px 0` |
| `table` (used heavily — GFM tables) | `border:1px solid var(--hair)`, `border-radius:12px`, `overflow:hidden`; `thead th`: `background:var(--card2)`, 11px/700/lavdim/uppercase, `padding:10px 12px`; `td`: 13px/lav, `padding:10px 12px`, `border-top:1px solid var(--hair)` |
| `code` (inline) | `font-family:var(--mono)`, 12.5px, `background:var(--card2)`, `padding:2px 6px`, `border-radius:5px`, `color:var(--lav)` |
| `pre`/code fences | `background:var(--card)`, `border:1px solid var(--hair)`, `border-radius:10px`, `padding:14px 16px`, mono 12.5px, horizontal scroll not wrap |
| `ul`/`ol` | 14px/lav, `line-height:1.6`, 6–8px gap between items, standard disc/decimal markers |
| `hr` (the docs' frequent `---` section dividers) | `1px solid var(--hair)`, `margin:32px 0` |

No table of contents, no sidebar-within-page anchor nav, no syntax highlighting beyond the plain `pre` treatment above — v1 keeps this to a clean, readable long-form container, not a docs-site product.

---

## Spacing Scale

This phase's canonical source is the **locked pixel-precise mockups**, not the generic 8-point grid — the mockups use a denser scale tuned for an information-dense admin panel, and several literal values fall outside strict 4px multiples (11px, 13px, 14px, 15px, 17px, 18px, 19px, 34px all recur). Treat the mockups' literal values as authoritative; the table below is the *distilled, reusable* set an executor should reach for, with the real literals noted as the sanctioned exceptions.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-label gaps within a badge/pill |
| sm | 8–9px | Compact row internal gaps (rail nav rows, tile stripe offsets) |
| md | 12–14px | Default card/tile/panel-header padding, grid gaps |
| lg | 16–18px | Panel padding, `.wrap`/`.cwrap` horizontal padding (dashboard variant) |
| xl | 22–24px | Content vertical padding (top of `.cwrap`/`.wrap`), h1-to-content gap |
| 2xl | 28–34px | Content horizontal padding (`.ctop`/`.wrap`/`.main` — 28px for the 3-rail shell, 34px for the 2-rail detail mockups) |
| 3xl | 60–70px | Page bottom padding |

Exceptions (locked, keep exactly as in the mockups — do not round to the grid above): Rail 2 padding `20px 14px`; `.tile` padding `14px 15px` / `16px 17px` (shell vs. dashboard variant); `.urow`/`.vcell`/`.trow`/`.drow` padding `10–12px`; `.firstmove`/`.fcard` padding `18px 19–20px`; gap values of `10px`, `13px`, `18px` throughout the grid/flex containers. When shell chrome (3-rail) and dashboard-detail (2-rail mockup) padding values differ slightly for the equivalent region, prefer the shell mockup's value (28px) since that's what the real 3-rail production layout will render at — the dashboard-detail mockup's 34px assumed more available width than the real shell leaves once Rail 1 + Rail 2 are both present.

---

## Typography

This phase locks **4 font weights** inherited unmodified from the mockups — Regular (400, body copy/lede), Medium (500, nav links), Bold (700, panel headers/labels/badges), Extrabold (800, page titles/brand wordmark). This exceeds the standard 2-weight guideline; it is an explicit, justified exception because the visual source (the three locked mockups) already fixes this exact ramp and none of it is being redesigned here.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body / paragraph | 13–14px | 400 | 1.5–1.6 |
| Label / uppercase micro-copy (badges, section labels, thresholds header) | 9.5–11.5px, `letter-spacing:.14em–.16em`, uppercase | 700 | 1.2 |
| Nav item | 13–14px | 500 (600 when active) | 1.3 |
| Panel/card header (`h2`-equivalent, e.g. "Uptime — production routes") | 13.5–15.5px | 700 | 1.2 |
| Heading — page `h1` (shell chrome, e.g. "Monitoring Dashboard") | 22–24px, `letter-spacing:-.02em` | 800 | 1.1 |
| Display — doc-page `h1` (long-form title, e.g. "SaaS & Infra Vendor Directory") | 25–30px, `letter-spacing:-.02em` | 800 | 1.1 |
| Mono (crumbs, metric values, thresholds, digest dates) | 10–13px | 400–700 | 1.3 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0a0a0f` (`--ink`/`--ground`) | Page background, Rail 1/Rail 2 nav gradient background |
| Secondary (30%) | `#0E0D1E` (`--card`/`--panel`) + `#1A1838` (`--card2`/`--panel-2`) | Panels, tiles, Rail 2 surface, active-row/chip backgrounds |
| Accent (10%) | `#818CF8` → `#D946EF` gradient (`--grad`) | **Reserved for:** active-room left accent bar + active-room dot glow, the "Funūn" wordmark on Rail 1 (unchanged, pre-existing), the sticky-header blur accent is neutral (no gradient there) |
| Destructive | `#F43F5E` (mockup `--rose`, not the console's softer `--rose-fg`) | Reserved for: degraded App Health banner/tile, site-critical vendor-dot (`.vd.crit`), SEV-1/2 legend dot. **No destructive user *actions* exist in this read-only v1** — rose here is purely status-semantic, never a delete/remove button (there are none) |

Accent reserved for: the active-nav-row indicator (bar + dot) in both Rail 1 (the one new active-state treatment) and Rail 2, and nothing else — never applied to large surfaces, body text, or as a general "brand color wash." Do not tint tiles, panels, or badges with the gradient outside these two specific nav-row contexts.

Additional semantic (non-accent, non-destructive) colors already established and reused verbatim from the mockups:

| Color | Hex | Usage |
|---|---|---|
| Emerald | `#34D399` | Healthy status (banner, App Health tile, digest dot), Live chip/badge, healthy sevlegend dot |
| Amber | `#F59E0B` | SEV-3/warning sevlegend dot, blockquote-callout accent (doc pages) |
| Fuchsia | `#D946EF` | "awaiting feed" / "Live values · v2" badges (paired with the gradient's other end) |
| Money | `#F4C77B` | Spend tile stripe |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | None — this is a read-only v1 with no forms/creation. The nearest analog is a navigational CTA: **"View live status →"** (Uptime tile + panel, links to `https://funun.betteruptime.com`) |
| Rail 2 header | "The Playbook" / subhead "Company wiki · SOPs, topics & plays" |
| Access chip | `🔒 IT + Leadership` (verbatim, all 5 IT-room pages) |
| Live chip | `Live` (verbatim, Monitoring Dashboard page + Rail 2's Monitoring Dashboard sub-item only) |
| "Coming soon" ghost badge | `Coming soon` (the 5 non-IT rooms, every staff member) |
| Global status banner — healthy | "All systems operational" / "3/3 uptime monitors up · /api/health healthy · no open incidents" |
| Global status banner — degraded (researcher default) | "Degraded — /api/health reporting an issue" / "/api/health → 503 · re-checked at page load · see the Incident Runbook" |
| Uptime panel replacement body | "No live per-route data in v1" / "Uptime is monitored externally by Better Stack — view the live status page for real-time numbers across all monitored routes." |
| Spend tile | `$— / $200 cap` / "v2 live figure" |
| Thresholds badge | `Live values · v2` |
| Thresholds row status | `awaiting feed` |
| Vendors footer note | "🔴 = site-critical (down = full outage). Per-vendor live status dots arrive in v2 (their status APIs); for now each tile deep-links to that vendor's own dashboard + status page." |
| Daily digest v2 note | "Full digest history arrives in v2 — this shows today's live check only; the cron's own email digest is the historical record until then." |
| Empty state (Incidents tile) | "none active" — this is the tile's permanent state in v1, not a transient empty state; there is no incident-list surface to empty-state |
| Error state (health-check exception) | "Health check unavailable — treat as degraded until confirmed" |
| Destructive confirmation | Not applicable — no destructive actions exist anywhere in this read-only v1 (no delete/edit/publish surfaces per the phase boundary) |

---

## Registry Safety

Not applicable — no shadcn, no component registry of any kind is used in this phase.

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable |
| third-party | none | not applicable |

---

## Access & Role Gating (design-relevant subset of D-01/D-02/D-06 — cross-reference for the executor)

- Every one of the 5 IT-room pages carries its **own inline `requireStaff(['leadership','it'])` self-guard** (D-02) — the shell/layout gate is not sufficient authority on its own, matching this codebase's established "layout gate + per-page inline guard" pattern (`25-06`, `13-04` precedent). This is a data/access concern, not a visual one, but it determines the *rendering* contract above: a non-authorized staff member requesting `/admin/playbook/it/*` directly never sees any of this phase's IT-room UI (redirect, not a locked/greyed rendering) — there is no "you don't have access" visual state to design for the IT room itself, only the Rail-2-level omission already specified.
- The owner (`is_admin=true` → leadership) always reaches the IT room via the leadership branch — no UI needs to special-case "owner without the `it` role."

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
