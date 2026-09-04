-- Migration 174: bind client-callable membership helpers to the current user.
--
-- RLS policies pass auth.uid(), so normal policy evaluation is unchanged.
-- service_role callers and trigger-time recipient checks retain the internal
-- arbitrary-subject behavior needed by server workflows and notifications.

CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = auth.uid() OR auth.role() = 'service_role' OR pg_trigger_depth() > 0
  ) AND EXISTS (
    SELECT 1 FROM public.vault_projects
    WHERE id = p_project_id AND user_id = p_uid
  )
$$;

CREATE OR REPLACE FUNCTION public.project_member_role(p_project_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_uid = auth.uid() OR auth.role() = 'service_role' OR pg_trigger_depth() > 0 THEN (
      SELECT role FROM public.project_members
      WHERE project_id = p_project_id AND user_id = p_uid
    )
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.is_buyer_org_member(p_org_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = auth.uid() OR auth.role() = 'service_role' OR pg_trigger_depth() > 0
  ) AND EXISTS (
    SELECT 1 FROM public.buyer_members
    WHERE org_id = p_org_id AND user_id = p_uid
  )
$$;

CREATE OR REPLACE FUNCTION public.is_work_owner(p_work_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = auth.uid() OR auth.role() = 'service_role' OR pg_trigger_depth() > 0
  ) AND EXISTS (
    SELECT 1 FROM public.works
    WHERE id = p_work_id AND user_id = p_uid
  )
$$;

CREATE OR REPLACE FUNCTION public.work_member_tier(p_work_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_uid = auth.uid() OR auth.role() = 'service_role' OR pg_trigger_depth() > 0 THEN (
      SELECT tier FROM public.work_members
      WHERE work_id = p_work_id AND user_id = p_uid
    )
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.idea_access_level(p_idea_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT (
      p_uid = auth.uid() OR auth.role() = 'service_role' OR pg_trigger_depth() > 0
    ) THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.ideas idea
      WHERE idea.id = p_idea_id AND idea.user_id = p_uid
    ) THEN 'owner'
    ELSE (
      SELECT member.permission FROM public.idea_members member
      WHERE member.idea_id = p_idea_id AND member.user_id = p_uid
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.is_project_owner(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_member_role(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_buyer_org_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_work_owner(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.work_member_tier(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.idea_access_level(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Authenticated execution remains necessary for RLS policy bodies. The
-- function bodies now return false/NULL for any direct cross-user query.
GRANT EXECUTE ON FUNCTION public.is_project_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_member_role(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_buyer_org_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_work_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_member_tier(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.idea_access_level(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
