-- ============================================================
-- Funūn — Phase 37.1 "The Songwriter" (My Catalogue)
-- Migration 135: the composition core — public.works, public.work_versions,
--                public.lyric_blocks and public.ai_entries. Tables created,
--                row level security ENABLED, and deliberately NO policies.
--                Every policy for these four tables lives in migration 136.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (the standing convention since migrations 058/062/063/064/066/067/070/078,
-- restated in migration 134's own header). This file is authored and
-- text-tested (__tests__/migration-135.test.ts) but must not be applied
-- automatically. The live push is the 37-01 Task 4 blocking checkpoint and
-- the owner performs it. Do NOT edit migrations 001-134 (already landed).
--
-- ─── 135 AND 136 ARE ONE UNIT, SPLIT ONLY FOR REVIEWABILITY ──────────────
-- This file creates four tables with RLS on and no policy on any of them.
-- That is not an omission and it is not a live window. The two files are
-- pushed together in a single `supabase db push` at one checkpoint, against
-- four tables that are empty and that no shipped application code reads yet,
-- so there is no moment in which a user's request meets an enabled-but-
-- unreachable table.
--
-- Splitting the other way is impossible, not merely inconvenient. Every
-- policy these tables need calls public.work_member_tier(), and that
-- function selects from public.work_members — a table this file does not
-- create. A policy body cannot reference a function whose own body reads a
-- relation that does not exist yet, so the policies must follow the
-- membership table, and the membership table is 136.
--
-- ─── RLS DOCTRINE FOR THIS PHASE ─────────────────────────────────────────
-- The four tables here get REAL, authenticated-readable owner-or-member
-- policies (migration 078's helper-pair shape), NOT the zero-policy+REVOKE
-- posture of migrations 128-134. That posture is correct only for tables no
-- authenticated client ever reads directly (handle_history, the jobs queue).
-- The composer page renders through createServerClient() under the viewer's
-- own session, exactly as app/(artist)/vault/page.tsx does today, so these
-- rows must be visible to their owner and to a work's members through RLS
-- and not through a service-role escape hatch. The two tables that ARE
-- capability surfaces rather than content — work_members (136) and
-- work_diary_events (138) — do carry the REVOKE lockdown, for the reasons
-- their own files give.
--
-- UUID DEFAULTS: every primary key default below is gen_random_uuid(), never
-- uuid_generate_v4() — uuid-ossp lives in the `extensions` schema and is not
-- on the migration session's search_path. Migration 062's first push attempt
-- failed on exactly that, and migration 078's header records the rule.
-- ============================================================

-- ─── (1) works — the composition entity ──────────────────────────────────
-- A work is a SONG, not a release. It carries no release date, no
-- distributor, no ISRC, no readiness score, and nothing else from the
-- vault_projects world; that separation is the reason this is a new table
-- rather than a sixth vault_projects type (37-RESEARCH.md "Alternatives
-- Considered").
--
-- vocal_state is three states, not a boolean, and the third one is
-- load-bearing (DEFAULT-PERFORMER RULE). 'primary' means one voice sings
-- this song unless a section says otherwise, and primary_performer names
-- them. 'varies' means the song genuinely trades voices and every section
-- declares its own. 'instrumental' is not cosmetic: it makes every
-- who-sings prompt disappear from the pad, it makes the Crate's vocal check
-- pass by construction rather than by an artist answering a question that
-- does not apply to their song, and at graduation it makes the DDEX export
-- omit vocal performer roles entirely instead of emitting empty ones.
--
-- primary_performer is JSONB shaped {kind, collaborator_id, user_id, name},
-- matching this codebase's existing convention for flexible people-lists
-- (tracks.writers, tracks.featuring_artists, lib/metadata/schema.ts's
-- Performer type) rather than three new FK columns per performer slot. It is
-- nullable — an instrumental work has no primary performer, and a brand new
-- work has not been asked yet.
--
-- graduated_project_id is the 37.2 seam and NOTHING in 37.1 writes it. It
-- exists now so that graduating a work to a release is later an UPDATE
-- rather than a migration. ON DELETE SET NULL: deleting the release must
-- never delete the composition it came from.
CREATE TABLE public.works (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title                TEXT NOT NULL DEFAULT 'Untitled',
  vocal_state          TEXT NOT NULL DEFAULT 'primary'
                       CHECK (vocal_state IN ('primary', 'varies', 'instrumental')),
  primary_performer    JSONB,
  graduated_project_id UUID REFERENCES public.vault_projects ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_works_user_id ON public.works (user_id);

-- Reuse migration 001's update_updated_at() rather than defining a second
-- copy of a three-line function — migration 028's header records that
-- convention and every table with an updated_at column in this schema
-- follows it.
CREATE TRIGGER works_updated_at
  BEFORE UPDATE ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── WHAT IS DELIBERATELY ABSENT FROM public.works ───────────────────────
-- Two columns a later reader will look for are missing on purpose. Both are
-- resolved open questions from 37-RESEARCH.md, not oversights.
--
-- (a) NO REVERSE POINTER TO THE SPLIT SHEET. The researcher's Open Question
-- 1 asked whether a work stores its sheet's id or the sheet stores its
-- work's id. Resolved: the sheet side only, added in migration 137. It
-- matches the direction migration 067 already established (a sheet points at
-- its vault project and at its track, never the reverse), it avoids the FK
-- cycle a bidirectional pair would create, and it turns work creation into
-- one insert per row instead of insert-then-update-the-other-row. A work's
-- living sheet is resolved by selecting from public.split_sheets where the
-- work matches and status is 'draft' — an indexed lookup, exactly as cheap
-- as a stored id.
--
-- (b) NO ARTIST-LABELS COLUMN. Open Question 2 asked whether the labels
-- system (demo / beat / track / idea / instrumental / concept, plus custom)
-- ships in 37.1. Resolved: DEFER to 37.2. A plain TEXT array is cheap to add
-- later against a table that will still have very few rows, no backfill will
-- ever be needed because the absence of a label is a legitimate state, and
-- 37.1 ships no surface that would consume one — the volume view whose
-- filters labels exist to power is itself deferred. Adding the column now
-- would ship a schema commitment ahead of the design that uses it.

-- ─── (2) work_versions — the recording side (hum / upload) ───────────────
-- The doctrine's work/recording split, made structural: a work is the
-- composition, a version is one take of it. Versions accumulate; none
-- replaces another.
--
-- user_id here is whoever created THIS version, which may be a collaborator
-- rather than the work's owner. Do not conflate it with works.user_id —
-- migration 078's Pitfall 1 is precisely the bug that conflation causes once
-- a second writer exists, and the policies in 136 resolve access through
-- work_id, never through this column.
--
-- performers is the declared per-recording credit list (PERFORMER RULE) and
-- it is the authoritative one: what a version says about who played on it
-- beats anything inherited from the work.
--
-- NO VERSION NUMERAL COLUMN EXISTS AND NONE MAY BE ADDED (37-RESEARCH.md
-- Pitfall 5). "v3" is derived at read time by ROW_NUMBER() OVER (PARTITION
-- BY work_id ORDER BY created_at) in lib/catalogue/versions.ts. Storing the
-- numeral would create a renumbering write cascade on every delete and would
-- let a stored number drift out of agreement with the ordering that produced
-- it. The composite index below is what makes the derivation cheap.
--
-- audio_path convention: '{work_id}/{version_id}.{ext}' inside the EXISTING
-- track-audio bucket, with NO owner-id prefix, and this migration widens no
-- storage policy. 37-RESEARCH.md Pitfall 2 is the argument. Migration 004's
-- storage.objects policies are folder-owner-scoped
-- ((storage.foldername(name))[1] = auth.uid()::text) and were never widened
-- for project_members when Phase 21 shipped shared projects, because every
-- real upload and every real signed-URL read in this codebase goes through
-- createServiceClient() and bypasses storage RLS entirely. Those policies
-- are inert defense-in-depth today. An owner-id prefix would make that inert
-- layer REJECT a legitimate collaborator's upload the moment anyone
-- exercised a direct-client path, because the first path segment would be
-- the work owner's id and not the uploader's. Access to version audio is
-- gated at the API route through public.work_member_tier(), before storage
-- is touched at all.
CREATE TABLE public.work_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id          UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  user_id          UUID REFERENCES auth.users NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('hum', 'upload')),
  audio_path       TEXT NOT NULL,
  audio_ext        TEXT NOT NULL,
  audio_size       BIGINT,
  duration_seconds INTEGER,
  label            TEXT,
  performers       JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_versions_work_id ON public.work_versions (work_id, created_at);

-- ─── (3) lyric_blocks — the structure blocks of the pad ──────────────────
-- Three decided rules are encoded in this shape. Read them before changing
-- any column here; each one is load-bearing for authorship evidence, not for
-- presentation.
--
-- RENUMBERING RULE. `position` is the absolute drag order and it is the ONLY
-- ordering fact stored. "Verse 2" is DERIVED at read time by ROW_NUMBER()
-- OVER (PARTITION BY work_id, block_type ORDER BY position) among same-type
-- siblings. Dragging a verse above another therefore renumbers both
-- instantly with no write beyond the two positions, and authorship — which
-- binds to the row id — cannot smudge, because nothing in the diary or the
-- split sheet ever referred to the numeral. Custom-named sections never
-- renumber at all. NO BLOCK NUMERAL COLUMN EXISTS AND NONE MAY BE ADDED
-- (37-RESEARCH.md Pitfall 5).
--
-- REPEAT RULE. `repeat_of_block_id` is a LINK, not a copy. A repeated chorus
-- is one row pointing at the source row; it displays the source's text and
-- inherits the source's author, so editing the source updates every repeat
-- and no duplicate authorship claim is ever created. "Detach to vary" is
-- copy-on-write: the route copies the source text into this row, clears this
-- column, and from that point the row carries its own authorship. ON DELETE
-- SET NULL, never CASCADE: deleting the chorus a repeat pointed at must
-- leave the repeat standing as its own block, never silently delete lyrics
-- somewhere else in the song.
--
-- PERFORMER RULE. The two people-columns mean different things and must not
-- be merged. `author_user_id` is the ✍ writer badge; it is set automatically
-- from whoever wrote the block and it is the fact that MOVES SPLITS.
-- `performers` is the declared 🎤 singer cluster; it moves CREDITS and never
-- splits. A blank `performers` inherits the work's primary_performer for
-- display — and an inherited badge fills the PLAN, never the RECORD: it is
-- never written into this column, because a default must not fabricate a
-- performance record that nobody declared.
CREATE TABLE public.lyric_blocks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id            UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  block_type         TEXT NOT NULL
                     CHECK (block_type IN ('verse', 'pre_chorus', 'chorus', 'bridge',
                                           'intro', 'outro', 'hook', 'custom')),
  custom_label       TEXT,
  position           INTEGER NOT NULL,
  text               TEXT NOT NULL DEFAULT '',
  author_kind        TEXT NOT NULL DEFAULT 'human'
                     CHECK (author_kind IN ('human', 'ai')),
  author_user_id     UUID REFERENCES auth.users,
  performers         JSONB NOT NULL DEFAULT '[]',
  repeat_of_block_id UUID REFERENCES public.lyric_blocks ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lyric_blocks_work_id ON public.lyric_blocks (work_id, position);

CREATE TRIGGER lyric_blocks_updated_at
  BEFORE UPDATE ON public.lyric_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── (4) ai_entries — DDEX-component AI contributions (CAT-Q3) ───────────
-- ZERO SPLIT BY CONSTRUCTION. There is no percentage column on this table
-- and none may be added. That is the whole point of CAT-Q3: an AI
-- contribution is DISCLOSED, never OWNED, so there is nothing for it to hold
-- a share of. Disclosure is not forfeiture — citing a tool that performed a
-- human-written melody costs the artist no ownership at all — but the hard
-- edge stays honest: what a tool WROTE, nobody can own, and no column here
-- can be made to say otherwise.
--
-- `component` is DDEX v5.0's own vocabulary, stored now so that at
-- graduation the disclosure fields (IsAIGenerated, AIComponentType,
-- AITrainingDisclosure) auto-fill from rows rather than from a form the
-- artist has to remember to fill in months later.
--
-- `level` is the swap-versus-persist axis. A 'version' entry is attached to
-- one recording and washes out naturally the moment a human re-records that
-- part. A 'work' entry is attached to the composition and PERSISTS through
-- graduation, because it should — it describes something in the song itself.
--
-- `mode` is the swap-versus-generate distinction the doctrine calls the
-- authorship-hygiene layer's sharpest edge, and it is the same button in
-- some tools with totally different rights postures. 'performance' is a tool
-- singing or playing something a human wrote: timbre only, ownership
-- untouched. 'generate' is the tool inventing the material: owned by no one,
-- forever, no matter who performs it afterwards.
--
-- `human_source_version_id` is the when-in-doubt rule made structural. The
-- maximal-ownership citation ("AI reference vocal — performed a human-written
-- melody, demo only") may only be offered when the entry can point at a real,
-- diary-anchored human take that existed BEFORE the tool touched it. If
-- there is no such take, the UI must not reach for that label; the artist
-- re-authors the part first and then the citation becomes true. Doubt is
-- resolved by work, not by wording — and this nullable FK is what lets the
-- product tell the difference instead of trusting memory. ON DELETE SET
-- NULL: deleting the cited take weakens the citation, it does not delete the
-- disclosure.
--
-- `citation` is the plain-words receipt line, composed server-side at write
-- time and stored, never regenerated client-side, so what the artist agreed
-- to is what stays on the record. No tool names appear in UI copy; the
-- citation text is the artist's own sentence.
CREATE TABLE public.ai_entries (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                 UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  level                   TEXT NOT NULL CHECK (level IN ('work', 'version')),
  version_id              UUID REFERENCES public.work_versions ON DELETE CASCADE,
  block_id                UUID REFERENCES public.lyric_blocks ON DELETE SET NULL,
  component               TEXT NOT NULL
                          CHECK (component IN ('vocal', 'instrument', 'lyric', 'melody', 'full')),
  mode                    TEXT NOT NULL CHECK (mode IN ('performance', 'generate')),
  citation                TEXT NOT NULL,
  human_source_version_id UUID REFERENCES public.work_versions ON DELETE SET NULL,
  created_by              UUID REFERENCES auth.users NOT NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (level = 'version' AND version_id IS NOT NULL)
    OR (level = 'work' AND version_id IS NULL)
  )
);

CREATE INDEX idx_ai_entries_work_id ON public.ai_entries (work_id);

-- ─── (5) Row level security: ENABLED here, governed in 136 ───────────────
-- Enabling RLS with no policy denies everything to authenticated and anon —
-- which is the correct state for these four tables until the helper pair
-- they must consult exists. Migration 136 creates public.work_members, the
-- is_work_owner/work_member_tier pair, and every policy for the tables
-- below. The two files ship in ONE push at ONE checkpoint, so this state is
-- never observable by a user. See this file's header for why the split runs
-- in this direction and not the other.
ALTER TABLE public.works         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyric_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_entries    ENABLE ROW LEVEL SECURITY;

-- ─── (6) Schema-cache reload ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
