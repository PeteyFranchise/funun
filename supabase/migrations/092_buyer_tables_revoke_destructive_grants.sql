-- ============================================================
-- Funūn — Phase 25/28 review fix (#4): close the TRUNCATE/TRIGGER/REFERENCES gap on the
-- buyer tables. Migration 092.
--
-- WHY: migration 080 made buyer_orgs / buyer_members RLS-gated with column-scoped SELECT
-- grants, but revoked only SELECT/INSERT/UPDATE/DELETE from anon/authenticated. Supabase's
-- default privileges ALSO grant TRUNCATE, TRIGGER, and REFERENCES on public tables, and a
-- DML-only REVOKE leaves those behind — the exact gap migration 091 closed for funun_staff /
-- staff_audit_log. RLS does NOT gate TRUNCATE, so an authenticated principal able to execute
-- SQL could TRUNCATE buyer membership/org data. Flagged by the Codex review (finding #4).
--
-- WHAT: a SURGICAL revoke of only the three residual privileges from PUBLIC, anon, and
-- authenticated on both tables. Unlike migration 091's REVOKE ALL (those tables were
-- zero-grant), this deliberately does NOT touch buyer_orgs' existing DML + column-scoped
-- SELECT grants (migration 080) — buyers must keep reading their permitted columns, and
-- ae_user_id must stay outside the grant. service_role is untouched. Idempotent: REVOKE of
-- an already-absent privilege is a no-op.
--
-- NOTE: the sibling audit tables verification_audit_log / reports (migration 058) share this
-- same DML-only-REVOKE gap and are being closed by a SEPARATE task, so they are intentionally
-- NOT included here.
--
-- HUMAN-GATED — never `supabase db push` from an agent. Confirm the live grants first
-- (information_schema.role_table_grants for buyer_orgs / buyer_members, grantee anon/authenticated
-- — expect TRUNCATE/TRIGGER/REFERENCES present, then zero after), then the owner reviews + pushes
-- via Codex. Do NOT edit migration 080 (already live).
-- ============================================================

REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.buyer_orgs    FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.buyer_members FROM PUBLIC, anon, authenticated;
