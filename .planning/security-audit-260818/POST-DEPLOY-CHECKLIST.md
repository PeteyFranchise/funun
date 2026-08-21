# Post-deploy verification checklist (security audit)

Deploy-time proofs for fixes that code tests can't reach. Run after the branch
deploys + the migrations are pushed.

---

## 1. Split-sheet token lockdown (#1 / migration 115) — CRITICAL, atomic

**Push + deploy together** — migration 115 and its app companion must go live in
the same window, or split-sheet reads `42501` (migration alone) / the token stays
exposed (app alone).

1. Owner: `supabase db push` (migration 115) **and** deploy this branch together.
2. Confirm parity: `supabase migration list` shows 115 applied.
3. Run the adversarial check as a **real initiator account** (owns a sheet with
   co-parties):
   ```bash
   set -a; source .env.local; set +a
   node scripts/verify-115-split-sheet-token-privacy.mjs --email <initiator> --password <pw>
   ```
   Expect: **all checks pass** — `approval_token` returns 42501 (both explicit and
   via `select=*`), safe columns still readable.
4. Smoke the app: as that initiator, open a draft sheet → **Share** still returns
   working `/approve/<token>` links (token now read via the service client); a
   normal signed-in user's split-sheet dashboard still lists their sheets.

**If any token leaks → migration/app did not deploy together. Do not consider #1 shipped.**

---

## 2. Sentry global-error boundary (#16)

1. In the deployed app, trigger a controlled top-level render error (a temporary
   throwing route/component, or the documented test-error path).
2. Confirm the event appears in Sentry, and the branded "Something went wrong"
   fallback renders (not a white screen).
3. Remove the temporary trigger.

*(No-op until `SENTRY_DSN` is set — depends on item 3.)*

---

## 3. Sentry live-exception verify (#32-06, previously deferred)

Owner setup, then verify — see `32-06-SUMMARY.md` / the tracked todo:
1. Create the Sentry org/project; set `SENTRY_DSN`/`SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/
   `SENTRY_PROJECT` as **server-side** Vercel env vars (NOT the Marketplace integration).
2. Deploy; trigger a controlled **server** and **browser** exception.
3. Confirm both land in Sentry with release + source maps resolved, **no PII/secrets**,
   session replay off.

---

## 4. Better Stack `/api/health` monitor (#32-07, deploy-gated)

Once `/api/health` is live on production:
1. Add the Better Stack monitor for `/api/health` as a **status-code check treating
   503 (degraded) as down**.
2. Confirm a forced failure alerts `it@funun.studio`.

---

## 5. Durable job worker (#5/#10 / migration 118) — deploy-gated on Vercel Pro

The queue ships **deploy-safe** — nothing breaks before Pro: Selects previews
still render via Next's `after()`, and small export packs still assemble inline.
Only the WORKER that drains **large** exports (and backstops preview renders)
needs Vercel Pro's frequent cron.

Owner, in order:
1. `supabase db push` (migration 118 — `jobs` table + `claim_next_job`). Safe to
   push anytime; jobs simply queue until the worker runs.
2. Upgrade the project to **Vercel Pro**.
3. Add the worker cron to `vercel.json` (a sub-daily schedule is **rejected on
   Hobby**, so only add this AFTER the Pro upgrade):
   ```json
   { "path": "/api/cron/process-jobs", "schedule": "* * * * *" }
   ```
   `CRON_SECRET` is already set for the existing crons — the worker reuses it
   (Vercel sends `Authorization: Bearer $CRON_SECRET`).
4. Deploy; force a **large** export (>80MB of audio): the panel shows
   "Assembling a large pack…" then resolves to a working download/link. In the
   `jobs` table the row goes `pending → processing → completed`.
5. Open a Selects link for a freshly-added track → its preview renders (a
   `watermark_preview` job completes).

**Until Pro + the cron entry are live:** large exports queue but don't complete
(the panel spins, then errors after ~3 min); small exports + previews are
unaffected. Don't add the sub-daily cron to `vercel.json` before upgrading.

---

*Owner: Pete. Items 3–4 were already tracked from Phase 32; listed here so the whole
deploy-time verification set lives in one place.*
