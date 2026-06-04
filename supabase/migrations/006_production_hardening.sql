-- Production hardening: rate limits, job tracking, internal function events,
-- stricter scan-history permissions, and indexes for common receipt queries.

CREATE TABLE IF NOT EXISTS function_rate_limits (
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action       TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 1 CHECK (count >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action, window_start)
);

ALTER TABLE function_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_rate_limits" ON function_rate_limits;

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO function_rate_limits (user_id, action, window_start, count)
  VALUES (p_user_id, p_action, v_window_start, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET
    count = function_rate_limits.count + 1,
    updated_at = now()
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION check_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS processing_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type      TEXT        NOT NULL CHECK (job_type IN ('ocr_receipt', 'email_import')),
  status        TEXT        NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  receipt_id    UUID        REFERENCES receipts(id) ON DELETE SET NULL,
  storage_path  TEXT,
  error_code    TEXT,
  error_message TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_processing_jobs" ON processing_jobs;

CREATE POLICY "users_read_own_processing_jobs"
  ON processing_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS processing_jobs_user_created_idx
  ON processing_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS processing_jobs_user_status_idx
  ON processing_jobs (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS function_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  function_name TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,
  severity      TEXT        NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  request_id    TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE function_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS function_events_function_created_idx
  ON function_events (function_name, created_at DESC);

CREATE INDEX IF NOT EXISTS function_events_user_created_idx
  ON function_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_scan_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_message_id TEXT        NOT NULL,
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, email_message_id)
);

ALTER TABLE email_scan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_scan_history" ON email_scan_history;
DROP POLICY IF EXISTS "users_read_own_scan_history" ON email_scan_history;

CREATE POLICY "users_read_own_scan_history"
  ON email_scan_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS email_scan_history_user_message_idx
  ON email_scan_history (user_id, email_message_id);

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_rfc822_message_id TEXT;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_subject TEXT;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_received_at TIMESTAMPTZ;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS attachment_type TEXT CHECK (attachment_type IN ('none','pdf','image','link_only'));

CREATE UNIQUE INDEX IF NOT EXISTS receipts_user_email_message_idx
  ON receipts (user_id, email_message_id)
  WHERE email_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS receipts_user_created_idx
  ON receipts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS receipts_user_category_date_idx
  ON receipts (user_id, category, date DESC);

CREATE INDEX IF NOT EXISTS receipts_user_business_date_idx
  ON receipts (user_id, is_business, date DESC);

CREATE INDEX IF NOT EXISTS receipts_user_email_received_idx
  ON receipts (user_id, email_received_at DESC)
  WHERE email_received_at IS NOT NULL;

DROP POLICY IF EXISTS "user receipt files" ON storage.objects;

CREATE POLICY "users_read_own_receipt_files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users_insert_own_receipt_files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users_update_own_receipt_files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users_delete_own_receipt_files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
