-- 017_readiness_distributor_trigger.sql
-- The readiness triggers fire on the child tables (tracks / vault_assets /
-- vault_documents / tool_outputs) but NOT on vault_projects. Migration 016 made
-- `distributor` (a vault_projects column) a scored gate, so changing it has to
-- recompute the score too — otherwise the picker would set the distributor
-- without moving the percentage until some other edit fired a child trigger.
--
-- This fires only when `distributor` changes, and its inner UPDATE touches only
-- vault_readiness_score, so it cannot re-fire itself (no recursion).

create or replace function public.recompute_readiness_on_distributor()
returns trigger
language plpgsql
as $$
begin
  update vault_projects
     set vault_readiness_score = calculate_vault_readiness(NEW.id)
   where id = NEW.id;
  return NEW;
end;
$$;

drop trigger if exists distributor_affects_readiness on vault_projects;
create trigger distributor_affects_readiness
  after update of distributor on vault_projects
  for each row execute function recompute_readiness_on_distributor();
