# Phase 31: AE Client Workspace + Selects (My Client Partners / Client Partners) — Specification

**Created:** 2026-08-13
**Ambiguity score:** 0.13 (gate: ≤ 0.20)
**Requirements:** 14 locked

## Goal

Turn the AE sales rooms from thin lists into the working surfaces the Lane-1 AE motion actually needs: an AE opens **My Client Partners**, scans a reorderable insight list, drills into a client or company workspace, curates a **Selects** from The Crate and sends it, and leadership assigns/routes accounts — each account carrying a computed health signal, a next action, and an auditable relationship log.

## Background

Grounded in the codebase + this session's design work (2026-08-13). The AE rooms exist today only as thin scaffolding (a card list + inline rename; the Lead Engine shipped read-only). The catalogue ("The Crate"), `buyer_orgs` (with staff-private `ae_user_id`, migration 090), `buyer_briefs` (migration 106, owner-run), and the `selects`/`selects_tracks`/`selects_reactions` model (design in `.planning/design/crate-lead-engine-BUILD-SPEC.md`) are the substrate. The Team Console ships light/dark with a role model (leadership/ae/bd/anr) from Phase 25/30. This phase builds the AE-facing rooms + the Selects motion on top.

**Design reference (visual source of truth):** interactive mockup produced this session — `claude.ai/code/artifact/0ac07e60-412d-4f4c-98bc-9074c3982314` (My Client Partners list + workspace, Crate Requests, Selects builder, assign-to-AE + automated email, The Playbook, health-rules settings, role toggle, light/dark).

**Trigger:** the AE-led (Lane 1) motion — moving demand (briefs/Crate activity) to deals (via Selects) — has no real working surface. Everything downstream (deals, GTM metrics) depends on these rooms existing.

## Requirements

1. **My Client Partners — list + workspace**: The room lands on a list with a **Clients** tab (people) and a **Companies** tab (orgs); a row drills into a person or company workspace.
   - Current: a flat card list with inline rename; cards don't open a detail
   - Target: list-with-tabs → drill-in; the **company** workspace is the four jobs (Contacts CRM, Activity, Curation/Selects, Notes+status) plus company website; the **person** workspace mirrors it, scoped to the individual
   - Acceptance: clicking a Companies row opens the company workspace; clicking a Clients row opens the person workspace; both render the person's/company's own briefs, Selects, deals, status, and relationship log

2. **Insight columns**: List columns surface the valuable, scannable signals and are user-tunable.
   - Current: no list columns exist
   - Target: Companies columns = Company · Next action · Status · Health · Days in stage · Open briefs · Active Selects · Open deal · Lifetime value · Last brief · Last touch · Contacts; Clients columns = Client · Next action · Company · Role · Status · Last touch · Last brief · Briefs · Selects seen · Deals. Columns are **show/hide + drag-reorder + per-column click-to-sort**, persisted per AE (identity column pinned)
   - Acceptance: an AE can hide/show, reorder, and click-sort any column; the arrangement persists per AE across sessions; the identity column cannot be hidden

3. **Relationship health**: Each client/company carries a computed green/yellow/red health with a human override.
   - Current: no health concept
   - Target: health is **computed** from activity signals (days since last touch, days in current stage, unanswered brief, deal aging); an AE can manually pin or snooze it; each value carries a "why" explanation
   - Acceptance: a metric with no data resolves to "unknown" (never silently green); a value exactly at a threshold resolves to one documented band; an AE override/snooze expires after a defined period, after which the computed value resumes

4. **Relationship-health rules (config)**: The health parameters live in one leadership-editable surface.
   - Current: no config
   - Target: a leadership-only surface sets per-signal warning/at-risk thresholds, the combine rule ("worst signal wins" vs "two warnings = at-risk"), and the override policy; a live preview shows the resulting distribution across the book
   - Acceptance: warning/at-risk bands are validated non-overlapping; saving new rules recomputes health across all accounts; only a leadership-role member can edit

5. **Role-aware navigation**: The rooms an account exec vs leadership sees differ by role.
   - Current: nav is not role-gated
   - Target: an **AE** sees only "My Client Partners" (their own assigned clients) — no "Client Partners" all-clients view; **leadership** sees both, and leadership's own "My Client Partners" is a personal hold-queue (unassigned leads awaiting routing + coverage for out-of-office/departed AEs); the role model is extensible
   - Acceptance: an unassigned account never appears in any AE's My Client Partners; the "Client Partners" nav item and the leadership tower are hidden for the AE role; an AE with zero clients sees a defined empty state

