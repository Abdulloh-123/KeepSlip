# Architecture — KeepSlip

## Overview

Receipt aggregation mobile app for iOS and Android. Users scan paper receipts, upload files (photo/PDF), and import receipts from Gmail. An email agent runs server-side, processes attachments via OCR, and surfaces receipts that require manual download as guided "pending" items.

---

## Tech Stack

### Frontend
| Layer | Choice | Reason |
|---|---|---|
| Framework | Expo (React Native) | iOS + Android from one codebase, managed workflow |
| Navigation | Expo Router (file-based) | Convention over config, deep link support |
| Server state | TanStack Query (React Query) | Caching, background refetch, optimistic updates |
| Client state | Zustand | Lightweight, no boilerplate, works with React Query |
| Camera | expo-camera | First-party Expo, no native config |
| File picker | expo-document-picker + expo-image-picker | PDF + photo library access |
| Secure storage | expo-secure-store | Encrypted token storage on device |
| Push | expo-notifications | Wraps FCM (Android) + APNs (iOS) |
| Icons | lucide-react-native | Already in design system |
| HTTP | Axios | Interceptors for JWT refresh |

### Backend
| Layer | Choice | Reason |
|---|---|---|
| Framework | FastAPI (Python) | Async, type-safe, fast to build, native AI/ML integration |
| Database | PostgreSQL | Relational, JSONB for OCR data and line items |
| ORM | SQLAlchemy + Alembic | Migrations, type-safe queries |
| Task queue | Celery + Redis | Email agent runs async; Redis as broker |
| WebSocket | FastAPI native | Live email import progress without polling |
| OCR | Anthropic Claude (claude-haiku-4-5) | Structured extraction from images/PDFs, cheap and fast |
| OCR fallback | Google Cloud Vision API | For edge cases where Claude struggles |
| Email | Gmail API (v1) | OAuth 2.0, message search, attachment download |
| File storage | Cloudflare R2 | S3-compatible, significantly cheaper than AWS S3 |
| Auth | Google OAuth 2.0 + JWT | Single sign-on covers both auth and Gmail scope |

### Infrastructure
| Service | Choice |
|---|---|
| API hosting | Railway (containers) |
| Database | Supabase PostgreSQL |
| Redis | Upstash Redis |
| File storage | Cloudflare R2 |
| Push notifications | Expo Push Notification Service |

---

## System Diagram

```
┌─────────────────────────────────────────────────────┐
│                  Mobile App (Expo)                  │
│  Receipt List │ Add Sheet │ Email Import │ Search   │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS / WebSocket
┌──────────────────────▼──────────────────────────────┐
│                   FastAPI Server                    │
│  /auth  /receipts  /email-import  /upload  /me      │
└────────┬──────────────┬───────────────┬─────────────┘
         │              │               │
    ┌────▼────┐   ┌─────▼──────┐  ┌────▼────┐
    │Postgres │   │   Celery   │  │   R2    │
    │  (DB)   │   │  Workers   │  │(Storage)│
    └─────────┘   └─────┬──────┘  └─────────┘
                        │
              ┌─────────┼─────────┐
              │         │         │
         ┌────▼───┐ ┌───▼───┐ ┌──▼──────────────┐
         │Gmail   │ │Claude │ │Google Cloud     │
         │API     │ │Haiku  │ │Vision (fallback)│
         └────────┘ └───────┘ └─────────────────┘
```

---

## Database Schema

