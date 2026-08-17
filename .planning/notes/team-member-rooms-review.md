---
title: Team Member Rooms — Review & Access Model
date: 2026-08-12
context: Room-by-room review of the internal Team Member (staff) Console — each room's design + function, and which staff roles get access. Started via /gsd-explore.
---

# Team Member Rooms — Review & Access Model

Going room by room through the admin Team Console: what each room is *for*, its design + function, and who gets access. The full access matrix (roles × rooms) is finalized **after** all rooms are mapped.

## Roles in play
- **leadership** — full oversight + control.
- **ae** — Account Executive; manages their OWN assigned Client Partners.
- **bd** — Business Development (ops: Team Members, Verification, Reports).
- **anr** — **A&R** (new, 2026-08-13). Approval authority for AE tag proposals (Phase 30); more powers TBD.
- (more roles possible — the model is extensible; plan roles as data, not hard-coded.)

---

## ✅ My Client Partners — `/admin/my-client-partners`

**Verdict: an AE's own-clients WORKSPACE — not just a directory.**

- **For:** individual **AEs** — only the Client Partners assigned to them. (Leadership uses the *Client Partners* room for the full view.)
- **Function — the AE "works the account" from here.** Opening a client is a workspace with four jobs:
  1. **Contacts** — the people at the company: view, see their info, reach out (email/call). *(the CRM-lite piece — the original ask.)*
  2. **Their activity** — briefs they've sent + license requests they've filed.
  3. **Music curation** — build a Selects/shortlist from the catalogue and send it to the client (the AE sales motion).
  4. **Notes + status** — log conversations and move the relationship/deal forward.
- **Access:** AEs (their own clients).
- **Current state / gap:** today it's just a card list + inline rename — cards don't even open a detail. Reaching the workspace vision is a real build.

---

## ✅ Client Partners — `/admin/buyer-orgs` (leadership)

**Verdict: BOTH the full workspace (on any client) AND a top-down control tower.**
- **For:** leadership (+ future roles) — ALL Client Partners in one place.
- **Function:**
  - **Full workspace** — everything My Client Partners does (contacts, activity, curation, notes), but on ANY client.
  - **Top-down layer** — assign/reassign clients to AEs, oversee the whole book, manage companies (create/verify/deactivate/members), and see health/metrics across clients.
- **Access:** leadership (+ future roles). AEs stay in My Client Partners for their own.
- **Open for planning:** how much cross-client oversight/metrics (a dashboard?) vs. just the list + assign.

---

## ✅ Lead Engine — `/admin/lead-engine`

