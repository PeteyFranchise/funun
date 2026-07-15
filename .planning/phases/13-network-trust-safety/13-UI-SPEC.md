# Phase 13 UI Design Contract: Network Tab & Trust & Safety

**Status:** Draft
**Design precedent:** None in the static handoff. This phase needs net-new UI.

## Routes

- `/network` or `/green-room/network` for the member-facing Network tab. Recommended: `/green-room/network` only if Green Room subroutes are introduced; otherwise `/network` can be a primary nav destination.
- `/settings/privacy` or existing settings section for profile visibility and `Open to` privacy.
- `/admin/reports` for report review.
- `/admin/members/verification` or existing admin member area for verified badge grant/revoke.

## Network Tab

Tabs:

- Connections
- Following
- Followers
- Pending
- Blocked

Each person row:

- Avatar.
- Display name.
- Handle.
- Primary role.
- Relationship label.
- Actions allowed by state: View profile, Message, Follow/unfollow, Accept, Decline, Withdraw, Remove, Block, Unblock.

Safety:

- Block and unblock require inline confirmation.
- Block copy must state impact simply: "They will not be able to view your profile, message you, or find you in discovery."
- Do not show "blocked you" state anywhere.

## Report Flow

Entry points:

- Profile more menu.
- Message thread more menu.
- Feed post/comment/repost more menu if Phase 12 hooks are present.

Dialog/panel fields:

- Reason.
- Optional details.
- Submit.

Reason labels:

- Spam or scam.
- Harassment or hate.
- Sexual or explicit content.
- Violence or threat.
- Impersonation.
- Copyright or rights issue.
- Misleading opportunity or paid offer.
- Other.

After submit:

- Calm confirmation: "Thanks. Our team will review this."
- Do not promise a specific outcome.
- Do not notify the reported user.

## Admin Reports

Queue columns:

- Target type.
- Reporter.
- Reported member or object.
- Reason.
- Status.
- Created date.
- Assigned/reviewer.

Actions:

- Mark reviewing.
- Dismiss.
- Actioned.
- Hide/remove target where supported.
- Add internal note.

Report details must be admin-only.

## Verification Admin

Member rows:

- Name, handle, roles, current verified state, last updated.

Actions:

- Grant verified badge.
- Revoke verified badge.
- Optional internal reason.

This is manual admin authority only. No self-serve verification request in V1.

## Privacy Settings

Controls:

- Profile visibility: Public, Connections-only.
- `Open to` visibility: Public, Connections-only, Hidden.

Copy:

- Public profile: "Anyone with your profile link can view your public profile."
- Connections-only: "Only accepted connections can view your full profile."
- Open-to hidden: "Your preferences still help Funun privately, but they are not shown publicly."

## Mobile

- Network tabs scroll horizontally.
- Person rows stack actions into a compact menu.
- Block/report confirmation must not rely on hover.