### `users`
```sql
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 VARCHAR(255) UNIQUE NOT NULL,
  name                  VARCHAR(255),
  avatar_url            TEXT,
  google_sub            VARCHAR(255) UNIQUE,       -- Google user ID
  google_access_token   TEXT,                       -- AES-256 encrypted
  google_refresh_token  TEXT,                       -- AES-256 encrypted
  google_token_expiry   TIMESTAMPTZ,
  email_last_checked_at TIMESTAMPTZ,                -- NULL = never run
  email_check_limit_days INTEGER DEFAULT 90,
  expo_push_token       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### `receipts`
```sql
CREATE TABLE receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_name     VARCHAR(255),
  total_amount      DECIMAL(10,2),
  currency          VARCHAR(3) DEFAULT 'AUD',
  receipt_date      DATE,
  category          VARCHAR(50),                    -- see category colour system
  source            VARCHAR(20) NOT NULL,           -- 'scan' | 'upload' | 'email'
  status            VARCHAR(20) DEFAULT 'confirmed',-- 'confirmed' | 'pending_review'
  original_file_key TEXT,                           -- R2 object key
  original_file_type VARCHAR(50),                   -- MIME type
  ocr_raw           JSONB,                          -- raw Claude response
  ocr_confidence    DECIMAL(4,3),                   -- 0.000–1.000
  line_items        JSONB DEFAULT '[]',
  is_business       BOOLEAN DEFAULT FALSE,
  email_message_id  TEXT,                           -- Gmail message ID
  email_import_job_id UUID REFERENCES email_import_jobs(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receipts_user_date ON receipts(user_id, receipt_date DESC);
CREATE INDEX idx_receipts_user_category ON receipts(user_id, category);
```

### `pending_receipts`
Link receipts — emails where the receipt is behind a URL the agent cannot access.
```sql
CREATE TABLE pending_receipts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_name          VARCHAR(255),
  email_date             TIMESTAMPTZ,
  email_subject          TEXT,
  email_from             VARCHAR(255),
  email_message_id       TEXT,
  suggested_search_query TEXT,   -- Gmail search string, e.g. "from:noreply@bunnings.com.au subject:\"tax invoice\" after:2026/5/13 before:2026/5/15"
  link_urls              TEXT[], -- extracted URLs from email body
  status                 VARCHAR(20) DEFAULT 'awaiting_upload', -- 'awaiting_upload' | 'resolved' | 'dismissed'
  resolved_receipt_id    UUID REFERENCES receipts(id),
  email_import_job_id    UUID REFERENCES email_import_jobs(id),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pending_receipts_user_status ON pending_receipts(user_id, status);
```

### `email_import_jobs`
```sql
CREATE TABLE email_import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           VARCHAR(20) DEFAULT 'queued', -- 'queued' | 'running' | 'complete' | 'failed'
  from_date        TIMESTAMPTZ NOT NULL,
  to_date          TIMESTAMPTZ NOT NULL,
  emails_scanned   INTEGER DEFAULT 0,
  receipts_added   INTEGER DEFAULT 0,
  receipts_pending INTEGER DEFAULT 0,            -- link receipts created
  error_message    TEXT,
  celery_task_id   VARCHAR(255),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);