6. **Client Partners (leadership control tower)**: Leadership works any client and routes the book.
   - Current: leadership has no all-clients working view
   - Target: the same list + workspace on ANY client, plus assign/route AEs (an unassigned-leads queue), health-at-a-glance across the book, and per-AE performance
   - Acceptance: leadership can open any company/person workspace; the tower lists all clients with the same column/sort model as R2; an empty unassigned queue renders a defined state

7. **Assign-to-AE**: Leadership assigns/reassigns an account to an AE, and the action is recorded.
   - Current: no assignment UI beyond a stored `ae_user_id`
   - Target: from the company header (and the list), leadership picks an AE (or moves to unassigned); the account reassigns atomically, the newly-assigned AE is notified, and the action is written to the account's relationship log
   - Acceptance: assigning updates the account's AE; a relationship-log entry records "who assigned to whom, when"; reassigning to the current AE is a no-op (no duplicate email/log)

8. **Automated assignment email**: Assignment triggers a handoff email to the AE.
   - Current: no assignment email
   - Target: on assignment the AE receives an email with the account snapshot (client, status, open deal) and the relevant **Intro** or **Onboarding** call SOP checklist plus a link to start that task; call type is chosen by context (new/unassigned → onboarding; existing → intro)
   - Acceptance: an assignment sends one email to the assigned AE containing the account snapshot and a SOP checklist with a start-task link; an email-delivery failure does not block the assignment (the account still reassigns and logs)

9. **The Playbook (editable SOP library)**: SOP checklists live in one editable place.
   - Current: SOPs do not exist
   - Target: a leadership/ops-editable library of named SOPs (Intro call, Onboarding call, Re-engage at-risk, + addable), each a checklist with a trigger; it is the **single source** the assignment email (R8) and any created task read from
   - Acceptance: editing an SOP's steps in The Playbook changes what a subsequent assignment email sends; each SOP has ≥1 step; only leadership/ops can edit; edits apply forward-only (do not rewrite already-sent emails)

10. **Crate Requests (demand inbox)**: An intent-ranked feed of buyer activity in The Crate.
    - Current: the Lead Engine shipped read-only (briefs only)
    - Target: a feed of briefs, repeat searches, Selects re-opens, and tag browsing — each tied to which client did it, rated Hot/Warm/New-lead, each with a one-click action (Build Selects, Reply, Follow up, See lead); this **replaces/absorbs the previously-scoped Lead Engine**; anonymous/guest Crate demand surfaces as a distinct "new lead" row
    - Acceptance: the feed lists activity items ranked by intent (briefs > repeat searches > re-opens > browsing), each showing the originating client and an action; a guest signal with no account appears as a "new lead" row

11. **Selects builder**: The AE curate-and-send console.
    - Current: no Selects builder exists
    - Target: build a Selects by pulling tracks from The Crate (add/remove, per-track note, cover note), via three methods (from scratch / off a brief / AI-drafted from a brief); rights-readiness badges are shown; target client + optional brief link; status draft → sent → approved/changes; **Send** mints the shareable player link. Drafts **auto-save** continuously as the AE works (a manual save is also available); the Crate search supports **saved and team-shared searches** an AE can recall in one click.
    - Acceptance: an AE can add/remove Crate tracks and per-track notes; an empty Selects cannot be sent; adding a track already present is idempotent; the AI-draft action populates a starter tracklist + notes; Send produces a shareable link; editing a Selects **auto-saves** the draft (with a manual save available); an AE can **save a Crate search and re-apply it**, and a saved search can be **shared with the team**

12. **Shareable Selects player**: The client receives and acts on a Selects. *(UI design pending — contract locked here.)*
    - Current: no player exists
    - Target: a token-addressed page where the client plays **watermarked previews** only, reacts per track (love/pass/more-like-this), and approves / requests changes / licenses; can **download the watermarked file** (never a clean master) to test-sync it into a rough cut; rich unfurl (OpenGraph) for forwarding
    - Acceptance: opening a valid share link plays watermarked previews and records per-track reactions; an invalid/expired token shows a safe "link unavailable" state and leaks no data; clean master audio is never served through the player; downloading a track yields a watermarked file only, never a clean master

