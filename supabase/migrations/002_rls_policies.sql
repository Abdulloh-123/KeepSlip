ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own receipts
CREATE POLICY "users see own receipts"
  ON receipts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Storage bucket for receipt files
INSERT INTO storage.buckets (id, name, public)
  VALUES ('receipts', 'receipts', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only access files in their own folder (userId/*)
CREATE POLICY "user receipt files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
