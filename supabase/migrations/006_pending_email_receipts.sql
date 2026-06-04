CREATE TABLE IF NOT EXISTS pending_email_receipts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_message_id          TEXT NOT NULL,
  email_rfc822_message_id   TEXT,
  email_subject             TEXT,
  email_source              TEXT,
  email_received_at         TIMESTAMPTZ,
  gmail_search              TEXT,
  merchant_hint             TEXT,
  reason                    TEXT,
  status                    TEXT NOT NULL DEFAULT 'unresolved'
                             CHECK (status IN ('unresolved', 'resolved')),
  resolved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, email_message_id)
);

CREATE INDEX IF NOT EXISTS pending_email_receipts_user_status_idx
  ON pending_email_receipts(user_id, status, created_at DESC);

ALTER TABLE pending_email_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_pending_email_receipts_select"
  ON pending_email_receipts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_pending_email_receipts_update"
  ON pending_email_receipts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
