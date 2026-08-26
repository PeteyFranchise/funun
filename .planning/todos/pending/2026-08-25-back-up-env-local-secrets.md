---
created: 2026-08-25
area: ops / disaster recovery
title: Back up the app's secret settings file to a password manager
---

# Back up the secret settings file (2 minutes)

## What this is about

There is one file on Pete's Mac — `.env.local` — that holds every password and
key the app needs: the database credentials, the email key, and the rest.

**It exists in exactly one place.** It is deliberately kept out of GitHub (so
secrets never get published), which also means nothing is backing it up.

## Why it matters

If the Mac is lost, stolen, or dies:

- The **code** is safe (GitHub).
- The **database** is safe (Supabase's servers).
- The **live site** keeps running (Vercel).
- The **secret settings file is gone.**

Without it, Pete can't run or develop the app locally until it's rebuilt by
hunting through several dashboards — and some values (like the Resend email
key) can never be retrieved, only replaced, which then has to be updated in
Vercel too. Call it an hour of frustration, versus two minutes now.

**Vercel is NOT a backup for this.** Those same values live in Vercel, but they
are stored as "Secret" — write-only. Vercel will not show them to anyone,
including Pete. (That's why the value box always looks empty when editing one.)

## What to do

1. Open **Dashlane** (owner's password manager — `app.dashlane.com` or the browser extension).
2. Left sidebar → **Secure Notes** → **+ New**. Name it: `Funūn .env.local`
3. Open the settings file. Easiest way — paste this in Terminal:
   `open -e ~/Desktop/funun/.env.local`
4. Select all (Cmd+A), copy (Cmd+C).
5. Paste into the secure note. Save.

Done.

## Two rules to remember

- **Dashlane (or another password manager) only.** Not Apple Notes, not email,
  not a plain file in iCloud/Dropbox. This file contains the Supabase *service-role key*, which can
  read and change the entire database with no permission checks — the single
  most sensitive string in the project.
- **Re-copy it after changing a key.** When a key gets rotated (e.g. the Resend
  key), update the note too, or the backup quietly goes out of date.

## Recovering on a new computer

1. `git clone` the repo from GitHub
2. Install Node + npm (and the Supabase CLI)
3. Log into Dashlane, open the `Funūn .env.local` secure note, create a new
   `.env.local` file in the repo and paste the contents in
4. `npm install`

## Background

Raised 2026-08-25 while fixing the Resend email outage, which surfaced how the
local file and Vercel's copy are two separate sets of settings that can drift
apart (local was correct; Vercel had the API key pasted into the sender-address
field). See `.planning/todos/pending/2026-08-23-invite-email-resend-config.md`.
