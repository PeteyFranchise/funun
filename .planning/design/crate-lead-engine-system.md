# The Crate · Brief Builder · Lead Engine · Selects — Design Notes

**Status:** IN DESIGN (living doc — we are still talking this through)
**Opened:** 2026-08-11 (owner + Claude, during Lane 1 buyer-portal build)
**Scope:** A two-sided, relationship-based sync system layered on Lane 1 (the AE-negotiated per-deal lane / Phase 16 buyer portal).
**Related:** `.planning/deliberations/sync-license-signing-model.md`, `.planning/phases/16-gtm-beta-buyer-portal/`, `.planning/phases/24-buyer-onboarding-self-serve/24-RESEARCH-paid-tiers.md`.

---

## The idea in one loop

```
Buyer builds a brief (AI-assisted) or digs The Crate
      → activity pings the assigned AE in real time
      → AE curates (AI drafts a starter set, AE refines)
      → AE sends "Selects" (in-app "From [AE]" + email + shareable player link)
      → client plays, reacts, approves
      → client (or AE) moves to license
      → AE runs the deal in the deal room → signed → delivered
Status is visible to BOTH sides the whole way.
```

Buyer side = **The Crate** + the **Brief Builder**. AE side = the **Lead Engine** console + **Selects**. One shared activity spine connects them.

---

## Naming / brand

- **The Crate** — the buyer's browse/search surface (masthead: "The Crate", *powered by Funūn*, tagline "Dig for your sound — every track we represent, in one place."). Pairs with the artist-side **Sound Vault**. (Rebrand is WIP/uncommitted; design to be refined.)
- **Selects** — the AE-curated shared tracklist sent to a client ("here are your selects"). Client-facing, AE side. = the private-shortlist object, now named.
- Artist-created playlists (later) get their own name (TBD, different from Selects).

---

## Buyer side

### The Crate (browse/search)
The existing catalogue (`app/sync/catalog`, `components/buyer/CatalogBrowserLight.tsx`) — light aesthetic, filters (mood, energy, dynamics, vocals, instruments, length, genres, rights), search, similarity search, playlists, favorites. Shipped in Phase 16; step-1 menu + `/help` added on branch `feat/lane1-catalogue-menu-help`.

### Brief Builder (new)
- **Interaction:** form-as-truth + a conversational AI assist that fills the fields. The form is the source of truth (always complete, maps to Crate filters); the assist lets a vague buyer talk and watch fields populate. Buyer who knows their spec just fills the form.
- **Schema:** creative fields (mood / genre / energy / dynamics / vocals / instruments / length / "sounds like" references) + deal terms (use/media / territory / term / exclusivity / budget / timeline) + free notes. Creative fields map 1:1 to Crate filters.
- **Matching:** filters + **AI re-rank** — apply the brief's fields as filters, then an AI pass re-orders by fit to the whole brief (incl. prose). v1 ships the filter-map; the re-rank layers on (reuses the brief-gen Claude call).
- **Output:** BOTH — instantly filter The Crate to matches AND route the brief to the assigned AE.
- **Guests:** build free + see matches with no account; register gate only on send/save; the brief carries through signup as the first lead.

---

## AE side — the Lead Engine

A dashboard/curation console in the staff/admin area (`app/(admin)/admin/…`).

- **Alerts:** everything real-time — briefs AND searches ping the assigned AE immediately (in-app + email).
- **Prioritization:** intent-weighted hot-lead rank by default (briefs > searches > browsing; deadline/budget boosts; unactioned-first; newer-first), with toggles to re-sort (newest, by deadline).
- **Curation console:** the AE can search The Crate **on the client's behalf**, build a **Selects**, and send it. AI drafts a starter Selects (filters + re-rank) + cover/per-track notes from the brief; the AE edits/approves before sending (**AI drafts, AE curates**).
- **Coverage:** primary AE per client (owns alerts/deals) + **pod/team backup** (activity feed visible to the pod) + **leadership** cross-AE oversight. Needs a pod grouping on top of per-client `buyer_orgs.ae_user_id` (migration 090).

### AE dashboard mockup
A structural mockup was shown (neutral system style, not the Funūn dark skin): masthead + metric tiles (hot briefs / active clients / needs follow-up / awaiting feedback) + a live intent-ranked client feed (client · activity chip · summary · deadline/budget chips · hotness score · time · actions) + a "Selects · awaiting feedback" section showing per-track reactions + approvals.

---

## Selects — the curated shared tracklist

- **What:** the AE's curated set for a client — tracks + a **cover note** + a **per-track "why I picked this."**
- **Feedback:** BOTH per-track reactions (love / pass / "more like this" → can re-run similarity) AND a shortlist-level **approve / request-changes** with a note.
- **Delivery (three surfaces, one object):**
  1. in-app **"From [AE]"** / Shared-with-you space in The Crate,
  2. **email** nudge (Resend — already in stack),
  3. a **shareable player link** at `funun.studio/selects/{token}`.
