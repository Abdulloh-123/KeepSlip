ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_rfc822_message_id TEXT;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_subject TEXT;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_received_at TIMESTAMPTZ;
