-- ─── Track audio bucket — stems config bump ──────────────────────────────────
-- Additive config-only update to the track-audio bucket (created in 004).
-- No new bucket is created. No access-control DDL (RLS policies) is altered —
-- the four owner-path policies from 004 stay intact and are not referenced here.
--
-- Changes:
--   file_size_limit  50 MB → 250 MB   (D-07: stems ZIP can be up to ~200 MB)
--   allowed_mime_types  +application/zip, +application/x-zip-compressed
--                       (D-03/Pitfall 4: ZIP is the container for stems delivery;
--                        application/x-zip-compressed is what some Windows tools emit)
--
-- The on-conflict idempotent upsert mirrors migration 004's exact statement shape
-- so re-running is safe (e.g., on re-deploy or supabase db push after a reset).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'track-audio',
  'track-audio',
  false,
  262144000, -- 250 MB, D-07
  array[
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
    'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/webm',
    'application/zip', 'application/x-zip-compressed'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
