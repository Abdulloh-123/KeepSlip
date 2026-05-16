# Design System — KeepSlip

## Product Context
- **What this is:** Receipt aggregation mobile app — camera scan, email import, NFC tap
- **Who it's for:** Tradies, sole traders, and everyday consumers who lose receipts
- **Space/industry:** Consumer fintech / receipt management (competitors: Expensify, Dext, SimplyWise)
- **Project type:** Mobile app (iOS + Android, Expo/React Native)

## Memorable Thing
> "Simple and instant — receipts sorted before you blink."

Every design decision serves this. If something adds friction, complexity, or hesitation — cut it.

## Aesthetic Direction
- **Direction:** Clean & Confident — consumer-grade simplicity, NOT accounting software
- **Decoration level:** Minimal — typography and whitespace carry all weight. The receipt is the visual.
- **Mood:** Feels like a camera app crossed with a payments app. Fast, trusted, built for someone with dirty hands who needs this done in 10 seconds.
- **What to avoid:** Corporate navy blue, dashboard complexity, form-like UIs, anything that signals "expense report"

## Screens

| Screen | Purpose |
|--------|---------|
| Onboarding (×3) | Welcome, Gmail connect (optional), permissions |
| Receipt List | Main feed — all receipts, bank-transaction style |
| Scan Screen | Camera UI, dark mode, single capture action |
| Receipt Detail | Merchant, date, amount, line items, original file viewer |
| Email Import | Gmail connect flow, scan progress, results summary |
| Search | Filter by merchant, date, amount, category |
| Settings/Profile | Account, Gmail, subscription |

## Screen Information Architecture

### Onboarding (3 screens)
1. **Welcome** — App name, one-line value prop ("All your receipts, one place"), Sign in with Google button + email option
2. **Gmail Connect** — Explains what access is requested, "Connect Gmail" CTA + "Skip for now" link (no pressure)
3. **Camera Permission** — Single permission request, brief explanation, "Allow" CTA

### Receipt List (home)
- **Top:** Spend summary header — "This month: $X,XXX · N receipts" (skeleton placeholder while loading, not a spinner)
- **Below header:** Chronological receipt cards (newest first)
- **Empty state:** If Gmail not connected → nudge card "Import receipts from Gmail — find 6 months of receipts in 2 minutes" with teal Connect button. If Gmail connected but 0 receipts → "No receipts yet — tap + to scan your first one"
- **FAB:** Large teal scan button, bottom center (always visible)

### Scan Screen
- **Full dark UI** — black background, receipt fills the frame
- **Top:** "Scan Receipt" label + X to close
- **Center:** Camera viewfinder with subtle corner guides
- **Bottom:** Large teal 64px capture button, centered

### Receipt Detail
- **Top:** Merchant name (Cabinet Grotesk, 32px) + date
- **Below:** Total amount (Cabinet Grotesk, 48px, teal)
- **Below:** Line items list (if available)
- **Below:** Category tag (editable), source tag (scanned/email/tap)
- **Bottom:** "View Original" button if PDF/image exists, "Mark as Business" toggle

### Email Import (progress screen)
- **Header:** "Importing receipts from Gmail"
- **Live counter:** "Found 47 receipts so far..." (updates in real time, not a spinner)
- **Below:** Live list of receipts appearing as they're found (merchant + amount, animated in)
- **Bottom:** "Stop import" link (small, muted)

### Search
- **Top:** Search bar (auto-focused on open)
- **Below:** Filter chips — Date range, Category, Amount range
- **Results:** Same receipt card format as Receipt List

### Settings/Profile
- **Account:** Name, email, avatar
- **Gmail:** Connected status + "Disconnect" or "Connect Gmail" CTA
- **Data:** "Export all receipts (CSV)" link
- **Danger zone:** Delete account
- **Note:** No subscription tier at launch. Spend summaries and category breakdowns are free for all users. Tax export reports deferred to a later version.

## UX Flow

```
Onboarding (Welcome → Gmail Connect → Camera Permission)
  ↓ (gmail connected)          ↓ (gmail skipped)
Receipt List (populated)    Receipt List (empty + nudge card)
  ↓ (tab: scan)
Scan Screen → flash + processing → Receipt Detail
  ↓ (tab: search)
Search → Results → Receipt Detail
  ↓ (settings → gmail not connected)
Gmail Connect → Scanning (live counter) → Celebration Screen → Receipt List
```

