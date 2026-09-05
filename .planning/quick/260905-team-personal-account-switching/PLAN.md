# Team and Personal account switching

## Objective

Ship the safe first version of explicit switching between a privileged Funūn Team
identity and a separate personal Member identity, while preventing a tab from silently
changing workspace when another tab replaces the shared browser session.

## Scope

- Add a persistent active-context identity treatment to Member and Team navigation.
- Add deliberate Team → Personal and Personal → Team switch actions that sign out the
  current browser session and require authentication as the target account class.
- Add target-aware sign-in copy and reject signing into the wrong account class during
  an intentional switch.
- Add a per-tab identity snapshot and short-lived intentional-switch marker.
- Add a blocking account-change interstitial when the authenticated identity changes
  underneath an existing tab, with safe continue and sign-back-in actions.
- Clear per-tab identity state during ordinary sign-out.
- No identity linking, credential storage, permission inheritance, database migration,
  or simultaneous dual-session claim.

## Files expected to change

- `app/(artist)/layout.tsx`
- `app/(admin)/layout.tsx`
- `app/(auth)/signin/page.tsx`
- `components/nav/ArtistNav.tsx`
- `components/nav/AdminNav.tsx`
- `components/auth/SignOutButton.tsx`
- `components/auth/AccountContextSwitch.tsx` (new)
- `components/auth/SessionIdentityGuard.tsx` (new)
- `lib/auth/session-identity.ts` (new)
- focused tests for session identity and navigation/sign-in integration
- `.planning/ROADMAP.md`
- `.planning/quick/260905-team-personal-account-switching/SUMMARY.md`

## Validation plan

- Focused unit and integration-shape tests.
- Strict TypeScript and ESLint.
- Full Jest suite.
- Next.js production build.
- `git diff --check` and final worktree review.

## Risks and coordination notes

- Team Member and Member identities remain separate security principals.
- The switch is an intentional sign-out/reauthentication handoff, not a role toggle.
- The target account class must be verified after authentication; `?next=` cannot be
  allowed to carry a wrong-class identity into a protected context.
- `sessionStorage` is deliberately tab-scoped. Supabase auth remains browser-profile
  scoped, which is why other tabs need the account-change interstitial.
- The existing roadmap-only changes in `260905-staff-personal-session-switching` belong
  to this user request and will be preserved.
