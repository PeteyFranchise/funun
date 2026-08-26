---
phase: quick/260826-2qm-vendor-health-check
plan: 260826-2qm
subsystem: observability
tags: [nextjs, fetch, jest, playbook, admin, credential-health, docuseal, resend, anthropic, stripe, supabase]

requires:
  - phase: 33-observability-runbook
    provides: The Playbook IT room shell (Rail2, ItRoomTopBar, requireRoomAccessPage, DOC_PAGE_FILE doc-page pattern) that this sub-page slots into
provides:
  - A live, read-only, staff-only Vendor Health page answering "is this credential correct in THIS environment" for Supabase/Resend/DocuSeal/Anthropic/Stripe plus three sender-address rows, in one page load, with a proven no-leak guarantee
affects: [observability, it-team-room, docuseal-integration, resend-email]

tech-stack:
  added: []
  patterns:
    - "Bounded fetch (AbortController raced with a timer promise, always no-store) reused verbatim from app/api/health/route.ts for a second call site"
    - "Never read a vendor's response body on a failure path — build the detail string from the numeric status plus fixed prose only, since several vendor APIs echo the submitted credential back in error payloads"
    - "One audited chokepoint function (safeSenderDisplay) as the sole permitted path for an env value to reach a render, gated by shape validation"

key-files:
  created:
    - lib/observability/vendor-health.ts
    - lib/observability/vendor-health.test.ts
    - app/api/admin/vendor-health/route.ts
    - __tests__/vendor-health-route.test.ts
    - app/(admin)/admin/playbook/it/vendor-health/page.tsx
    - components/playbook/VendorHealthPanel.tsx
    - components/playbook/VendorHealthRecheck.tsx
  modified:
    - lib/playbook/nav.ts
    - __tests__/playbook-nav.test.ts

key-decisions:
  - "safeSenderDisplay is the only function in the module permitted to return an env value, gated on isEmailShaped AND a Resend key-prefix (re_) exclusion — a sender address is already public in every outbound email header, a key is not"
  - "verdictFromHttpStatus reads only the numeric status; the vendor's response body is never read on a failure path, because several vendor APIs echo a submitted bad credential back in the error body"
  - "Webhook secrets (DOCUSEAL_WEBHOOK_SECRET, RESEND_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET, CRON_SECRET) are deliberately unprobed — no read-only verification endpoint exists, and a green tick beside a WRONG shared secret is worse than silence"
  - "Re-check is a router.refresh() (Server Component re-render), not a client fetch to the API route — no duplicate probe logic, credentials never move toward the browser"

requirements-completed: []

coverage:
  - id: D1
    description: "Pure verdict core (classifyCredential, verdictFromHttpStatus, isEmailShaped, safeSenderDisplay, checkSenderAddress, summarizeVendorHealth) with full behavior coverage"
    verification:
      - kind: unit
        ref: "lib/observability/vendor-health.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bounded, concurrent, read-only network probes for Supabase/Resend/DocuSeal/Anthropic/Stripe, including the sentinel no-leak guarantee"
    verification:
      - kind: unit
        ref: "lib/observability/vendor-health.test.ts#runVendorHealthChecks"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/admin/vendor-health independently gated by requireRoomAccess('it-team'), gate-before-probe ordering proven"
    verification:
      - kind: unit
        ref: "__tests__/vendor-health-route.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Vendor Health sub-page in the IT room nav, staff-gated page rendering three visually distinct states, re-checkable without leaving the page"
    verification: []
    human_judgment: true
    rationale: "Visual/UX rendering (three-state color treatment, panel chrome parity with VendorsGrid, live re-check behavior) requires a human to view the rendered page against real or simulated Vercel env vars — not provable by unit tests alone."

duration: 35min
completed: 2026-08-26
status: complete
---

# Quick Task 260826-2qm: Vendor Health Check Summary

**Staff-only live credential-health page for the IT room — one page load answers "is DOCUSEAL_API_KEY correct in this environment", with a sentinel-proven guarantee that no credential value, prefix, or fragment can ever reach the response.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-26
- **Tasks:** 4/4
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments

- `lib/observability/vendor-health.ts` — pure three-state verdict core (`ok`/`failed`/`not-configured`) plus bounded, concurrent, read-only probes for Supabase, Resend, DocuSeal, Anthropic, Stripe, and three sender-address rows (Resend/e-sign/pitch)
- `GET /api/admin/vendor-health` — independently gated route (`requireRoomAccess('it-team')` first statement, zero probes on refusal, `force-dynamic`)
- `/admin/playbook/it/vendor-health` — sixth IT-room sub-page, self-guarded (`requireRoomAccessPage('it-team')`), live re-check via `router.refresh()`
- Sentinel no-leak test: seeds distinctive credential values, mocks `fetch` to echo every inbound header verbatim into the response body, and asserts none of the sentinels survive serialization — the behavioral proof that the 2026-08-26 outage class is now caught in ten seconds instead of hours

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure verdict core for vendor health** — `baf5ff9` (test)
2. **Task 2: Bounded, concurrent, read-only vendor probes** — `0912865` (feat)
3. **Task 3: Independently gated GET /api/admin/vendor-health** — `5df8363` (feat)
4. **Task 4: Vendor Health sub-page wired into the IT room nav** — `9b69cfb` (feat)

