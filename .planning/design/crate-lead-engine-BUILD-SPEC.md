# The Crate · Brief Builder · Lead Engine · Selects — Build Spec

**Status:** SPEC (build-ready) — derived from `.planning/design/crate-lead-engine-system.md`
**Date:** 2026-08-11
**Convention:** migrations are **owner-run** (all SQL below is for you to apply). App code uses the service-role client only where noted.

---

## 0. Slices (build order)

| Slice | Scope | Migration? |
|---|---|---|
| **v1** | Buyer **Brief Builder** — form + conversational AI assist → apply-to-Crate filters + a copyable brief. No persistence. | **No** — ships now |
| **v2** | **Activity spine** — persist briefs + search log + Selects model + pod grouping + RLS. Route briefs to the AE. | **Yes** (§2, §3) |
| **v3** | **Lead Engine** dashboard + curation console + the `/selects/{token}` shareable player + feedback + status pipeline. | Uses v2 tables |

Design the **brief schema (§1) once** in v1 so v2/v3 persist and render the same shape.

**Placement (owner decision, 2026-08-11):** the Brief Builder is a first-class entry with **three front doors**, all rendering one `BriefBuilder` component:
1. **Search-anchored** — a "Describe your project" entry at the search in The Crate (`CatalogBrowserLight`) that opens the Builder as a **panel/overlay** over the catalogue; on finish it filters the catalogue behind it + offers "send to your AE."
2. **Dedicated route `/sync/brief`** — standalone page (direct links + the guest-lead funnel; public, works signed-in or out like `/help`).
3. **Hamburger menu** — a "Brief Builder" item → `/sync/brief`.
The "Contact a sales rep" flow can also hand off to it. Guest = build free + see matches; register-gate only on send/save.

**My Briefs + AE view (owner add, 2026-08-11):**
- **Buyer — "My Briefs":** `/sync/brief` is the buyer's **My Briefs home** — a list of their briefs with live **status** (§9 pipeline) + a prominent "Build a new brief" (opens the Builder). Also surfaced as a **"My Briefs" tab** in The Crate's "My …" family (next to My Playlists / My Favorites).
- **AE — all client briefs:** this *is* the **Lead Engine (§4)** — an AE views all their assigned/pod clients' briefs (intent-ranked, per-client), each opening to detail + the curation console (build a Selects). Same `buyer_briefs` object, two views.
- **Dependency:** My Briefs list + AE feed both need persistence → **v2** (`buyer_briefs`). **v1** ships the Builder + the 3 entry points + apply-to-Crate + copyable brief (no list yet); My Briefs + AE feed arrive in v2.

---

## 1. Brief schema (jsonb, stable across all slices)

Stored in `buyer_briefs.brief`. Creative fields map 1:1 to Crate filters; deal fields map to the license-request.

```json
{
  "creative": {
    "mood": ["cinematic"], "genre": ["alt-pop"], "energy": "medium",
    "dynamics": "builds", "vocals": "instrumental", "instruments": ["strings"],
    "length": "2:30-4:00", "references": ["artist or track names"]
  },
  "deal": {
    "use": "advertising-online", "media": ["online","social"], "territory": "worldwide",
    "term": "1 year", "exclusivity": "none|category|timed|full", "budget": "8000-12000",
    "timeline": "2026-09-15"
  },
  "notes": "free text the AI couldn't structure"
}
```

**AI (Anthropic SDK, already in stack):** two calls, same schema.
1. **Generate/patch** — free text (+ conversation) → structured `brief` (tool/structured-output). The assist can patch individual fields as the buyer talks.
2. **Re-rank** — given `brief` + a filtered candidate set, return an ordering by fit to the whole brief (incl. prose). v1 may skip re-rank (filters only); layer it in as the upgrade.

---

## 2. Data model (migrations — owner runs)

```sql
-- ─── buyer_briefs ────────────────────────────────────────────────────────
create table public.buyer_briefs (
  id            uuid primary key default gen_random_uuid(),
  buyer_org_id  uuid references public.buyer_orgs(id) on delete cascade,   -- null until a guest claims
  created_by    uuid references auth.users(id) on delete set null,          -- buyer user; null for guest
  guest_email   text,                                                       -- guest capture pre-signup
  status        text not null default 'new'
                check (status in ('new','ae_reviewing','selects_sent','in_deal','licensed','closed')),
  title         text,
  prose         text,
  brief         jsonb not null default '{}'::jsonb,
  deadline      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_buyer_briefs_org_created on public.buyer_briefs (buyer_org_id, created_at desc);

-- ─── buyer_search_activity ───────────────────────────────────────────────
create table public.buyer_search_activity (
  id            uuid primary key default gen_random_uuid(),
  buyer_org_id  uuid references public.buyer_orgs(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  query         text,
  filters       jsonb not null default '{}'::jsonb,
  result_count  int,
  created_at    timestamptz not null default now()
);
create index idx_search_activity_org_created on public.buyer_search_activity (buyer_org_id, created_at desc);

-- ─── selects (AE-curated shared tracklist) ───────────────────────────────
create table public.selects (
  id            uuid primary key default gen_random_uuid(),
  buyer_org_id  uuid not null references public.buyer_orgs(id) on delete cascade,  -- the client
  created_by    uuid not null references auth.users(id),                            -- the AE (staff)
  brief_id      uuid references public.buyer_briefs(id) on delete set null,
  name          text not null,
  cover_note    text,
  share_token   text not null unique default encode(gen_random_bytes(16),'hex'),   -- /selects/{token}
  status        text not null default 'draft'
                check (status in ('draft','sent','approved','changes_requested')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index idx_selects_org on public.selects (buyer_org_id, created_at desc);
create index idx_selects_share on public.selects (share_token);

create table public.selects_tracks (
  id            uuid primary key default gen_random_uuid(),
  selects_id    uuid not null references public.selects(id) on delete cascade,
  track_ref     text not null,          -- catalogue track id / vault_project ref (match your catalogue key)
  note          text,                   -- per-track "why I picked this"
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
create index idx_selects_tracks_sel on public.selects_tracks (selects_id, position);

create table public.selects_reactions (
  id               uuid primary key default gen_random_uuid(),
  selects_track_id uuid not null references public.selects_tracks(id) on delete cascade,
  reacted_by       uuid not null references auth.users(id),
  reaction         text not null check (reaction in ('love','pass','more_like_this')),
  created_at       timestamptz not null default now(),
  unique (selects_track_id, reacted_by)
);

-- ─── AE pods (coverage/backup) ───────────────────────────────────────────
create table public.staff_pods (
  id    uuid primary key default gen_random_uuid(),
  name  text not null
);
alter table public.buyer_orgs add column pod_id uuid references public.staff_pods(id) on delete set null;
-- buyer_orgs.ae_user_id already exists (migration 090, staff-private).
```

