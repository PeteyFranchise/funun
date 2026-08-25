---
created: 2026-08-22T00:00:00Z
title: Turn transactional email back on — new Resend API key + verified funun.studio sender
area: email / infra config
files:
  - lib/email/index.ts
  - lib/email/staffInvite.ts
  - docs/DOMAIN-SETUP.md
  - docs/observability/VENDOR-DIRECTORY.md
---

## Why — CORRECTED 2026-08-25 (narrower than first diagnosed)

There are TWO email paths, and only ONE is broken:

| Path | Credential | Used for | Status |
|---|---|---|---|
| Supabase -> Resend **SMTP** (`no-reply@auth.funun.studio`) | SMTP password stored in the Supabase dashboard | signup confirmation, password reset | **WORKING** (owner sent + received a real password reset to Gmail, 2026-08-25) |
| App code -> Resend **API** (`lib/email` `sendEmail`) | `RESEND_API_KEY` env var | staff invites, collaborator invites, split-sheet auto-invites, notifications, pitch confirmations | **BROKEN** — key returns 401 invalid |

So the original "ALL transactional email is DOWN" was wrong. Supabase auth mail is fine.

**Domain work is NOT needed.** `auth.funun.studio` is already **Verified** in Resend (added ~2026-06) and has proven deliverability to Gmail. No Squarespace DNS changes required. Adding a bare `funun.studio` sender is optional cosmetic polish only.

**Remaining fix = the API key + pointing the sender at the already-verified domain.**

## Steps (dashboard/config only — no code changes)

1. **Resend -> API Keys** -> create a fresh key -> set `RESEND_API_KEY` in **Vercel Production** AND local `.env.local`. (The current key is invalid — the hard blocker.)
2. **Vercel -> Production env** -> set `RESEND_FROM_EMAIL = no-reply@auth.funun.studio` (already-verified domain; currently a foreign `pete@artistos.co`) -> **Redeploy** (env changes need a fresh deploy). Keep `.env.local` in sync.
3. ~~Verify funun.studio in Resend + Squarespace DNS~~ — NOT REQUIRED (see above). Optional later for a prettier `@funun.studio` sender.

## Verify

- Re-run the diagnostic (expect an id, not 401):
  ```bash
  set -a; source .env.local; set +a
  node -e "const {Resend}=require('resend'); new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.RESEND_FROM_EMAIL,to:'peter.zora@gmail.com',subject:'Resend config test',html:'<p>test</p>'}).then(x=>console.log(JSON.stringify(x))).catch(e=>console.log(e.message))"
  ```
- In-app: invite a test Team Member → confirm it arrives **from @funun.studio**,
  and that "Resend invite" on a pending member delivers.

See memory `project_invite_email_deliverability` for full context.