## First-Run Experience & Emotional Arc

### Emotional Journey
| Step | User does | User feels | Design supports it |
|------|-----------|------------|-------------------|
| Opens app | Sees welcome screen | Curious, cautious | Clean, confident first impression — not accounting software |
| Connects Gmail | Grants access | Slightly nervous | Minimal permissions copy, explicit "read-only" reassurance |
| Waits for scan | Watches receipts appear live | Surprised, delighted | Live counter + receipts appearing builds anticipation |
| First import complete | Sees celebration screen | Wow — I had no idea | Count-up animation: "127 receipts imported" — shareable moment |
| Opens receipt list | Sees all their receipts | This actually works | Full list, spend summary, organised |
| Scans first paper receipt | Taps capture | Instant satisfaction | White flash + receipt appears in 2 seconds |

### Celebration Screen (first import complete)
- **Background:** Teal `#0D9488` full-screen
- **Center:** Large white number counting up to receipt total (Cabinet Grotesk, 80px)
- **Below number:** "receipts imported from Gmail" (DM Sans, white, 18px)
- **Below:** Date range covered: "From May 2024 to May 2026"
- **Bottom:** "View your receipts" CTA button (white, teal text)
- **Motion:** Number counts up over 1.5s (ease-out), confetti burst at completion
- **Auto-dismisses** after 4 seconds or on tap

## Interaction States

### Scan Screen
| State | What user sees |
|-------|---------------|
| Camera ready | Dark screen, viewfinder active, teal capture button |
| Capturing | White flash (80ms), then "Processing..." label |
| OCR attempt 1 fails | Retries silently — user sees nothing |
| OCR attempt 2 fails | Two-option bottom sheet: "Fill in details" (opens prefill form) or "Try again" (with tip: better lighting, flatten the receipt) |
| OCR success | Receipt card slides in from bottom, brief success tick animation |
| **Photo always saved** | The original photo is ALWAYS stored regardless of OCR outcome — users need the original image for tax returns |

### Receipt List
| State | What user sees |
|-------|---------------|
| Loading | Skeleton cards (3 ghost cards), spend summary shows "--" |
| Empty, Gmail not connected | Nudge card: "Import receipts from Gmail — find 6 months in 2 minutes" + teal Connect button |
| Empty, Gmail connected | "No receipts yet — tap + to scan your first one" with scan icon |
| Has receipts | Chronological card list, spend summary populated |
| Pull to refresh | Standard iOS/Android refresh indicator |

### Email Import
| State | What user sees |
|-------|---------------|
| Connecting | "Connecting to Gmail..." with brief animation |
| Scanning | Live counter: "Found 47 receipts..." + receipts appearing in real time |
| User closes app | Scan continues server-side (Celery job); push notification when done |
| Done | "Import complete — 127 receipts added" with confetti micro-animation, CTA to view receipts |
| Auth error | "Gmail connection failed — tap to reconnect" with reconnect CTA |
| No receipts found | "No receipt emails found in the last 6 months" with suggestion to scan paper receipts |

### Receipt Detail
| State | What user sees |
|-------|---------------|
| Loading | Skeleton for merchant name, amount |
| OCR partial (unconfirmed fields) | Teal highlight on fields that OCR wasn't confident about; "Confirm details" CTA |
| Has original photo/PDF | "View Original" button visible; opens in-app viewer |
| No original file | Extracted data only, no view button |

### General Error States
| Error | What user sees |
|-------|---------------|
| No internet | Toast: "No internet connection — your scan is saved and will upload when you're back online" |
| Camera permission denied | Full-screen prompt: "KeepSlip needs camera access to scan receipts" + "Open Settings" button |
| Push notification permission | Asked during onboarding permissions screen (needed for Gmail scan completion) |

## Typography
- **Display/Amounts:** Cabinet Grotesk — geometric, strong, great at large sizes for merchant names and dollar amounts
- **Body/Labels:** DM Sans — precise, clean on mobile at 14–16px, excellent legibility outdoors in bright sun
- **Loading:** Google Fonts CDN
- **Scale:**
  - xs: 12px (timestamps, tags)
  - sm: 14px (labels, secondary text)
  - base: 16px (body)
  - lg: 18px (section headers)
  - xl: 24px (screen titles)
  - 2xl: 32px (amounts, merchant names on detail screen)
  - 3xl: 48px (hero moments)

