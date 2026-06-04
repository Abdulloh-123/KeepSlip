# Architecture — KeepSlip

## Current Scope

KeepSlip is an Expo/React Native receipt wallet backed by Supabase. The current app lets a user:

- Create an account or sign in with email/password.
- Complete a short onboarding flow.
- Scan a paper receipt with the camera.
- Upload an image or PDF receipt.
- Run OCR through a Supabase Edge Function.
- Store receipt records in Supabase Postgres.
- Store original receipt files in a private Supabase Storage bucket.
- Search receipts.
- View receipt details and signed original files.
- Delete receipts and delete the account.

Gmail import, background email jobs, push notifications, subscriptions, FastAPI, Celery, Redis, Cloudflare R2, and NFC/store integrations are not part of the current built architecture.

## Frontend Stack

| Layer | Choice |
|---|---|
| Framework | Expo 52, React Native 0.76 |
| Navigation | Expo Router |
| Auth session storage | Expo SecureStore |
| Camera | expo-camera |
| File picker | expo-document-picker |
| Image/PDF viewing | Expo WebBrowser for PDFs, React Native Image modal for images |
| Lists | @shopify/flash-list |
| Icons | lucide-react-native |
| Fonts | DM Sans via Expo Google Fonts, Cabinet Grotesk local files |
| Tests | Jest + testing-library/react-native |

## Backend Stack

| Layer | Choice |
|---|---|
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| Storage | Supabase Storage private `receipts` bucket |
| Server logic | Supabase Edge Functions |
| OCR | `ocr-receipt` Edge Function |
| Account deletion | `delete-account` Edge Function |

## App Routes

| Route | Role |
|---|---|
| `app/(auth)/index.tsx` | Welcome, sign in, sign up |
| `app/(onboarding)/welcome.tsx` | Onboarding intro |
| `app/(onboarding)/permissions.tsx` | Camera permission explanation |
| `app/(tabs)/index.tsx` | Receipt list/home |
| `app/(tabs)/search.tsx` | Receipt search |
| `app/(tabs)/settings.tsx` | Settings/profile |
| `app/add-receipt.tsx` | Transparent modal bottom sheet |
| `app/scan.tsx` | Full-screen camera scan flow |
| `app/receipt/[id].tsx` | Receipt detail |

## Data Model

The app uses the `receipts` table represented by `types/receipt.ts`.

Important fields:

- `id`, `user_id`
- `merchant_name`, `date`, `total_amount`, `currency`
- `category`, `is_business`
- `source`: `manual_scan`, `email_agent`, `store_tap`, or legacy combined value
- `line_items`
- `image_url`, `pdf_url`: private storage paths, not public URLs
- Email metadata fields are present for compatibility but email import screens are currently deferred.

Original files are stored in Supabase Storage under user-specific paths. UI code must call `getReceiptFileUrl(path)` before displaying or opening originals.

## Core Flows

### Auth and Onboarding

1. Root layout listens to Supabase auth changes.
2. Unauthenticated users route to `(auth)`.
3. Newly signed-in users route through onboarding until `onboarding_complete` is stored in SecureStore.
4. Completed users route to `(tabs)`.

### Scan Receipt

1. User opens `app/scan.tsx`.
2. Camera permission is checked.
3. User captures a photo.
4. Photo uploads to the private `receipts` bucket.
5. App invokes `ocr-receipt`.
6. Parsed receipt is inserted into Postgres.
7. User sees success and can open the new detail screen.

### Upload Receipt

1. User opens the add receipt sheet.
2. User picks an image or PDF.
3. File uploads to private storage.
4. App invokes `ocr-receipt`.
5. Parsed receipt is inserted into Postgres.
6. App navigates to receipt detail.

### Receipt Detail

1. App fetches a single receipt by id.
2. If the receipt has `image_url` or `pdf_url`, the app creates a signed URL.
3. PDFs open in `WebBrowser`; images open in an in-app modal.

## Error-State Rule

All async UI must avoid showing raw backend, auth, database, OCR, or stack messages to users. Use friendly copy with a retry/back action. Log raw errors only in developer-facing tools if needed.

Required states for async screens:

- Ready/content
- Loading/running
- Friendly failure

## Deferred Architecture

The following areas are intentionally not represented as active architecture:

- Gmail OAuth connect flow
- Email import jobs and pending link receipts
- Push notifications for background jobs
- Subscription/paywall
- FastAPI/Celery/Redis/R2 backend
- Store/NFC receipt capture

If a deferred area returns, update this file before or alongside implementation.
