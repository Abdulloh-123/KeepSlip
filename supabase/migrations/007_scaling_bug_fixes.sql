-- Follow-up production fixes from load/review pass.

CREATE INDEX IF NOT EXISTS processing_jobs_receipt_id_idx
  ON processing_jobs (receipt_id)
  WHERE receipt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS processing_jobs_ocr_active_storage_idx
  ON processing_jobs (user_id, storage_path)
  WHERE job_type = 'ocr_receipt'
    AND status IN ('processing', 'completed')
    AND storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS function_rate_limits_window_start_idx
  ON function_rate_limits (window_start);

CREATE INDEX IF NOT EXISTS function_events_created_at_idx
  ON function_events (created_at);

ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_line_items_array_check;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_line_items_array_check
  CHECK (jsonb_typeof(line_items) = 'array') NOT VALID;

ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_image_path_owner_check;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_image_path_owner_check
  CHECK (
    image_url IS NULL OR (
      image_url LIKE user_id::text || '/%' AND
      image_url NOT LIKE '%..%' AND
      position(chr(92) in image_url) = 0 AND
      image_url NOT LIKE '/%'
    )
  ) NOT VALID;

ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_pdf_path_owner_check;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_pdf_path_owner_check
  CHECK (
    pdf_url IS NULL OR (
      pdf_url LIKE user_id::text || '/%' AND
      pdf_url NOT LIKE '%..%' AND
      position(chr(92) in pdf_url) = 0 AND
      pdf_url NOT LIKE '/%'
    )
  ) NOT VALID;

UPDATE storage.buckets
SET
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
WHERE id = 'receipts';

DROP POLICY IF EXISTS "users see own receipts" ON receipts;

CREATE POLICY "users see own receipts"
  ON receipts FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_read_own_processing_jobs" ON processing_jobs;

CREATE POLICY "users_read_own_processing_jobs"
  ON processing_jobs FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_read_own_scan_history" ON email_scan_history;

CREATE POLICY "users_read_own_scan_history"
  ON email_scan_history FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_read_own_receipt_files" ON storage.objects;
DROP POLICY IF EXISTS "users_insert_own_receipt_files" ON storage.objects;
DROP POLICY IF EXISTS "users_update_own_receipt_files" ON storage.objects;
DROP POLICY IF EXISTS "users_delete_own_receipt_files" ON storage.objects;

CREATE POLICY "users_read_own_receipt_files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "users_insert_own_receipt_files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "users_update_own_receipt_files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "users_delete_own_receipt_files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