- **Lifecycle (proposed default):** editable + re-sendable after sending; optional expiry.

### The shareable player
- **Design exists:** `~/Desktop/design_handoff_funun_app/music-player-playlists.html` — mobile-first, **dark/immersive** (its own focused surface, distinct from the light Crate): artwork hero + scrim + gradient scrubber + transport controls + a tracklist ("up next" becomes *the* Selects). Currently framed as an artist now-playing screen → recontextualize the header to "**from [AE] · for [Client]**" (configurable; "**by [Artist]**" for the later artist version).
- **Routing / sharing:** a short **tokenized public link** (no login — link = access) so it forwards easily; **OpenGraph unfurl** (server-rendered OG tags) so it previews as a rich card in iMessage / email / social; **watermarked previews** only (content protection); a **native share sheet** on the page (copy / text / email / social / QR).
- **Actions:** playlist playback; per-track react; **License / Request** CTA → auth gate → the AE-run deal. Every track links back into The Crate.
- **Generalizes:** same player component serves AE Selects now and **artist-created playlists later**.

---

## Conversion & status

- **Conversion:** client-initiated (License → request → AE-run deal, carrying brief/Selects context) AND AE-initiated (AE starts the license/deal from the console). Both → the AE-run deal room (Lane 1). Instant self-serve pay = Lane 2 (subscription), signing-model-gated, later.
- **Status:** a shared pipeline — **New → AE reviewing → Selects sent → In deal → Licensed** — the client sees it as "Your requests", the AE sees it as their pipeline. One source of truth.

---

## The activity spine (data) — owner runs migrations

- `buyer_briefs` — the structured brief + prose + status, keyed to `buyer_org` (+ creating user; guests reconciled on signup).
- `buyer_search_activity` — a log of notable searches/filters, keyed to `buyer_org` + user.
- **Selects** — a curated set (owner = AE, for = buyer_org) + its tracks + per-track notes/reactions + cover note + share token + status.
- **Pod/team grouping** — so coverage/backup and leadership oversight have a scope for RLS.
- **RLS:** an AE sees their assigned orgs (+ their pod); leadership sees all; `ae_user_id` stays staff-private (a buyer never reads it directly — a dedicated endpoint returns only the AE's public card: name + photo). AE photo/avatar field may need adding to staff accounts.

---

## Build slices

- **v1 — Buyer Brief Builder** (form + AI assist → apply-to-Crate + copyable brief). **No migration — ships now.**
- **v2 — Activity spine** (`buyer_briefs`, `buyer_search_activity`, Selects model + pod grouping). **Migrations = owner runs.**
- **v3 — Lead Engine + Selects + player** (dashboard, curation console, the shareable `/selects/{token}` player). On v2's tables.
- Design the brief + Selects schema once so every surface renders the same shape.

---

## Reuse / existing pieces

- `buyer_orgs.ae_user_id` (migration 090) — per-client AE assignment (staff-private).
- Shortlists (`lib/deals/shortlists.ts`, `app/sync/shortlists`) — the base for Selects.
- The catalogue player in `CatalogBrowserLight` — base for the shareable player.
- DocuSeal e-sign (`lib/esign/docuseal.ts`), Resend email, Anthropic SDK, the deal room (Phase 16).

---

## Decisions log (2026-08-11)

| # | Area | Decision |
|---|------|----------|
| 1 | Alerts | Everything real-time (briefs + searches) to the AE |
| 2 | Prioritization | Intent-weighted hot-lead rank, with sort toggles |
| 3 | Feedback | Per-track reactions AND shortlist-level approve/request-changes |
| 4 | Guest briefs | Build free + see matches; register gate on send/save |
| 5 | Track notes | Per-track "why" AND a cover note |
| 6 | Matching | Filters + AI re-rank |
| 7 | Delivery | Email + in-app "From [AE]" + shareable player link (Selects) |
| 8 | Conversion | Client- and AE-initiated → AE-run deal |
| 9 | Status | Shared pipeline (New → reviewing → Selects sent → in deal → licensed) |
| 10 | AE assist | AI drafts the Selects + notes; AE curates |
| 11 | Coverage | Primary AE + pod backup + leadership oversight |
| 12 | Set name | AE→client curated tracklist = **Selects** (client-facing) |

---

## Still open (talking through)

- Recipient's primary action on a Selects (proposed: React + License/Request → AE deal).
- AE creation flow for a Selects (proposed: from "search for client" → name → notes → generate link / send).
- Selects lifecycle (editable / re-sendable / expiry).
- Artist-side playlist name + when the artist version lands.
- Final data model + the exact SQL (deferred until design is settled).
