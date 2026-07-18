# Plan 12-10 Summary: Admin-Curated Green Room Placements

## What Changed

- Added `lib/green-room/placements-admin.ts` — create/patch validators (mass-assignment allowlist, kind/status/destination enums, label/title/body limits, external-URL vs internal-UUID coherence, start/end window) and the `isDestinationVisible` activation gate.
- Added admin API: `GET/POST /api/admin/green-room/placements` and `PATCH/DELETE /api/admin/green-room/placements/[id]`, all behind `verifyAdmin()` + service client.
- Added admin UI: `app/(admin)/admin/green-room-placements/page.tsx` + `components/admin/PlacementAdmin.tsx` (create / activate / pause / resume / archive / delete), and a nav entry in `app/(admin)/layout.tsx`.
- Added focused tests: `__tests__/green-room-placements-admin.test.ts` (validators + visibility gate) and `__tests__/green-room-placements-admin-api.test.ts` (non-admin 403, activation-visibility 409, success paths).

## Validation Run

- `npm test -- --runInBand __tests__/green-room-placements-admin.test.ts __tests__/green-room-placements-admin-api.test.ts`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- Live: migration 057 (`green_room_placements` + RLS) confirmed LOCAL=REMOTE.

## Notes

- No schema change — reuses the `green_room_placements` table and RLS from migration 057. RLS revokes INSERT/UPDATE/DELETE from `authenticated`, so all writes are server-owned through the admin API + service client (mirrors the existing `/api/admin/*` pattern).
- A placement can only **activate** once its destination is confirmed public/visible: profile → `artist_profiles.is_public`, project → `vault_projects.is_public`, track → parent project public, opportunity → `active`, post → published/visible/public/not-deleted, external → valid `http(s)` URL. Enforced on both create-as-active and the PATCH transition to active (returns 409 otherwise).
- The destination is immutable via PATCH (change it by archiving + recreating) so the activation visibility check cannot be bypassed by a same-request destination swap.
- Placements are editorially labeled featured/sponsored/partner/program/opportunity cards. No self-serve ad buying, targeting, billing, or ad analytics — matches the migration-057 table comment and the moderation guardrails.
- Addresses the adversarial-review note "Admin placement creation must validate destination visibility before activation."

## Outstanding UAT

One authenticated admin-session check recorded in `12-UAT.md` (create→activate visibility gate: private destination rejected 409, public succeeds; pause/archive lifecycle; non-admin 403). Everything verifiable headlessly is done.