**Verdict: a cross-client ACTION inbox for incoming demand.**
- **Both** a combined feed (new briefs across ALL an AE's clients) AND per-client briefs on each client's page.
- **From a brief, the AE can:** open the client (jump into the workspace), **build & send Selects** for it, and set its status (reviewing / selects sent / etc.).
- **Access:** AE (their clients) + leadership (all) — the established split.
- Built this session as read-only; the actions above are the next build.

> **⭐ Cross-cutting: "Selects".** Keeps surfacing (My Client Partners curation, Lead Engine "build & send"). The AE's core sales motion — curate a tracklist from the catalogue, send it to the client (shareable player). **Not built yet** (design in `.planning/design/crate-lead-engine-BUILD-SPEC.md`). A major dependency for the AE workspace.

---

## ✅ Deals — `/admin/deals`

**Verdict: AEs work their OWN clients' deals; leadership oversees all.**
- The AE negotiates the deal for their own client (it's their relationship); leadership sees + can step into every deal.
- **Access change:** today leadership-only → **AE (own) + leadership (all)**.

---

## 🔑 The pattern (sales cluster)
Across My Client Partners, Client Partners, Lead Engine, and Deals — one consistent access model:
> **AE = their OWN assigned clients' view/work. Leadership = ALL clients + oversight/assignment.**
(BD's role in this cluster still open.)

---

## ✅ Sync Library — `/admin/sync-library`
- **AE: browse & pull only** (view catalogue, pull tracks into a client's Selects). **Leadership: full curation** (add/edit/remove/organize). Two ability levels in one room.

## ✅ GTM Metrics — `/admin/deals/metrics`
- **AE: their own numbers** (their clients/deals/conversion). **Leadership: all.** Mirrors the sales-cluster pattern.

## ✅ Team Members — `/admin/team-members`
- **Leadership + BD** create/manage staff accounts + roles. (BD has real ops authority, not just sales.)

## ✅ Verification — `/admin/verification`
- **Leadership + BD** work the artist approval queue.
- **⭐ Pete may add a dedicated role for this** (a verification/ops role). The role model is **extensible beyond leadership/AE/BD** — plan roles as data, not hard-coded.

## ✅ Reports — `/admin/reports`
- **Leadership + BD** for now; may open to others later.

## ⏸️ TABLED — revisit after the core rooms are scoped
- **Green Room Placements** — Pete is unclear on its purpose/design/function; table until the core rooms are scoped.
- **Also deferred (peripheral admin, likely leadership ± BD):** Artist Invites, Industry Members, PitchPlug·Curators, Checklist Items, Tips, E-Sign Usage, Directory.

---

## 🎯 PIVOT (Pete, 2026-08-12): go DEEP on the core, not broad
Nail scope + design/function for the **three core sales rooms** first; the peripheral rooms fall out after.
1. **My Client Partners** — the AE workspace.
2. **Client Partners** — the leadership pair.
3. **Sync Library = "The Crate"** — the catalogue, viewed admin-side (**Sync Library**) and buyer-side (**The Crate**). One catalogue, two faces.

**Selects** (the AE curate-and-send motion) is the connective tissue and the biggest unbuilt piece.

---

## 🔎 DEEP DIVE #1: Sync Library / The Crate (the catalogue) — _in progress_
- **Inclusion:** BOTH — artists submit (mark a Vault track for sync) AND staff curate tracks in; everything passes a **staff review gate** before it goes live.
- **The gate checks:** rights are clear (→ rights badge), quality bar, metadata complete.
- **⭐ Key insight: incomplete ≠ rejected.** Tracks that aren't fully complete get a **process to complete them** (close the rights / metadata / quality gaps) and then enter the catalogue — a **readiness-remediation pipeline**, not a binary pass/fail. Ties into Wave 1 readiness + Wave 2 rights.
- **Completion = "Sync Readiness":** a **sync-specific readiness checklist** — a *subset* of the existing Sound Vault readiness — defining what a track needs for Sync placement. The **Funūn team guides the artist / artist team** to get songs sync-ready (collaborative, not just kick-it-back). Tracked in a **worklist queue** in Sync Library (every incomplete track + exactly what's missing). *Reuses the Wave 1 readiness engine.*
- **Tagging:** layered — **AI suggests** (auto-listen), **artist provides/confirms**, **staff curate/refine** for consistency. All three feed the mood/genre/energy tags behind filters, search, and brief-matching.
- **Browse / admin↔buyer split:** ONE catalogue surface (**The Crate**), **role-aware & layered** — buyers see the clean storefront; team members see the same view with **staff-only layers** (rights details, readiness status, artist notes, in-progress tracks). AEs build Selects from that same layered surface. **Sync Library** = the backstage management of the same catalogue (the gate, the Sync-Readiness worklist, curation + tagging).
- **✅ Catalogue scope captured.**

### Catalogue summary (for planning)
A single catalogue with two faces + a backstage:
- **The Crate** (buyer storefront) — clean browse/search/filter of live, rights-ready tracks.
- **The Crate + staff layers** (team view) — same surface, richer info; where AEs curate Selects.
- **Sync Library** (backstage) — inclusion gate (rights + quality + metadata), the **Sync-Readiness** worklist that shepherds incomplete tracks to live (staff guide artists; reuses Wave 1 readiness), and tag curation (AI + artist + staff).

_Remaining core deep-dives: My Client Partners (AE workspace) · Client Partners (leadership)._

---

## 🔎 DEEP DIVE #2: My Client Partners (AE workspace) — _in progress_

### Contacts (the CRM-lite → actually a real CRM contact record)
Per person at the client company:
- **Basics + reach out** — name, title/role, email, phone; one-tap email/call.
- **Their history with us** — every brief/request they've sent, deals touched, Selects they've been shown.
- **Relationship log** — running notes/timeline of conversations + touchpoints with this person.
- **Their status** — new lead / engaged / gone quiet / champion, etc.
- Company → contacts list → click a contact → this record. "Feed into a real CRM later" is the stated vision (keep the data model export-friendly).

### Selects (the AE curate-and-send motion — the connective tissue)
- **Build:** from scratch (hand-pick from the Crate + per-track & cover notes), **AI-drafted** starter from the brief (AE refines), or **straight off a brief** in the Lead Engine.
- **Client receives:** a **shareable player link** (watermarked previews + AE notes, forwardable, rich unfurl), **react per track** (love / pass / more-like-this), **approve / request changes**, and **license → deal** right from it.
- Matches the existing design in `.planning/design/crate-lead-engine-BUILD-SPEC.md` — confirmed.

### Notes/status + activity
- Largely covered by the contact record (relationship log + status) + "their history." Company-level status = the existing pipeline (new → reviewing → selects sent → in deal → licensed).

**✅ My Client Partners deeply scoped.** Client Partners (leadership) = the same workspace on ALL clients + assignment/oversight (detailed below).

---

## 🔎 DEEP DIVE #3: Client Partners (leadership control tower) — ✅
Inherits the **full AE workspace on ANY client** (contacts CRM, Selects, activity, notes/status), PLUS a top-down layer:
- **Assign & route** — assign/reassign clients to AEs + an **unassigned-leads queue**.
- **Health at a glance** — active / stalled / at-risk / quiet across the whole book.
- **Performance metrics** — per-AE + overall (deals, conversion, revenue) — the leadership dashboard.
- **Manage companies** — create / verify / deactivate companies + their members.

---

## ✅ All three core rooms deeply scoped. Ready to crystallize into phases.

---

_Access matrix (roles × rooms) — to be finalized after all rooms are reviewed._

---

**→ Continued in** `.planning/deliberations/team-member-rbac-access-model.md` (2026-08-17) — the RBAC / access-model deliberation brief that carries this forward: adds The Playbook's create/edit/publish permission gradient and consolidates the open forks for the discussion.
