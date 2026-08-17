# Deliberation — Team Member RBAC & Access Model (roles × rooms)

**Status:** OPEN — emerging model captured; full access matrix + Playbook permissions to finalize with the owner
**Opened:** 2026-08-17 (owner — "start capturing this emerging model for the RBAC discussion")
**Builds on:** `.planning/notes/team-member-rooms-review.md` (2026-08-12 — room-by-room review of the built admin Team Console; ends with "access matrix to be finalized after all rooms mapped" — this deliberation is that continuation)
**Related artifacts:** `docs/design/playbook-it-team-room.html` + `docs/design/playbook-editor.html` (Playbook mockups), `docs/design/README.md`, `docs/observability/VENDOR-DIRECTORY.md`; the Launchpad **Tips** precedent (`app/(admin)/tips/page.tsx`, `launchpad_checklist_items.tip_draft/tip_approved`); `.planning/todos/pending/2026-08-16-shared-it-ops-account-for-vendor-notifications.md`
**Blocks / feeds:** the eventual Playbook build + any per-room permission enforcement; adjacent to the cross-account access model (Phase 21) and the four-lane account taxonomy

---

## The question

How do internal **Team Members** (staff) get access to what — across both the **admin Team Console** (built: My Client Partners, Selects, Deals, Sync Library, …) and **The Playbook** (future internal wiki) — and *within* each surface, who can **create / edit / publish**?

Only internal Team Members ever see these surfaces — never Artist / Industry / Client-Partner accounts. (Those are the other three of the four account lanes; how the lanes interoperate is the *adjacent* cross-account model, Phase 21, kept consistent with but distinct from this.)

---

## The model so far (emerging)

### 1. Foundation — role × room, roles-as-data
- Access = **role × room** gating, not per-user ACLs.
- **Stable identity** (company email = login, follows the person across role changes) + a **mutable role attribute**. Admin-tier leadership reassigns roles via a **Team admin surface** — no new login/email.
- **Roles are data, not hard-coded** — extensible. Roles in play today: **leadership**, **ae** (Account Executive), **bd** (Business Development), **anr** (A&R). More expected — e.g. a **verification/ops** role and an **IT** role (both already flagged).

### 2. The admin Team Console (BUILT) — the established pattern
From the room-by-room review, one consistent rule across the sales cluster:
> **AE = their OWN assigned clients' view/work. Leadership = ALL clients + oversight/assignment.**
- **Two ability-levels in one room** is common (e.g. Sync Library: AE *browse & pull* vs. leadership *full curation*; GTM Metrics: AE *own numbers* vs. leadership *all*).
- **BD/ops** authority on Team Members, Verification, Reports.
- The **full roles × rooms matrix is still to be finalized** (per the note) — that's open sub-decision #4.

### 3. The Playbook (FUTURE internal wiki) — create/edit/publish gradient
A **descending authority gradient** — the more structural the object, the fewer can create it:
- **Team Rooms** (a whole team/function; adding one declares membership + what they see → an org+security decision) → **admins only** (leadership / ops), via the Team admin surface.
- **Sub-groups** (sections inside a room) → **room leads AND admins**.
- **Articles / entries** (content pages) → **any Team Member of that room** adds a **draft** → **reviewed/approved by the room-lead OR team leadership** → published.
- Rooms map to team types: Company-wide · A&R · AE/Sales · IT Team · TMS → Training · Leadership.
- **This draft→approve flow already runs in the codebase** — the Launchpad **Tips** system (`tip_draft` → `tip_approved`, leadership-gated) is a working instance. The Playbook generalizes it to every room.

### 4. Cross-cutting — the "IT Team" role
An **IT team member** role: in-app monitoring-dashboard access + vendor-alert routing. The IT Playbook room houses the observability SOPs + the SaaS vendor directory (`docs/observability/VENDOR-DIRECTORY.md`). Concrete first instance of role-scoped room access outside the sales cluster.

---

## Open sub-decisions (to resolve in the discussion)

1. **Distinct "room owner/lead" role per room**, or does *leadership* cover lead duties everywhere?
2. **Cross-room reading** — open (transparency across teams) or gated per room?
3. **Publish gate granularity** — which content publishes **on-save** vs. **needs review**?
4. **The full admin-console roles × rooms matrix** — finalize after all rooms mapped (carried from the rooms-review note); includes **BD's role in the sales cluster** (still open there).
5. **New roles to formalize** — verification/ops role, IT role — and confirm "roles as data" is the implementation stance.
6. **Lane interplay** — how the four account lanes (Team Member / Artist / Industry / Client Partner) and cross-account access (Phase 21) relate to this internal RBAC. Adjacent model; keep consistent.

---

## Timing / non-blocking (owner, 2026-08-17)

These bite only when **both**: (a) a permission-enforcing surface is actually being built, and (b) a room has **2+ potential editors**. Today neither holds for The Playbook (it isn't built). The decisions are **reversible/tunable** — start permissive (any member drafts + approval gate), tighten later; no data migration. Authoring seed content now (e.g. the vendor directory) needs none of it. **Not blocking** current Phase 31/32 work — this is the brief to open the RBAC discussion with when the team is ready.