13. **Selects engagement tracking**: The player records which tracks the client actually listened to, not just that a Selects was shown.
    - Current: only "shown" is known (a Selects was sent); there is no per-track listening data behind the "Selects seen" metric
    - Target: the player records per-track playback (plays, actual **audible** time, completions, replays) and marks a **qualified listen** when audible time crosses a configurable threshold (**default ≥30s**); attributed via the share token (a named recipient when logged in, otherwise the link/session); the AE sees a per-track + per-Selects engagement readout, and the signal feeds the Selects-seen metric (R2), Crate Requests (R10), Next action, and health (R3)
    - Acceptance: playing a track past the threshold records exactly one qualified listen for that track+viewer; scrubbing/seeking past the threshold without audible playback does NOT record a listen; a replay is counted distinctly; the AE's Selects view shows per-track plays / qualified-listens / replays and a Selects-level summary

14. **Call/conversation Game Plan**: The AE plans and logs calls against a saved topic list in the individual client view.
    - Current: only a free-text "log a conversation" note exists; there is no pre-call planning
    - Target: in the person (individual client) view, the AE builds a **Game Plan** of **3–5 topics** to cover (create their own or select from suggested topics), **saves** it for the next planned call, then on/after the call checks off covered topics, adds notes, and logs the conversation — which writes a relationship-log entry recording how many topics were covered; a saved game plan persists until it is logged
    - Acceptance: an AE can add/remove topics (guided toward 3–5), save a game plan that persists to the next call, check topics as covered, and "Log conversation" writes a relationship-log entry noting topics-covered + notes

## Boundaries

**In scope:**
- My Client Partners: list (Clients/Companies tabs) + person/company workspaces (R1, R2)
- Relationship health (computed + override) and its leadership-editable rules config (R3, R4)
- Role-aware navigation + leadership hold-queue (R5)
- Client Partners leadership control tower incl. assign/route (R6, R7)
- Automated assignment email + The Playbook SOP library (R8, R9)
- Crate Requests demand inbox — absorbs the Lead Engine (R10)
- Selects builder + the shareable player contract (R11, R12)
- A CRM-lite **contact record** layer under `buyer_orgs` (people + relationship log + status)
- Per-track Selects engagement tracking + the shareable player's listen telemetry (R13)
- Call/conversation **Game Plan** — pre-call topic planning + logging in the client view (R14)
- Auto-saving Selects drafts + saved/team-shared Crate searches (R11); watermarked download from the player (R12)

**Out of scope:**
- **AI-guided company knowledge wiki** (searchable, ask-a-question → routed to the right article/doc/video) — deferred to its own future phase; it is company-wide (all team members), not the AE engine. The Playbook is its seed.
- **GTM metrics dashboards** and the **Deals room** rebuild — separate rooms/phases (this phase only surfaces a per-AE performance summary in the tower, not the full metrics room)
- **Peripheral admin rooms** (Artist Invites, Industry Members, PitchPlug·Curators, Checklist Items, Tips, E-Sign Usage, Directory) — tabled per the rooms review
- **Green Room Placements** — tabled until core rooms are scoped
- **Buyer-facing Brief Builder / My Briefs** — shipped (v1/v2 buyer half); this phase is the AE side

## Constraints

- Lives inside the **Team Console** and inherits its light/dark theming (Phase 25) and the `role × room` access model (leadership/ae/bd/anr; extensible — roles as data, not hardcoded).
- **Data reuse:** `buyer_orgs` (+ staff-private `ae_user_id`, migration 090), `buyer_briefs` (migration 106), and the `selects`/`selects_tracks`/`selects_reactions` model from `crate-lead-engine-BUILD-SPEC.md`. Contact records are a NEW CRM-lite layer under `buyer_orgs` (export-friendly for a future real CRM). Migrations are owner-run (draft + text-tested; no agent `supabase db push`).
- **Access scoping (hard):** an AE reads only their own assigned clients' data; leadership reads all. `ae_user_id` stays staff-private (never in an authenticated buyer GRANT).
- **Content protection:** the shareable player serves only watermarked previews via an unguessable token; never clean masters.
- **Per-AE persistence** (column order/visibility, sort) uses the same per-member mechanism as the console theme cookie.
- **Engagement threshold** — the qualified-listen bar (default 30s of audible time) is owner-editable config, same "one place to adjust as we grow" pattern as the health rules.
- Founder / small-team scale — every surface must be usable without a dedicated operator.

## Acceptance Criteria

