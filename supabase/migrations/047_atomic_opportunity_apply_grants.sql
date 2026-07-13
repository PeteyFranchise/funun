-- ─── Migration 047: Restrict atomic opportunity apply RPC ────────────────

REVOKE ALL ON FUNCTION public.apply_to_opportunity_atomic(UUID, UUID, UUID, TEXT) FROM PUBLIC;

