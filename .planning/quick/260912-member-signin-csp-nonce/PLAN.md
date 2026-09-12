# Member sign-in CSP nonce recovery

## Scope

- Restore the production Member sign-in form without weakening the nonce-based Content Security Policy.
- Ensure all routes in the authentication route group are dynamically rendered so Next.js can propagate the per-request middleware nonce into framework scripts.
- Add a regression check for the dynamic-rendering contract.

## Evidence

- Production `/signin` returned HTTP 200 but rendered only the Funūn auth shell; the form was absent after hydration time.
- The response CSP required a per-request `script-src` nonce with `strict-dynamic`.
- Production script tags contained no nonce, and the response was marked `x-nextjs-prerender: 1` with a Vercel cache hit.
- The affected Member account is confirmed, not banned, has a Member profile, and carries no staff role metadata.

## Implementation

1. Force dynamic rendering at the auth route-group layout.
2. Add a regression test proving the auth layout cannot silently return to static prerendering while nonce CSP is active.
3. Run targeted tests, strict typecheck, lint, and a production build.
4. Verify the built route classification and then verify the deployed `/signin` response and visible form.

## Safety

- No database or migration changes.
- No credential changes.
- Do not relax `script-src`, add `unsafe-inline`, or remove `strict-dynamic`.
