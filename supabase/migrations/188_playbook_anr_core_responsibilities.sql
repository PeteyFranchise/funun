-- ============================================================
-- Funūn — The Playbook: A&R Core Responsibilities
-- Migration 188: activate the A&R room and publish the
-- owner-approved first section of the evolving A&R doctrine.
--
-- Renumbered 188 -> 198 on 2026-09-06: 188-192 are claimed by Phase 38.0.1's
-- migration chain, 193-194 by Phase 38.0.2, 195-196 by Phase 38.2 and 197 by
-- the BDT doctrine entry. This migration is independent of all of them.
--
-- HUMAN-GATED: review and apply with `supabase db push`.
-- This entry defines responsibilities, not final decision authority.
-- ============================================================

UPDATE public.playbook_rooms
SET coming_soon = false
WHERE key = 'ar';

INSERT INTO public.playbook_sub_groups (room_id, key, label, sort_order)
SELECT id, 'role-doctrine', 'Role Doctrine', 10
FROM public.playbook_rooms
WHERE key = 'ar'
ON CONFLICT (room_id, key) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

WITH responsibility_entries(sort_order, title, items) AS (
  VALUES
    (
      1,
      'A&R Core Responsibilities — Start Here',
      ARRAY[
        'STATUS — Owner-approved on September 6, 2026 as Point 1 of the evolving Funūn A&R Role and Console Doctrine.',
        'WORKING DEFINITION — A Funūn A&R is responsible for the continuity of the creative relationship—from discovery through development, readiness, opportunity and follow-through.',
        'THE ROLE — Learn what a creator is trying to build before recommending what should happen next.',
        'THE STANDARD — Combine creative judgment, relationship stewardship, catalogue awareness, business readiness and dependable follow-through without taking ownership of the creator''s voice.',
        'THE BOUNDARY — Access to an opportunity is not a promise of selection, placement or compensation. Final decision authority will be governed by the completed doctrine.',
        'HOW TO USE THIS ENTRY — Read each responsibility card as an operating expectation and as a requirement for the future A&R console.'
      ]::TEXT[]
    ),
    (
      2,
      '01 — Discovery & Cultural Awareness',
      ARRAY[
        'Discover promising artists, writers, producers, songs and creative communities.',
        'Maintain an informed understanding of emerging sounds, genres, scenes, technologies and audience behavior.',
        'Look beyond public metrics to identify creative identity, work ethic, growth potential and cultural relevance.',
        'Build genuine relationships with trusted creative communities and referral sources.',
        'Do not allow follower counts, streaming totals, personal taste or industry hype to become the only measures of potential.'
      ]::TEXT[]
    ),
    (
      3,
      '02 — Creative Understanding & Development',
      ARRAY[
        'Learn what each artist is trying to create before recommending what they should do next.',
        'Listen closely to songs, works in progress, demos, releases and alternate versions.',
        'Give specific, respectful and actionable feedback while preserving the creator''s ownership and voice.',
        'Help identify strengths, unfinished decisions, missing collaborators and promising creative directions.',
        'Recognize when an artist needs encouragement, honest critique, practical resources or simply room to create.',
        'Track creative development over time rather than judging someone from a single song or interaction.'
      ]::TEXT[]
    ),
    (
      4,
      '03 — Relationship Stewardship',
      ARRAY[
        'Establish trust through consistency, discretion, preparation and honest communication.',
        'Understand the member''s goals, preferred communication style, team structure and current priorities.',
        'Maintain appropriate follow-up rhythms without overwhelming the artist.',
        'Preserve relevant context so members do not have to repeatedly explain their history to different Funūn Team Members.',
        'Treat every interaction as part of a long-term relationship, including when no immediate commercial opportunity exists.',
        'Close communication loops and avoid leaving artists uncertain about status or next steps.'
      ]::TEXT[]
    ),
    (
      5,
      '04 — Onboarding & Platform Guidance',
      ARRAY[
        'Prepare for and conduct structured onboarding calls.',
        'Help members establish accurate profiles, professional roles, collaborator records, IPI/CAE information, PRO affiliation, publishing information and rights details when appropriate.',
        'Introduce Funūn tools in the context of the member''s immediate goals rather than forcing a rigid walkthrough.',
        'Help members begin with a real project, song, recording or useful next action.',
        'Confirm that members understand what information is private, shared, artist-visible or internally documented.',
        'Identify technical or usability friction and report it to the product team.'
      ]::TEXT[]
    ),
    (
      6,
      '05 — Project & Catalogue Awareness',
      ARRAY[
        'Maintain a working understanding of assigned artists'' active songs, releases, catalogues and development priorities.',
        'Know which projects are early ideas, active works in progress, release candidates, catalogue assets or opportunity-ready.',
        'Help members organize recordings, lyrics, credits, rights information and supporting materials.',
        'Identify projects that have stalled and determine whether a useful intervention exists.',
        'Notice missing information or unresolved issues without allowing administrative completion to obstruct creation.',
        'Respect the distinction between creative participation, project access, credits, ownership and contractual rights.'
      ]::TEXT[]
    ),
    (
      7,
      '06 — Opportunity Development & Matching',
      ARRAY[
        'Identify opportunities that genuinely align with the artist, song, timing, rights status and career goals.',
        'Recommend artists, writers, producers and songs for appropriate internal consideration.',
        'Explain why a recommendation is a meaningful match rather than forwarding music indiscriminately.',
        'Confirm readiness before advancing a project toward an opportunity.',
        'Track submissions, responses, outcomes and required follow-ups.',
        'Communicate honestly when an opportunity is exploratory, competitive, unconfirmed or subject to another decision-maker.'
      ]::TEXT[]
    ),
    (
      8,
      '07 — Internal AE Partnership & Opportunity Circulation',
      ARRAY[
        'GOVERNING PRINCIPLE — Reach should be broad, but relevance must remain real.',
        'Cultivate active, trusted working relationships with Funūn Account Executives rather than waiting for isolated requests or briefs.',
        'Maintain awareness of upcoming opportunities, client needs, campaigns, placements, partnerships and other openings that may benefit artists and songwriters in the Funūn network.',
        'Learn from AEs what each opportunity actually requires—including creative fit, business constraints, rights readiness, deadlines and current status—before sharing it.',
        'Search across the relevant, permissioned Funūn network for every credible match, not only the A&R''s own roster, most familiar contacts or most visible artists.',
        'Get relevant opportunities in front of as many genuinely suitable artists and songwriters as practical while avoiding indiscriminate blasts that create noise or false hope.',
        'Work with AEs to turn commercial and client context into clear, creator-appropriate guidance without exposing confidential client information.',
        'Document who was considered, who received the opportunity, why they matched and what response or next action followed.',
        'Close the feedback loop with AEs and creators so outcomes improve future matching, catalogue knowledge and trust.',
        'Surface repeated unmet demand to A&Rs, AEs and Leadership so Funūn can develop its network intentionally.'
      ]::TEXT[]
    ),
    (
      9,
      '08 — Collaboration & Team Building',
      ARRAY[
        'Identify when a project could benefit from a writer, producer, musician, engineer, manager, attorney, publisher or other specialist.',
        'Facilitate thoughtful introductions with consent from the relevant parties.',
        'Understand the difference between introducing collaborators and recommending ownership arrangements.',
        'Help creators establish expectations before work begins without providing unauthorized legal advice.',
        'Watch for unclear roles, communication breakdowns or emerging conflicts and escalate appropriately.',
        'Support healthy creative rooms where contributors are respected and accurately documented.'
      ]::TEXT[]
    ),
    (
      10,
      '09 — Rights & Business Readiness',
      ARRAY[
        'Encourage members to document contributors, splits, recordings, agreements and registration status as the work develops.',
        'Help members understand which information can be completed later and when it becomes necessary.',
        'Guide members toward Funūn''s rights workflows and approved educational resources.',
        'Identify missing or conflicting information that could obstruct a release, registration, payment, submission or licensing opportunity.',
        'Never present educational guidance as legal, tax or financial advice.',
        'Escalate rights disputes, contractual questions, ownership conflicts and sensitive business matters.'
      ]::TEXT[]
    ),
    (
      11,
      '10 — Internal Coordination & Documentation',
      ARRAY[
        'Maintain clear, factual and timely call logs, relationship notes, tasks and follow-up dates.',
        'Separate observable facts from personal interpretations and recommendations.',
        'Label internal notes, artist-visible messages and confidential escalations correctly.',
        'Record meaningful decisions and context—not unnecessary surveillance or private speculation.',
        'Coordinate with Leadership and other authorized Funūn Team Members without making the member repeat their story.',
        'Assign clear owners and deadlines when work moves between departments.',
        'Keep CRM stages and member records current enough to support reliable team decisions.'
      ]::TEXT[]
    ),
    (
      12,
      '11 — Member Advocacy & Accountability',
      ARRAY[
        'Advocate for the member''s stated goals inside Funūn.',
        'Surface recurring obstacles, unmet needs and opportunities for better support.',
        'Hold members accountable to agreed next actions without becoming controlling or punitive.',
        'Be candid when a project is not ready while explaining what readiness would require.',
        'Ensure that internal enthusiasm does not become an external promise.',
        'Recognize when Funūn is not the appropriate solution and communicate that respectfully.'
      ]::TEXT[]
    ),
    (
      13,
      '12 — Safety, Privacy & Professional Conduct',
      ARRAY[
        'Protect unreleased music, private communications, rights information, personal data and business strategy.',
        'Access only the members and information necessary for assigned work.',
        'Avoid favoritism, discrimination, retaliation, harassment, conflicts of interest and exploitative behavior.',
        'Disclose personal, financial or professional conflicts that could affect judgment.',
        'Never use access to solicit unauthorized side business or personal benefit.',
        'Escalate credible safety, fraud, impersonation, abuse or rights concerns through the correct internal channel.'
      ]::TEXT[]
    ),
    (
      14,
      '13 — Product & Organizational Learning',
      ARRAY[
        'Document recurring member questions, friction, unmet needs and successful workflows.',
        'Distinguish individual preferences from patterns that may justify product changes.',
        'Participate in beta testing and report issues with enough context for the product team to reproduce them.',
        'Help refine Playbook guidance, onboarding gameplans, evaluation standards and internal processes.',
        'Treat the console as a system of record—not a replacement for judgment, empathy or direct human communication.'
      ]::TEXT[]
    )
),
anr_room AS (
  SELECT id
  FROM public.playbook_rooms
  WHERE key = 'ar'
),
doctrine_group AS (
  SELECT subgroup.id
  FROM public.playbook_sub_groups subgroup
  JOIN anr_room room ON room.id = subgroup.room_id
  WHERE subgroup.key = 'role-doctrine'
)
INSERT INTO public.playbook_entries (
  room_id,
  sub_group_id,
  entry_type,
  title,
  content,
  status,
  created_at
)
SELECT
  room.id,
  subgroup.id,
  'sop',
  entry.title,
  jsonb_build_object('items', to_jsonb(entry.items)),
  'published',
  now() - (entry.sort_order * INTERVAL '1 microsecond')
FROM responsibility_entries entry
CROSS JOIN anr_room room
CROSS JOIN doctrine_group subgroup
WHERE NOT EXISTS (
  SELECT 1
  FROM public.playbook_entries existing
  WHERE existing.room_id = room.id
    AND existing.title = entry.title
);

NOTIFY pgrst, 'reload schema';
