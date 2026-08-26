---
created: 2026-08-22T00:00:00Z
completed: 2026-08-26
status: done
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


---

## RESOLVED 2026-08-26 — verified delivered

**Root cause (not what was first diagnosed):** in Vercel production, `RESEND_FROM_EMAIL`
held the **Resend API key value** instead of a sender address — a clipboard slip when both
env vars were pasted. The app therefore tried to send *from* a key string; Resend rejected it
before creating any record, which is why the Resend log showed **zero** attempts (the
signature of `lib/email`'s no-op guard, not of a bad key). The API key itself was always fine.

Found via a temporary, token-gated `/api/diag-temp` endpoint that reported env presence; it
was removed immediately afterwards (it echoed `RESEND_FROM_EMAIL` as a non-secret, which in
this misconfigured state meant echoing the key — see the rotation note below).

**Fix applied:** `RESEND_FROM_EMAIL` corrected to `no-reply@auth.funun.studio` in Vercel
Production + redeployed without build cache. No DNS work was needed — `auth.funun.studio` was
already Verified in Resend.

**Verified delivered (Resend records, 2026-08-26):**
- `soko@funun.studio` — "You're invited to the Funūn team" — **delivered**
- `bencookeditup@gmail.com` — collaborator invite — **delivered**

These are the first app-generated invites this system has ever successfully sent; every prior
record was a Supabase password reset (a separate SMTP path that never broke), which is why the
misconfiguration went unnoticed.

**Outstanding (low priority):** rotate the Resend API key — it was briefly exposed by the
diagnostic described above. Not required for function; see
`feedback_env_secrets_dashlane_rule` (re-copy `.env.local` into Dashlane after rotating).
