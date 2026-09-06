# Member/Team sign-in routing fix

## Scope

- Preserve an explicit Personal or Team account-switch request when an older authenticated browser session reaches `/signin`.
- Force a full navigation after successful credential exchange so server-rendered workspace layouts read the new auth cookie.
- Add regression coverage for valid and invalid account-transition URLs.

## Assumptions

- Personal Member and Funūn Team Member identities remain separate Supabase users and separate credentials.
- `switchTo=personal|team` and `accountChanged=1` are internal sign-in intents, not authorization grants; the destination still verifies the signed-in user's server-side staff metadata.
- Sign-out remains local to this browser session rather than revoking sessions on the user's other devices.

## Verification

- Run focused middleware/auth account-switch tests.
- Run TypeScript type checking.
- Run lint on the changed TypeScript files.
