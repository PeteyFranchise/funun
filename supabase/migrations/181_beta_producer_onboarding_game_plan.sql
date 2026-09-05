-- ============================================================
-- Funūn — Beta Producer Onboarding Game Plan
-- Migration 181: publish the beta-only Playbook SOP and add
--                reusable Member onboarding call plans.
--
-- HUMAN-GATED: apply with `supabase db push` before using the
-- Member Onboarding CRM in production.
-- ============================================================

-- Reusable templates are separate from per-call runs. Editing a template
-- must never rewrite the checklist or evidence captured during an earlier
-- onboarding call.
CREATE TABLE IF NOT EXISTS public.member_game_plan_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key               TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  beta_only         BOOLEAN NOT NULL DEFAULT true,
  version           INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  checklist         JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(checklist) = 'array'),
  playbook_entry_id UUID REFERENCES public.playbook_entries(id) ON DELETE SET NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS member_game_plan_templates_updated_at ON public.member_game_plan_templates;
CREATE TRIGGER member_game_plan_templates_updated_at
  BEFORE UPDATE ON public.member_game_plan_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Each run freezes the selected template version and checklist. Open runs are
-- editable; completed runs form the append-only call log presented by the UI.
CREATE TABLE IF NOT EXISTS public.member_game_plan_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       UUID NOT NULL REFERENCES public.member_game_plan_templates(id),
  member_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_label      TEXT NOT NULL,
  facilitator_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  facilitator_label TEXT NOT NULL,
  template_key      TEXT NOT NULL,
  template_title    TEXT NOT NULL,
  template_version  INTEGER NOT NULL CHECK (template_version > 0),
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'completed', 'cancelled')),
  items             JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(items) = 'array'),
  context           JSONB NOT NULL DEFAULT '{}'::jsonb
                    CHECK (jsonb_typeof(context) = 'object'),
  overall_notes     TEXT NOT NULL DEFAULT '',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);

