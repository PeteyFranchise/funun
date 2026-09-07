-- ============================================================
-- Funūn — The Playbook: BDT Foundation Doctrine
-- Migration 189: create the Business Development room and
-- publish the owner-approved scope, handoff, verification and
-- organic-buyer licensing foundation.
--
-- APPLIED IN PRODUCTION as migration 189. A 2026-09-06 renumber to 197 was
-- reverted: this migration was already applied under 189, so the local file
-- must keep that number. Phase 38.0.1's chain moved to 190-194 instead.
--
-- HUMAN-GATED: review and apply with `supabase db push`.
-- Expanded BDT responsibilities remain under discussion.
-- ============================================================

-- Keep the team-room order explicit and stable as Business Development joins
-- the six original rooms from migration 130.
UPDATE public.playbook_rooms
SET sort_order = CASE key
  WHEN 'company-wide' THEN 1
  WHEN 'ar' THEN 2
  WHEN 'ae-sales' THEN 4
  WHEN 'it-team' THEN 5
  WHEN 'tms' THEN 6
  WHEN 'leadership' THEN 7
  ELSE sort_order
END
WHERE key IN ('company-wide', 'ar', 'ae-sales', 'it-team', 'tms', 'leadership');

INSERT INTO public.playbook_rooms (key, label, sort_order, sensitive, coming_soon)
VALUES ('business-development', 'Business Development', 3, false, false)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    sensitive = EXCLUDED.sensitive,
    coming_soon = EXCLUDED.coming_soon;

-- Follow the existing transparency default for non-sensitive operating rooms:
-- every operational role may read; leadership retains structural access.
INSERT INTO public.playbook_room_role_grants (room_id, role)
SELECT room.id, role_name.role
FROM public.playbook_rooms room
CROSS JOIN (
  VALUES ('ae'), ('bd'), ('anr'), ('it'), ('legal'), ('tms'), ('accounting'), ('marketing')
) AS role_name(role)
WHERE room.key = 'business-development'
ON CONFLICT (room_id, role) DO NOTHING;

INSERT INTO public.playbook_sub_groups (room_id, key, label, sort_order)
SELECT id, 'role-doctrine', 'Role Doctrine', 10
FROM public.playbook_rooms
WHERE key = 'business-development'
ON CONFLICT (room_id, key) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

