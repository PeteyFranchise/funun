# Plan 12-09 Summary: People Search / Discover Filters

## What Changed

- Added `lib/green-room/discover.ts` — filter parsing/validation, keyset cursor, relationship + reason labels, public-safe result shaping, and the `loadDiscoverResults` query orchestrator.
- Added `GET /api/green-room/discover` (`app/api/green-room/discover/route.ts`) — authenticated endpoint; supports `q`, `role`, `openTo`, `genre`, `location`, `relationship`, `capability`, `cursor`, `limit`.
- Added `components/green-room/PeopleSearch.tsx` and mounted it in the existing Green Room right rail (`GreenRoomFeed.tsx`) — desktop rail, mobile stacks. No feed re-architecture.
- Added focused tests: `__tests__/green-room-discover.test.ts` (pure helpers + query behavior) and `__tests__/green-room-discover-api.test.ts` (auth/cursor/success).

## Validation Run

- `npm test -- --runInBand __tests__/green-room-discover.test.ts __tests__/green-room-discover-api.test.ts`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- Live: migrations 054–057 confirmed LOCAL=REMOTE; `GET /api/green-room/discover` returns 401 unauthenticated on the running dev server; the full discover query shape executes against the production database (HTTP 200); selecting a private column (`contact_phone`) is DB-blocked (`42501`), confirming the migration-040 column grant enforces the public-safe projection.

## Notes

- No schema change — reuses `search_vector` (migration 034, GIN-indexed) via `.textSearch(..., { type: 'websearch' })`, and the migration-040 public column grant.
- Privacy posture: `artist_profiles` RLS is `USING (true)` and only column-limited, so this layer explicitly filters `is_public=true`, excludes self, and excludes blocked profiles in BOTH directions. The block set is computed with the service client (the `blocks` RLS only exposes rows where `blocker_id = auth.uid()`, so "who blocked me" cannot be read via the session client) and is used only to exclude rows — never returned to the client.
- Result projection omits all PII/private fields (legal name, contact, PRO/IPI, etc.).
- `capability` maps to `member_type` (`artist`/`industry`) for v1 rather than joining capability grants — index-friendly and matches what shows on the public profile; extendable later.
- **Bug found + fixed during live smoke test:** `.contains('open_to', [value])` serialized to the PG array literal `cs.{collabs}`, but `open_to` is a JSONB column — Postgres rejected it (`22P02 invalid input syntax for type json`, HTTP 400). Fixed to pass a JSON string so PostgREST emits jsonb containment `cs.["collabs"]` (HTTP 200, verified against the live DB). `industry_roles` (TEXT[]) keeps the array form. Regression-locked in `green-room-discover.test.ts`. Committed as `863b604`.

## Outstanding UAT

Two authenticated-session checks recorded in `12-UAT.md` (People Search results/privacy in-browser; requires a logged-in member). Everything verifiable headlessly is done.
