---
created: 2026-08-25
area: ops / standing rule
title: STANDING RULE — refresh the Dashlane secrets note whenever .env.local changes
recurring: true
---

# Standing rule: keep the Dashlane secrets note current

This is not a one-off task — it's an ongoing rule. It stays in `pending`
deliberately, as a reminder that fires whenever the trigger below happens.

## The rule

`.env.local` is backed up as a Dashlane **secure note named `Funūn .env.local`**
(saved 2026-08-25). **Refresh that note whenever the file changes.**

## When to refresh

- A key is **rotated** (e.g. the Resend API key)
- A **new service** is added that needs its own key
- **Any setting in `.env.local` is changed or updated**

Realistically a handful of times a year — not a daily chore.

## How to refresh

1. Open the file: `open -e ~/Desktop/funun/.env.local`
2. **Cmd+A**, **Cmd+C**
3. Dashlane → Secure Notes → `Funūn .env.local`
4. **Select all the old content, delete it, paste the new** — a full overwrite
5. Save

**Always overwrite, never append.** Two versions of the same key in one note
means no way to tell which is live — precisely the ambiguity that cost an hour
on 2026-08-25.

## Why this matters

- `.env.local` is git-ignored, so **nothing else backs it up**.
- **Vercel is not a backup.** Its environment variables are stored write-only
  ("Secret" type) and cannot be revealed — not even to the owner.
- A *stale* note is recoverable (regenerate the one changed key). **No** note
  means an hour of dashboard scavenging plus rotations, with local dev dead the
  whole time.
- The file contains the Supabase **service-role key** — full read/write on the
  entire database, bypassing all permissions. It belongs in a password manager
  and nowhere else (not Apple Notes, not email, not loose in iCloud/Dropbox).

## Claude-side

Also recorded as a persistent memory (`feedback_env_secrets_dashlane_rule`) so
Claude proactively prompts the update at the moment a key is rotated or the file
is edited, rather than waiting to be asked.
