# GTM Buyer Portal Planning

## Objective

Turn the external GTM/business-plan review into durable GSD roadmap artifacts, with a stronger product stance on buyer intake: Funun should plan a fully integrated sync-buyer portal and specialized buyer account model instead of relying on a long-lived manual Tally/Typeform bridge.

## Scope

- Add a new Phase 16 planning folder for GTM beta launch and buyer portal work.
- Capture adversarial review findings from the Perplexity GTM plan against the current repo roadmap.
- Define a coded buyer-side portal path: buyer accounts, license requests, searchable/catalog-safe discovery, request workflow, deal room/admin workflow, and sync metrics.
- Update `.planning/ROADMAP.md` so Phase 16 appears after Phase 13/15 and before broader monetization expansion.
- Keep this as planning-only work; do not implement schema, routes, UI, or vendor integrations in this quick task.

## Files Expected To Change

- `.planning/ROADMAP.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-CONTEXT.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-GTM-ADVERSARIAL-REVIEW.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-IMPLEMENTATION-BREAKDOWN.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-VALIDATION.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-01-PLAN.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-02-PLAN.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-03-PLAN.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-04-PLAN.md`
- `.planning/phases/16-gtm-beta-buyer-portal/16-05-PLAN.md`
- `.planning/quick/260718-gtm-buyer-portal-plan/SUMMARY.md`

## Validation Plan

- Re-read the new Phase 16 docs for internal consistency.
- Grep for `Phase 16` and `buyer portal` to confirm roadmap traceability.
- Run `git diff --check`.
- Confirm `git status --short --branch`.

## Risks / Coordination Notes

- Buyer-side accounts can create new trust/safety attack surfaces. Phase 13 should remain a safety prerequisite before broad buyer outreach.
- License-request data becomes commercially sensitive, so the schema must be private by default and admin/founder-visible only through server-side routes.
- Avoid overbuilding a self-serve marketplace before there are real buyer conversations. The portal should accelerate founder-led deals first, then graduate into scalable buyer discovery after behavior is proven.
