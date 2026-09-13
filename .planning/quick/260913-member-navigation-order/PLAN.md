# Member navigation order

## Objective

Reorder the Member navigation so Collaborators appears immediately beneath Contract Locker and Deals appears immediately above Earnings.

## Scope

- Change only the canonical Member navigation item order.
- Preserve every route, icon, active-route match, Sync Library eligibility gate, and access behavior.
- Keep the order identical in expanded and collapsed rendering by changing the shared item list.

## Files expected to change

- `components/nav/ArtistNav.tsx`
- A focused navigation-order regression test
- `.planning/quick/260913-member-navigation-order/SUMMARY.md`

## Validation plan

- Add and run a focused source-contract test for the requested adjacency.
- Run strict TypeScript checking and focused ESLint.
- Run `git diff --check`.

## Risks and coordination notes

- Do not touch the Admin or Workspace section navigation; the request concerns the Member menu shown in the supplied screenshot.
- Do not change navigation authorization or progressive-disclosure behavior.
- Preserve unrelated working-tree changes.