## Color
- **Approach:** Restrained — one accent, everything else is neutral
- **Background:** `#FAFAF9` (warm white — easier on eyes, high contrast outdoors)
- **Surface/Cards:** `#FFFFFF`
- **Border:** `#E5E7EB` (1px card border, no heavy shadow)
- **Text:** `#0C0C0C`
- **Muted text:** `#6B7280`
- **Accent:** `#0D9488` (deep teal — unowned in this category; not corporate blue, not accounting green)
- **Accent hover/press:** `#0F766E`
- **Success:** `#16A34A`
- **Error:** `#DC2626`
- **Warning:** `#D97706`
- **Dark mode (scan screen only):** `#000000` background, `#FFFFFF` text, `#0D9488` capture button

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — not cramped (tradies need large tap targets), not airy
- **Scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px
- **Card padding:** 16px
- **Screen horizontal padding:** 16px
- **Bottom tab height:** 64px + safe area

## Layout
- **Approach:** Grid-disciplined — single column, predictable alignment
- **Receipt feed:** Single-column list, cards stacked with 8px gap
- **Card anatomy:** Logo circle (40px, teal bg) left → merchant name + date center → amount right (bold, Cabinet Grotesk)
- **Scan button:** 64px circle, teal `#0D9488`, centered in bottom tab bar
- **Bottom navigation:** 4 tabs — Receipts, Scan (oversized), Search, Profile
- **Border radius:** sm: 8px (tags), md: 12px (cards), lg: 16px (sheets/modals), full: 9999px (scan button, avatar)

## Components

### Buttons
| Variant | Background | Text | Height | Border radius | Press state |
|---------|-----------|------|--------|--------------|-------------|
| Primary | `#0D9488` teal | `#FFFFFF` white | 52px | 12px | `#0F766E` (darken 10%) |
| Secondary | `#FFFFFF` white | `#0D9488` teal | 52px | 12px | `#F0FDFA` |
| Ghost | Transparent | `#0C0C0C` | 44px | 8px | `#F4F4F5` |
| Danger | `#DC2626` red | `#FFFFFF` white | 52px | 12px | `#B91C1C` |
| Disabled | `#E5E7EB` | `#9CA3AF` | 52px | 12px | Non-interactive |

- Font: DM Sans, 16px, weight 600
- All buttons: full width inside modals/sheets, auto-width inline

### Inputs (text fields)
- Height: 52px
- Background: `#FFFFFF`
- Border: 1px `#E5E7EB` default, 2px `#0D9488` focused
- Border radius: 12px
- Label: above the field (NEVER inside as placeholder-only)
- Placeholder text: `#9CA3AF`
- Error state: 2px `#DC2626` border + red helper text below

### Tags / Badges
- Height: 28px, horizontal padding: 12px
- Border radius: full (9999px)
- Category tag: `#F0FDFA` background, `#0D9488` text (DM Sans, 12px, 600)
- Source tag (scanned/email/tap): `#F4F4F5` background, `#6B7280` text
- Business tag: `#0D9488` background, `#FFFFFF` text

### Receipt Card
- Height: 72px, padding: 16px horizontal, 12px vertical
- Border: 1px `#E5E7EB`
- Border radius: 12px
- Left: 40px circle (teal `#0D9488` bg, white letter initial) — merchant logo placeholder
- Center: Merchant name (DM Sans, 15px, 600, `#0C0C0C`) / Date below (DM Sans, 13px, `#6B7280`)
- Right: Amount (Cabinet Grotesk, 17px, 600, `#0C0C0C`) / Category tag below

### Bottom Sheet / Modal
- Border radius: 16px top corners only
- Background: `#FFFFFF`
- Handle bar: 4×36px, `#E5E7EB`, centered at top
- Padding: 24px

## Motion
- **Approach:** Intentional — only animations that aid comprehension or confirm action
- **Scan capture:** Brief white flash (80ms) + receipt card slides in from bottom (250ms, ease-out)
- **Card list load:** Cards stagger in on first load (50ms delay between each, 200ms duration)
- **Tab switch:** Instant — no transition animation on navigation
- **Easing:** Enter: ease-out | Exit: ease-in | Move: ease-in-out
- **Duration:** micro: 80ms | short: 200ms | medium: 300ms | long: 500ms

