CREATE TABLE IF NOT EXISTS public.account_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'individual' CHECK (account_type IN ('individual', 'business')),
  full_name TEXT NOT NULL DEFAULT '',
  work_field TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read_own_account_profile ON public.account_profiles;
DROP POLICY IF EXISTS users_insert_own_account_profile ON public.account_profiles;
DROP POLICY IF EXISTS users_update_own_account_profile ON public.account_profiles;

CREATE POLICY users_read_own_account_profile
  ON public.account_profiles
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY users_insert_own_account_profile
  ON public.account_profiles
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY users_update_own_account_profile
  ON public.account_profiles
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
