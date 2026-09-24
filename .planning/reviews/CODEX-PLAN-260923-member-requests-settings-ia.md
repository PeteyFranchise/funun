# Member Requests Center and Settings IA — Approved Product Plan

**Owner direction captured:** 2026-09-23
**Execution phase:** Phase 42
**Status:** Ready for Claude to plan/execute; no implementation is claimed here.

## Bottom line

Settings should hold durable information a Member configures and rarely revisits. Permissions,
rights-information proposals, and master-ownership claims are work waiting for a decision, so hiding
them in Settings creates missed requests and delayed releases. Move those workflows into one top-level
**Requests** center, surface urgent items in Dashboard **Your next moves**, and use notifications as
deep links into the same records. Keep the permanent rights profile, public profile, and payouts in
Settings. Preserve workspace context for creation and work/Song Passport context for permanent records.

## What the current features actually are

- **Rights proposals** are not contract drafts. An authorized workspace can propose a correction to
  the Member's PRO, IPI, publisher, or SoundExchange ID; the Member confirms or declines each value
  (`lib/workspaces/rights-proposals.ts:3-31`). The UI name should become **Rights information updates**.
- **Master claims** require the alleged holder to confirm, dispute, or support a claim with a document
  (`lib/workspaces/master-ownership.ts:23-40`). A supported claim unlocks a bounded set of operational
  capabilities but deliberately never a clean-master download (`lib/workspaces/master-ownership.ts:12-18,42-60`).
- **Permissions** contain both pending approve/decline decisions and active access that can be revoked.
  These are relationship operations, not preferences.
- The current six-tab Settings definition proves all three were placed beside stable profile data
  (`lib/profile/settings-form.ts:100-139`).

## Approved information architecture

### Settings

Keep only:

1. **Rights & identity** — Member-owned legal/professional rights information and contract defaults.
2. **Public profile** — public presentation and discoverability.
3. **Payouts** — Funūn payouts and, after Phase 43, the Member's private external payment profile.

Future durable privacy, security, and notification preferences may also belong here. Nothing whose
primary state is “waiting for your decision” belongs here.

### Requests

Add a top-level `/requests` destination with three views:

1. **Needs your decision** — pending permission requests, rights information updates, and holder-side
   master claims. Sort by consequence/deadline, then creation time; do not pretend all requests have
   equal urgency.
2. **Active access** — effective grants/relationships with an obvious revoke or manage action.
3. **History** — decided, superseded, expired, revoked, and disputed records with contextual links.

Cards show request type, requesting workspace/person, affected work when applicable, requested action,
age/deadline, and a clear decision verb. The summary feed must not reveal raw IPI values or sensitive
evidence. Authorized detail views may show exactly what the Member must evaluate.

## Placement rules

- A label/management workspace still initiates a permission request, rights update, or master claim
  from the relevant relationship/work context.
- The affected Member receives it in Requests, Dashboard **Your next moves**, and the notification bell.
- Deciding in any entry point updates the same source record; no duplicate inbox tables or copied state.
- Master-claim history remains reachable from the work/Song Passport because it is part of that work's
  rights record.
- Old `/settings/permissions`, `/settings/rights-proposals`, and `/settings/master-claims` URLs redirect
  to filtered Requests views so bookmarks and existing notification links do not strand users.

## Execution order for Claude

1. Build a server-only read model over the three existing domains; do not create a generic mutation
   endpoint that weakens their individual authorization.
2. Build `/requests` and reuse/refactor the existing domain decision controls.
3. Connect Dashboard, navigation counts, and summary-only notifications.
4. Remove the three action tabs from Settings and install redirects.
5. Run authorization, deep-link, accessibility, empty/loading/error, stale-decision, and cross-account
   tests before considering the phase complete.

The detailed executable slices are in
`.planning/phases/42-member-requests-center-settings-ia/`.

## Non-negotiable acceptance rules

- A Member sees only requests addressed to them and access records they are authorized to manage.
- Counts and list results share one source and cannot disagree after a decision.
- A stale or concurrently decided request fails safely and reloads its current state.
- Notifications contain a summary and record link, not rights values, legal names, evidence contents,
  or other private record material.
- Existing create/decide authorization and audit semantics remain intact.
- No database migration is expected for Phase 42; if implementation discovers one is necessary, stop
  and re-plan it as a human-gated migration rather than slipping it into a UI plan.

## Evidence behind the design

- Dashboard already defines **Your next moves** as a cross-account “waiting on you” feed
  (`app/(artist)/dashboard/page.tsx:225-264`).
- Notification rows already route through a generic link (`components/nav/NotificationPanel.tsx:260-275`).
- Rights proposals are bounded Member decisions, not passive settings
  (`lib/workspaces/rights-proposals.ts:21-31`).
- Master claims are explicit confirm/dispute/support actions
  (`lib/workspaces/master-ownership.ts:28-40`).

## Out of scope

- Changing the substance of workspace permissions, rights-proposal authority, or master-claim doctrine.
- Adding inline approve/decline actions to the notification popover.
- Reworking the underlying ownership or evidence models.
- Implementing external payout sharing; that is Phase 43 and Phase 43.1.
