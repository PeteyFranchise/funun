# Add Legal, Executive, and Creative Roles

## Objective

Add new selectable profile/industry role options requested by Pete: legal/executive roles such as Attorney and Publishing Administrator, plus creative/performance/technical roles such as DJ and Live Sound Mixing.

## Scope

- Update the shared industry-role catalog so Settings, admin invites, capability requests, and validation inherit the new options.
- Add focused tests for label lookup and allowlist validation.
- Do not change capability access rules; these roles remain cosmetic/profile-discovery metadata, not permission grants.

## Files Expected To Change

- `lib/industry-roles.ts`
- `__tests__/industry-roles.test.ts`
- `.planning/quick/260715-add-legal-exec-creative-roles/SUMMARY.md`

## Validation Plan

- `npm test -- --runInBand __tests__/industry-roles.test.ts`
- `npm run lint`
- `git diff --check`

## Risks / Coordination Notes

- Keep legal/executive role labels broad enough for discovery without implying Funūn verifies someone is licensed or authorized.
- Any verified/legal-provider marketplace behavior remains a later roadmap item.

