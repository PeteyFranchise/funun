---
name: verify-e2e-setup
description: >
  Checks whether the local environment is ready to run the Playwright E2E
  suite in tests/e2e/ - env vars, demo mode, dev server, Supabase
  reachability, migrations, seed data - and reports pass/fail with fixes in
  plain language. Use when the user asks to check or verify their e2e setup,
  asks "am I ready to run the e2e tests", before their first `npm run e2e`,
  or via /verify-e2e-setup.
---

## What to do

1. Run `npm run e2e:verify` via Bash. It always runs the full check (env vars,
   demo mode, dev server, plus live Supabase reachability and a migration
   probe) - there's no partial mode to pick. It makes real network calls, so
   give it 10-20 seconds before assuming it's stuck.

2. Don't paste the raw output. Summarize it:
   - **Everything passed** - say so plainly and confidently ("you're ready"),
     and briefly note what that covered (env vars, demo mode off, Supabase
     reachable, migrations applied, seed present).
   - **Something failed** - list only the failing checks, in plain language,
     using the fix line the script already printed for each one. Don't
     invent a different fix than what the script said.

3. If the command crashes with no structured PASS/FAIL output at all (a raw
   exception, not a failed check), show the actual error rather than
   papering over it - that's a bug in the script itself, not a setup problem.

4. If a failure has an obvious next action Claude could run for the user
   (most commonly: the seed file is missing, fixed by `npm run e2e:seed`),
   offer to run it and wait for a yes. Don't run it unprompted - it writes
   real rows to a real Supabase project via the service-role key.

5. Never report a check as passing or failing unless you actually saw that
   line in the command's output. If the user asks "is X set up" about
   something this script doesn't check, say you don't know rather than
   guessing from the overall result.

## Why this exists

Three of `npm run e2e:verify`'s checks exist specifically because they fail
silently otherwise, not loudly:

- `NEXT_PUBLIC_VAULT_DEMO=true` makes every DM/presence/Green Room API route
  return canned success. A suite run against demo mode passes without
  touching a single real code path - it looks exactly like a real green run.
- A missing `NEXT_PUBLIC_SUPABASE_ANON_KEY` doesn't fail the suite - it makes
  `specs/17-messaging-security.spec.ts` silently skip itself, which happens
  to be the one file that verifies the migration-056 write-boundary fix PR
  #37 explicitly asks reviewers to focus on.
- A missing seed file (`tests/e2e/.auth/seed.json`) doesn't fail most specs -
  they self-skip, so a run can look mostly fine while testing almost nothing.

See `tests/e2e/verify-setup.ts` for the exact check list, and the code
comment at its top for why migrations 055/056 are deliberately NOT probed
here (that's covered live, safely, by spec 17 instead).
