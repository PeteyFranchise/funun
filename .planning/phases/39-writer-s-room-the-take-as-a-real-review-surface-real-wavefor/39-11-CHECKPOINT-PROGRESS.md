# 39-11 — checkpoint progress

Phase 39 is complete through plan 39-10 (10/11). Plan 39-11 is the human-gated close-out.

## Task 1, Step 1 — SEQUENCING GATE: **PASSED** (2026-09-15)

`npx supabase@latest migration list` against production returned local/remote parity on every
migration through **223**, including the 219–223 range the gate names. Migration **224** shows
local-only with an empty remote column — written, not applied, exactly as expected.

Verified twice: once with the token in the session environment, and again from a fresh terminal
with no environment variable set. Both runs agreed.

Automated precondition also green at checkpoint time: `npm test` 611 suites / 7,378 tests,
`npm run typecheck` clean, `npm run build` clean.

**The gate is satisfied. The push in Step 3 is unblocked.**

## Blocker that preceded this — RESOLVED

Every authenticated Supabase CLI call returned `401 Unauthorized`, including `projects list`,
which made it account-level rather than project-scoped.

Ruled out along the way: token expiry alone (`supabase login` reported success and changed
nothing), an env-var override in `.env.local`, a stale project link, and CLI version (2.109.1
local vs 2.117.0 via npx — both failed identically). The dashboard confirmed the account could
see project `wgfjakfiyeewzfuxkgyo` normally, so access was never the issue.

**Root cause: the personal access token was expired or revoked.** A fresh one resolved it.

One trap worth recording: during recovery the new token was pasted as `Sbp_...` with a capital S
(macOS autocapitalisation). The CLI reported `Invalid access token format` rather than anything
about capitalisation. Check `${TOKEN:0:4}` before assuming a token is bad.

Also note `supabase projects list` **legitimately fails** under the new token — listing all
projects is an account-level read the scoped token deliberately does not grant. It is the wrong
canary. Use `migration list`.

## Current credential

- Scoped personal access token, created 2026-09-14, named `funun-cli-macbook-2026-09-14`.
- Scopes: Project Settings READ, Database READ-WRITE, Migrations READ-WRITE, one organization.
- **Expires ~14 October 2026.** When CLI calls start returning 401 around then, check expiry
  FIRST — that is what cost an evening this time.
- Stored in the CLI credential store via `login --token`, confirmed working from a fresh shell.
  It is NOT in `.env.local`; line 40 there stays commented out (backup: `.env.local.bak-p39`).
- Use `npx supabase@latest` rather than the Homebrew binary, which is an old 2.109.1.

## Resume from here

Run `/gsd-execute-phase 39`. It re-enters 39-11 at Task 1 and re-confirms the gate before
proceeding — deliberate, not redundant. Remaining steps:

2. Confirm the 224 reservation still holds (no unrelated session claimed it).
3. **`npm run db:push`** — owner runs this. No agent runs it; every Phase 38 migration shipped
   human-gated.
4. `migration list` again — local and remote must now agree through 224.
5. Load a Writer's Room take and confirm its comments read without a missing-column or
   ambiguous-function error (catches a stale PostgREST cache).

Then push `main` to deploy the code, then Tasks 2 and 3 (two-account pins privacy, and the
felt-quality checks: 0.5× pitch, instant peaks, keyboard safety).

**Deploy ordering matters:** migration 224 first, code second. `p_end_timestamp_ms` carries
`DEFAULT NULL`, so 224 is backward compatible with what is already deployed — but the Phase 39
code queries `work_version_pins`, which does not exist until 224 applies.

## Housekeeping still outstanding

- `.env.local` was modified — the Dashlane note `Funūn .env.local` needs a full overwrite.
- The old token should be revoked once the new one has proven itself over a few sessions.
- `brew cleanup` will clear a partial `llvm@21` source build abandoned during diagnosis. node
  v24.15.0 / npm 11.12.1 were verified unchanged afterwards.

## Not done, deliberately

Phase verification has NOT run and Phase 39 is NOT marked complete — 39-11 is outstanding, so the
phase stays in progress. Commits remain unpushed on local `main`; pushing is the production
deploy and is the owner's call.
