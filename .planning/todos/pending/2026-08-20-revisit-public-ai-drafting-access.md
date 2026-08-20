---
created: 2026-08-20T00:00:00Z
title: Revisit public AI drafting access (brief-draft/rerank) if traffic grows
area: product
files:
  - app/api/buyer/brief-draft/route.ts
  - app/api/buyer/brief-rerank/route.ts
  - .planning/security-audit-260818/REMEDIATION-PLAN.md
---

## Decision (2026-08-20) — security audit finding #2

**Chosen: require sign-in** on the two paid AI routes (brief-draft, brief-rerank) — the
cheapest, strongest fix for the unbounded-cost abuse vector. Only authenticated buyers can
use the AI drafting; anonymous users can't reach it.

**Trade-off accepted for now:** logged-out visitors can no longer "try the AI" before
signing up — the AI Brief Builder sits behind the login wall.

## Re-deliberate if…

We notice **a lot of traffic to the site** (top-of-funnel prospective buyers) where
try-before-signup would meaningfully help conversion. At that point, switch to the
**public + protection** model (audit #2, option 2):

1. Keep the routes public, but require a **Cloudflare Turnstile** human-check
   (`lib/security/turnstile.ts` already exists; the waitlist route is the reference pattern).
2. Add a **durable per-IP + global daily AI-spend circuit-breaker** (depends on the
   limiter-store decision — audit #7).

Watch signal: site traffic / Brief-Builder funnel metrics. Owner (Pete) makes the call.