**Plan metadata:** (this commit) — `docs(260826-2qm): complete vendor-health-check plan`

_Note: Task 1 combined the RED test file and the GREEN pure-function implementation into a single `test(...)` commit rather than two separate commits — the functions involved are simple, fully-typed pure logic with no external dependency to fake, so writing test+implementation together and verifying both pass before committing carried negligible risk. Tasks 2–4 each landed as a single `feat(...)` commit once their own local test/typecheck/lint gate was green._

## Files Created/Modified

- `lib/observability/vendor-health.ts` — verdict core + bounded probes for all 8 vendor rows; the module's single hardest rule (no credential value ever leaves it) is documented in its header
- `lib/observability/vendor-health.test.ts` — 44 tests: pure-function behavior, network-layer behavior (not-configured short-circuit, ok/failed mapping, rejecting fetch, timeout, read-only verb + no-store cache, concurrency, sentinel no-leak)
- `app/api/admin/vendor-health/route.ts` — `GET`, gated first, `force-dynamic`
- `__tests__/vendor-health-route.test.ts` — 401/403/200 + gate-before-probe ordering
- `lib/playbook/nav.ts` — `vendor-health` added to `ItSubpageSlug`/`IT_SUBPAGES` after `vendor-directory`; `DOC_PAGE_FILE`'s `Exclude<>` widened to also drop `vendor-health` (bespoke React, no doc-file mapping)
- `__tests__/playbook-nav.test.ts` — sub-page count/order updated to 6, label/href assertion added for `vendor-health`
- `app/(admin)/admin/playbook/it/vendor-health/page.tsx` — self-guarded Server Component, `force-dynamic`
- `components/playbook/VendorHealthPanel.tsx` — reuses `VendorsGrid`'s panel chrome; three visually distinct states (green ok / rose `#F43F5E` failed / muted `--ink-3` not-configured) with a not-configured footnote
- `components/playbook/VendorHealthRecheck.tsx` — client button calling `router.refresh()` inside `useTransition`

## Decisions Made

- `safeSenderDisplay` is the sole audited function permitted to return an env value (email-shape + Resend-key-prefix-exclusion gated); no second value-returning path was added anywhere in the module
- Failure-path details are built from HTTP status + fixed prose only — never the vendor's response body — because several vendor APIs echo a bad credential back in their error payload
- Webhook secrets (`DOCUSEAL_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`) are deliberately excluded — no read-only verification endpoint exists for a shared secret, and a false-positive green tick would be worse than no row at all
- Re-check re-runs the Server Component via `router.refresh()` rather than calling the API route client-side, so there is exactly one probe implementation and credentials never move toward the browser

## Deviations from Plan

None — plan executed as written. Task 1's test+implementation were combined into a single commit rather than split into separate RED/GREEN commits (see note under Task Commits above); this is a process deviation only, not a scope or behavior deviation, and every behavior-block assertion listed in the plan is covered.

## Issues Encountered

None.

## Vendor Rows Shipped

| Row | Env var | Probe | Free because |
|---|---|---|---|
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | delegates to `getDashboardHealth()` (no new query) | in-process re-check of `/api/health`, already bounded |
| Resend | `RESEND_API_KEY` | `GET api.resend.com/domains` | listing, no send |
| Resend sender | `RESEND_FROM_EMAIL` | shape check, no network | pure string check |
| DocuSeal | `DOCUSEAL_API_KEY` | `GET {DOCUSEAL_API_BASE}/templates?limit=5` | DocuSeal bills only on a COMPLETED document; a templates listing is free |
| Anthropic | `ANTHROPIC_API_KEY` | `GET api.anthropic.com/v1/models` | listing consumes no tokens |
| Stripe | `STRIPE_SECRET_KEY` | `GET api.stripe.com/v1/balance` | balance read creates nothing |
| E-sign sender | `ESIGN_FROM_EMAIL` | shape check, no network | pure string check |
| Pitch sender | `PITCH_FROM_EMAIL` | shape check, no network | pure string check |

Ok/failed/not-configured are distinguished as: **not-configured** = credential unset or placeholder-shaped (no network call made); **failed** = credential present but the live probe returned a non-2xx status, timed out, or (for sender rows) is key-shaped/malformed; **ok** = credential present and the live probe returned 2xx (or, for sender rows, is a valid email address).

## User Setup Required

None — no external service configuration required by this work itself. The motivating question (is `DOCUSEAL_API_KEY` correct in Vercel production) is now answerable by opening `/admin/playbook/it/vendor-health` as it-team staff; no code change here can answer that without visiting the running production page.

## Next Phase Readiness

- Thomas (artist-side beta) or any it-team/leadership staff member can self-serve vendor credential verification without needing Pete or a throwaway diagnostic endpoint
- The sentinel no-leak test is the durable regression guard: any future edit that widens what a probe reads from a vendor response will be caught if it starts leaking a seeded credential value
- No blockers for downstream work

---
*Phase: quick/260826-2qm-vendor-health-check*
*Completed: 2026-08-26*

## Self-Check: PASSED
