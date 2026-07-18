# Phase 12 Moderation & Reporting Guardrails

**Prepared:** 2026-07-15
**Status:** Planning guardrail before wider Green Room rollout

## Boundary

Phase 12 should add only the minimum safety hooks needed for the feed, comments, reactions, reposts, placements, and People Search to be reviewable. Phase 13 still owns the full trust-and-safety product surface.

## Minimum Phase 12 Controls

- Every post, comment, repost, and placement has a moderation lifecycle or can inherit one from its source row.
- Users can delete their own comments and reposts.
- Original post owners can remove reposts of their own posts through an RLS-scoped path.
- Feed UI has a clear future slot for `Report`, `Mute`, and `Remove` actions, even if full dashboards land in Phase 13.
- Admin-curated placements can be paused/archived and must never render when inactive, expired, hidden, or removed.

## Report Reasons

Recommended V1 reason set:

- Spam or scam.
- Harassment or hate.
- Sexual or explicit content.
- Violence or threat.
- Impersonation.
- Copyright or rights issue.
- Misleading opportunity or paid offer.
- Other.

## Data Model Recommendation

If Phase 12 adds reports before Phase 13, use a generic table rather than one table per object:

```text
green_room_reports
- id
- reporter_id
- target_type: post | comment | repost | placement | profile
- target_id
- reason
- details
- status: open | reviewing | actioned | dismissed
- reviewer_id
- reviewed_at
- created_at
```

RLS posture:

- Authenticated users can create reports.
- Reporters can read their own report status only.
- Admin/service clients can read/update all reports.
- Report targets must be visible to the reporter at report time, except profile reports where the profile must be public/visible.

## Automatic Safety Rules

- If a post is hidden/removed, comments/reactions/reposts should disappear from feed reads because they inherit original visibility.
- If a placement is hidden/expired/paused, it should disappear immediately.
- Reporting should not instantly notify the reported user.
- Report details should never be exposed in public APIs.
- Rate limits are required before public launch for posting, commenting, reacting, reposting, and reporting.

## Phase 13 Handoff

Phase 13 should pick up:

- Full report dashboard.
- Block management UI.
- Profile visibility controls.
- Verified-badge grant workflow.
- Admin moderation queues.
- Appeal/review history.
- Notification policies for moderation actions.

