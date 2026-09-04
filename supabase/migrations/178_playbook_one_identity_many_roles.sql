-- ============================================================
-- Funūn — The Playbook: One Identity, Many Roles v1.0
-- Migration 178: publish the owner-approved account, workspace,
--                role, and access model.
--
-- HUMAN-GATED: review and apply with `supabase db push`. The entry is
-- inserted as published because the owner approved this doctrine on
-- September 4, 2026.
-- ============================================================

UPDATE public.playbook_rooms
SET coming_soon = false
WHERE key = 'company-wide';

INSERT INTO public.playbook_sub_groups (room_id, key, label, sort_order)
SELECT id, 'standards-and-doctrine', 'Standards & Doctrine', 10
FROM public.playbook_rooms
WHERE key = 'company-wide'
ON CONFLICT (room_id, key) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

WITH account_doctrine(title, items) AS (
  VALUES (
    'One Identity, Many Roles — The Funūn Account, Workspace & Access Model v1.0',
    ARRAY[
      'Authority: Owner-approved Funūn account and access doctrine, September 4, 2026.',
      'Core rule: one human has one Funūn identity. Professional roles describe the person; workspace relationships grant access; project records establish authority and ownership.',
      'The three account classes are Member Account, Client Partner Account and Funūn Team Member Account.',
      'Member Account: the full-user umbrella for artists, songwriters, producers, managers, publishers, attorneys, engineers, label executives, curators, collaborators and other creative professionals.',
      'Client Partner Account: a verified organization relationship for licensing music through The Crate. Access comes only from buyer organization membership, never from a self-declared professional role.',
      'Funūn Team Member Account: a privileged internal identity for operating the Funūn business. Authority comes from server-verified staff roles and remains purpose-specific and audited.',
      'Limited guests and signature recipients are not a fourth account class. They receive narrow invitation or signing access and may later become Members without losing the evidence attached to the earlier invitation.',
      'Professional roles are plural and contextual. A person may be a songwriter, producer and music supervisor at the same time and may use different roles on different works.',
      'A professional-role label may personalize copy or prefill a form. It never grants workspace access, authorship, ownership, signature authority, licensing authority, payment rights or clean-master access.',
      'Member tools are universal. An incomplete profile, PRO, IPI, publishing, splits, registration or rights setup must not block creative capture, Writer''s Room entry, lyrics, notes, uploads or rough recordings.',
      'Writer''s Room membership grants creative access only. It does not automatically add a person to a split sheet or establish ownership.',
      'Project management, collaborator status and organizational seniority do not independently establish legal authority. No actor may grant more authority than they hold.',
      'One identity may simultaneously hold a personal Member workspace and a verified Client Partner organization relationship.',
      'Dual-context example: a person may write and produce songs in a private Member catalogue while separately acting as a music supervisor in an employer''s Client Partner workspace.',
      'Context separation: personal songs, collaborators, creative agreements and rights records remain in the Member workspace. Shortlists, requests, company activity and licensing agreements remain in the Client Partner workspace.',
      'The interface must show an explicit workspace switch when both relationships exist. Data never merges merely because one person can reach both contexts.',
      'Declaring Music Supervisor on a Member profile never unlocks The Crate. An authorized, verified buyer organization membership is required.',
      'Authorized Client Partner invitations may attach an existing Member identity without replacing its login or deleting its profile, subscription, Sound Vault, projects or personal agreements.',
      'Public registration must never attach an arbitrary existing email to an organization. Existing-identity reconciliation is service-only and follows an authorized invitation.',
      'Current transactional limitation: one Client Partner organization membership per identity. Multi-organization support requires an explicit active-organization selector and a route-by-route authorization audit before additional memberships are allowed.',
      'Corporate-email continuity: before a corporate email is the sole credential for a personal workspace, Funūn should offer a verified personal login or recovery method such as a secondary verified email or passkey.',
      'When employment ends, revoke only the Client Partner organization relationship. Preserve the person''s Member workspace and personal records.',
      'Credential linking is security-sensitive. Do not claim that typing a second email or changing an email safely joins identities until provider-level verification, recovery, conflict handling and audit history ship.',
      'Staff separation: Funūn Team Member identities do not double as Member or Client Partner identities. Staff who also make music should use a separate personal Member login.',
      'Contract Locker is available to every Member, including managers who are not writers. Split Sheets live as a section inside Contract Locker while creation and detail deep links remain stable.',
      'Client Partner licensing documents stay in The Crate''s Licenses/Agreements context and do not flow into a person''s Member Contract Locker.',
      'Legacy member_type, capability_grants, buyer metadata and route names are compatibility data, not the canonical taxonomy. Remove them only after dependent routes and production records are migrated and audited.',
      'Authorization rule: sensitive actions are checked server-side and at the database/RLS boundary where applicable. Navigation visibility and profile labels are never security controls.',
      'Engineering decision sequence: identify the person; resolve the active workspace relationship; check the action-specific permission or legal authority; then read the authoritative rights record. Never answer a later question from a professional-role label alone.',
      'Governance: leadership owns this doctrine. Any new account class, identity-overlap rule, credential-linking flow or workspace authority requires security review and a dated Playbook successor.'
    ]::TEXT[]
  )
),
company_room AS (
  SELECT id
  FROM public.playbook_rooms
  WHERE key = 'company-wide'
),
standards_group AS (
  SELECT subgroup.id
  FROM public.playbook_sub_groups subgroup
  JOIN company_room room ON room.id = subgroup.room_id
  WHERE subgroup.key = 'standards-and-doctrine'
)
INSERT INTO public.playbook_entries (
  room_id,
  sub_group_id,
  entry_type,
  title,
  content,
  status
)
SELECT
  room.id,
  subgroup.id,
  'sop',
  entry.title,
  jsonb_build_object('items', to_jsonb(entry.items)),
  'published'
FROM account_doctrine entry
CROSS JOIN company_room room
CROSS JOIN standards_group subgroup
WHERE NOT EXISTS (
  SELECT 1
  FROM public.playbook_entries existing
  WHERE existing.room_id = room.id
    AND existing.title = entry.title
);

NOTIFY pgrst, 'reload schema';
