-- Migration 122: partial unique indexes on generated identifier columns
--
-- Backstop for the identifier-generation race (2026-08-22 audit #3): the artist
-- counters in app/api/metadata/generate-identifier/route.ts are read-modify-
-- written without a lock, so two concurrent mints for the same artist could
-- compute the same ISRC/UPC/GRid/catalog number and write it to two different
-- tracks/projects. These indexes make that impossible to PERSIST — the second
-- write fails with 23505, and the route surfaces a retryable 409; since the
-- counter is already advanced, the retry mints a fresh value (no duplicate, no
-- gap). Verified against prod 2026-08-23: zero existing duplicates.
--
-- Scope:
--   * isrc / upc / grid are globally-unique standards -> global unique index.
--   * catalog_number is label-scoped (an artist's own prefix + sequence, and two
--     different labels may legitimately reuse a number) -> unique PER artist.
-- Partial (WHERE ... IS NOT NULL) so the many rows without an identifier are
-- unconstrained and multiple NULLs remain allowed.
--
-- HUMAN-GATED PUSH.

CREATE UNIQUE INDEX IF NOT EXISTS tracks_isrc_unique
  ON public.tracks (isrc) WHERE isrc IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vault_projects_upc_unique
  ON public.vault_projects (upc) WHERE upc IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vault_projects_grid_unique
  ON public.vault_projects (grid) WHERE grid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vault_projects_user_catalog_number_unique
  ON public.vault_projects (user_id, catalog_number) WHERE catalog_number IS NOT NULL;

NOTIFY pgrst, 'reload schema';