CREATE UNIQUE INDEX IF NOT EXISTS member_game_plan_runs_one_open_template
  ON public.member_game_plan_runs (member_id, template_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS member_game_plan_runs_member_history
  ON public.member_game_plan_runs (member_id, created_at DESC);

DROP TRIGGER IF EXISTS member_game_plan_runs_updated_at ON public.member_game_plan_runs;
CREATE TRIGGER member_game_plan_runs_updated_at
  BEFORE UPDATE ON public.member_game_plan_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.member_game_plan_templates IS
  'Reusable Team Console game-plan templates for Member Account calls. beta_only is a display and operating-scope warning, never an authorization control. Service-role only.';

COMMENT ON TABLE public.member_game_plan_runs IS
  'Per-call snapshots created from member_game_plan_templates. Open runs hold live checklist progress; completed runs are retained as the Member onboarding call log. Rights identifiers stay in the Member profile and are never copied here. Service-role only.';

ALTER TABLE public.member_game_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_game_plan_runs ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.member_game_plan_templates FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.member_game_plan_runs FROM authenticated, anon;

-- Publish the approved SOP once in Company-wide / Beta Operations. Company-
-- wide is already available to A&R and AE/Sales, and Leadership has structural
-- access to every Playbook room.
UPDATE public.playbook_rooms
SET coming_soon = false
WHERE key = 'company-wide';

INSERT INTO public.playbook_sub_groups (room_id, key, label, sort_order)
SELECT id, 'beta-operations', 'Beta Operations', 20
FROM public.playbook_rooms
WHERE key = 'company-wide'
ON CONFLICT (room_id, key) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

WITH article(title, items) AS (
  VALUES (
    'BETA TESTING ONLY — Producer Onboarding Call',
    ARRAY[
      'BETA TESTING ONLY: Use this workflow only for approved beta onboarding sessions. Keep original files backed up, do not guess rights information, and document bugs or confusing behavior during the call.',
      'Audience: A&R, AE/Sales and Leadership. Purpose: help a producer create one real artist record in Funūn while collecting structured product feedback.',
      'Definition of success: the producer creates a real song, uploads the working track, invites the artist, leaves a timestamped note, and knows how to return and continue the work.',
      'BEFORE THE SESSION — Confirm the producer''s sign-in email, artist and song name; request Chrome, headphones, one backed-up audio file and the artist''s email.',
      'ACCOUNT & PROFILE — Create or sign into the Member Account; confirm professional name, handle, legal name and applicable roles.',
      'RIGHTS PROFILE — Enter the PRO, IPI/CAE, publisher or administrator, self-published status and SoundExchange ID when known. Leave uncertain information blank and flag it for later. Never guess.',
      'REAL PROJECT — Open Sound Vault, create one real song, enter the artist/song context, open the Writer''s Room, upload and play the current audio, name it and mark the working take.',
      'COLLABORATION — Invite the artist, confirm room roles, create a studio note with an @mention, add and reopen a timestamped waveform note, then reply or react.',
      'OPTIONAL CAPTURE — If useful, record a quick spoken or vocal take over the track and demonstrate archive/restore for an unwanted test take.',
      'CREDITS & RIGHTS — Explain that room membership is not authorship or ownership. Record production, performance and songwriting roles separately; add only confirmed writers and agreed percentages.',
      'RELIABILITY — Refresh, then sign out and back in. Confirm the project, audio, members, notes and takes persist and that the producer remains in the correct Member workspace.',
      'FEEDBACK — Ask what felt useful or confusing, what was slower than their normal workflow, whether they would choose Funūn over Voice Memos/text/file links, and which single improvement matters most.',
      'RECOMMENDED CRM WORKFLOW — Open Member Onboarding in the Team Console and select the producer''s Member Account.',
      'RECOMMENDED CRM WORKFLOW — Choose Start a game plan, select Beta Producer Onboarding Call, and enter the artist/project context.',
      'RECOMMENDED CRM WORKFLOW — Check off, skip or annotate each item during the call. A skipped item is acceptable; this workflow must not become rigid paperwork.',
      'RECOMMENDED CRM WORKFLOW — Use Save progress during the session. Rights identifiers belong in the Member''s private Settings profile; record only completion status or follow-up notes in the game plan.',
      'RECOMMENDED CRM WORKFLOW — Choose Complete & log call when finished. Funūn preserves the checklist snapshot, facilitator, time, context, completion totals, skipped/pending items, notes and next steps in the Member''s call log.',
      'RECOMMENDED CRM WORKFLOW — Start a new run for every future onboarding call. Never edit the master template or an earlier completed call to represent a new conversation.'
    ]::TEXT[]
  )
),
company_room AS (
  SELECT id FROM public.playbook_rooms WHERE key = 'company-wide'
),
beta_group AS (
  SELECT subgroup.id
  FROM public.playbook_sub_groups subgroup
  JOIN company_room room ON room.id = subgroup.room_id
  WHERE subgroup.key = 'beta-operations'
)
INSERT INTO public.playbook_entries (
  room_id, sub_group_id, entry_type, title, content, status
)
SELECT
  room.id,
  subgroup.id,
  'sop',
  article.title,
  jsonb_build_object('items', to_jsonb(article.items)),
  'published'
FROM article
CROSS JOIN company_room room
CROSS JOIN beta_group subgroup
WHERE NOT EXISTS (
  SELECT 1
  FROM public.playbook_entries existing
  WHERE existing.room_id = room.id AND existing.title = article.title
);

-- Seed the runnable template. Each entry is deliberately concise in the live
-- call UI; the detailed rationale and Recommended CRM Workflow remain in the
-- linked Playbook article above.
WITH article AS (
  SELECT entry.id
  FROM public.playbook_entries entry
  JOIN public.playbook_rooms room ON room.id = entry.room_id
  WHERE room.key = 'company-wide'
    AND entry.title = 'BETA TESTING ONLY — Producer Onboarding Call'
  LIMIT 1
), checklist AS (
  SELECT jsonb_build_array(
    jsonb_build_object('id','confirm-email','section','Before the session','label','Confirm the producer''s preferred sign-in email'),
    jsonb_build_object('id','confirm-project','section','Before the session','label','Confirm the artist and first song/project name'),
    jsonb_build_object('id','prepare-browser','section','Before the session','label','Use Chrome on a laptop with headphones available'),
    jsonb_build_object('id','prepare-audio','section','Before the session','label','Prepare one backed-up beat, demo, rough mix or session bounce'),
    jsonb_build_object('id','artist-email','section','Before the session','label','Have the artist''s email ready'),

    jsonb_build_object('id','member-signin','section','Account and profile','label','Create or sign into the producer''s Member Account'),
    jsonb_build_object('id','professional-identity','section','Account and profile','label','Confirm professional name, handle and applicable roles'),
    jsonb_build_object('id','legal-name','section','Account and profile','label','Enter the legal name exactly as registered'),
    jsonb_build_object('id','pro','section','Account and profile','label','Add the PRO affiliation when known'),
    jsonb_build_object('id','ipi','section','Account and profile','label','Enter and verify the IPI/CAE number when known'),
    jsonb_build_object('id','publishing','section','Account and profile','label','Add publisher, administrator or self-published status'),
    jsonb_build_object('id','soundexchange','section','Account and profile','label','Add the SoundExchange ID when applicable'),

    jsonb_build_object('id','open-vault','section','Real project walkthrough','label','Open Sound Vault and create one real song project'),
    jsonb_build_object('id','song-context','section','Real project walkthrough','label','Enter the artist and song information'),
    jsonb_build_object('id','open-room','section','Real project walkthrough','label','Open the song in the Writer''s Room'),
    jsonb_build_object('id','upload-audio','section','Real project walkthrough','label','Upload and play the current beat, demo or rough mix'),
    jsonb_build_object('id','working-take','section','Real project walkthrough','label','Name the audio and mark the current working take'),
    jsonb_build_object('id','invite-artist','section','Real project walkthrough','label','Invite the artist and confirm room roles'),

    jsonb_build_object('id','studio-note','section','Collaboration tools','label','Create a studio note and @mention the artist'),
    jsonb_build_object('id','timed-note','section','Collaboration tools','label','Add and reopen one timestamped waveform note'),
    jsonb_build_object('id','reply-react','section','Collaboration tools','label','Reply or add a micro-reaction'),
    jsonb_build_object('id','rough-take','section','Collaboration tools','label','Optionally record a quick spoken or vocal take over the track'),
    jsonb_build_object('id','archive-restore','section','Collaboration tools','label','Archive and restore an unwanted test take'),

    jsonb_build_object('id','room-vs-rights','section','Credits and rights','label','Explain that room membership is not songwriting credit or ownership'),
    jsonb_build_object('id','actual-contribution','section','Credits and rights','label','Identify actual production, performance and writing contributions'),
    jsonb_build_object('id','split-draft','section','Credits and rights','label','Open the split-sheet draft and add only confirmed writers'),
    jsonb_build_object('id','percentages','section','Credits and rights','label','Enter percentages only when agreed'),
    jsonb_build_object('id','registration-tracking','section','Credits and rights','label','Show project-level rights and registration tracking'),

    jsonb_build_object('id','refresh-check','section','Reliability','label','Refresh and confirm current changes remain saved'),
    jsonb_build_object('id','signin-check','section','Reliability','label','Sign out and back in'),
    jsonb_build_object('id','persistence-check','section','Reliability','label','Confirm the project, audio, notes, members and takes remain available'),
    jsonb_build_object('id','workspace-check','section','Reliability','label','Confirm the producer remains in the correct Member workspace'),

    jsonb_build_object('id','feedback-useful','section','Feedback','label','Ask what felt immediately useful'),
    jsonb_build_object('id','feedback-confusing','section','Feedback','label','Ask what was confusing or difficult to find'),
    jsonb_build_object('id','feedback-alternative','section','Feedback','label','Ask whether they would choose Funūn over their current tools'),
    jsonb_build_object('id','feedback-priority','section','Feedback','label','Record the one improvement they would prioritize'),
    jsonb_build_object('id','next-step','section','Feedback','label','Agree on the next action and owner')
  ) AS value
)
INSERT INTO public.member_game_plan_templates (
  key, title, description, beta_only, version, checklist, playbook_entry_id, active
)
SELECT
  'beta-producer-onboarding-v1',
  'Beta Producer Onboarding Call',
  'Guide one producer through a real artist project while collecting structured beta feedback.',
  true,
  1,
  checklist.value,
  article.id,
  true
FROM checklist
CROSS JOIN article
ON CONFLICT (key) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    beta_only = EXCLUDED.beta_only,
    version = EXCLUDED.version,
    checklist = EXCLUDED.checklist,
    playbook_entry_id = EXCLUDED.playbook_entry_id,
    active = EXCLUDED.active;

NOTIFY pgrst, 'reload schema';
