# Phase 37.1 "The Songwriter" — Research

**Researched:** 2026-08-30
**Domain:** New composition-layer data model (works/versions/lyric blocks/diary) + browser audio capture (MediaRecorder), inside an existing Next.js 15 / Supabase app
**Confidence:** HIGH on codebase patterns and reuse (everything cited is read from this repo); MEDIUM on the recommended new schema (Claude's discretion per CONTEXT.md — the shapes below are a considered proposal, not a locked decision); MEDIUM-LOW on cross-browser MediaRecorder playback specifics (flagged, needs device test)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (Slice decisions, owner, 2026-08-30)

- **S-01 — Audio: hum capture AND file uploads in 37.1.** Sketch 002's AI-entry flow
  ships in 37.1 — both modes (conversational for the account's first-ever AI entry,
  two-door form after), the receipt block, component tagging, and the hum-first nudge
  (003's deliberate minute) plus the inline re-author prompt.
- **S-02 — Collaborators in 37.1.** Shared diary ships day one: membership via the
  existing collaborator invite/claim/connect machinery, contribute vs administer tiers
  (money/release doors stay with the owner), attribution on every entry, ✍/🎤 badges,
  and the once-per-contributor splits nudge (equal-split default, people never numbers,
  settable cadence).
- **S-03 — Real home immediately.** The Sound Vault becomes two shelves: My Catalogue
  (new) + Releases (existing, untouched). New-project flow becomes two doors: 🎵 Start a
  song · 🚀 Start a release. `unreleased` retires from the create flow; the (at most one)
  existing prod project typed `unreleased` surfaces on the catalogue shelf.
- **S-04 — "Copy full lyric" ships in 37.1** — tagged and plain flavors, tool-agnostic
  copy.

### Claude's Discretion

- The works/versions/blocks/diary data model — including whether works are new tables
  or extend `vault_projects`. New tables are the expected answer.
- Hum capture implementation (MediaRecorder; browser/iOS quirks; reuse of `lib/storage`
  buckets + signed-URL patterns; format/size limits).
- Whether the labels system squeezes into 37.1 or waits.
- Mobile behavior follows the decided rules (001: single-stream + Versions toggle) but
  polish depth in 37.1 is discretionary.

### Non-negotiables carried from the doctrine (do not re-decide)

- Diary auto-capture with attribution; identity-fixed/presentation-derived everywhere
  (titles, block numerals, handles).
- Splits: living draft → executes at the doors; EQUAL default; system never proposes
  percentages; nudge cadence once-per-contributor, settable.
- AI entries: zero-split, DDEX component vocabulary, version-level vs work-level,
  receipts in plain words, no tool names in UI copy.
- Vocal doctrine: primary-performer inheritance, Instrumental third state, the
  human-take registry (a default never fabricates a record).

### Deferred Ideas (OUT OF SCOPE for 37.1)

- Destinations doors (sketch 004), Crate submission, DDEX export, artist playlists,
  volume/catalogue list view at scale, graduation to a release, the labels system
  (unless trivially cheap).
- Sketch 007 (collaborator's vantage — shared-with-me list, sheet-nudge moment).
- The "still unsure? ask" community-FAQ feed path.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| S-01 | Hum capture AND file uploads, with the full AI-entry flow (both modes, receipts, component tagging, hum-first nudge, re-author prompt) | MediaRecorder codec/browser research below; `ai_entries` table design; reuse of `track-audio` bucket + service-role upload pattern from `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` |
| S-02 | Collaborators: shared diary, contribute/administer tiers, ✍/🎤 attribution, once-per-contributor splits nudge | `work_members` table design bridging the existing `collaborators.claimed_by` claim mechanism (migration 026) and the `project_members` RLS pattern (migration 078/079); `evenSplit()` reuse from `lib/split-sheets/approval.ts` |
| S-03 | Two-shelf Sound Vault, two-door create flow, `unreleased` type retirement | `works` table design; exact mount points in `app/(artist)/vault/page.tsx` and `app/(artist)/vault/new/page.tsx`; backfill note for the one existing `type='unreleased'` project |
| S-04 | "Copy full lyric" (tagged + plain) client-side export | `lyric_blocks` table + pure serializer function pattern (mirrors `lib/split-sheets/approval.ts`'s pure-function style); no server round-trip needed |
</phase_requirements>

## Summary

Phase 37.1 is additive: **no existing table changes shape, only new tables plus one
new nullable column on `split_sheets`.** The codebase already contains almost every
piece of infrastructure this phase needs, built for a structurally identical problem
one phase ago — Phase 21's `project_members` (shared vault projects) is the template
for the new `work_members`; the existing `collaborators.claimed_by` bridge (migration
026) plus its `sync_project_membership_for_sheet()` trigger (migration 079) is the
exact bridge mechanism the assignment asks for; `lib/split-sheets/approval.ts`'s
`evenSplit()` and `lib/split-sheets/lifecycle.ts`'s `LIVING_DRAFT_STATUSES` already
implement the equal-split-draft machinery the doctrine calls "the living draft"; the
`track-audio` Supabase Storage bucket (migration 004) already allow-lists
`audio/webm` and `audio/mp4` — the exact MIME types a browser's MediaRecorder
produces — so **hum capture needs no bucket migration**, only a new upload route
modeled on `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts`. `@dnd-kit/*`
is already a project dependency, covering the lyrics pad's grip-reorder requirement
with zero new packages.

The one non-obvious infrastructure gap: the existing `track-audio` Storage RLS
policies (migration 004) are owner-folder-scoped (`(storage.foldername(name))[1] =
auth.uid()::text`) and were **never widened for `project_members`** when Phase 21
shipped shared projects — every real upload/read in this codebase already goes
through the **service-role client**, bypassing that RLS entirely, so this is a
non-issue in practice but must be understood before designing a "collaborator hums
into someone else's work" upload route (see Common Pitfalls).

**Primary recommendation:** four new tables (`works`, `work_versions`, `lyric_blocks`,
`work_members`, `ai_entries`) plus a dedicated `work_diary_events` table for the
auto-capture diary, one new nullable `split_sheets.work_id` column, and a handful of
`SECURITY DEFINER` trigger functions that mirror migrations 078/079/013 byte-for-byte
in style. No new npm packages. Migration numbering starts at **135** (next free after
134).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Two-shelf vault listing | Frontend Server (SSR) | Database | `app/(artist)/vault/page.tsx` already does this exact owned+shared dual-query pattern for Releases; add a parallel `works` query, same page |
| Two-door create flow | Browser / Client | API / Backend | `app/(artist)/vault/new/page.tsx` is a client component posting to an API route — same shape, new destination table |
| Hum capture | Browser / Client | API / Backend | MediaRecorder is browser-only; the blob POSTs to a new API route that writes to Storage + DB, mirroring the existing track-audio upload route |
| Lyrics pad (structure blocks, autosave) | Browser / Client | API / Backend | Client-side drag/edit state (`@dnd-kit`), debounced PATCH to a blocks API route |
| Diary auto-capture | Database | API / Backend | DB triggers (matching migrations 013/079) guarantee capture regardless of which route performed the write — "never depends on discipline" is a database-tier guarantee, not an app-tier convention |
| Collaborator membership + tiers | Database | API / Backend | RLS + `SECURITY DEFINER` helpers (migration 078 pattern); API routes only call service-role inserts, never raw client writes (migration 078's `REVOKE` convention) |
| Living split-sheet draft | Database | API / Backend | Reuses `split_sheets`/`split_sheet_parties` verbatim — this phase adds one FK column, no new sheet machinery |
| AI-entry receipts | API / Backend | Database | The receipt text is composed server-side from `ai_entries` row data at write time — never regenerated client-side, so the plain-words citation is stable and audit-safe |
| Audio storage | Database / Storage | — | Supabase Storage (`track-audio` bucket), signed URLs minted server-side, matching every existing track-audio consumer in this codebase |

## Standard Stack

### Core (all already installed — zero new packages)

| Library | Version (installed) | Purpose | Why Standard (for this repo) |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 | DB + Storage client | Existing sole persistence layer |
| `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities` | 6.3.1 / 10.0.0 / 3.2.2 | Drag-reorder | Already a dependency; covers the lyrics pad's grip-reorder + insert-anywhere UI (sketch 006) with no new install |
| `zod` | 3.23.0 | Request validation | Matches `app/api/collaborators/quick-invite/route.ts`'s `z.object({...}).strict()` pattern — use the same for the new work/version/block/ai-entry routes |
| Browser `MediaRecorder` API | native | Hum capture | No package needed — see Hum Capture section |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/split-sheets/approval.ts` (`evenSplit`, `validateApprovalTotal`) | in-repo | Equal-split computation | Reused verbatim when a writer is added to a work's living draft sheet |
| `lib/split-sheets/lifecycle.ts` (`LIVING_DRAFT_STATUSES`, `assertEditable`) | in-repo | Draft/frozen gating | Reused verbatim — a work's sheet starts and stays in `'draft'` for all of 37.1 |
| `lib/collaborators/invite.ts` (`sendCollaboratorInvite`) | in-repo | Collaborator invite email + token | Reused verbatim for adding a writer/performer to a work |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `works` tables | Extend `vault_projects` with `type='unreleased'` + child tables | Rejected — CONTEXT.md/doctrine explicitly expect new tables; overloading `vault_projects` would force the release-readiness scoring machinery (`lib/vault/readiness.ts`), release RLS (migration 078), and the five-type picker onto a fundamentally different entity (a composition with no release date, no distributor, no ISRC yet) |
| DB-trigger diary auto-capture | App-layer `emitActivity()`-style best-effort calls at each route | Rejected as primary mechanism — the doctrine's "auto-capture… never depends on discipline" is a database-tier guarantee (matches migration 013/079's own trigger-based precedent); app-layer emit is what the *existing* `activity_events`/`emitActivity` deliberately does NOT guarantee (it's `try/catch` "best-effort", explicitly allowed to silently drop) |
| Storing performer credits as FK columns | JSONB performer-ref arrays (`[{kind, collaborator_id, user_id, name}]`) | Matches this codebase's existing convention for flexible people-lists (`tracks.writers TEXT[]`, `tracks.featuring_artists TEXT[]`, `lib/metadata/schema.ts`'s `Performer` type) rather than inventing three new FK columns per performer slot |

**Installation:** none — no new packages required for 37.1.

**Version verification:** all libraries above are already pinned in `package.json`
(read directly, not queried against a registry — no new packages, so no new version
risk).

## Package Legitimacy Audit

**Not applicable.** Phase 37.1 introduces zero new npm packages. Every capability
(drag-reorder, audio capture, storage, validation) is covered by libraries already
installed and in active use elsewhere in this codebase (see Standard Stack). If a
future 37.2+ slice needs a waveform-visualization or audio-processing package, run
this audit then.

## Architecture Patterns

### System Architecture Diagram

```
Browser (artist or invited collaborator, authenticated session)
  │
  ├─ Vault shelf toggle ──► GET app/(artist)/vault/page.tsx (SSR)
  │                          ├─ existing: vault_projects query (Releases shelf)
  │                          └─ NEW: works query, owned + shared-via-work_members
  │                                  (parallel Promise.all, same shape as the
  │                                  existing sharedProjects/project_members query)
  │
  ├─ "Start a song" ──► POST /api/works  (new route, mirrors app/api/vault/route.ts)
  │                       ├─ INSERT works (owner=user)
  │                       ├─ INSERT work_members (user_id=owner, tier='administer')
  │                       ├─ INSERT split_sheets (work_id, status='draft', song_name)
  │                       └─ redirect → /vault/works/[workId]  (the composer page)
  │
  ├─ Composer page (005-C spine)
  │    │
  │    ├─ 🎙 Hum it ──► browser MediaRecorder ──► blob
  │    │                  └─ POST /api/works/[workId]/versions  (multipart)
  │    │                       ├─ service-role upload → track-audio bucket
  │    │                       │    path: {workId}/{versionId}.{ext}
  │    │                       ├─ INSERT work_versions (source='hum')
  │    │                       └─ [DB TRIGGER] → INSERT work_diary_events
  │    │
  │    ├─ ⬆ Add audio ──► same route, source='upload', same trigger fan-out
  │    │                    └─ if flagged AI-involved: also POST
  │    │                       /api/works/[workId]/ai-entries (002's two-door
  │    │                       form / conversational-first-time flow)
  │    │
  │    ├─ ✎ Write lyrics ──► lyrics pad (structure blocks)
  │    │                       ├─ debounced PATCH /api/works/[workId]/blocks/[id]
  │    │                       │    (autosave — see Autosave Pattern below)
  │    │                       ├─ POST .../blocks (insert-anywhere)
  │    │                       ├─ POST .../blocks/reorder (RPC, mirrors
  │    │                       │    migration 127's atomic reorder pattern)
  │    │                       └─ [DB TRIGGER on lyric_blocks UPDATE OF text]
  │    │                            → INSERT work_diary_events (section-level)
  │    │
  │    └─ 💬 Note ──► POST /api/works/[workId]/notes → work_diary_events
  │                     (annotation-only event, no side table)
  │
  ├─ Add collaborator (S-02) ──► POST /api/works/[workId]/members
  │    reuses lib/collaborators/invite.ts's sendCollaboratorInvite() verbatim
  │    ├─ INSERT work_members (tier='contribute', user_id=NULL if unclaimed)
  │    ├─ [DB TRIGGER on collaborators.claimed_by] backfills user_id later
  │    │    (mirrors migration 079's bridge, one fire site instead of three)
  │    └─ if this collaborator is marked a WRITER (✍ on a block):
  │         upsert split_sheet_parties + recompute evenSplit() for all parties
  │
  └─ Guiding line resolver (005-C's "next for this song")
       pure function, reads: work_members count, split_sheet_parties state,
       ai_entries needing citation, work_versions count — no new I/O beyond
       what the composer page already fetched for its own render
```

### Recommended Project Structure

```
supabase/migrations/
├── 135_works_core.sql                # works, work_versions, lyric_blocks, ai_entries
├── 136_work_members.sql               # work_members + RLS helpers + claim-bridge trigger
├── 137_split_sheets_work_link.sql     # split_sheets.work_id + reorder_lyric_blocks() RPC
└── 138_work_diary_events.sql          # diary table + auto-capture triggers

lib/catalogue/                         # new domain module, mirrors lib/vault/ and lib/split-sheets/
├── membership.ts                      # ProjectRole-style pure helpers: WorkTier, canContribute(), canAdminister()
├── versions.ts                        # numeral derivation (row_number over created_at), pure
├── blocks.ts                          # numeral-by-position derivation, repeat-detach, tagged/plain serializers (S-04)
├── guiding-line.ts                    # pure "next best step" resolver (005-C)
├── ai-entries.ts                      # citation-copy builder, when-in-doubt resolver
└── diary.ts                           # event-type → render-shape mapping (mirrors lib/social pattern)

app/api/works/
├── route.ts                           # POST create (two-door "Start a song")
├── [workId]/
│   ├── route.ts                       # GET/PATCH (title rename — RENAME RULE)
│   ├── versions/route.ts              # POST hum/upload (multipart)
│   ├── blocks/
│   │   ├── route.ts                   # POST insert-anywhere
│   │   ├── [blockId]/route.ts         # PATCH text/type, DELETE, detach
│   │   └── reorder/route.ts           # POST → calls reorder_lyric_blocks() RPC
│   ├── members/route.ts               # POST add collaborator (reuses invite.ts)
│   ├── ai-entries/route.ts            # POST (002's two-door + conversational-first-time)
│   └── notes/route.ts                 # POST 💬 annotation

app/(artist)/vault/
├── page.tsx                           # MODIFIED — add My Catalogue shelf query + render
├── new/page.tsx                       # MODIFIED — two-door picker replaces five-type picker
└── works/[workId]/page.tsx            # NEW — the composer + diary page (001 desktop C / mobile A)

components/catalogue/                  # new component tree, mirrors components/vault/
├── ComposerCard.tsx                   # 005-C: four verb tiles + guiding line
├── DiaryFeed.tsx                      # mirrors components/profile/ActivityFeed.tsx's reverse-chron render
├── LyricsPad.tsx                      # structure blocks (006), @dnd-kit sortable context
├── HumCaptureButton.tsx               # MediaRecorder wrapper (003's deliberate-minute variant + inline variant)
├── AiEntryFlow.tsx                    # 002: conversational (first time) / two-door form (after)
└── VaultProjectCard.tsx (existing, unmodified) # Releases shelf keeps its own card
```

### Pattern 1: Owner-or-member RLS via `SECURITY DEFINER` helper pair

**What:** Two `STABLE SECURITY DEFINER` SQL functions —
`is_work_owner(work_id, uid)` and `work_member_tier(work_id, uid)` — called from every
RLS policy body wrapped as `(SELECT ...)`. This is migration 078's exact pattern,
reused for works instead of vault_projects.

**When to use:** Any table whose visibility must resolve through work membership
(`works`, `work_versions`, `lyric_blocks`, `ai_entries`) rather than a single
`user_id = auth.uid()` check.

**Why it matters:** A naive pair of cross-table `EXISTS` subqueries between `works`
and `work_members` recurses at Postgres REWRITE time (42P17) — this is exactly the
bug migration 018 hit and migration 064/078 both had to fix. Do not rediscover it;
copy the helper-pair shape from day one.

**Example (from migration 078, adapt table names):**
```sql
-- Source: supabase/migrations/078_project_members.sql
CREATE OR REPLACE FUNCTION public.is_work_owner(p_work_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.works
    WHERE id = p_work_id AND user_id = p_uid
  )
$$;

CREATE OR REPLACE FUNCTION public.work_member_tier(p_work_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tier FROM public.work_members
  WHERE work_id = p_work_id AND user_id = p_uid
$$;

REVOKE EXECUTE ON FUNCTION public.is_work_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_work_owner(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.work_member_tier(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.work_member_tier(uuid, uuid) TO authenticated;
```

### Pattern 2: DB-trigger diary auto-capture (never depends on discipline)

**What:** `AFTER INSERT/UPDATE` triggers on `work_versions`, `lyric_blocks`,
`work_members`, `ai_entries`, and `works` (for renames) each call a shared
`SECURITY DEFINER` function that inserts one row into `work_diary_events`.

**When to use:** Every mutation the doctrine lists as diary-worthy: new version,
lyric edit (section-level — the trigger fires per saved UPDATE of a block's `text`,
not per keystroke, because the client debounces writes before PATCHing), roster
change, sheet event, AI entry, rename, reorder, detach.

**Why a trigger and not an app-layer `emitActivity()` call:** this codebase already
has an app-layer "best-effort, never throws, swallows errors" activity emitter
(`lib/social/activity-emit.ts`) — deliberately allowed to silently drop events. The
doctrine's non-negotiable is the opposite: "auto-capture… never depends on
discipline." A trigger fires regardless of which future route performs the write,
including routes not yet written. Direct precedent for exactly this shape:

```sql
-- Source: supabase/migrations/013_readiness_activity_trigger.sql (adapt)
CREATE OR REPLACE FUNCTION public.capture_work_version_event() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'version',
    NEW.user_id,
    jsonb_build_object('versionId', NEW.id, 'source', NEW.source)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_capture_work_version ON public.work_versions;
CREATE TRIGGER trg_capture_work_version
  AFTER INSERT ON public.work_versions
  FOR EACH ROW EXECUTE FUNCTION public.capture_work_version_event();
```

### Pattern 3: Claimed-collaborator bridge (the exact mechanism the assignment asks for)

**What:** `work_members` rows can exist with `user_id IS NULL` (an invited-but-unclaimed
collaborator, identified only by `collaborator_id`). A single trigger on
`collaborators.claimed_by` backfills `user_id` the moment that person signs up.

**Precedent — read this migration before designing the trigger:**
`supabase/migrations/079_project_membership_auto.sql` does this exact bridge for
`project_members`, and its header comment (lines ~15–30) is the authoritative
explanation of *why* `collaborators.claimed_by` is "the ONLY verified-identity signal
in this codebase" — `split_sheet_parties.user_id` is a **dead column, written
nowhere**. Do not key any new table's identity resolution off it.

**Simplified for work_members (one fire site, not three):** unlike
`split_sheet_parties` (which can be linked to a project before or after either side
exists), a `work_members` row is always created with `collaborator_id` already known
(the invite flow requires picking/creating a roster collaborator first). So only one
trigger is needed:

```sql
CREATE OR REPLACE FUNCTION public.sync_work_membership_on_claim()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.work_members
  SET user_id = NEW.claimed_by
  WHERE collaborator_id = NEW.id AND user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_work_membership_on_claim ON public.collaborators;
CREATE TRIGGER sync_work_membership_on_claim
  AFTER UPDATE OF claimed_by ON public.collaborators
  FOR EACH ROW
  WHEN (NEW.claimed_by IS DISTINCT FROM OLD.claimed_by)
  EXECUTE FUNCTION public.sync_work_membership_on_claim();
```

### Pattern 4: Equal-split-on-writer-add (reuse, don't rebuild)

**What:** `evenSplit(count)` already exists and already does exactly what
CAT-Q1a asks: `evenSplit(3) → 33.333`.

```typescript
// Source: lib/split-sheets/approval.ts (existing, unmodified)
export function evenSplit(count: number): number {
  if (count <= 0) return 0
  return Math.round((100 / count) * 1000) / 1000
}
```

**When to use:** The moment a collaborator is marked a **writer** on a work (not
merely a member — see "membership vs splits" distinction below), upsert their
`split_sheet_parties` row on the work's living-draft sheet and recompute every
existing party's `split_percentage` to `evenSplit(newCount)`. The sheet stays in
`'draft'` (`LIVING_DRAFT_STATUSES`), so `assertEditable()` permits this freely — no
consensus-reset logic applies (that only fires from `'pending_approval'`/`'approved'`).

**Membership vs. splits — keep these two facts separate (doctrine, verbatim):**
"being ON THE WORK and being ON THE SPLITS are different facts — membership grants
access, the sheet grants ownership." A `work_members` row does **not** imply a
`split_sheet_parties` row. Writership is established separately — recommended
trigger point: the first time a collaborator's `author_user_id` appears on any
`lyric_blocks` row, or via an explicit "Add as writer" action in the UI.

### Recommended Data Model (full DDL sketch)

```sql
-- ═══ works — the composition entity ═══════════════════════════════════
CREATE TABLE public.works (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL, -- creator/default owner
  title                  TEXT NOT NULL DEFAULT 'Untitled',
  vocal_state            TEXT NOT NULL DEFAULT 'primary'
                         CHECK (vocal_state IN ('primary', 'varies', 'instrumental')),
  primary_performer      JSONB, -- {kind:'self'|'collaborator'|'guest', collaborator_id?, name?}; NULL when vocal_state != 'primary'
  split_sheet_id         UUID, -- FK added after split_sheets gets work_id (see below) OR resolve via split_sheets.work_id reverse lookup instead of storing here (recommended — avoids a cycle; see Open Question 1)
  graduated_project_id   UUID REFERENCES vault_projects ON DELETE SET NULL, -- 37.2 seam, unused in 37.1
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_works_user_id ON public.works (user_id);

-- ═══ work_versions — the "recording" side (hum / upload / re-record) ═══
CREATE TABLE public.work_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id           UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  user_id           UUID REFERENCES auth.users NOT NULL, -- who created THIS version (may be a collaborator, not the work owner)
  source            TEXT NOT NULL CHECK (source IN ('hum', 'upload')),
  audio_path        TEXT NOT NULL, -- storage path in track-audio bucket: {work_id}/{version_id}.{ext}
  audio_ext         TEXT NOT NULL,
  audio_size        BIGINT,
  duration_seconds  INTEGER,
  label             TEXT, -- optional artist free-text ("acoustic take"); vN numeral is DERIVED, never stored
  performers        JSONB DEFAULT '[]', -- declared performer credits for THIS recording (feeds DDEX + human-take registry later)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_work_versions_work_id ON public.work_versions (work_id, created_at);

-- ═══ lyric_blocks — structure blocks (sketch 006) ═══════════════════════
CREATE TABLE public.lyric_blocks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id             UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  block_type          TEXT NOT NULL
                      CHECK (block_type IN ('verse','pre_chorus','chorus','bridge','intro','outro','hook','custom')),
  custom_label        TEXT, -- only when block_type = 'custom' — custom sections never renumber
  position            INTEGER NOT NULL, -- absolute drag order; numerals-among-same-type are DERIVED at read time
  text                TEXT NOT NULL DEFAULT '',
  author_kind         TEXT NOT NULL DEFAULT 'human' CHECK (author_kind IN ('human', 'ai')),
  author_user_id      UUID REFERENCES auth.users, -- ✍ badge; required when author_kind='human'
  performers          JSONB DEFAULT '[]', -- 🎤 badges: [{kind, collaborator_id, user_id, name}]
  repeat_of_block_id  UUID REFERENCES public.lyric_blocks ON DELETE SET NULL, -- linked repeat (copy-on-write detach clears this)
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lyric_blocks_work_id ON public.lyric_blocks (work_id, position);

-- ═══ work_members — collaborator access + tier (S-02) ══════════════════
CREATE TABLE public.work_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id          UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  user_id          UUID REFERENCES auth.users ON DELETE CASCADE, -- set immediately for the owner; NULL until claimed for an invitee
  collaborator_id  UUID REFERENCES public.collaborators ON DELETE SET NULL, -- NULL only for the owner's own row
  tier             TEXT NOT NULL CHECK (tier IN ('contribute', 'administer')),
  added_by         UUID REFERENCES auth.users,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_work_members_unique_user ON public.work_members (work_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_work_members_unique_collab ON public.work_members (work_id, collaborator_id) WHERE collaborator_id IS NOT NULL;
CREATE INDEX idx_work_members_work_id ON public.work_members (work_id);
CREATE INDEX idx_work_members_user_id ON public.work_members (user_id);

-- ═══ ai_entries — DDEX-component AI contributions (CAT-Q3) ═════════════
CREATE TABLE public.ai_entries (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                   UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  level                     TEXT NOT NULL CHECK (level IN ('work', 'version')),
  version_id                UUID REFERENCES public.work_versions ON DELETE CASCADE,
  block_id                  UUID REFERENCES public.lyric_blocks ON DELETE SET NULL,
  component                 TEXT NOT NULL CHECK (component IN ('vocal','instrument','lyric','melody','full')),
  mode                      TEXT NOT NULL CHECK (mode IN ('performance', 'generate')), -- swap-vs-generate (Q3)
  citation                  TEXT NOT NULL, -- plain-words receipt line, e.g. "AI reference vocal — demo only"
  human_source_version_id   UUID REFERENCES public.work_versions ON DELETE SET NULL, -- the diary-anchored human take this cites
  created_by                UUID REFERENCES auth.users NOT NULL,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  CHECK ((level = 'version' AND version_id IS NOT NULL) OR (level = 'work' AND version_id IS NULL))
);
CREATE INDEX idx_ai_entries_work_id ON public.ai_entries (work_id);

-- ═══ work_diary_events — the auto-captured timeline (CAT-Q1) ═══════════
CREATE TABLE public.work_diary_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id        UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN (
                   'version', 'lyric_edit', 'roster', 'sheet', 'ai_entry',
                   'rename', 'reorder', 'detach', 'note'
                 )),
  actor_user_id  UUID REFERENCES auth.users, -- NULL only for system-fired events with no human actor (none expected in 37.1)
  payload        JSONB NOT NULL DEFAULT '{}', -- typed per `kind`, see lib/catalogue/diary.ts
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_work_diary_events_work_id ON public.work_diary_events (work_id, created_at DESC);

-- ═══ split_sheets — one new nullable column, mirrors migration 067's track_id ═══
ALTER TABLE public.split_sheets
  ADD COLUMN IF NOT EXISTS work_id UUID REFERENCES public.works ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_split_sheets_work_id ON public.split_sheets (work_id);
```

**RLS doctrine for the six new tables:** `works`/`work_versions`/`lyric_blocks`/
`ai_entries`/`work_diary_events` need **real, authenticated-readable RLS** (the
composer page renders via `createServerClient()` under the viewer's own session, same
as `app/(artist)/vault/page.tsx` does today) — use the owner-or-member pattern
(Pattern 1), **not** the zero-policy+REVOKE pattern from migrations 128–134. The
zero-policy+REVOKE pattern is correct only for tables no authenticated client ever
needs to read directly (e.g. `handle_history`). `work_members` itself should mirror
migration 078(b)'s write lockdown exactly: `REVOKE INSERT, UPDATE, DELETE ...
FROM authenticated, anon` — all membership writes go through a service-role API
route, never raw PostgREST.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Equal-split math | A new percentage calculator | `evenSplit()` in `lib/split-sheets/approval.ts` | Already handles the 3-decimal rounding edge case (`evenSplit(3) → 33.333`) that a naive `100/n` would get wrong for `validateApprovalTotal()`'s sum-to-100 check |
| Draft-vs-frozen sheet editability | A new status state machine | `assertEditable()` + `LIVING_DRAFT_STATUSES` in `lib/split-sheets/lifecycle.ts` | Already encodes the exact "living draft until money/release" rule the doctrine describes, including the consensus-reset edge case |
| Collaborator invite email + token | A new invite flow | `sendCollaboratorInvite()` in `lib/collaborators/invite.ts` | Handles the 60s dedup cooldown, XSS-escaping of user-entered names (see its own M6 comment), and the Resend-down fallback (returns a copyable link even when email delivery fails) — all real, previously-fixed bugs |
| Drag-reorder UI | A custom pointer-event reorder implementation | `@dnd-kit/sortable` (already installed) | Zero new dependency; this codebase already ships it |
| Atomic multi-row reorder | Sequential per-row UPDATE calls (race-prone under concurrent edits) | A `SECURITY DEFINER` RPC modeled on `reorder_launchpad_checklist()` (migration 127) | That function's completeness/contiguity/duplicate validation is exactly the shape `reorder_lyric_blocks()` needs, and it is already proven correct under concurrent load (`LOCK TABLE ... SHARE ROW EXCLUSIVE MODE`) |
| Signed URL playback for private audio | A new bucket or new signing helper | `service.storage.from('track-audio').createSignedUrls(paths, ttl)` — exact pattern in `app/(artist)/vault/[projectId]/page.tsx` lines ~176-193 | Batch-signs in one call, 2-hour TTL, already proven in production |
| Reverse-chron event list rendering | A new feed component from scratch | `components/profile/ActivityFeed.tsx`'s structure (icon badge + body + relative timestamp + `timeAgo()` helper) | Directly portable render shape for `DiaryFeed.tsx`; `work_diary_events` is a *separate, private* table (see below), only the render pattern is reused |

**Key insight:** This phase's biggest risk is *not* missing infrastructure — it's
building a second, competing version of infrastructure that already exists one
directory over. Every "Don't Hand-Roll" row above is copy-adapt, not build-from-zero.

## Common Pitfalls

### Pitfall 1: Treating `activity_events`/`emitActivity()` as the diary mechanism

**What goes wrong:** `activity_events` (migration 012) is a **public** wall feed
(`FOR SELECT USING (true)`) with a closed `ActivityKind` enum (`placement | release |
readiness | other`) and an explicitly best-effort, swallow-errors emit helper
(`lib/social/activity-emit.ts`). Neither the visibility model nor the
never-guaranteed-to-fire semantics match the doctrine's private, typed,
never-depends-on-discipline diary.

**Why it happens:** The name "activity feed" and the visual precedent
(`ActivityFeed.tsx`) are both directly relevant and easy to over-reuse wholesale.

**How to avoid:** Reuse the **render component's structure** (Pattern in Don't
Hand-Roll above), never the **table or the emit function**. `work_diary_events` is a
new, RLS-scoped-to-work-members table, populated by DB triggers, not app code.

**Warning signs:** A PR that imports `emitActivity` inside a new `/api/works/*` route.

### Pitfall 2: Storage RLS silently doing nothing (and that being fine — until it isn't)

**What goes wrong / what's actually true today:** `track-audio`'s storage.objects RLS
policies (migration 004) check `(storage.foldername(name))[1] = auth.uid()::text` —
i.e. only the *folder-name owner* may read/write. But **every real upload and every
real signed-URL read in this codebase already goes through the service-role client**
(`createServiceClient()`), which bypasses RLS entirely — confirmed in
`app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` (upload) and
`app/(artist)/vault/[projectId]/page.tsx` lines ~186-190 (signed-URL read). The
storage RLS policies are pure defense-in-depth against a hypothetical direct-client
upload that this codebase has never actually built — and Phase 21's shared-project
work (migrations 078/079) confirms this by *never* widening those storage policies
for `project_members` either. A shared-project **editor today cannot upload track
audio via a hypothetical direct-client path** — only the DB-row RLS was widened, not
storage.

**Why it matters for 37.1:** S-02 explicitly wants a contributing collaborator to
"add their own iterations (uploads and Hum-it-in takes)" to *someone else's* work.
If the new upload route naively keeps the `{ownerUserId}/{workId}/{versionId}.{ext}`
path convention, a defense-in-depth storage policy keyed to the *uploader's own*
`auth.uid()` would never match anyway (the path's first segment is the work
*owner's* id, not the uploader's) — meaning even the currently-inert defense-in-depth
layer would reject a legitimate collaborator upload if it were ever exercised
directly.

**How to avoid:** Use `{workId}/{versionId}.{ext}` as the storage path (drop the
owner-id prefix). Keep all writes and signed-URL reads on the service-role client
(matching the existing, only-ever-used pattern) and gate access entirely at the
API-route level via `work_member_tier()` before calling storage — do **not** attempt
to write a work-membership-aware storage.objects RLS policy for 37.1; it adds
migration surface for a code path (direct-client storage access) that does not exist
anywhere in this codebase today. Revisit only if a future phase needs true
direct-to-storage client uploads (e.g. via `tus-js-client`, which `StemsUpload.tsx`
already uses for large stems).

### Pitfall 3: Conflating "on the work" with "on the splits"

**What goes wrong:** Auto-adding every `work_members` row to `split_sheet_parties`
would silently grant splits to a pure performer/listener who was never meant to own
a share of the composition.

**Why it happens:** It is the simplest possible implementation — one INSERT instead
of a conditional writer-detection step.

**How to avoid:** Doctrine states this explicitly: "being ON THE WORK and being ON
THE SPLITS are different facts." Only promote someone to `split_sheet_parties` when
they are marked a **writer** (first `✍` badge on a `lyric_blocks` row they authored,
or an explicit "Add as writer" action) — never merely because they were invited to
the work.

### Pitfall 4: `unreleased` type retirement breaking the existing `type IN (...)` CHECK

**What goes wrong:** `vault_projects.type` has a `CHECK (type IN ('single',
'snippet', 'ep', 'album', 'unreleased'))` (migration 001, line 85-87). S-03 retires
`unreleased` from the **create flow** UI, not from the database — the CHECK
constraint must stay exactly as-is (existing rows, and the "surfaces on the catalogue
shelf" requirement for the one prod `unreleased` row, both depend on the value
continuing to exist and validate).

**How to avoid:** Do not touch the `vault_projects.type` CHECK constraint in this
phase. The two-door picker (`app/(artist)/vault/new/page.tsx`) simply never renders
`unreleased` as an option and posts to `/api/works` instead of `/api/vault` when
"Start a song" is chosen — a UI/routing change, not a schema change. The vault
listing page's My Catalogue shelf query should `UNION`-equivalent (in application
code, not SQL) rows from the new `works` table with any `vault_projects` row where
`type = 'unreleased'`, so the one existing prod row surfaces without a data
migration.

### Pitfall 5: Version numerals or block numerals stored instead of derived

**What goes wrong:** Storing `version_number INTEGER` or `block_number INTEGER`
directly creates a renumbering write cascade on every reorder/delete, and — per the
RENUMBERING RULE — breaks the non-negotiable "authorship binds to block identity…
never the numeral."

**How to avoid:** Never store a numeral. Derive `vN` via
`ROW_NUMBER() OVER (PARTITION BY work_id ORDER BY created_at)` for versions, and
derive block numerals via `ROW_NUMBER() OVER (PARTITION BY work_id, block_type ORDER
BY position)` for same-type lyric blocks, computed at read time in
`lib/catalogue/versions.ts` / `lib/catalogue/blocks.ts` (pure functions, easily unit
tested without a database — see Validation Architecture).

## Code Examples

### Hum capture — codec selection (pure, testable)

```typescript
// lib/catalogue/hum-capture.ts (new) — pure function, unit-testable without a browser
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus', // Chrome/Firefox/Edge default; Safari 18.4+ can also record this if asked
  'audio/mp4',              // Safari's default (AAC) on all versions, including pre-18.4
  'audio/mp4;codecs=mp4a.40.2',
  'audio/aac',
] as const

export function pickSupportedMimeType(
  isTypeSupported: (mime: string) => boolean = MediaRecorder.isTypeSupported
): string | null {
  return CANDIDATE_MIME_TYPES.find(isTypeSupported) ?? null
}
```

### Hum capture — recorder wrapper

```typescript
// components/catalogue/HumCaptureButton.tsx (new, sketch)
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const mimeType = pickSupportedMimeType() ?? '' // '' lets the browser pick its own default
const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
const chunks: BlobPart[] = []
recorder.ondataavailable = e => chunks.push(e.data)
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: recorder.mimeType })
  const form = new FormData()
  form.append('file', blob, `hum.${extFromMime(recorder.mimeType)}`)
  form.append('source', 'hum')
  await fetch(`/api/works/${workId}/versions`, { method: 'POST', body: form })
  stream.getTracks().forEach(t => t.stop()) // release the mic — required, not optional
}
```

### Upload route — modeled directly on the existing track-audio route

```typescript
// app/api/works/[workId]/versions/route.ts (new) — adapted from
// app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts
const BUCKET = 'track-audio'
const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac',
}
// ... auth check via createApiClient(), work_member_tier() check (contribute or administer) ...
const path = `${workId}/${versionId}.${ext}` // note: workId prefix, not userId — Pitfall 2
const service = createServiceClient()
await service.storage.from(BUCKET).upload(path, file, { contentType: file.type })
// INSERT work_versions row with audio_path = path; DB trigger fires the diary event.
```

### "Copy full lyric" export (S-04) — pure serializer, no server round-trip

```typescript
// lib/catalogue/blocks.ts (new)
const TYPE_LABEL: Record<string, string> = {
  verse: 'Verse', pre_chorus: 'Pre-Chorus', chorus: 'Chorus', bridge: 'Bridge',
  intro: 'Intro', outro: 'Outro', hook: 'Hook',
}

export function serializeLyrics(
  blocks: { block_type: string; custom_label: string | null; position: number; text: string; repeat_of_block_id: string | null }[],
  flavor: 'tagged' | 'plain'
): string {
  const byId = new Map(blocks.map(b => [b.position, b])) // resolve repeats by position/id upstream
  return blocks
    .sort((a, b) => a.position - b.position)
    .map(b => {
      const label = b.block_type === 'custom' ? (b.custom_label ?? 'Custom') : TYPE_LABEL[b.block_type]
      return flavor === 'tagged' ? `[${label}]\n${b.text}` : b.text
    })
    .join('\n\n')
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Safari 18.4+ CAN record `audio/webm;codecs=opus` if explicitly requested, but still DEFAULTS to `audio/mp4` — sourced from WebSearch (WebKit blog + secondary aggregator sites), not verified against a live device in this session | Hum Capture / Environment Availability | If wrong, the codec-preference order in `CANDIDATE_MIME_TYPES` may pick a codec Safari silently rejects on some iOS point release — mitigated by always calling `MediaRecorder.isTypeSupported()` at runtime rather than hardcoding a browser-sniffed choice, so the worst case is a suboptimal (not broken) codec choice |
| A2 | Safari (macOS 14.1+/iOS 15+) can *play back* `audio/webm` via `<audio>` — sourced from WebSearch, historically the search results conflated WebM-video-with-VP8/VP9 support with pure WebM-audio/Opus support | Hum Capture playback compatibility | If wrong on some Safari version, a collaborator on that browser opening a hum recorded on Chrome would see a silently-failing `<audio>` element. **Needs a real-device test before shipping** — flagged explicitly below |
| A3 | The recommended table names (`works`, `work_versions`, `lyric_blocks`, `work_members`, `ai_entries`, `work_diary_events`) and their exact columns are a considered proposal, not verified against any existing partial implementation — grep of the full repo found zero references to any of these names today | Recommended Data Model | Low risk — greenfield naming, no collision found; the planner may reasonably rename any of these |
| A4 | Writership (promotion to `split_sheet_parties`) should trigger off the first `✍` badge on an authored `lyric_blocks` row, or an explicit "Add as writer" action — this specific trigger point is not stated verbatim in the doctrine, which only establishes the *distinction* between membership and splits, not the *mechanism* that bridges them | Pattern 4 / Pitfall 3 | If the planner picks a different trigger point (e.g. requiring an explicit action always, never implicit from block authorship), the UX changes but the underlying `evenSplit()`/`split_sheet_parties` machinery is unaffected |

**If this table is empty:** N/A — populated above.

## Open Questions

1. **`works.split_sheet_id` vs. `split_sheets.work_id` — which direction should the FK point?**
   - What we know: `split_sheets` already has a nullable `vault_project_id` and
     `track_id` (migration 067) pointing *from* the sheet *to* its subject — adding
     `split_sheets.work_id` (this research's recommendation) matches that existing
     convention exactly, and avoids a `works.split_sheet_id` column that would need
     to be nullable-then-backfilled at work-creation time (a two-step INSERT+UPDATE
     instead of one INSERT).
   - What's unclear: whether the planner prefers a single INSERT ordering
     (`works` first without the FK, `split_sheets` second referencing `works.id`,
     no back-reference needed at all — querying `split_sheets WHERE work_id = X` is
     just as cheap as a stored FK).
   - Recommendation: drop `works.split_sheet_id` entirely from the DDL sketch above;
     resolve a work's living sheet via `SELECT * FROM split_sheets WHERE work_id = X
     AND status = 'draft'` (at most one such row expected in 37.1). This is simpler
     and matches the existing `split_sheets.vault_project_id`-direction convention.
     **(Already reflected as a comment in the DDL above — flagging here so the
     planner makes it a deliberate choice, not an oversight.)**

2. **Should the labels system (free-text tags on works/versions) ship in 37.1?**
   - What we know: CONTEXT.md marks this as Claude's discretion; the doctrine
     describes it as powering the (deferred) volume view's filters.
   - What's unclear: whether a trivial `works.labels TEXT[]` column (no join table,
     no UI beyond a simple chip-add) is "trivially cheap enough" per the owner's own
     bar.
   - Recommendation: **defer** — a plain `TEXT[]` column is cheap to *add* later
     (additive migration, no backfill needed since no rows exist yet), and 37.1 has
     no UI surface (the volume view) that would consume it. Shipping it now adds a
     UI element to the composer/lyrics-pad screens with no payoff until 37.2+.

3. **Device-verified MediaRecorder playback matrix** — see Assumption A2. This needs
   an actual test pass (Chrome desktop, Safari desktop, Safari iOS, at minimum) before
   the hum-capture feature ships, given the owner's stated intent to test in
   production personally.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Browser `MediaRecorder` API | Hum capture (S-01) | ✓ (all evergreen browsers) | Chrome/Edge/Firefox: full; Safari 14.1+: MP4/AAC only; Safari 18.4+: also WebM/Opus | `MediaRecorder.isTypeSupported()` returning `false` for every candidate → hide the Hum button, show "Add audio" (upload) as the only capture path for that browser |
| `navigator.mediaDevices.getUserMedia` | Mic permission | ✓ (requires HTTPS or localhost — this app is deployed on Vercel, always HTTPS) | — | Permission denied → inline error state, matches sketch 003's "Continue without — I understand the risk" skip affordance |
| Supabase Storage `track-audio` bucket | Both hum + upload versions | ✓ already exists, already allow-lists `audio/webm`, `audio/mp4`, `audio/aac`, `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/flac`, `audio/ogg` (migration 004) | 50MB file_size_limit | None needed — no migration required for storage |
| `@dnd-kit/*` | Lyrics pad reorder | ✓ already a dependency | 6.3.1 / 10.0.0 / 3.2.2 | — |

**Missing dependencies with no fallback:** none identified.

**Missing dependencies with fallback:** MediaRecorder unsupported on a given
browser/device — falls back to the existing "Add audio" upload path, which has no
browser-API dependency at all (a plain `<input type="file">`).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 (`ts-jest` preset) |
| Config file | `jest.config.js` — `testEnvironment: 'node'` (no jsdom; component tests use `renderToStaticMarkup`, not DOM assertions) |
| Quick run command | `npx jest lib/catalogue --silent` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| S-01 | `pickSupportedMimeType()` selects the first supported candidate, returns `null` if none | unit | `npx jest lib/catalogue/hum-capture.test.ts -x` | ❌ Wave 0 |
| S-01 | AI-entry citation composer produces the exact "when-in-doubt" default string given a human-source version | unit | `npx jest lib/catalogue/ai-entries.test.ts -x` | ❌ Wave 0 |
| S-02 | `evenSplit()`-driven recompute produces correct percentages for 1/2/3/4-writer works | unit (reuse existing `lib/split-sheets/approval.test.ts` fixtures) | `npx jest lib/split-sheets/approval.test.ts -x` | ✅ (existing) |
| S-02 | Claimed-collaborator bridge backfills `work_members.user_id` | migration text-lock + structural test, mirrors `__tests__/migration-134.test.ts` | `npx jest __tests__/migration-13X.test.ts -x` | ❌ Wave 0 |
| S-03 | Two-shelf vault page renders both owned works and owned+`unreleased`-type projects | component (`renderToStaticMarkup`, no jsdom) | `npx jest app/\(artist\)/vault -x` | ❌ Wave 0 |
| S-04 | `serializeLyrics()` tagged vs. plain output, including a linked-repeat block expanded in full | unit | `npx jest lib/catalogue/blocks.test.ts -x` | ❌ Wave 0 |
| — | Block numeral derivation is stable across reorders (RENUMBERING RULE) | unit | `npx jest lib/catalogue/blocks.test.ts -x` | ❌ Wave 0 |
| — | RLS helper migration matches the `is_project_owner`/`project_member_role` shape (text-lock, byte-comparison against migration 078 pattern conventions — not a live-DB test, matching this repo's existing convention of never running `supabase db push` from a test) | migration text-lock | `npx jest __tests__/migration-13X.test.ts -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx jest lib/catalogue --silent` (fast, no DB)
- **Per wave merge:** `npx jest` (full suite, includes existing `lib/split-sheets/*.test.ts` regression coverage)
- **Phase gate:** Full suite green before `/gsd-verify-work`; migration text-lock tests are the pre-push review evidence per this repo's "an executor agent must NEVER run `supabase db push`" convention (see every migration 058+ header)

### Wave 0 Gaps

- [ ] `lib/catalogue/hum-capture.test.ts` — covers S-01's codec-selection pure function
- [ ] `lib/catalogue/ai-entries.test.ts` — covers S-01's citation/receipt composer + when-in-doubt resolver
- [ ] `lib/catalogue/blocks.test.ts` — covers S-04's serializer + numeral derivation + repeat/detach logic
- [ ] `lib/catalogue/membership.ts` + test — mirrors `lib/vault/membership.ts`'s `canEditProject`-style pure helpers for `contribute`/`administer`
- [ ] `__tests__/migration-135.test.ts` through `138.test.ts` — text-lock tests for each new migration, mirroring `__tests__/migration-134.test.ts`'s pattern (read the SQL file, strip comments, assert on structural/string content — never a live DB connection)
- [ ] No jsdom is configured (`testEnvironment: 'node'`) — any new component test for `LyricsPad.tsx`/`ComposerCard.tsx`/`DiaryFeed.tsx` must use `renderToStaticMarkup` (React 18, matches `lib/vault/pdf/split-sheet.test.tsx`'s existing JSX-in-Jest precedent) rather than `@testing-library/react` (not installed, and would require jsdom)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherited) | Existing Supabase Auth session via `createApiClient().auth.getUser()` on every new route — no new auth mechanism introduced |
| V3 Session Management | no | Unchanged — no new session concept |
| V4 Access Control | yes | `work_member_tier()`/`is_work_owner()` SECURITY DEFINER helper pair (Pattern 1), `REVOKE INSERT/UPDATE/DELETE ... FROM authenticated, anon` on `work_members` (only service-role API routes write it) — mirrors migration 078's exact posture |
| V5 Input Validation | yes | `zod` `.strict()` schemas on every new route body (mirrors `app/api/collaborators/quick-invite/route.ts`); audio MIME allow-list + `MAX_BYTES` size check before any storage write (mirrors `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts`'s `EXT_BY_MIME`/`MAX_BYTES` pattern) |
| V6 Cryptography | no | No new secrets, tokens, or crypto — collaborator invite tokens reuse `generateApprovalToken()` (existing `crypto.randomBytes(32)`) |
| V12 File Handling | yes | MIME allow-list (never trust `file.name`'s extension — derive from `file.type` via a lookup table, matching the existing audio route); 50MB size ceiling (matches the `track-audio` bucket's own `file_size_limit`); path derived server-side only (`{workId}/{versionId}.{ext}`), never client-supplied |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A `contribute`-tier collaborator escalating to `administer`-only actions (graduate, Crate submission, membership changes) by calling an API route directly | Elevation of Privilege | Every `administer`-gated route checks `work_member_tier(workId, uid) = 'administer' OR is_work_owner(workId, uid)` server-side — never trust a client-sent tier value (mirrors migration 078's `canManageGuests()`/`canDeleteProject()` role-check pattern in `lib/vault/membership.ts`) |
| A collaborator uploading audio to a work they are not a member of, by guessing/enumerating `workId` in the upload route | Elevation of Privilege / Info Disclosure | `work_member_tier()` check before any storage write or DB insert — UUIDs are not guessable, but the check must exist regardless (defense against a leaked/logged workId, not just brute force) |
| XSS via collaborator-entered free text (block author name, work title, AI citation note) rendered in the diary or an invite email | Tampering | Reuse `lib/email/esc.ts`'s `esc()` helper for any email-rendered text (already the pattern in `lib/collaborators/invite.ts`); React's default JSX escaping covers the in-app diary render (no `dangerouslySetInnerHTML` anywhere in the recommended component tree) |
| A malicious/mislabeled `file.type` on upload (e.g. an executable renamed with an audio MIME) | Tampering | The existing `EXT_BY_MIME` allow-list approach only trusts the browser-reported `file.type` for extension mapping, never for content validation — this is the SAME residual risk the existing track-audio route already accepts (no server-side audio-content sniffing exists anywhere in this codebase today); flagging as inherited risk, not introducing a new one |
| False AI-authorship citation ("laundering" an AI-invented part as a human performance) | Repudiation | This is a **product/UX** control, not a technical one — the when-in-doubt UI flow (doctrine, verbatim) requires pointing to an actual `work_versions` row (`human_source_version_id`) before the "AI reference vocal — demo only" citation is offered; the diary's immutability (INSERT-only via triggers, no UPDATE/DELETE path exposed to clients) is the technical backstop that makes the citation auditable after the fact |

## Sources

### Primary (HIGH confidence — read directly from this repository)

- `supabase/migrations/001_initial_schema.sql` — `vault_projects`/`tracks` schema
- `supabase/migrations/004_track_audio_storage.sql` — `track-audio` bucket + RLS
- `supabase/migrations/018_collaborators_split_sheets.sql` — `collaborators`/`split_sheets`/`split_sheet_parties`/`collaborator_invites` origin schema
- `supabase/migrations/026_collaborator_identity_reconciliation.sql` — `claimed_by`, `claim_collaborators()`
- `supabase/migrations/067_split_sheet_song_attachment.sql` — `track_id`/`source` column-add pattern (direct precedent for `split_sheets.work_id`)
- `supabase/migrations/078_project_members.sql` — the RLS helper-pair + REVOKE + owner-backfill pattern this research adapts wholesale
- `supabase/migrations/079_project_membership_auto.sql` — the claimed-collaborator bridge trigger (Pattern 3's direct source)
- `supabase/migrations/013_readiness_activity_trigger.sql` — DB-trigger event-emit precedent (Pattern 2's direct source)
- `supabase/migrations/127_atomic_checklist_reorder.sql` — atomic multi-row reorder RPC precedent
- `supabase/migrations/133_handle_identity.sql`, `134_handle_format_and_backfill.sql` — current migration header/RLS-doctrine conventions
- `__tests__/migration-134.test.ts` — text-lock migration test pattern
- `lib/storage/index.ts`, `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` — audio upload patterns (the latter is the ACTUALLY-used one; see Summary)
- `app/(artist)/vault/[projectId]/page.tsx` (lines ~176-193) — signed-URL batch-read pattern
- `lib/split-sheets/approval.ts`, `lib/split-sheets/lifecycle.ts` — `evenSplit()`, `LIVING_DRAFT_STATUSES`, `assertEditable()`
- `lib/collaborators/invite.ts`, `app/api/collaborators/quick-invite/route.ts` — invite/claim machinery
- `lib/vault/membership.ts` — `ProjectRole` pure-helper style (template for `lib/catalogue/membership.ts`)
- `components/profile/ActivityFeed.tsx` — reverse-chron render pattern
- `app/(artist)/vault/page.tsx`, `app/(artist)/vault/new/page.tsx` — exact mount points for S-03
- `jest.config.js` — `testEnvironment: 'node'`, no jsdom
- `package.json` — confirms `@dnd-kit/*` already installed, no audio-recording package exists (none needed)
- `docs/architecture/ACCOUNT-TYPES.md` — User Account scope confirmation

### Secondary (MEDIUM confidence — WebSearch, cross-checked against multiple results)

- MediaRecorder codec support: Chrome/Firefox default to `audio/webm;codecs=opus`; Safari defaults to `audio/mp4`/AAC on all versions; Safari 18.4 added WebM/Opus recording capability (not default). Multiple aggregator sources agree on the broad strokes; primary WebKit blog post not directly fetched this session.

### Tertiary (LOW confidence — flagged for device verification)

- Safari WebM *playback* version thresholds (14.1+ macOS / iOS 15+) — search results showed signs of conflating WebM-video (VP8/VP9) support with WebM-audio (Opus) support specifically. **Do not ship without a real-device playback test** (see Open Question 3).

## Metadata

**Confidence breakdown:**
- Standard stack / reuse map: HIGH — every citation above is read directly from this repository, not inferred
- Data model (new tables): MEDIUM — this is Claude's discretion per CONTEXT.md; the shapes follow this codebase's own established conventions closely, but are a proposal for the planner to finalize, not a verified-against-existing-code fact
- Hum capture (MediaRecorder): MEDIUM for recording codec selection (well-documented, cross-checked), LOW-MEDIUM for cross-browser playback specifics (flagged, needs device test)
- Pitfalls: HIGH — Pitfalls 1, 2, and 4 are each grounded in a specific, cited line of existing code/migration, not general best-practice advice

**Research date:** 2026-08-30
**Valid until:** ~30 days for the schema/architecture recommendations (stable — internal codebase conventions change slowly); ~14 days for the MediaRecorder browser-support claims (fast-moving — Safari has shipped codec changes as recently as version 18.4 per the search results)
