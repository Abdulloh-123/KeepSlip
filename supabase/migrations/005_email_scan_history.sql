-- Tracks every email message ID that has been scanned (regardless of outcome).
-- Used to skip already-processed emails on future import runs.
CREATE TABLE IF NOT EXISTS email_scan_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_message_id TEXT        NOT NULL,
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, email_message_id)
);

CREATE INDEX IF NOT EXISTS email_scan_history_user_idx
  ON email_scan_history(user_id);

ALTER TABLE email_scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_scan_history"
  ON email_scan_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
