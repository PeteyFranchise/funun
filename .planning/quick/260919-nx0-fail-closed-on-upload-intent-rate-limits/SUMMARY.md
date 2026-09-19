---
type: quick
slug: fail-closed-on-upload-intent-rate-limits
quick_id: 260919-nx0
created: 2026-09-19
completed: 2026-09-19
branch: fail-closed-upload-intent-limits
status: complete
source: .planning/reviews/CODEX-RESPONSE-260919-storage-attribution.md (Answer 5)
---

# Fail closed on upload-intent rate limits — Summary

Five signed-upload-intent routes now pass `failClosed: true` to `checkRateLimit`,
so a limiter outage refuses the request instead of waving it through.

## What changed

`checkRateLimit` (`lib/security/rate-limit.ts:41-52`) returns
`options.failClosed === true` on both of its failure branches — the RPC
returning an `error` (`:48`) and the RPC or service client throwing (`:51`).
With the flag unset that evaluates to `false`, which the caller reads as **"not
rate limited"**. The module header already states the policy: abuse-sensitive
writes pass `failClosed: true`. Five upload-intent routes were abuse-sensitive
writes that did not.

| Route | Limit (unchanged) |
|---|---|
| `app/api/ideas/[ideaId]/recordings/upload-intent/route.ts` | 80 / 15 min |
| `app/api/works/[workId]/versions/upload-intent/route.ts` | 40 / 15 min |
| `app/api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent/route.ts` | 120 / 15 min |
| `app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/upload-intent/route.ts` | 20 / 15 min |
| `app/api/admin/playbook/media/upload-intent/route.ts` | 20 / 24 h |

Only the options object changed. No key, window, attempt ceiling, ordering, or
response body was altered. The `if (await checkRateLimit(...))` conditions were
wrapped across lines so `failClosed: true,` sits on its own line, matching the
17 existing call sites (`app/api/dm/send/route.ts:77` and others).

The sixth intent route,
`app/api/vault/[projectId]/tracks/[trackId]/audio/upload-intent`, was left
untouched — it gates on the upload-admission RPC and never calls
`checkRateLimit`. A test asserts it stays that way.

## What this does NOT close

**This is limiter-outage containment. It is not the quota fix.** Every bound
that already holds with a healthy limiter survives this change unchanged,
including the one that needs no attacker and no outage at all: these routes
validate a *declared* size against a 50 MB `MAX_BYTES`, while the `track-audio`
bucket accepts 250 MB and the minted signed URL is not size-bound. A caller can
declare 50 MB and store 250 MB. That is separate, untouched work.

No migration, no schema change, no byte-quota work, no new limiter on the
admission-gated route, no path-shape changes.

## Tests

Two new files, 29 tests, all behavioural except one deliberate text lock.

**`__tests__/rate-limit-fail-closed.test.ts`** (14 tests) — helper-level, real
`checkRateLimit` against a stubbed `createServiceClient`:

- RPC returns `{ data: null, error }` → `failClosed: true` yields `true`;
  omitted / `{}` / `failClosed: false` all yield `false`.
- RPC rejects → same pair of assertions (the two failure branches are separate
  lines and can regress independently).
- `createServiceClient()` itself throws → same pair.
- Healthy limiter: the flag changes nothing; the RPC verdict wins either way.
- Range validation still fires before the RPC.
- A source-text lock over the five routes in the house style
  (`__tests__/phase-38-1-hardening.test.ts:16-21`), kept as a cheap regression
  catch and explicitly *not* relied on as proof of behaviour.

**`__tests__/upload-intent-fail-closed-routes.test.ts`** (15 tests) — three per
route, with `@/lib/security/rate-limit` mocked per the idiom in
`__tests__/selects-react-ratelimit.test.ts:7-12`:

1. the route calls `checkRateLimit` with an options object containing
   `failClosed: true`;
2. when the limiter resolves `true`, the route returns **429 and
   `createSignedUploadUrl` is never called**;
3. when the limiter resolves `false`, the route **does** reach
   `createSignedUploadUrl` and returns 200 — so assertion 2 cannot pass
   vacuously on broken mocks.

## Proof the tests bite

`failClosed: true` was removed from
`app/api/works/[workId]/versions/upload-intent/route.ts`, the suite was run, and
it failed:

```
● POST /api/works/[workId]/versions/upload-intent — fail-closed upload intent
  › asks the limiter with failClosed: true

  expect(jest.fn()).toHaveBeenCalledWith(...expected)

  Expected: Any<String>, ObjectContaining {"failClosed": true}
  Received: "work-version-intent:1111...", {"maxAttempts": 40, "windowMs": 900000}
```

Two tests failed across the two files (the behavioural flag assertion and the
source-text lock). Worth recording precisely: the *429-refusal* test still
passed with the flag removed, which is correct — with a healthy limiter
reporting `true` the route does refuse. The flag assertion is what detects the
outage-posture regression; the 429 assertion is what proves the refusal is real.
Both are needed. The line was then restored and the two files went back to
29/29 passing.

## Verification gate

Every step CI `validate` runs, all from this branch:

| Step | Result |
|---|---|
| `npm run security:migrations:verify` | PASS (migrations 214–218) |
| `npm run typecheck:strict` | PASS, exit 0 |
| `npm run lint` (`--max-warnings=0`) | PASS, exit 0 |
| `npm test -- --runInBand` | PASS — 624 suites, 7595 tests |
| `npm audit --omit=dev --audit-level=moderate` | 0 vulnerabilities |
| `npm audit --audit-level=high` | 0 vulnerabilities |

## Files

Changed:
- `app/api/ideas/[ideaId]/recordings/upload-intent/route.ts`
- `app/api/works/[workId]/versions/upload-intent/route.ts`
- `app/api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent/route.ts`
- `app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/upload-intent/route.ts`
- `app/api/admin/playbook/media/upload-intent/route.ts`

Added:
- `__tests__/rate-limit-fail-closed.test.ts`
- `__tests__/upload-intent-fail-closed-routes.test.ts`
