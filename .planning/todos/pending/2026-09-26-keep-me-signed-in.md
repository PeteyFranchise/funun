# "Keep me signed in" on the sign-in screen

**Captured:** 2026-09-26 · **Status:** designed and approved, not built
**Owner framing:** asked for a remember-me control while reviewing the sign-in card, then
*"when can we add 'keep me signed in'"* once the reskin shipped without it.

The control is **drawn and approved** in the bench mock (`private/bench/signin.html`, gitignored:
the `.remember` block). It was deliberately left out of PR #105 because it is a session-lifetime
change, not a skin, and a checkbox that does nothing is worse than no checkbox.

## Correction to the reason first given

During the reskin this was described as a `localStorage` vs `sessionStorage` choice made at
`createClient` time. **That is wrong for this codebase.** Funūn does not store the session in web
storage at all:

- `lib/supabase/client.ts:1` — the browser client is `@supabase/ssr`'s `createBrowserClient`.
- `package.json` — `@supabase/ssr` 0.10.0, `@supabase/supabase-js` 2.109.0.
  (`.claude/CLAUDE.md`'s Technology Stack section still lists `@supabase/auth-helpers-nextjs`
  0.10.0 and supabase-js 2.45.0 — **that section is stale** and misleads anyone planning auth work.)

The session lives in **cookies**. So the feature is cookie `Max-Age`, not a storage backend:

| Checkbox | Cookie | Behaviour |
|---|---|---|
| checked | persistent, with `Max-Age` | survives closing the browser — **this is what happens today** |
| unchecked | session cookie, no `Max-Age`/`Expires` | dies when the browser closes |

## Why it is not a two-line change

`middleware.ts:84-86` rewrites the auth cookies on **every request**, using the options Supabase
hands it:

```ts
cookiesToSet.forEach(({ name, value, options }) => {
  res.cookies.set(name, value, options)
})
```

Nothing in the repo passes `cookieOptions` anywhere — verified, `lib/supabase/` and `middleware.ts`
are on defaults throughout. So setting a session cookie at sign-in is not enough: **the middleware
would silently re-persist it on the person's next page load** and quietly defeat the feature. The
preference has to be durable and readable server-side — a small non-auth cookie (`fn_persist=0`)
that both the browser client and the middleware consult.

Second wrinkle: `createClient()` is called at component top level, before the checkbox can be read.
Either construct the client lazily at submit time with the right `cookieOptions`, or write the
preference cookie first and have `createClient()` read it.

## The sharp end — this is a shared-computer feature

**Persistent is already the default.** Nobody is currently being logged out. So the box does not
add "stay signed in" — it only ever lets someone **opt out**. The failure mode is therefore not
"mildly annoying", it is *left signed in on a library or studio machine after explicitly asking not
to be*, in a product holding rights and payment records. Build it carefully or not at all.

## To decide before building

1. **How long is "remembered"?** Supabase's default refresh-token lifetime, or an explicit cap?
2. **Default state of the box** — checked (matches today, and most people want it) or unchecked
   (safer, but logs out the existing beta cohort on their next browser restart)?
3. **Does it interact with `SessionIdentityGuard`?** That guard already reasons about auth storage
   being shared across every tab in a browser profile (`components/auth/SessionIdentityGuard.tsx`).
   A non-persistent session must not confuse it.
4. **Copy.** "Keep me signed in on this device" is what the mock says. Consider whether the shared-
   computer case deserves the more explicit framing, since that is the only reason to untick it.

## Verification — the usual gate cannot see this

Jest cannot observe cookie lifetime, and there is no jsdom in this repo
(`reference_jest_harness_constraints`). A green suite here would prove nothing. Verify by:

- asserting on the `Set-Cookie` headers the middleware and the sign-in response emit
  (presence/absence of `Max-Age`), and
- an owner-run manual pass: untick, sign in, fully quit the browser, reopen — expect a sign-in
  screen; then repeat with it ticked and expect a session.

## Size

One focused task: `lib/supabase/client.ts`, `middleware.ts`, `app/(auth)/signin/page.tsx`, plus the
header assertions. Its own PR — it should not be buried inside the subscriptions phase, which is
unrelated.
