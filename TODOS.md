# TODOS — Pre-Ship Checklist

Items marked **BEFORE SHIP** are required before any real users touch the app.
Items marked **AFTER TEST** are deferred until post-testing phase.

---

## BEFORE SHIP — Email Import: Switch from Streaming to Background Job

**Current (test phase):** Email import uses a streaming response (Option 1).
The Edge Function sends receipt events over an open connection as it finds them.
The app reads the stream and shows a live counter. User must stay on screen.

**Required before shipping (Option 2):** Convert to background job + polling.
- Edge Function returns `{job_id}` immediately, then processes in background via `EdgeRuntime.waitUntil()`
- Create `email_import_jobs` table to track job state (queued → running → complete)
- App polls the jobs table every 3 seconds via a `useEmailImportJob` hook
- User can close the import screen and continue using the app
- Push notification when job completes: "X receipts imported"
- Results screen shows imported receipts + any pending receipts needing manual upload

**Why deferred:** Background job requires a new DB table, polling hook, results screen,
and push notification wiring. Too much scope for the test phase. Streaming gives
equivalent UX for test users who are actively watching the import run.

**Files to touch when implementing:**
- `supabase/migrations/` — add `email_import_jobs` table
- `supabase/functions/email-sync/index.ts` — return job_id + use waitUntil()
- `hooks/useEmailImportJob.ts` — new polling hook
- `app/email-import.tsx` — replace streaming UI with job status + results screen
- `lib/gmail.ts` — update `syncGmailReceipts()` to return job_id

---

## BEFORE SHIP — Storage Bucket: Presigned URLs

**Current:** Fixed (bucket set to private). ✅
Receipts bucket is now private. The `getReceiptFileUrl()` helper in `lib/supabase.ts`
generates signed URLs with 1-hour TTL.

**Remaining:** Anywhere the app currently uses `receipt.image_url` or `receipt.pdf_url`
directly (e.g. `app/receipt/[id].tsx:145`, `email-import.tsx`) must call
`getReceiptFileUrl(path)` instead of using the raw URL. The raw URLs will 403 once
the bucket is private.

---

## BEFORE SHIP — ARCHITECTURE.md is Stale

**Current:** ARCHITECTURE.md describes a FastAPI + Celery + Redis + Cloudflare R2
backend that was never built. Actual stack is Supabase-only (Edge Functions + Storage).

**Action:** Rewrite ARCHITECTURE.md to reflect the actual Supabase architecture before
onboarding any new contributors or investors reviewing the technical docs.
