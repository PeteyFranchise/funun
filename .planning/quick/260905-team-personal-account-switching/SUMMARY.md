# Team and Personal account switching — summary

## What changed

- Added an explicit switch action to both the personal Member sidebar and Funūn Team
  Console sidebar.
- Added persistent `Personal workspace` and `Funūn Team` context labeling.
- Switching now signs out only the local browser session and opens a target-aware sign-in
  handoff. Signing into the wrong account class is rejected and signed back out.
- Added a versioned, tab-scoped identity snapshot plus a ten-minute intentional-switch
  marker.
- Added an account-change interstitial that blocks silent workspace replacement when
  another tab signs in or out. It reacts to Supabase auth events and rechecks on focus and
  visibility changes.
- Added safe actions to accept the newly active account or sign in again.
- Ordinary sign-out clears the tab identity state before ending the local session.
- No identities, permissions, profiles, catalogues, or staff records are linked or merged.
- Updated the roadmap from planned to safe-beta-version built locally.

## Validation run

- Focused Jest: 4 suites, 12 tests passed.
- Full Jest after final changes: 450 suites, 4,189 tests passed.
- Strict TypeScript: passed.
- ESLint with zero warnings: passed.
- Next.js production build: passed; 122 static pages generated.
- Browser: target-aware Team sign-in rendered meaningful content with no Next.js overlay or
  browser console errors. Authenticated sidebar switching still requires human two-account
  UAT because the verification browser did not hold either private account session.
- `git diff --check`: passed.

## Remaining risks or follow-ups

- Run human UAT with the Team and personal credentials in two tabs: switch each direction,
  change the session in the other tab, and verify the interstitial appears before continuing.
- A future verified identity-link layer may hide the switch action from people who do not
  own both identity classes. This beta version relies on reauthentication to prove ownership.
- Separate browser profiles remain required for two simultaneously active sessions.
- No migration is required for this build.
