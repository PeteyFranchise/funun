# Green Room people-search repair

## Objective

Make eligible Funūn members discoverable in The Green Room by display name,
handle/username, or exact account email while preserving profile visibility,
connection-only visibility, and bidirectional blocks.

## Confirmed evidence

- Green Room search currently requires `user_profiles.is_public = true`.
- `@justifiednoise` and `@shanemaux` both have populated search vectors and
  user-facing `profile_visibility = public`, but legacy `is_public = false`.
- `is_public` still defaults to false and is not exposed by the current
  privacy settings UI, so it silently contradicts the setting users can see.
- Keyword search uses English `websearch` full-text matching, which does not
  reliably support `@handle` or partial/prefix handle searches.
- Email is correctly excluded from public search columns and results, but no
  privacy-safe exact-email resolver exists.

## Scope

1. Make the active `profile_visibility` setting authoritative by changing the
   legacy `is_public` default and aligning existing profiles with it.
2. Normalize `@handle`/name tokens into safe prefix full-text queries.
3. Add an authenticated exact-email resolver that returns only an otherwise
   visible, unblocked profile ID; never select or return email in results.
4. Keep self-exclusion, public/connection-only rules, and block exclusion.
5. Update the search placeholder to describe supported inputs.
6. Add focused tests for search normalization, email privacy, and migration
   security invariants.

## Files expected to change

- `lib/green-room/discover.ts`
- `components/green-room/PeopleSearch.tsx`
- `__tests__/green-room-discover.test.ts`
- `supabase/migrations/149_green_room_people_search.sql`
- `__tests__/migration-149.test.ts`

## Safety and coordination notes

- Email lookup is exact only; no fuzzy email search or email display.
- The database resolver enforces public/connection visibility and
  bidirectional blocks even if called directly, not only through the API.
- Public-safe result columns remain unchanged and continue to exclude email
  and rights/legal PII.
- Existing unrelated working-tree changes remain untouched and unstaged.

## Validation

- Focused Green Room discovery and migration Jest suites.
- ESLint on changed TypeScript/TSX files.
- TypeScript typecheck and `git diff --check`.
