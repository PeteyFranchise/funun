-- ============================================================
-- Funūn — Phase 38.2-04: Member workspace doctrine publication.
-- Candidate migration 223. OWNER ACTION REQUIRED.
--
-- HUMAN-GATED: applying this migration publishes three approved doctrine
-- entries into existing Playbook rooms. It creates no workspace authority,
-- cohort membership, billing entitlement, ownership, or rights record.
-- ============================================================

BEGIN;

WITH doctrine(room_key, subgroup_key, slug, title, source_path, sort_order, body) AS (
  VALUES
  (
    'company-wide',
    'organizational-doctrine',
    'member-workspaces-identity-authority-and-custody',
    'Member Workspaces — Identity, Authority and Custody',
    '.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#member-workspaces-identity-authority-and-custody-doctrine',
    60,
    $workspace$
> **Doctrine:** A workspace is a durable operating context under a Member identity. It is never a
> new identity class and never evidence of credit, ownership, royalties, representation, or signing
> authority.

## The identity boundary

Funūn retains three genuine identity classes: full Member, limited guest/signature recipient, and
internal Funūn Team Member. Client Partner access and Member workspace access are verified
relationships attached to a Member; they are not new identities. Artists, writers, producers,
managers, publishers, attorneys, label executives, and music supervisors remain Members whose
professional roles describe them but grant nothing by themselves.

One Member may act personally, belong to several artist/management/label workspaces, and belong to a
verified Client Partner organization. The active context must always be explicit. Switching context
must never merge data, replace a login, or silently change the owner of a project.

## Custody and authority

Member-created songs, recordings, lyrics, notes, agreements, and rights records remain in the
Member's personal catalogue. A workspace attachment references a Member project; it never copies,
moves, or transfers custody. Workspace access to that project requires every live link in the chain:
eligible membership, sufficient role, an accepted roster relationship, an attachment rooted in that
relationship, a narrow unrevoked grant, and current Member custody.

Being in a workspace does not put anyone on a split sheet. A roster relationship does not prove
legal representation. A manager or label administrator cannot confirm a Member's rights statement
for them. Contracts, split sheets, registrations, confirmed rights evidence, and explicit signing
authority remain the governing records. Funūn records declarations and provenance; it does not
adjudicate ownership.

## Continuity, removal and billing

Ending a membership or roster relationship removes future workspace-derived access without erasing
the historical record. Revoking a grant takes effect immediately. Personal Member access, personal
catalogue custody, credits, splits, royalties, and payment identity remain untouched.

Workspace billing is separate from every Member plan. Beta workspaces begin free and active while
seat, roster, storage, AI, e-sign, and audio-processing use is measured without limits. A later
billing lapse makes workspace mutations read-only; it never deletes or detaches records. Billing and
usage data are operational signals, never authority or rights evidence.

## Operating standard

Before acting through a workspace, ask:

1. Which Member identity is acting?
2. Which workspace and live relationship are active?
3. What narrow permission is required for this action?
4. Does the Member still hold custody of the exact project?
5. Which rights or contract record supports any legal claim being made?

If any link is missing, unclear, expired, or unreadable, fail closed and preserve the records.
    $workspace$::TEXT
  ),
  (
    'company-wide',
    'cross-functional-operations',
    'ar-sales-working-through-member-workspaces',
    'A&R and Sales — Working Through Member Workspaces',
    '.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#a-r-and-sales-working-through-member-workspaces',
    60,
    $commercial$
> **Purpose:** Help teams coordinate around Members and opportunities without turning relationship
> management into ownership or unrestricted catalogue access.

## Before attaching work

- Confirm the Member and the intended professional relationship are the right parties.
- Ask the Member to accept the roster relationship; an internal proposal alone grants nothing.
- Attach only the exact project needed for the stated purpose.
- Request the narrowest permission and explain why it is needed.
- Treat a refusal, expiration, revocation, or ended relationship as authoritative immediately.

## While work is active

- Keep creative notes, operational tasks, contract evidence, and rights assertions in their proper
  records rather than mixing them into a generic CRM note.
- Never infer representation, signing authority, ownership, split participation, or payment rights
  from a workspace role or professional title.
- A&R may coordinate artist/label/publisher/service-provider relationships; Sales may coordinate
  qualified buyer opportunities. Neither team may widen a grant merely because an opportunity is
  urgent.
- Use the Member's confirmed data for delivery. Proposed changes remain proposals until the Member
  accepts them.

## At handoff or exit

- End or narrow access that is no longer needed; do not delete the relationship history.
- Confirm that open rights questions, agreements, and opportunity obligations have a named owner.
- Preserve the Member's personal catalogue and direct them to their personal context for work that
  no longer belongs in the organization's operating view.
    $commercial$::TEXT
  ),
  (
    'it-team',
    'role-doctrine',
    'workspace-rollout-and-incident-controls',
    'IT and Leadership — Workspace Rollout and Incident Controls',
    '.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#it-and-leadership-workspace-rollout-and-incident-controls',
    60,
    $operations$
> **Control doctrine:** One rollout boundary, one emergency stop, fail-closed mutations, and no
> production control hidden in presentation code.

## Beta rollout

- `workspace_cohorts` is the sole bounded-pilot membership source. Only Leadership may view or
  change it.
- `workspace_access_config` is the sole platform-wide database stop control.
- `WORKSPACE_ACCESS_GENERAL_ENABLED=true` may end the cohort requirement; it can never override a
  disabled database control.
- Accounts outside the pilot receive a 404. Cohort membership is not exposed to Members.
- Every control mutation is rate limited and audited.

## Billing and usage operations

- Workspace subscription state is independent of personal Member subscriptions.
- Missing or unreadable billing state fails workspace writes closed while reads remain available.
- Usage observations are allowlisted, idempotent, append-only, and stripped of prompts, contract
  content, file paths, emails, and rights data.
- Beta usage is measured, not enforced. Pricing, quotas, and entitlement decisions require a later
  owner-approved doctrine and migration.

## Incident response

- Use the database stop for a workspace authorization, custody, or integrity incident; record a
  reason and incident reference.
- Confirm that personal Member catalogue access remains available.
- Restore access only after the authorization path, database controls, and audit evidence are
  verified.
- Never create a second stop button or cohort table to solve an operational convenience problem.
- Apply billing and usage migrations before deploying application paths that deliberately fail
  closed when their service-only functions are unavailable.
    $operations$::TEXT
  )
), resolved AS (
  SELECT
    room.id AS room_id,
    subgroup.id AS subgroup_id,
    doctrine.slug,
    doctrine.title,
    doctrine.source_path,
    doctrine.sort_order,
    btrim(doctrine.body) AS body
  FROM doctrine
  JOIN public.playbook_rooms room ON room.key = doctrine.room_key
  JOIN public.playbook_sub_groups subgroup
    ON subgroup.room_id = room.id AND subgroup.key = doctrine.subgroup_key
)
INSERT INTO public.playbook_entries (
  room_id, sub_group_id, entry_type, title, slug, sort_order, content,
  status, published_at, source_kind, source_path, source_hash, adopted_at
)
SELECT
  resolved.room_id,
  resolved.subgroup_id,
  'document',
  resolved.title,
  resolved.slug,
  resolved.sort_order,
  jsonb_build_object('schemaVersion', 1, 'format', 'markdown', 'body', resolved.body),
  'published',
  now(),
  'adopted_markdown',
  resolved.source_path,
  pg_catalog.encode(extensions.digest(resolved.body, 'sha256'), 'hex'),
  now()
FROM resolved
WHERE NOT EXISTS (
  SELECT 1 FROM public.playbook_entries existing
  WHERE existing.source_kind = 'adopted_markdown'
    AND existing.source_path = resolved.source_path
);

COMMIT;

NOTIFY pgrst, 'reload schema';
