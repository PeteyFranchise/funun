---
created: 2026-08-20T00:00:00Z
title: Selects reactions — server-issued signed viewer cookie (defense-in-depth, audit #6)
area: security
files:
  - app/api/selects/[token]/react/route.ts
  - lib/selects/public-resolve.ts
---

## Context

Audit #6 (Selects reaction flooding) was substantively addressed 2026-08-20:
- **Rate limit** per (token+ip) and per token on the react route (audit #7 limiter).
- **DB-level per-track cap** (migration 117) as a hard backstop.

Together these bound both the flood rate and total rows, so a leaked link can no
longer inflate analytics or grow the table without bound.

## Deferred piece — signed viewer identity

The route still attributes guest reactions to a **client-supplied `viewerKey`**
(the player mints a random id client-side). A determined attacker can rotate that
key per request; the rate limit + cap stop the volume, but each fresh key still
reads as a distinct "viewer," so within the caps the *distinct-viewer* count can
be nudged.

The defense-in-depth fix (VA2): replace the client `viewerKey` with a
**server-issued, HMAC-signed, HttpOnly cookie** minted on first contact, so the
viewer identity can't be trivially rotated. Deferred here because it touches the
**client player** (which currently mints + persists `viewerKey`) as well as the
route, and needs a signing secret — lower marginal value now that volume is
capped. Pick this up when Selects analytics fidelity matters (e.g. leadership
reads reaction counts as a real signal).
