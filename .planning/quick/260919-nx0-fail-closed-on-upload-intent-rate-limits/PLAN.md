---
type: quick
slug: fail-closed-on-upload-intent-rate-limits
quick_id: 260919-nx0
created: 2026-09-19
branch: fail-closed-upload-intent-limits
source: .planning/reviews/CODEX-RESPONSE-260919-storage-attribution.md (Answer 5)
---

# Fail closed on upload-intent rate limits

## The defect

`lib/security/rate-limit.ts:41-52` returns `options.failClosed === true` when the
`check_rate_limit` RPC errors or throws. With the flag unset that evaluates to
`false` — meaning **"not rate limited"**. A limiter outage therefore turns into
unlimited signed-upload-intent issuance.

The module's own header states the policy it is not meeting:

> Low-cost onboarding checks retain the default fail-open behavior so a limiter
> outage does not lock out legitimate signups. **Abuse-sensitive or fan-out
> writes pass `failClosed: true`**, preventing a database/limiter outage from
> turning into an unlimited messaging channel.

Five upload-intent routes are abuse-sensitive writes. None passes the flag. This
is not a reviewer's preference imposed on the codebase — it is the codebase's
documented contract unmet at five call sites.

## Scope — exactly five call sites

| Route | Current limit |
|---|---|
| `app/api/ideas/[ideaId]/recordings/upload-intent/route.ts` | 80 / 15 min |
| `app/api/works/[workId]/versions/upload-intent/route.ts` | 40 / 15 min |
| `app/api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent/route.ts` | 120 / 15 min |
| `app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/upload-intent/route.ts` | 20 / 15 min |
| `app/api/admin/playbook/media/upload-intent/route.ts` | 20 / 24 h |

The sixth intent route, `vault/[projectId]/tracks/[trackId]/audio/upload-intent`,
does **not** use `checkRateLimit` — it goes through the upload-admission RPC
instead. **Leave it alone.** Adding a limiter to it is out of scope.

Match the established idiom: `failClosed: true,` as its own line in the options
object, as in `app/api/dm/send/route.ts:77` and 11 other call sites.

## What this is NOT

**Do not describe this as the quota fix, in code comments, the summary, or the
commit message.** It closes the limiter-outage bypass only. Every healthy-limiter
bound survives it untouched, including the one that needs no attacker at all:
these routes validate a *declared* 50 MB while the `track-audio` bucket accepts
250 MB and the signed URL is not size-bound, so any caller can declare 50 and
store 250. That is separate work.

## Tests — both halves are required

The repo's existing convention (`__tests__/phase-38-1-hardening.test.ts:16-21`)
is a source-text assertion: `expect(file).toContain('failClosed: true')`. Keep
that as a cheap regression lock, but **it is not sufficient on its own** — this
session has already watched source-counting assertions be satisfied three times
by text that changed no behaviour. Write both:

1. **Helper-level behavioural.** Mock `createServiceClient` so `rpc()` resolves
   `{ data: null, error }`. Assert `checkRateLimit(key, { failClosed: true })`
   returns `true` (limited) and that the same call without the flag returns
   `false`. Cover the `throw` path as well as the returned-error path — the
   helper has two separate branches (`:48` and `:51`) and one can regress alone.

2. **Route-level behavioural.** For each of the five routes, mock
   `@/lib/security/rate-limit` per the idiom in
   `__tests__/selects-react-ratelimit.test.ts:7-12`. Assert both:
   - the route calls `checkRateLimit` with an options object containing
     `failClosed: true`, and
   - when it resolves `true`, the route returns **429 and never calls
     `createSignedUploadUrl`**.

   The second assertion is the one that matters. A route could pass the flag and
   still issue a URL; only proving no signed URL is minted shows the refusal is
   real.

**Prove the tests bite.** Before finishing, remove `failClosed: true` from one
route and confirm the suite fails; restore it. Report that you did this by
actually doing it, not by inspection.

## Verification gate

Every step CI `validate` runs, per `.claude/CLAUDE.md`:

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

Lint is load-bearing here — `--max-warnings=0`.

## Out of scope

No migration. No schema change. No new rate limit on the admission-gated sixth
route. No byte-quota work. No touching `{workId}/...` or `ideas/...` path shapes.