- [ ] My Client Partners lands on a list with Clients + Companies tabs; a row drills into the matching person/company workspace (R1)
- [ ] The company workspace shows the four jobs (Contacts, Activity, Curation/Selects, Notes+status) + website; the person workspace mirrors it, person-scoped (R1)
- [ ] List columns can be hidden/shown, reordered, and click-sorted; the arrangement persists per AE; identity column is pinned (R2)
- [ ] Health renders green/yellow/red computed from signals; a no-data signal is "unknown", never green; an AE can override/snooze with a defined expiry (R3)
- [ ] The health-rules config is leadership-only, validates non-overlapping bands, and recomputes the book on save (R4)
- [ ] An AE sees only their own book; "Client Partners" + the leadership tower are hidden for the AE role; unassigned accounts never appear in an AE's list (R5)
- [ ] Leadership can open any client and assign/reassign it to an AE; the tower lists all clients (R6, R7)
- [ ] Assigning writes a relationship-log entry and notifies the assigned AE; reassigning to the same AE is a no-op (R7)
- [ ] Assignment sends one email with the account snapshot + an Intro/Onboarding SOP + start-task link; a delivery failure does not block the assignment (R8)
- [ ] Editing an SOP in The Playbook changes what a later assignment email sends; SOPs are leadership/ops-editable; each has ≥1 step (R9)
- [ ] Crate Requests ranks buyer activity by intent, tags each item to a client, and offers a per-item action; a guest signal appears as a "new lead" (R10)
- [ ] The Selects builder adds/removes Crate tracks with per-track + cover notes; an empty Selects cannot be sent; AI-draft populates a starter; Send mints a share link (R11)
- [ ] The player plays watermarked previews only for a valid token, records reactions, and shows a safe state for an invalid/expired token (R12)
- [ ] The player records a per-track qualified listen at the configured threshold (default ≥30s of audible time); scrubbing does not count; the AE's Selects view shows per-track plays/qualified-listens/replays + a Selects-level summary (R13)
- [ ] The client view offers a Game Plan of 3–5 topics that saves for the next call; logging a conversation checks off covered topics and writes a relationship-log entry noting topics-covered + notes (R14)
- [ ] Selects drafts auto-save as the AE edits, with a manual save also available (R11)
- [ ] An AE can save a Crate search and re-apply it in one click; a saved search can be shared with the team (R11)
- [ ] A client can download a watermarked file (never a clean master) from the player to test-sync (R12)

## Edge Coverage

**Coverage:** 22/22 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| adjacency | R1 | ✅ covered | A person under a company appears in both the Companies-tab contacts and the Clients tab; both open the SAME record (consistency AC). |
| empty | R1 | ✅ covered | 0 clients / 0 companies / 0 contacts each render a defined empty state, never a blank/broken table. |
| ordering | R1 | ✅ covered | The list opens sorted by Next action (overdue-first), deterministic default. |
| adjacency | R2 | 🧪 backstop | Equal sort keys resolve to a documented stable tiebreak (identity) — held-out sort-stability test in plan-phase. |
| empty | R2 | ✅ covered | Identity column is pinned/unhideable → the table can never have zero columns. |
| ordering | R2 | ✅ covered | Reordered/hidden column state persists per AE and restores on reload. |
| unclassified | R3 | ✅ covered | No-data signal ⇒ "unknown" (never green); a value exactly at a threshold ⇒ one documented band; override/snooze has a defined expiry. |
| unclassified | R4 | ✅ covered | Warning/at-risk bands validated non-overlapping; saving rules recomputes health across the book. |
| adjacency | R5 | ✅ covered | An account assigned to no AE appears only in leadership's hold-queue, never in an AE's book. |
| empty | R5 | ✅ covered | An AE with zero clients (and an empty leadership hold-queue) renders a defined empty state. |
| ordering | R5 | ⛔ dismissed | Role-aware nav is a visibility rule with no ordering contract. |
| adjacency | R6 | ✅ covered | Reassigning to the current AE is a no-op (no duplicate email/log); reassignment replaces the prior assignment atomically. |
| empty | R6 | ✅ covered | An empty unassigned-leads queue renders a defined state. |
| ordering | R6 | ⛔ dismissed | The tower inherits R2's column/sort contract — no separate ordering semantics. |
| unclassified | R7 | 🧪 backstop | Concurrent reassignment of one account by two leaders resolves to a single final owner — held-out concurrency test in plan-phase. |
| unclassified | R8 | ✅ covered | Call type chosen by context (new/unassigned→onboarding, existing→intro); an email-delivery failure does not block the assignment. |
| unclassified | R9 | ✅ covered | Each SOP has ≥1 step; edits apply forward-only (do not rewrite already-sent emails). |
| concurrency | R10 | 🧪 backstop | Intent ranking is stable and de-duped under concurrent activity inserts — held-out ranking-stability test in plan-phase. |
| unclassified | R11 | ✅ covered | Empty Selects cannot be sent; re-adding an existing track is idempotent; a not-rights-ready track is flagged before send. |
| unclassified | R12 | ✅ covered | An invalid/expired token shows a safe "unavailable" state and leaks nothing; only watermarked previews are ever served. |
| precision | R13 | ✅ covered | Only actual audible time counts toward the ≥30s qualified-listen bar (scrub/seek excluded); a replay is a distinct count. |
| boundary | R14 | ✅ covered | The Game Plan guides to 3–5 topics (soft cap at 5); logging a call with 0 topics checked is allowed but the entry records "0 of N covered", never a silent blank. |

