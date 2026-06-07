-- ─── Vault Assets storage bucket ─────────────────────────────────────
-- Public bucket for project images (cover art, press photos, etc.).
-- Files live under a {user_id}/{project_id}/ path prefix so ownership can
-- be enforced by the first path segment. Mirrors what the app uploads via
-- /api/vault/[projectId]/assets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vault-assets',
  'vault-assets',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Owner-scoped writes: a user may only touch objects whose first path
-- segment equals their uid. Public reads are served via the public bucket,
-- so no SELECT policy is required.
drop policy if exists "vault_assets_insert_own" on storage.objects;
drop policy if exists "vault_assets_update_own" on storage.objects;
drop policy if exists "vault_assets_delete_own" on storage.objects;

create policy "vault_assets_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vault-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vault_assets_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vault-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'vault-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vault_assets_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vault-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
