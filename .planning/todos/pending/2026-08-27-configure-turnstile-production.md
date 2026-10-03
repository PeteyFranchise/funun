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

**CORRECTED 2026-10-02 (quick task 261002-wtl) — the claim below was false.** The waitlist
form is public, unauthenticated, and writes to `waitlist` with nothing between a script and
the table. It holds 0 rows today, but not because nothing has been abused — because
**nobody has ever been able to join.** Verified against production:

```
curl -s -X POST https://www.funun.studio/api/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe-261002-wtl@example.test","name":"Probe","note":""}'
→ 400 {"error":"Verification failed. Please try again."}
```

~~Production degrades gracefully — the copy reads "Verification will appear here" and the
submit button stays enabled, so real people can still join. This is a missing protection,
not a broken form.~~ **This was wrong.** `app/api/waitlist/route.ts` hard-rejects an empty
Turnstile token before any DB call, every time, regardless of whether a site key is
configured — the old client gate (`app/(auth)/signup/waitlist-gate.ts`) enabled the submit
button in exactly the state the server always refuses. It is a broken form, not a missing
protection, and it has been broken since the waitlist shipped.

## The code is already done — and the client/server disagreement is now fixed

Someone built the client widget (`app/(auth)/signup/page.tsx`) and server verification
(`lib/security/turnstile.ts`) properly. Quick task 261002-wtl (this branch) fixed the two
things env vars alone could not have fixed:

- The CSP had no `frame-src` allowance for the Turnstile challenge iframe — now added,
  alongside the vendor-documented (if currently inert under `'strict-dynamic'`) `script-src`
  entry.
- The client gate (`waitlist-gate.ts`, now `waitlistSubmitState`) mirrored the server's
  precondition instead of silently enabling a submit the server rejects, and a coherence
  test (`__tests__/waitlist-turnstile-coherence.test.ts`) binds the two together so they
  cannot drift apart again. With no site key configured, the form now says plainly that
  verification is unavailable instead of promising a widget that never appears.

**Setting the keys below is now sufficient** — before this branch, it would not have been.

## To fix

1. Create a Cloudflare Turnstile site (free) for `funun.studio`.
2. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (and the secret key, whatever
   `lib/security/turnstile.ts` expects server-side) to Vercel Production.
3. Redeploy — `NEXT_PUBLIC_*` is build-time, so the toggle alone does nothing.
4. Re-run the check above and confirm `scriptTag: true`.
5. If added to `.env.local` too, refresh the Dashlane `Funūn .env.local` note.

## Also worth checking while in there

- **Does the server actually reject a missing token when the key is unset? ANSWERED
  2026-10-02.** Yes — `app/api/waitlist/route.ts:56` (the `if (!verified)` branch) hard-
  rejects before any DB call, with or without a site key configured. The waitlist has been
  fully broken (400 for everyone), never merely unprotected.
- **Local dev renders a blank white rectangle** where the widget would be (dark UI, white
  box). Cosmetic and local-only — production shows a legible "verification isn't available"
  line instead (`waitlist-gate.ts` + `page.tsx`, 261002-wtl) — but an unset key should
  render nothing, not an empty container.