```

---

## API Endpoints

All endpoints require `Authorization: Bearer <jwt>` except `/auth/*`.

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/google` | Exchange Google OAuth code for JWT |
| `POST` | `/auth/refresh` | Refresh JWT using refresh token |
| `POST` | `/auth/logout` | Revoke tokens |

### Receipts
| Method | Path | Description |
|---|---|---|
| `GET` | `/receipts` | Paginated list (cursor-based, `?after=<id>&limit=20`) |
| `GET` | `/receipts/:id` | Receipt detail |
| `PATCH` | `/receipts/:id` | Edit merchant, amount, date, category |
| `DELETE` | `/receipts/:id` | Soft delete |

### Upload
| Method | Path | Description |
|---|---|---|
| `POST` | `/upload/presign` | Get presigned R2 URL for direct client upload |
| `POST` | `/upload/confirm` | Confirm upload done → triggers OCR Celery task |

The client uploads the file directly to R2 (never through the API server). After upload, it calls `/upload/confirm` with the object key. OCR runs async; receipt appears in list when done.

### Email Import
| Method | Path | Description |
|---|---|---|
| `POST` | `/email-import/run` | Start agent job — returns `job_id` immediately |
| `GET` | `/email-import/jobs/:id` | Job status + counts |
| `WS` | `/email-import/jobs/:id/stream` | WebSocket — live progress events |
| `GET` | `/email-import/pending` | All unresolved link receipts for user |
| `POST` | `/email-import/pending/:id/resolve` | Upload file to resolve a pending receipt |
| `DELETE` | `/email-import/pending/:id` | Dismiss a pending receipt |

### User
| Method | Path | Description |
|---|---|---|
| `GET` | `/me` | User profile |
| `PATCH` | `/me` | Update name, expo push token |
| `DELETE` | `/me/gmail` | Disconnect Gmail (clears tokens) |
| `DELETE` | `/me` | Delete account + all data |

---

## Email Agent (Celery Task)

**Triggered by:** `POST /email-import/run`

**Task: `workers.email_agent.run_import`**

```
1. Load user record, decrypt Google tokens
2. Refresh Google access token if expired
3. Determine scan window:
   - First run (email_last_checked_at is NULL):
       from_date = now() - email_check_limit_days
   - Re-run:
       from_date = email_last_checked_at
   to_date = now()

4. Update job status → 'running'

5. Search Gmail:
   Query: "subject:(invoice OR receipt OR \"tax invoice\" OR \"order confirmation\" OR \"payment receipt\")"
   Date filter: after:{from_date} before:{to_date}
   
6. For each matching email (paginated, up to 500):
   a. Fetch full message (headers + body + attachments)
   b. Push progress event via Redis pub/sub → WebSocket sends to client
   c. Classify email:
      - Has PDF/image attachment? → RECEIPT_WITH_ATTACHMENT
      - Body contains receipt-like link? → RECEIPT_WITH_LINK
      - Neither? → SKIP
   
   RECEIPT_WITH_ATTACHMENT:
     - Download attachment from Gmail API
     - Upload to R2: {user_id}/{job_id}/{message_id}/attachment.{ext}
     - Enqueue OCR task (non-blocking)
     - Create Receipt record (status='pending_review' until OCR done)
     - Increment job.receipts_added
   
   RECEIPT_WITH_LINK:
     - Extract merchant from From header / Subject
     - Build Gmail search query string for user:
         "from:{sender_email} subject:\"{subject}\" after:{date-1day} before:{date+1day}"
     - Extract all URLs from email body
     - Create PendingReceipt record
     - Increment job.receipts_pending

7. Update user.email_last_checked_at = to_date
8. Update job: status='complete', completed_at=now()
9. Send push notification via Expo Push API:
   - "{receipts_added} receipts imported" (if receipts_pending == 0)
   - "{receipts_added} receipts imported, {receipts_pending} need your help" (if pending > 0)
```

### Link Detection Heuristics
An email is classified as `RECEIPT_WITH_LINK` when ALL of the following are true:
- No PDF or image attachment found
- Email From address matches a known merchant domain OR subject contains invoice/receipt keywords
- Email body contains ≥1 URL matching patterns: `*invoice*`, `*receipt*`, `*statement*`, `*tax*`, `*download*`, or from a known merchant domain

Known merchant domains list is stored in config and expandable.

### WebSocket Events (job stream)
```json
{ "type": "progress", "emails_scanned": 42, "receipts_added": 7, "receipts_pending": 1 }
{ "type": "receipt_found", "merchant": "Bunnings", "amount": 84.50 }
{ "type": "link_found", "merchant": "Officeworks", "email_date": "2026-05-10" }
{ "type": "complete", "receipts_added": 23, "receipts_pending": 4 }
{ "type": "error", "message": "Gmail auth expired" }
```

---

## OCR Pipeline

**Triggered by:** Camera capture, file upload confirm, email attachment download

**Task: `workers.ocr_worker.process_receipt`**

```
1. Download file from R2 (presigned URL)
2. If PDF: convert first page to PNG (pdf2image)
3. Call Claude Haiku with vision:
   Model: claude-haiku-4-5-20251001
   Prompt:
     "Extract the following from this receipt image. Return JSON only, no prose.
      Fields: merchant_name, total_amount, currency, receipt_date (YYYY-MM-DD),
      gst_amount, line_items ([{description, amount}]), confidence (0.0-1.0 overall)"
4. Parse JSON response
5. If confidence < 0.80 OR merchant_name missing OR total_amount missing:
   - Fall back to Google Cloud Vision API
   - Re-extract from Vision response
6. Infer category from merchant_name (keyword matching → ML classifier later)
7. Update Receipt record:
   - merchant_name, total_amount, receipt_date, category, line_items, ocr_raw, ocr_confidence
   - status = 'confirmed' if confidence >= 0.80 else 'pending_review'
8. If source='email', push WebSocket event to notify app
```

### OCR Confidence Thresholds
| Confidence | Status | User sees |
|---|---|---|
| ≥ 0.80 | `confirmed` | Normal receipt card |
| < 0.80 | `pending_review` | Teal highlight on uncertain fields + "Confirm details" CTA |
| Complete failure | `pending_review` | All fields blank, user fills manually |

---

## File Storage (Cloudflare R2)

**Object key conventions:**
```
{user_id}/receipts/{receipt_id}/original.{ext}    — confirmed receipt file
{user_id}/jobs/{job_id}/{message_id}/attachment.{ext}  — email attachment (temp, pre-OCR)
```

**Upload flow (camera / file picker):**
1. App calls `POST /upload/presign` → API returns `{ upload_url, object_key, expires_in }`
2. App uploads file directly to R2 using presigned URL (PUT request)
3. App calls `POST /upload/confirm` with `{ object_key, source }` → API creates Receipt, enqueues OCR
4. App receives `{ receipt_id }` and starts polling or listening for receipt status

**Viewing files:**
- API generates a presigned GET URL (1 hour TTL) on demand
- Never expose permanent R2 URLs — all access is time-limited

---

## Authentication

**Flow:**
1. App opens Google OAuth via `expo-auth-session` requesting scopes:
   - `openid email profile`
   - `https://www.googleapis.com/auth/gmail.readonly`
2. Google returns `code`
3. App sends `code` to `POST /auth/google`
4. API exchanges code for `access_token` + `refresh_token` + user profile
5. API encrypts and stores Google tokens in `users` table
6. API issues JWT pair:
   - Access token: 15 minutes, signed HS256
   - Refresh token: 30 days, stored in DB for revocation
7. App stores JWT in `expo-secure-store`

**Token refresh:**
- Axios interceptor catches 401 → calls `POST /auth/refresh` → retries original request
- If refresh fails → redirect to sign-in

**Google token refresh:**
- Before any Gmail API call, check `google_token_expiry`
- If expired: call Google token endpoint with refresh token, update DB

---

## Push Notifications

- **Service:** Expo Push Notification Service (free tier, wraps FCM + APNs)
- **Token storage:** `users.expo_push_token` — updated on app open
- **Triggered when:**
  - Email import job completes (success or partial)
  - OCR processing completes while app is backgrounded

**Send from backend:**
```python
import httpx

async def send_push(token: str, title: str, body: str):
    await httpx.post(
        "https://exp.host/--/api/v2/push/send",
        json={"to": token, "title": title, "body": body, "sound": "default"}
    )
```

---

## Frontend File Structure

```
app/
  (auth)/
    welcome.tsx           # Onboarding step 1
    gmail-connect.tsx     # Onboarding step 2
    permissions.tsx       # Onboarding step 3
  (tabs)/
    index.tsx             # Receipt List (home)
    search.tsx            # Search screen
    profile.tsx           # Settings / Profile
  receipt/
    [id].tsx              # Receipt Detail
  email-import/
    [jobId].tsx           # Email Import Progress + Results

components/
  receipt/
    ReceiptCard.tsx
    ReceiptList.tsx
    CategoryAvatar.tsx
    CategoryFilterRow.tsx
    SpendHeader.tsx
  email/
    PendingReceiptCard.tsx
    LinkReceiptHelper.tsx
    ImportProgressCounter.tsx
    PendingBanner.tsx
  sheets/
    AddReceiptSheet.tsx   # Camera / Upload / Email Import
  common/
    NudgeCard.tsx
    SkeletonCard.tsx
    ErrorToast.tsx

stores/
  receipts.ts             # Zustand: local receipt list state
  user.ts                 # Zustand: auth, profile
  emailImport.ts          # Zustand: active job state

services/
  api.ts                  # Axios instance with JWT interceptors
  auth.ts                 # Google OAuth + token management
  websocket.ts            # WebSocket connection for import stream

hooks/
  useReceipts.ts          # TanStack Query
  useReceipt.ts
  useEmailImport.ts
  usePendingReceipts.ts
  useWebSocket.ts

constants/
  categories.ts           # Category → colour + icon mapping
  config.ts               # API base URL, R2 bucket, etc.
```

---

## Backend File Structure

```
app/
  api/
    auth.py
    receipts.py
    email_import.py
    upload.py
    me.py
    websocket.py
  workers/
    email_agent.py        # Celery task: run_import
    ocr_worker.py         # Celery task: process_receipt
  models/
    user.py
    receipt.py
    pending_receipt.py
    email_import_job.py
  services/
    gmail.py              # Gmail API wrapper (search, fetch, download)
    ocr.py                # Claude Haiku + GCV fallback
    storage.py            # R2 wrapper (presign, upload, delete)
    email_classifier.py   # Heuristics: receipt vs link vs skip
    link_detector.py      # Extract URLs, build Gmail search query
    push.py               # Expo Push API
    category.py           # merchant_name → category inference
  core/
    config.py             # Settings (pydantic-settings)
    database.py           # SQLAlchemy engine + session
    security.py           # JWT, AES-256 encryption for Google tokens
    celery.py             # Celery app instance
  main.py
  alembic/               # DB migrations
```

---

## Category Inference

On OCR completion, `category.py` infers a spend category from the merchant name:

| Priority | Method | Example |
|---|---|---|
| 1 | Exact match (known merchant list) | "Bunnings" → Hardware |
| 2 | Domain match (if email source) | `@bp.com.au` → Fuel/Transport |
| 3 | Keyword match in merchant name | contains "Fuel", "Petrol", "BP" → Fuel/Transport |
| 4 | Fallback | → Uncategorised |

Category can always be edited by the user from Receipt Detail screen.

---

## Key Non-Obvious Decisions

**Why Celery + Redis instead of a simpler queue?**
Gmail scans can take 30–120 seconds (hundreds of emails). If done in the request/response cycle, mobile connections time out and users think the import failed. Celery decouples the job from the HTTP request. The app gets a `job_id` immediately and connects via WebSocket for live updates.

**Why presigned R2 uploads (not through API)?**
Receipt images and PDFs can be 5–20MB. Routing through the API server doubles bandwidth cost and adds latency. Direct client-to-R2 upload is standard for this pattern.

**Why encrypt Google tokens in the DB?**
Gmail refresh tokens grant ongoing read access to a user's entire inbox. DB breach without encryption would expose all users' email. AES-256 encryption with a server-side key (stored in env, not DB) means a DB dump alone is not sufficient to access Gmail.

**Why `pending_receipts` is a separate table (not a status on `receipts`)?**
A `PendingReceipt` is not a receipt — it has no OCR data, no file, no amount. It's a pointer to an email that needs user action. Mixing it into the `receipts` table with nullable fields creates messy queries. Once resolved, a real `Receipt` is created and the `PendingReceipt` gets a foreign key to it.

**Why WebSocket for email import instead of polling?**
With polling at 2-second intervals over a 60-second job, you make ~30 round trips. WebSocket makes 1 connection and receives push events. The live "Found 47 receipts..." counter is the core delight moment of the email import — it needs to update smoothly.

**Why Claude Haiku for OCR instead of a dedicated OCR service?**
Haiku understands receipt context — it knows "Total incl. GST" is the final amount, not a line item. Traditional OCR (Tesseract, GCV) returns raw text and requires a separate extraction layer. Haiku does extraction in one call, handles handwritten amounts and partial receipts better, and is cheap enough at ~$0.0003 per image.
