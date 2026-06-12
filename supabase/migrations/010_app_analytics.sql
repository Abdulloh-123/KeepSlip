CREATE TABLE IF NOT EXISTS public.app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  screen TEXT,
  properties JSONB NOT NULL DEFAULT '{}',
  app_version TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_insert_own_app_events ON public.app_events;

CREATE POLICY users_insert_own_app_events
  ON public.app_events
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS app_events_user_created_idx
  ON public.app_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS app_events_name_created_idx
  ON public.app_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS app_events_created_idx
  ON public.app_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.app_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  error_name TEXT,
  error_message TEXT NOT NULL,
  screen TEXT,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('warning', 'error', 'fatal')),
  stack TEXT,
  properties JSONB NOT NULL DEFAULT '{}',
  app_version TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_insert_own_app_errors ON public.app_errors;

CREATE POLICY users_insert_own_app_errors
  ON public.app_errors
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS app_errors_user_created_idx
  ON public.app_errors (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS app_errors_severity_created_idx
  ON public.app_errors (severity, created_at DESC);

CREATE INDEX IF NOT EXISTS app_errors_created_idx
  ON public.app_errors (created_at DESC);