## Accessibility

- **Touch targets:** Minimum 44×44px for all interactive elements. Scan button is 64px — fine. Receipt card row is 72px — fine. Tab bar icons must have 44px tap area even if icon is smaller.
- **Contrast:** Text `#0C0C0C` on `#FAFAF9` background = 19:1 (exceeds WCAG AA 4.5:1). Muted text `#6B7280` on white = 4.6:1 (passes AA). Teal `#0D9488` on white = 4.5:1 (passes AA minimum — verify with contrast checker before shipping).
- **Colour blindness:** Teal-highlighted unconfirmed OCR fields must also have a non-colour indicator (icon or underline) — don't rely on colour alone.
- **Screen reader (VoiceOver / TalkBack):** Every interactive element needs an `accessibilityLabel`. Receipt cards: "[Merchant name], [amount], [date]". Scan button: "Scan receipt". Tab icons: "Receipts", "Scan", "Search", "Profile".
- **Font scaling:** UI must not break when user has system font size set to large. Test at 2× system font size.
- **Motion sensitivity:** The count-up animation and card stagger must respect `prefers-reduced-motion` — fade in immediately instead of animating.

## Design Risks (deliberate departures from category norms)

1. **Teal accent `#0D9488`** — every competitor uses navy blue or corporate green. Teal is unowned in this category. It reads as confident and modern without signalling "accounting."

2. **Receipt cards styled like bank transactions (Revolut/Wise style)** — merchant logo prominent left, amount in bold right, date small. Not a text list row — a card that respects the receipt. Every competitor shows dense text rows.

3. **Scan screen goes dark** — when the camera is active, all UI drops away. Black background, receipt fills the frame, one large teal capture button. The 10-second scan feels like using a pro tool, not submitting a form.

## Icons
- **Library:** Lucide Icons (`lucide-react-native`) — clean, minimal, consistent weight. Zero extra setup in Expo.
- **Tab icons:** Home (receipt list), Camera (scan), Search, User (profile)
- **Size:** 24px standard, 20px in dense contexts (tags, inline)
- **Color:** `#6B7280` muted (inactive tab), `#0D9488` teal (active tab), `#0C0C0C` (inline icons)

## Monetisation (Launch Scope)
- **No subscription tier at launch** — all features free for all users
- **Spend summaries:** Everyone gets category breakdowns (tools, groceries, fuel, etc.) by default
- **Tax export reports:** Deferred to a later version
- **Upgrade prompt:** Not applicable at launch — remove from Settings screen

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-16 | Teal `#0D9488` as primary accent | Unowned in receipt/expense category; competitors all use blue or green |
| 2026-05-16 | Light mode default | Tradies use phones outdoors — warm white + dark text = highest contrast |
| 2026-05-16 | Cabinet Grotesk for display | Strong geometric personality for merchant names and amounts; underused in fintech |
| 2026-05-16 | DM Sans for body/labels | Clean mobile legibility at small sizes, excellent outdoors |
| 2026-05-16 | Bank-transaction card style | Feels like a payments app, not an expense report tool |
| 2026-05-16 | Dark scan screen | Removes friction from the core 10-second capture action |
| 2026-05-16 | Initial design system created | /design-consultation based on competitive research + tradie user context |
| 2026-05-17 | Spend summary header on Receipt List | Gives tradies instant view of monthly spend without opening individual receipts |
| 2026-05-17 | Gmail skip → nudge card on empty receipt list | Respects user choice while keeping the best feature discoverable |
| 2026-05-17 | OCR fail → retry twice then 2-option bottom sheet | User can fill form manually or get tips; photo ALWAYS saved regardless |
| 2026-05-17 | Server-side Gmail scan + push notification | Tradies can background the app; scan completes on server |
| 2026-05-17 | Celebration screen after first Gmail import | Count-up animation makes the aha moment visceral and shareable |
| 2026-05-17 | Lucide Icons | Default Expo library, clean minimal style, zero extra setup |
| 2026-05-17 | No subscription tier at launch | All features free; tax export reports deferred to later version |
| 2026-05-17 | Spend summaries free for all users | Category breakdowns (tools, groceries, fuel, etc.) available to everyone |
