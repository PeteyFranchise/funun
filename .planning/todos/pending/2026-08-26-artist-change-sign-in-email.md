---
created: 2026-08-26
area: artist / auth
title: Let artists change their own sign-in email
recurring: false
---

# Let artists change their own sign-in email

Today an artist **cannot change the email they sign in with.** There is no
self-serve path at all — the only `supabase.auth.updateUser()` call in the whole
codebase is the PASSWORD reset in `app/(auth)/update-password/page.tsx`. The
Settings → Contact section now says so honestly and points at the support
mailbox; before 2026-08-26 it claimed the email was "managed through your
account settings", a screen that has never existed.

## Why this is a real feature, not a form field

A Supabase email change sends a confirmation to **both** the old and the new
address. That is deliberate takeover protection: if it only confirmed the new
address, anyone with a live session — a borrowed laptop, a shared machine, a
stolen cookie — could silently move the account to an address they control and
lock the real owner out permanently. So the flow has states (pending, one side
confirmed, expired) and needs UI for each.

Relevant Supabase behavior to confirm at build time, not assume:
- `supabase.auth.updateUser({ email })` triggers the confirmation flow.
- Whether BOTH confirmations are required is governed by the
  **Secure email change** setting in Supabase Auth. Verify what this project's
  instance is actually set to before designing the states.
- The confirmation mail goes out over the **Supabase SMTP credential**, which is
  configured separately from `RESEND_API_KEY` (see
  `.planning/todos/completed/2026-08-23-invite-email-resend-config.md` — the two
  were confused during the August outage, and Supabase auth mail never broke
  while app mail was down). Test the real deliverability path, not the app one.

## Scope when picked up

- A place to do it. There is no "account settings" screen; decide whether this
  becomes one, or a fourth Settings tab, or lives under the existing
  `/settings/profile`.
- Pending state: after submitting, the account is in limbo until confirmed.
  Show it — an artist who sees nothing will submit repeatedly.
- What happens to `artist_profiles`? The login email is an auth credential, NOT
  a profile column, so nothing in `artist_profiles` needs to change. Confirm
  that nothing else keys off the auth email (invites, collaborator matching,
  `collaborator_invites.invited_email`) before shipping — a changed sign-in
  email must not orphan a pending invite.
- Rate limiting / abuse: this is an account-takeover-adjacent surface.

## Why it is deferred, not urgent

Beta artists are onboarded one at a time by hand. An email change today is a
one-line Supabase dashboard edit by the owner, and the Settings copy now tells
the artist to ask. That is honest and cheap. Build the self-serve flow when
artist volume makes hand-editing the bottleneck — or sooner if an artist
actually asks, which is the signal worth watching for.

## Do not

Do not restore "Your login email is managed through your account settings" to
the Settings → Contact copy until this ships. The code comment in
`components/profile/RightsContractsSections.tsx` says the same thing at the
point of temptation.