## Prohibitions (must-NOT)

**Coverage:** 7/7 applicable prohibitions resolved · 0 unresolved
*(Canon-referral: generic injection/XSS/CSRF/secret-management/authz-framework hardening is owned by `/gsd-secure-phase` + lint — not minted here. Rows below are the bespoke privacy/access/content-protection must-NOTs this phase introduces.)*

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT show an AE any client/company/contact/brief/Selects/health data outside their own assigned book. | R5/R6 | resolved | test — access test asserts an AE query returns only own-assigned accounts |
| MUST NOT expose the staff-private `ae_user_id` (or other routing internals) to a buyer / authenticated non-staff caller. | R7 | resolved | test — grant/RLS test asserts `ae_user_id` is not authenticated-readable |
| MUST NOT serve clean master audio through the shareable player, by stream OR download — watermarked previews only. | R12 | resolved | judgment — data-flow review of what the token route streams and what the download returns |
| MUST NOT make a Selects reachable without its unguessable share token (no id enumeration). | R11/R12 | resolved | test — an unauthenticated request without a valid token is rejected |
| MUST NOT allow a non-leadership/ops role to edit The Playbook SOPs or the health-rules config. | R4/R9 | resolved | test — role-gate test on the edit endpoints |
| MUST NOT reassign or move an account without a leadership action AND an audit-log entry. | R7 | resolved | judgment — every assignment writes a relationship-log/audit record |
| MUST NOT attribute an anonymous/forwarded listen to a specific named contact it cannot verify. | R13 | resolved | judgment — attribution falls back to the link/session when the viewer is not an authenticated recipient |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                              |
|--------------------|-------|------|--------|--------------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Outcome-language goal; the AE motion end-to-end is concrete        |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | Explicit in/out; wiki + GTM + Deals + peripherals excluded         |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Access scoping, data reuse, content-protection, Team Console locked |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 18 pass/fail criteria + 22 edges + 7 prohibitions                  |
| **Ambiguity**      | 0.13  | ≤0.20| ✓      | Gate passed on the strength of the full design session             |

## Interview Log

Requirements were captured from an extended interactive design session (2026-08-13) that produced a full working mockup, rather than a cold Socratic interview — the mockup IS the discovery. Key decisions locked:

| Round | Perspective     | Question summary                          | Decision locked                                                        |
|-------|-----------------|-------------------------------------------|------------------------------------------------------------------------|
| —     | Researcher      | What are the AE rooms today?              | Thin lists; Lead Engine read-only; Crate/`buyer_orgs`/`selects` substrate |
| —     | Design session  | My Client Partners shape?                 | List (Clients/Companies tabs) → person/company workspace (4 jobs)       |
| —     | Design session  | What are the valuable columns + controls? | Defined column sets; show/hide + reorder + per-column sort, per-AE      |
| —     | Design session  | How is health decided + tuned?            | Computed from signals + AE override; leadership-editable rules config   |
| —     | Boundary Keeper | Which nav does each role get?             | AE = own book only; leadership = both + hold-queue (unassigned/coverage)|
| —     | Design session  | How does leadership assign?               | From company header/list; notifies AE; logs to relationship log        |
| —     | Design session  | What happens on assignment?               | Automated email + Intro/Onboarding SOP; SOPs live in The Playbook       |
| —     | Simplifier      | Lead Engine vs Crate Requests?            | Merge — Crate Requests is the single demand inbox                       |
| —     | Design session  | The Selects motion?                       | Builder (Crate→Selects, notes, AI-draft) → send → shareable player      |
| —     | Boundary Keeper | What's explicitly NOT this phase?         | AI knowledge wiki → own future phase; GTM/Deals/peripherals separate    |
| —     | Failure Analyst | What must never leak?                     | Cross-AE data, `ae_user_id`, clean masters, tokenless Selects           |

---

*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Spec created: 2026-08-13*
*Next step: /gsd-discuss-phase 31 — implementation decisions (how to build what's specified above)*
