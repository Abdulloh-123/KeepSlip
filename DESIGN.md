# Design System — KeepSlip

## Product Context

KeepSlip is a receipt wallet mobile app for iOS and Android. The current app supports email/password auth, onboarding, camera scanning, file/PDF upload, receipt search, receipt detail, original file viewing, CSV export entry point, sign out, and account deletion.

Email import, Gmail connection, subscriptions, push notifications, and store/NFC receipt capture are deferred product areas. Do not design or build those flows unless the current task explicitly brings them back.

## Design Principle

"Simple and instant — receipts sorted before you blink."

Every screen should feel fast, calm, and consumer-grade. This is not accounting software. Avoid dense dashboards, corporate navy, grey-only cards, and form-heavy layouts.

## Current Screens

| Screen | Purpose |
|---|---|
| Auth | Welcome, sign in, sign up |
| Onboarding Welcome | Introduce KeepSlip and start setup |
| Camera Permission | Explain camera access and finish onboarding |
| Receipt List | Main feed with monthly spend summary and category filters |
| Add Receipt Sheet | Bottom sheet for scan or upload |
| Scan | Camera capture, OCR processing, success, and failure handling |
| Receipt Detail | Merchant, date, amount, line items, original file, delete |
| Search | Search receipt records and open matching details |
| Settings | Account, export entry point, privacy/terms, sign out, delete account |

## Required Screen States

Every async or user-blocking flow must have three user-facing states:

1. **Ready/content** — the normal interactive screen.
2. **Loading/running** — something is happening and the user sees progress or skeletons.
3. **Friendly failure** — no raw backend, database, OCR, auth, or stack messages. Explain what happened in plain language and give a retry/back action when useful.

Static screens do not need artificial loading or error states.

## Receipt List

| State | What user sees |
|---|---|
| Loading | Teal header with placeholder spend/count and 3 ghost receipt cards |
| Empty | "No receipts yet" with guidance to tap + to scan or upload |
| Has receipts | Chronological receipt cards, category filters, monthly spend summary |
| Error | Friendly message, retry action |
| Pull to refresh | Native refresh indicator |

## Add Receipt Sheet

| State | What user sees |
|---|---|
| Ready | Handle, title, Scan Receipt row, Upload File or Photo row, Cancel |
| Processing upload | Centered progress message for upload/OCR |
| Upload failed | Friendly failure message with Try Again and Cancel |

## Scan

| State | What user sees |
|---|---|
| Camera ready | Dark camera UI, receipt frame, close button, capture button |
| Permission needed | Full-screen camera access prompt |
| Processing | White screen with running message such as "Reading receipt..." |
| Success | Saved confirmation, merchant/amount summary, View Receipt, Done |
| Failure | Friendly failure screen with Try Again and Cancel |

## Receipt Detail

| State | What user sees |
|---|---|
| Loading | Skeleton/quiet loading state for receipt header and totals |
| Not found | "Receipt not found" and Go back |
| Failed to load | Friendly failure message and Try again |
| Loaded | Merchant/date/amount, line items if present, original file action if present, delete |
| Original file failed | Plain alert: "We couldn't open the original file." |

## Search

| State | What user sees |
|---|---|
| Idle | Search prompt |
| Loading | Small search progress indicator |
| No matches | "No receipts match..." |
| Error | Friendly message and Try again |
| Results | Receipt cards and result count |

## Auth

| State | What user sees |
|---|---|
| Welcome | App intro and sign in/sign up choices |
| Form | Email/password fields |
| Submitting | Button spinner, controls disabled |
| Error | Inline friendly message near the form |
| Success sign-up | Confirmation alert to check email |

## Settings

| State | What user sees |
|---|---|
| Loading account | Profile area can show fallback initials/email placeholder |
| Ready | Account email, export, privacy/terms, sign out, delete |
| Delete failed | Plain alert: "We couldn't delete your account. Please try again." |

## Visual Language

- **Background:** `#FAFAF9` or nearby warm white. Current code also uses `#F8FAFC`; prefer consolidating toward `#FAFAF9` during visual polish.
- **Surface:** `#FFFFFF`
- **Border:** `#F1F5F9`
- **Primary text:** `#0C0C0C`
- **Muted text:** `#6B7280`
- **Accent:** `#0D9488`
- **Accent pressed:** `#0F766E`
- **Success:** `#16A34A`
- **Error:** `#DC2626`
- **Warning:** `#D97706`
- **Scan background:** `#000000`

## Typography

- **Display/amounts:** Cabinet Grotesk
- **Body/labels:** DM Sans
- **Scale:** 12, 14, 16, 18, 24, 32, 48

## Category Colours

Use category colour mainly for receipt avatars and chips.

| Category | Colour |
|---|---|
| Food & Drink | `#F59E0B` |
| Transport | `#3B82F6` |
| Tools & Materials | `#8B5CF6` |
| Office | `#6B7280` |
| Clothing | `#EC4899` |
| Health | `#10B981` |
| Entertainment | `#EF4444` |
| Accommodation | `#F97316` |
| Utilities | `#14B8A6` |
| Other | `#9CA3AF` |

## Deferred Screens

These were part of earlier planning but are not part of the current app surface:

- Gmail connect
- Email import progress/results
- Pending link receipts
- First-import celebration
- Push notification setup
- Subscription tier screens
- Store tap/NFC capture

If any deferred flow returns, it must include ready, running, complete, empty, and friendly error states before shipping.
