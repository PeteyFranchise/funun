---
created: 2026-08-27
area: security / signup
title: Turnstile is not configured in production — the waitlist has no bot protection
recurring: false
---

# Configure Cloudflare Turnstile in production

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is **unset in Vercel**. Verified empirically against
`https://funun.studio/signup` on 2026-08-27 by reaching the waitlist state:

```
turnstile global : undefined
script tag       : false      (challenges.cloudflare never loads)
iframes          : 0
submit disabled  : false
```

`NEXT_PUBLIC_*` values are baked into the client bundle at build time, so this is
definitive, not a runtime hiccup.

## What it means

The waitlist form is public, unauthenticated, and writes to `waitlist` with **nothing
between a script and the table**. It holds 0 rows today, so nothing has been abused — but
it is an open write endpoint on a public page, and the signup gate rejects everyone
without an invite, which makes the waitlist the only path for an unknown artist.

**Production degrades gracefully** — the copy reads "Verification will appear here" and
the submit button stays enabled, so real people can still join. This is a missing
protection, not a broken form.

## The code is already done

Someone built this properly: the client widget in `app/(auth)/signup/page.tsx`, server
verification in `lib/security/turnstile.ts`, and a graceful no-op when unconfigured.
**Only the key was never added.**

## To fix

1. Create a Cloudflare Turnstile site (free) for `funun.studio`.
2. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (and the secret key, whatever
   `lib/security/turnstile.ts` expects server-side) to Vercel Production.
3. Redeploy — `NEXT_PUBLIC_*` is build-time, so the toggle alone does nothing.
4. Re-run the check above and confirm `scriptTag: true`.
5. If added to `.env.local` too, refresh the Dashlane `Funūn .env.local` note.

## Also worth checking while in there

- **Does the server actually reject a missing token when the key is unset?** If the API
  accepts it, protection is fully off. If it rejects, the waitlist would be *broken* rather
  than unprotected — worth knowing which.
- **Local dev renders a blank white rectangle** where the widget would be (dark UI, white
  box). Cosmetic and local-only — production shows the muted "Verification will appear
  here" line instead — but an unset key should render nothing, not an empty container.
