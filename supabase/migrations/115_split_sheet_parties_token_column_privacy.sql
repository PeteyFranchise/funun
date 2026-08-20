-- Migration 115: split_sheet_parties approval_token column privacy (audit #1)
--
-- SECURITY FIX. Before this migration split_sheet_parties relied on Supabase's
-- default table-wide SELECT grant to authenticated/anon, filtered only by RLS.
-- RLS is ROW-level, not COLUMN-level: the "Initiator sees all parties" policy
-- (018, recreated in 064) returns every party row on the initiator's OWN sheet
-- -- including the plaintext `approval_token` of co-parties. Because
-- /approve/[token] treats possession of a token as authorization, an initiator
-- could read a co-party's token via direct PostgREST and approve, counter, or
-- update_identity on their behalf: forged consent on a legal instrument.
--
-- Fix (mirrors migration 040's artist_profiles column-privilege lockdown):
-- REVOKE the table-wide SELECT and re-GRANT SELECT on every column EXCEPT
-- approval_token. approval_token then carries no grant for authenticated/anon,
-- so PostgREST returns 42501 on any attempt to select it, while ROW-level
-- visibility (the existing RLS policies) is unchanged. The service role
-- (BYPASSRLS + table owner) still reads the token -- which is exactly how
-- /approve/[token] and the send-for-approval / share / mint-envelope routes
-- read it after this migration (each does an initiator ownership check via the
-- RLS-subject client first, then reads the token via the service client).
--
-- anon receives NO grant: it has no SELECT RLS policy on this table anyway, and
-- the only public path (/approve) uses the service client.
--
-- HUMAN-GATED PUSH + ATOMIC DEPLOY. Like every split-sheet migration in this
-- repo (see 062's header), an executor agent must NEVER run `supabase db push`.
-- Additionally, the application companion changes MUST deploy together with
-- this migration -- a select('*') / approval_token read through the
-- authenticated client 42501s the moment this lands. Companion (audit #1):
--   * app/api/split-sheets/[id]/share/route.ts          -> token via service client
--   * app/api/split-sheets/[id]/send-for-approval/route.ts -> token via service client
--   * app/api/split-sheets/[id]/mint-envelope/route.ts  -> token via service client
--   * lib/split-sheets/list.ts                          -> split_sheet_parties(*) narrowed

REVOKE SELECT ON split_sheet_parties FROM authenticated, anon;

-- Every column EXCEPT approval_token. Keep this list in sync with the table
-- definition (018 base + 062 first_viewed_at + 063 legal_name/publishing_designee/
-- administrator). A new column added later must be added here too, or it becomes
-- silently unreadable through the authenticated client.
GRANT SELECT (
  id,
  split_sheet_id,
  collaborator_id,
  user_id,
  name,
  email,
  pro,
  ipi,
  split_percentage,
  role,
  approval_status,
  counter_proposal,
  token_expires_at,
  approved_at,
  created_at,
  first_viewed_at,
  legal_name,
  publishing_designee,
  administrator
) ON split_sheet_parties TO authenticated;
