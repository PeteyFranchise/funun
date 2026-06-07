-- ─── Fix readiness recompute triggers ────────────────────────────────
-- The original docs/assets/outputs triggers only fired on a subset of
-- events, so removing a signed document, asset, or tool output left the
-- vault_readiness_score stale (too high) until some other change ran. Make
-- all child-table triggers fire on INSERT, UPDATE, and DELETE — matching
-- tracks_affect_readiness, which was already correct.

drop trigger if exists docs_affect_readiness on vault_documents;
create trigger docs_affect_readiness
  after insert or update or delete on vault_documents
  for each row execute function update_vault_readiness();

drop trigger if exists assets_affect_readiness on vault_assets;
create trigger assets_affect_readiness
  after insert or update or delete on vault_assets
  for each row execute function update_vault_readiness();

drop trigger if exists outputs_affect_readiness on tool_outputs;
create trigger outputs_affect_readiness
  after insert or update or delete on tool_outputs
  for each row execute function update_vault_readiness();