WITH doctrine_entries(sort_order, title, items) AS (
  VALUES
    (
      1,
      'BDT Foundation Doctrine — Start Here',
      ARRAY[
        'STATUS — Foundation owner-approved September 6, 2026. Expanded core responsibilities and remaining decision authority are still under discussion.',
        'WORKING DEFINITION — Funūn''s Business Development Team develops qualified relationships with Client Partner organizations and music buyers.',
        'PURPOSE — Create qualified demand for the Funūn creative network, qualify the relationship and prepare it for durable ownership by the appropriate receiving team.',
        'DIVISION OF LABOR — BDT opens and qualifies the buyer relationship. AEs operate and grow the account. A&Rs connect qualified demand to artists, songwriters and catalogue.',
        'HOW TO USE THIS ENTRY — Treat these cards as the approved foundation for training, CRM workflow and the future BDT console. Do not infer authority that is not stated.'
      ]::TEXT[]
    ),
    (
      2,
      '01 — BDT Relationship Scope',
      ARRAY[
        'PRIMARY — Client Partner organizations, music supervisors and authorized music buyers.',
        'PRIMARY — Film, television, advertising, gaming, media and production organizations seeking music.',
        'PRIMARY — Agencies or representatives legitimately sourcing music for authorized clients.',
        'PRIMARY — Other verified organizations that may license, commission, purchase or place music through Funūn.',
        'OUTCOME — Qualified demand for artists, songwriters and catalogue in the permissioned Funūn network.'
      ]::TEXT[]
    ),
    (
      3,
      '02 — Cross-Team Relationship Ownership',
      ARRAY[
        'A&R — Record labels, publishers, distributors, producers, production teams, artist managers, music service providers and other creative-development relationships.',
        'IT & LEADERSHIP — Technology partnerships, platform integrations, infrastructure, data/delivery integrations and technical-service relationships.',
        'LEADERSHIP & MARKETING — Sponsorships, corporate strategic partnerships, promotional alliances and company-level representation.',
        'PURPOSE CONTROLS OWNERSHIP — A brand seeking campaign music may be a BDT buyer; the same brand seeking to sponsor Funūn belongs to Marketing and Leadership.',
        'MULTIPLE RELATIONSHIPS — One organization may have several Funūn relationships. Each purpose receives its own owner and authority boundary.'
      ]::TEXT[]
    ),
    (
      4,
      '03 — Six-Month Incubation & Joint Ownership',
      ARRAY[
        'DEFAULT — The BDT originator remains relationship sponsor and joint owner for approximately six months after a receiving AE or team accepts the account.',
        'DAY-TO-DAY OWNER — The receiving AE becomes the primary client contact immediately after accepting ownership.',
        'BDT SPONSOR — The originator preserves trust, introductions, history and strategic context during the transition.',
        'COORDINATION — Assign responsibilities explicitly, share important context and avoid duplicated or competing outreach.',
        'FLEXIBILITY — Complete earlier when continuity is protected; extend for a documented strategic or operational reason with Leadership approval.',
        'PRINCIPLE — The client experiences one coordinated Funūn team.'
      ]::TEXT[]
    ),
    (
      5,
      '04 — Full-Handoff Standard',
      ARRAY[
        'The receiving owner has explicitly accepted responsibility.',
        'Key contacts, decision-makers, goals and communication preferences are documented.',
        'Active opportunities, promises, risks and next actions are current.',
        'Relevant meeting and relationship history is available to the receiving team.',
        'The client has been introduced to the long-term owner.',
        'No important knowledge remains solely with the BDT originator.',
        'The handoff date and ownership change are recorded.',
        'PRINCIPLE — Origin credit is permanent. Operational ownership is transferable. Relationship context must never disappear during transfer.'
      ]::TEXT[]
    ),
    (
      6,
      '05 — Client Partner Verification Authority',
      ARRAY[
        'BDT members investigate, document the buying use case and recommend verification; a prospect record does not itself grant protected access.',
        'A senior BDT Team Member may verify only when explicitly granted that system capability.',
        'Leadership may approve, reject, suspend or restore verification when necessary.',
        'A future authorized Verification function may perform the same controlled responsibility.',
        'Verification authority is never inferred from a title, profile label or claimed seniority.',
        'Every decision records its evidence, reason and accountable decision-maker.',
        'PRINCIPLE — The relationship owner gathers the evidence. An authorized verifier grants the access.'
      ]::TEXT[]
    ),
    (
      7,
      '06 — Organic Buyer Fast Path',
      ARRAY[
        'PRINCIPLE — Organizational verification controls ongoing privileges; it must not unnecessarily block a legitimate buyer ready to complete an eligible transaction.',
        'FULL VERIFICATION — May govern an organization workspace, continuing Crate access, team invitations, saved briefs and organization-level permissions.',
        'TRANSACTION CHECKS — Confirm buyer identity/contact, organization when applicable, exact use parameters, song/version clearance and commercial terms.',
        'TRANSACTION CONTROLS — Collect required signatures and payment; perform appropriate fraud, sanctions, payment and risk checks.',
        'EVIDENCE — Generate an immutable licence, delivery authorization and receipt.',
        'FOLLOW-THROUGH — Offer Client Partner verification after the transaction and create a relationship follow-up without retroactively granting verified status.',
        'PRINCIPLE — Verify the privilege at the level where it is needed.'
      ]::TEXT[]
    ),
    (
      8,
      '07 — Instant vs. Reviewed Licensing',
      ARRAY[
        'INSTANT ELIGIBILITY — The authorized controller has pre-authorized the exact song and recording version, permitted use, territory, term, price, exclusivity status, delivery asset and standard agreement.',
        'ASSISTED PATH — Anything outside the pre-authorized boundaries moves to assisted or manual review.',
        'PAUSE CONDITIONS — Incomplete/disputed rights, additional approval, failed identity/payment/fraud/sanctions/safety checks or terms exceeding the artist''s authorization.',
        'MANUAL CONDITIONS — Exclusivity, custom language, unusually broad rights or other exceptional commercial conditions.',
        'BOUNDARY — Fast purchasing reduces avoidable friction; it never overrides rights, authority, safety or contractual controls.'
      ]::TEXT[]
    ),
    (
      9,
      '08 — CRM & Console Requirements',
      ARRAY[
        'Track prospect, organic buyer, transaction-cleared buyer, verification recommended, verified Client Partner and suspended verification as distinct states.',
        'Record BDT originator, receiving owner/team, qualified date, current day-to-day owner and target handoff date.',
        'Support explicit responsibility assignments plus 30-, 90- and 180-day transition reviews.',
        'Preserve handoff readiness, approved extensions, completion date and permanent ownership history.',
        'Record verification evidence, recommendation, decision-maker, status and reason.',
        'Keep single-transaction access separate from continuing organization access.',
        'Turn an organic transaction into a documented follow-up opportunity without mislabeling the buyer.'
      ]::TEXT[]
    )
),
bdt_room AS (
  SELECT id FROM public.playbook_rooms WHERE key = 'business-development'
),
doctrine_group AS (
  SELECT subgroup.id
  FROM public.playbook_sub_groups subgroup
  JOIN bdt_room room ON room.id = subgroup.room_id
  WHERE subgroup.key = 'role-doctrine'
)
INSERT INTO public.playbook_entries (
  room_id, sub_group_id, entry_type, title, content, status, created_at
)
SELECT
  room.id,
  subgroup.id,
  'sop',
  entry.title,
  jsonb_build_object('items', to_jsonb(entry.items)),
  'published',
  now() - (entry.sort_order * INTERVAL '1 microsecond')
FROM doctrine_entries entry
CROSS JOIN bdt_room room
CROSS JOIN doctrine_group subgroup
WHERE NOT EXISTS (
  SELECT 1
  FROM public.playbook_entries existing
  WHERE existing.room_id = room.id
    AND existing.title = entry.title
);

NOTIFY pgrst, 'reload schema';
