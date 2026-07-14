-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 056: harden DM write privileges
-- ============================================================
-- Phase 11's API routes enforce the message-request contract: cold
-- outreach must pass the connection gate, rate limit, stacked-message cap,
-- block checks, and request-state transitions before any message is written.
--
-- RLS alone did not encode that full state machine. A generic authenticated
-- PostgREST client could still insert a default 'direct' dm_threads row and
-- then insert dm_messages directly, bypassing /api/dm/send entirely.
--
-- This migration makes DM thread/message writes server-owned. Authenticated
-- clients keep SELECT through existing participant RLS, but INSERT/UPDATE
-- must go through server API routes that authenticate the caller and use the
-- service role only after enforcing the application-level contract.
-- ============================================================

-- Client reads remain RLS-scoped by participant policies. Client writes are
-- revoked so the API layer is the only path that can earn a DM state change.
REVOKE INSERT, UPDATE ON dm_threads FROM authenticated;
REVOKE INSERT, UPDATE ON dm_messages FROM authenticated;

COMMENT ON TABLE dm_threads IS
  '1:1 DM threads. Direct authenticated writes are revoked in migration 056; server API routes own creation and request-state transitions.';

COMMENT ON TABLE dm_messages IS
  '1:1 DM messages. Direct authenticated writes are revoked in migration 056; /api/dm/send owns message insertion after gate/rate/block checks.';
