-- ============================================================
-- Funūn — Runtime repair: user_profiles table contract
-- Migration 053: restore identity table used by collaborator claiming
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id              UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  pro             TEXT,
  ipi             TEXT,
  publisher       TEXT,
  phone           TEXT,
  mailing_address JSONB DEFAULT '{}',
  display_name    TEXT,
  bio             TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users select own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.user_profiles;

CREATE POLICY "Users select own profile" ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP TRIGGER IF EXISTS set_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

NOTIFY pgrst, 'reload schema';

