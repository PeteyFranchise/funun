-- ─── Migration 048: Grant atomic opportunity apply RPC to service role ─────

GRANT EXECUTE ON FUNCTION public.apply_to_opportunity_atomic(UUID, UUID, UUID, TEXT) TO service_role;

