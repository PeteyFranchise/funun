# Phase 31: AE Client Workspace + Selects (My Client Partners / Client Partners) - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the AE sales rooms from thin lists into the working surfaces the Lane-1 AE motion needs: **My Client Partners** (list → person/company workspace), the **Client Partners** leadership control tower (assign/route), the **Crate Requests** demand inbox, and the **Selects** motion (curate from The Crate → send → watermarked shareable player with per-track listen tracking), plus computed relationship health and a per-client Game Plan. Lives inside the Team Console.

This CONTEXT captures the **implementation decisions** (the "how"); the **requirements** are locked in `31-SPEC.md`.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**14 requirements are locked.** See `31-SPEC.md` for full requirements, boundaries, and acceptance criteria (18 ACs + 22 edges + 7 prohibitions; ambiguity 0.13).

Downstream agents MUST read `31-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- My Client Partners: list (Clients/Companies tabs) + person/company workspaces (R1, R2)
- Relationship health (computed + override) and its leadership-editable rules config (R3, R4)
- Role-aware navigation + leadership hold-queue (R5)
- Client Partners leadership control tower incl. assign/route (R6, R7)
- Automated assignment email + The Playbook SOP library (R8, R9)
- Crate Requests demand inbox — absorbs the Lead Engine (R10)
- Selects builder + the shareable player contract (R11, R12)
- A CRM-lite contact record layer under `buyer_orgs` (people + relationship log + status)
- Per-track Selects engagement tracking + the shareable player's listen telemetry (R13)
- Call/conversation Game Plan — pre-call topic planning + logging in the client view (R14)
- Auto-saving Selects drafts + saved/team-shared Crate searches (R11); watermarked download from the player (R12)

**Out of scope (from SPEC.md):**
- AI-guided company knowledge wiki — deferred to its own future phase; The Playbook is its seed
- GTM metrics dashboards and the Deals room rebuild — separate rooms/phases (this phase surfaces only a per-AE performance summary in the tower)
- Peripheral admin rooms (Artist Invites, Industry Members, PitchPlug·Curators, Checklist Items, Tips, E-Sign Usage, Directory)
- Green Room Placements
- Buyer-facing Brief Builder / My Briefs (already shipped)

</spec_lock>

<decisions>
## Implementation Decisions

### Content protection — watermarking (R12)
- **D-01:** **Layered watermark.** The preview *stream* carries a subtle audible tag (marks it as a preview, kept non-intrusive so a 30s+ evaluative listen still works and R13 telemetry stays meaningful). The *download* carries a **clean-sounding forensic watermark** (no audible tag) so it's genuinely usable to test-sync into a rough cut.
- **D-02:** The downloadable file **defaults to full-length** (forensically marked); the AE can **cap its length or disable download** per Selects at send time. ("The AE runs the deal.")
- **D-03:** The forensic payload encodes **both the Selects and the recipient/share-token** → a leaked file traces to the specific grantee it was issued to, even if they forward it. Honors the SPEC prohibition against attributing an anonymous re-share to a different named contact.
- *Note:* the watermarking **mechanism/tooling is net-new** (nothing exists in the codebase) — a research task. Per-recipient forensic marking implies a per-share render.

### Build order / slicing (R1–R14)
- **D-04:** **Slice the phase; outbound Selects motion first.**
  - **Slice 1 (first end-to-end):** My Client Partners list + person/company workspaces, CRM-lite contacts + relationship log, role-aware nav (AE sees own book), Crate Requests, Selects builder, watermarked player. Goal: a client actually receives a Selects.
  - **Slice 2 (fast-follow):** computed health + rules config, leadership tower + assign/route + assignment email + The Playbook, engagement telemetry (R13), Game Plan (R14), saved/team-shared searches.
- **D-05:** **Slice 1 includes the CRM-lite people layer** (contacts + relationship log + both workspaces) — not deferred. "Own book" filtering in slice 1 uses the **existing `buyer_orgs.ae_user_id`** (mig 090), so the assign/reassign UI + email + log-write can stay in slice 2.

### Relationship health freshness (R3/R4)
- **D-06:** Health is **computed live on read** (each list/workspace load), not stored or scheduled. No cron, no staleness, no event wiring; always fresh. Makes R4's "recompute on rule save" a non-issue (nothing stored to recompute). Founder/small-team scale — revisit only if the book gets large.

### Assignment handoff strength (R7/R8)
- **D-07:** On assignment: the locked email + SOP checklist + start-task link, **plus an in-app notification AND an auto-created Intro/Onboarding task** (from the Playbook SOP) dropped into the AE's queue, pre-linked to the account. The handoff is structural — not email-dependent. Uses existing `lib/notifications` infra; the task-queue model may be net-new. (SPEC AC still holds: an email-delivery failure must not block the assignment.)

### CRM-lite contact layer (R1)
- **D-08:** **Multiple contacts per company, one flagged primary** (drives the default email/call); the Clients tab lists all people across companies.
- **D-09:** **Rich contact record** — name, title/role, company, email(s), phone(s), LinkedIn/social, timezone, tags, address, notes, **+ custom fields**. Designed **export-friendly** for a future real CRM.
- **D-10:** **Relationship pipeline stages are leadership-configurable** with a seeded default (New lead → Contacted → Active → Negotiating → Closed/Dormant); "days in stage" (R2 column) measures against it. Same "one place to adjust as we grow" config pattern as the health rules (R4) and the engagement threshold.

### Selects AI-draft + saved searches (R11)
- **D-11:** The AI Selects-draft is a **rights-ready-first, ~10-track reviewable starter** (tracklist + cover note + per-track "why it fits") off the brief; the AE curates/edits before send. Not a hard rights-ready-only filter — badges are shown, rights-ready prioritized. ("AI drafts, AE curates.")
- **D-12:** Saved searches — **any AE** saves privately and can flip one to **team-shared**; all AEs can recall team searches (no leadership gate).

### Shareable player UI (R12)
- **D-13:** The shareable player is the **one client-facing, brand-critical** surface, and the SPEC marked its pixel UI "pending." It runs through **`/gsd-ui-phase`** to produce a UI-SPEC/contract **before its build** — even though the player itself is in slice 1.

### Claude's Discretion
- Pete decided every area raised; nothing was left as "you decide."
- Details not explicitly discussed default to SPEC + sensible planner choices: the audible-tag's exact character (lean tonal/soft over spoken to preserve evaluability), Crate Requests' exact Hot/Warm/New-lead thresholds (SPEC locks the ordering: briefs > repeat searches > re-opens > browsing), and the leadership-config surface's exact form.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec + design (read first)
- `.planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/31-SPEC.md` — Locked requirements (14), boundaries, ACs, edges, prohibitions — **MUST read before planning**
- `.planning/design/crate-lead-engine-BUILD-SPEC.md` — Selects data model (`selects`/`selects_tracks`/`selects_reactions`), the `/selects/{token}` player contract (SSR + service-role, watermarked-only, OpenGraph), delivery (email + in-app + shareable link), and the watermarking loose-end (§9 content-protection)
- `.planning/notes/team-member-rooms-review.md` — scope source (rooms review Deep Dives #2/#3 + the role×room access model / full matrix)

### Team Console — theme + role model
- `components/admin/console-theme.ts` — Team Console light/dark tokens + role model (leadership/ae/bd/anr, roles-as-data); per-AE persistence uses this cookie mechanism

### Data substrate (migrations — owner-run; no agent `db push`)
- `supabase/migrations/090_buyer_orgs_ae_assignment.sql` — staff-private `ae_user_id` (own-book scoping)
- `supabase/migrations/106_buyer_briefs.sql` — briefs (Crate Requests source)
- `supabase/migrations/080_buyer_orgs_members.sql` + `supabase/migrations/095_buyer_org_lead_fields.sql` — `buyer_orgs` + lead fields (the company/account substrate)

### Email / notifications infra (reuse)
- `lib/email/index.ts` + `lib/email/*Invite.ts` — transactional email pattern (Resend) for the assignment email (R8)
- `lib/notifications/index.ts` + `lib/social/notifications.ts` — in-app notification pattern for the handoff notif (D-07)

### Visual source of truth (design ref — not a repo file)
- `claude.ai/code/artifact/0ac07e60-412d-4f4c-98bc-9074c3982314` — the interactive mockup produced this session (My Client Partners list + person/company workspace, Crate Requests, Selects builder, assign-to-AE + automated email, The Playbook, health-rules settings, role toggle, light/dark, collapsible rail). Build to match this look.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`buyer_orgs` (+ `ae_user_id`, mig 090/080/095):** the company/account substrate and own-book scoping — no new org table needed; the CRM-lite people layer hangs under it.
- **`buyer_briefs` (mig 106):** the brief feed that Crate Requests ranks (R10).
- **`lib/email/` (Resend):** the assignment email follows the existing `*Invite.ts` transactional pattern.
- **`lib/notifications/` + `lib/social/notifications.ts`:** the in-app handoff notification (D-07).
- **`components/admin/console-theme.ts` + the role model:** rooms inherit theming + role×room gating; per-AE column/sort persistence reuses the theme-cookie mechanism.
- **Existing dark music-player design refs** (`music-player-playlists.html`, The Crate player) — the player UI base, taken through `/gsd-ui-phase`.

### Established Patterns
- **Owner-run migrations** — draft + text-test via `__tests__/migration-NNN.test.ts`; **no agent `supabase db push`**.
- **"One place to adjust as we grow" config** — health rules (R4), the 30s engagement threshold, and now the pipeline stages (D-10) all live on a leadership-config surface.
- **Access scoping** — RLS/grant; `ae_user_id` never in an authenticated buyer grant; server-only secrets.

### Integration Points (net-new)
- `selects` / `selects_tracks` / `selects_reactions` tables — **net-new** (design in `crate-lead-engine-BUILD-SPEC.md`).
- **Watermarking pipeline** — **net-new** (nothing exists) — research task (D-01/D-03).
- CRM-lite **contact tables + relationship_log** under `buyer_orgs` — net-new (D-08/D-09).
- **Task-queue model** for auto-created SOP tasks (D-07) — may be net-new.
- `/selects/{token}` player route — SSR + service-role, watermarked-only (R12).

</code_context>

<specifics>
## Specific Ideas

- The **mockup is the visual source of truth** (artifact URL above) — the dark/gradient Team Console look + a faithful light mode.
- The **player is the one client-facing surface** → brand-critical → UI-phase gated (D-13).
- **"AI drafts, AE curates"** ethos throughout the Selects motion (D-11).
- **Layered content protection** is a deliberate product stance: obvious-preview stream + traceable-but-clean download, because Funūn *represents* (doesn't own) the catalog and can't lean on Content ID.

</specifics>

<deferred>
## Deferred Ideas

- **AI-guided company knowledge wiki** (searchable, ask-a-question → routed to the right article/doc/video) — its own future phase; company-wide, not the AE engine. The Playbook is its seed. (Also in SPEC out-of-scope + memory `project-ai-knowledge-wiki-phase`.)
- **GTM metrics dashboards + Deals room rebuild** — separate phases (this phase surfaces only a per-AE performance summary in the tower).
- **Peripheral admin rooms** (Artist Invites, Industry Members, PitchPlug·Curators, Checklist Items, Tips, E-Sign Usage, Directory) — tabled per the rooms review.
- **Green Room Placements** — tabled until core rooms are scoped.

None — discussion stayed within phase scope (the above are pre-existing SPEC out-of-scope items, restated so they aren't lost).

</deferred>

---

*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Context gathered: 2026-08-13*

---

## Slice split (2026-08-15, via /gsd-plan-phase — owner-approved)

Phase 31 was sized at ~19 full-fidelity plans and split along **D-04** into two phases (nothing dropped):

- **Phase 31 = Slice 1 (this phase — planned + checker-verified):** R1, R2, R5, R10, R11, R12 · decisions D-01, D-02, D-03, D-05, D-08, D-09, D-11, D-12, D-13.
- **Phase 31.1 = Slice 2 (deferred; plans after 31 ships):** R3, R4, R6, R7, R8, R9, R13, R14 · decisions **D-06, D-07, D-10** + the roles-as-a-set Team model.

**D-04** (the slicing decision) is honored *by* this split; **D-06, D-07, D-10** are intentionally carried to Phase 31.1 (recorded in ROADMAP.md). The decision-coverage gate flags D-04/D-06/D-07 here as expected — owner accepted the documented deferral on 2026-08-15.
