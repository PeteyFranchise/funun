-- HUMAN-GATED recovery for the directly applied, unregistered migration 214.
-- Run only after PRE-RECOVER-214-SERVICE-GRANTS.sql reports all true.
-- This changes privileges only; it does not read or modify application rows.

BEGIN;

REVOKE ALL ON TABLE public.verified_signup_invite_claims
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.verified_signup_invite_claims
  TO service_role;

COMMIT;
