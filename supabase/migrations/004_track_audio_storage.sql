-- ─── Track audio storage bucket ──────────────────────────────────────
-- PRIVATE bucket for track audio. Unlike vault-assets (public images),
-- audio must not be world-readable: playback is artist-only for now, so
-- the app serves it via short-lived signed URLs generated server-side on
-- the owner-only project page.
--
-- Files live under {user_id}/{project_id}/{track_id}.{ext}. The app does
-- storage reads/writes with a service-role client and enforces ownership
-- in route handlers; these policies are defense-in-depth so a user-session
-- client can still only touch its own objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'track-audio',
  'track-audio',
  false,
  52428800, -- 50 MB
  array[
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
    'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "track_audio_select_own" on storage.objects;
drop policy if exists "track_audio_insert_own" on storage.objects;
drop policy if exists "track_audio_update_own" on storage.objects;
drop policy if exists "track_audio_delete_own" on storage.objects;

-- Private bucket: the owner needs an explicit SELECT policy to read.
create policy "track_audio_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'track-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "track_audio_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'track-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "track_audio_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'track-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'track-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "track_audio_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'track-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