---

## 3. RLS (sketch — confirm against existing buyer_orgs policies)

Enable RLS on every new table. Helper: an AE "covers" an org if they are its `ae_user_id`, or share its pod; leadership (`app_metadata.staff_role in ('lead','admin')`) covers all.

```sql
alter table public.buyer_briefs enable row level security;
alter table public.buyer_search_activity enable row level security;
alter table public.selects enable row level security;
alter table public.selects_tracks enable row level security;
alter table public.selects_reactions enable row level security;

-- Buyers: see their own org's briefs/activity (uses whatever buyer_org membership predicate buyer_orgs already uses).
-- AEs/leadership: see briefs/activity/selects for orgs they cover.
-- selects: buyers see status in ('sent','approved','changes_requested') for their org.
-- selects_reactions: a buyer writes/reads only their own reactions.
```

- **`buyer_orgs.ae_user_id` stays staff-private** (never in the authenticated GRANT — matches migration 090). A buyer never reads it directly; a dedicated endpoint (§4) returns only the AE's **public card** (display_name + avatar). Add a **staff avatar** field if AEs don't have one.
- **The `/selects/{token}` player** reads via the unguessable token with **no login** → serve it through a `security definer` function (or service-role route) that returns **only watermarked-preview data + notes**, never clean masters, and never leaks org internals.

---

## 4. API routes

Buyer:
- `POST /api/buyer/briefs` — create/patch a brief (AI generate/patch) → returns `{ brief, matches }` (filters + optional re-rank). v1: no DB write (returns matches only); v2: persists + returns id.
- `POST /api/buyer/briefs/[id]/send` — set status `ae_reviewing`, notify the assigned AE (Resend + in-app). Guest → gate to register, then claim the brief to the new org.
- `POST /api/buyer/search-activity` — fire-and-forget search log (v2).
- `GET /api/buyer/ae-card` — the logged-in buyer's assigned AE public card (name + avatar + contact). Server reads staff-private `ae_user_id`, returns only public fields.

Staff / AE:
- `GET /api/admin/lead-engine` — the AE's **intent-ranked** feed (briefs + searches for covered orgs). Rank: briefs > searches > browsing; deadline/budget boost; unactioned-first; newer-first. Supports sort toggles (newest, deadline).
- `POST /api/admin/selects` (+ `/[id]/tracks`, `/[id]/send`) — build/curate/send a Selects. `POST /[id]/ai-draft` — AI drafts a starter Selects + notes from a brief (AE edits before send).

Public player:
- `GET /selects/[token]` — **SSR** page with **OpenGraph tags** (rich unfurl in text/social/email), the dark immersive player, watermarked previews, AE cover + per-track notes, share sheet.
- `POST /api/selects/[token]/react` — per-track reaction (auth-gated). `POST /api/selects/[token]/respond` — approve / request-changes.

Realtime: AE alerts on brief/search insert (Supabase Realtime channel on `buyer_briefs`/`buyer_search_activity` scoped to covered orgs, + email).

---

## 5. The 12 decisions (authoritative — see design notes §Decisions log)

Alerts = everything real-time · Prioritization = intent-weighted + toggles · Feedback = per-track + shortlist-level · Guest = build-free/gate-send · Notes = per-track + cover · Matching = filters + AI re-rank · Delivery = email + in-app "From [AE]" + shareable player · Conversion = client- & AE-initiated → AE-run deal · Status = shared pipeline · AE assist = AI drafts, AE curates · Coverage = primary AE + pod + leadership · Naming = **Selects**.

---

## 6. Reuse

`buyer_orgs.ae_user_id` (mig 090) · shortlists (`lib/deals/shortlists.ts`) → Selects base · the catalogue player in `CatalogBrowserLight` → the shareable player base · DocuSeal e-sign (`lib/esign/docuseal.ts`) · Resend email · Anthropic SDK · the deal room (Phase 16). Player design: `~/Desktop/The Crate - Browse &amp; Search.html` (light) + the mobile/states doc + `~/Desktop/design_handoff_funun_app/music-player-playlists.html` (the Selects player, dark).

---

## 7. Open before build (counsel + product)

- Signing model (flat-rate opt-in / Lane 2) — see `.planning/deliberations/sync-license-signing-model.md`. **Lane 1 (this system) is not blocked by it.**
- Confirm the catalogue **track key** used by `selects_tracks.track_ref`.
- Staff **avatar** field for the AE card.
- Watermarking pipeline for shareable-player previews (content-protection §9 of the research doc).
