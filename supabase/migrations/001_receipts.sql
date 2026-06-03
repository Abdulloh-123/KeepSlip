CREATE TABLE receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN (
                    'manual_scan', 'email_agent', 'store_tap',
                    'manual_scan + email_agent')),
  merchant_name   TEXT NOT NULL,
  date            DATE NOT NULL,
  total_amount    NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  currency        CHAR(3) NOT NULL DEFAULT 'AUD' CHECK (currency ~ '^[A-Z]{3}$'),
  category        TEXT,
  is_business     BOOLEAN NOT NULL DEFAULT FALSE,
  line_items      JSONB NOT NULL DEFAULT '[]',
  image_url       TEXT,
  pdf_url         TEXT,
  email_source    TEXT,
  email_message_id TEXT,
  email_rfc822_message_id TEXT,
  email_subject   TEXT,
  email_received_at TIMESTAMPTZ,
  attachment_type TEXT CHECK (attachment_type IN ('none','pdf','image','link_only')),
  raw_text        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index
ALTER TABLE receipts ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', merchant_name || ' ' || COALESCE(category, ''))
  ) STORED;

CREATE INDEX receipts_search_idx ON receipts USING GIN (search_vector);
CREATE INDEX receipts_user_date_idx ON receipts (user_id, date DESC);
CREATE UNIQUE INDEX receipts_user_email_message_idx
  ON receipts (user_id, email_message_id)
  WHERE email_message_id IS NOT NULL;
