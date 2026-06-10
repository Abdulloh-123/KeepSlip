ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', merchant_name || ' ' || COALESCE(category, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS receipts_search_idx
  ON public.receipts USING GIN (search_vector);
