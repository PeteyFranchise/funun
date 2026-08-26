---
created: 2026-08-20T00:00:00Z
title: Step 1 verification — migrations 115–118 pushed to prod, confirm app deploy + token lockdown
area: security / deploy
files:
  - scripts/verify-115-split-sheet-token-privacy.mjs
  - .planning/security-audit-260818/POST-DEPLOY-CHECKLIST.md
---

## State as of 2026-08-20

`supabase db push` **applied migrations 115, 116, 117, 118 to the LIVE DB**
(`wgfjakfiyeewzfuxkgyo`). Confirmed by Pete's terminal output (117 emitted a
benign "trigger does not exist, skipping" NOTICE — the DROP IF EXISTS guard).

The live app deploys from **`feat/lane1-catalogue-menu-help`**; branch HEAD is
**`be758a5`**, which carries the #1 app companion (`e1545d1` — split-sheet token
read via the service role).

## ✓ RESOLVED — app is in sync with the DB

Pete confirmed the app **auto-deploys from this branch**, so the `be758a5` push
(this session) already built + shipped to prod. The deployed app therefore
includes `e1545d1` (service-role token read) and is in sync with migration 115 —
**token locked, split-sheet reads working, no breakage.** (Only residual, very
low risk: that specific Vercel build failing — it compiled clean locally.)

## Remaining verification — OPTIONAL, low priority (tabled 2026-08-20)

Belt-and-suspenders proof only; nothing is broken without it.

1. Run the adversarial DB check (artist account = password auth; must own a
   split sheet with ≥1 collaborator):
   ```bash
   set -a; source .env.local; set +a
   read -p "Artist email: " EMAIL && read -s -p "Artist password: " PW && echo && node scripts/verify-115-split-sheet-token-privacy.mjs --email "$EMAIL" --password "$PW"
   ```
   Expect: `All checks passed` — `approval_token` → 42501 on both probes, safe
   columns still return N own party row(s). (If safe-columns probe says `[] — no
   rows`, that account has no qualifying sheet — use/create one that does.)

2. App smoke: open the split-sheet dashboard (still lists sheets) and **Share**
   (still returns a working `/approve/<token>` link — token now read via service
   role).

## After step 1

Steps 2–5 of `POST-DEPLOY-CHECKLIST.md` remain (Sentry live-verify, Better Stack
monitor, Vercel Pro + process-jobs cron for the #5/#10 worker). Branch kill-list
(#4) + npm-audit decision also still owner-pending.
