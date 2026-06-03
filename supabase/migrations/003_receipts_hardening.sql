ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_rfc822_message_id TEXT;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_subject TEXT;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS email_received_at TIMESTAMPTZ;

ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_user_id_merchant_name_date_total_amount_key;

ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_total_amount_check;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_total_amount_check CHECK (total_amount >= 0);

ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_currency_check;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_currency_check CHECK (currency ~ '^[A-Z]{3}$');

CREATE UNIQUE INDEX IF NOT EXISTS receipts_user_email_message_idx
  ON receipts (user_id, email_message_id)
  WHERE email_message_id IS NOT NULL;
