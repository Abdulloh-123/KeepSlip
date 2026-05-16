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

## UX Flow

```
Onboarding → Receipt List
                ↓ (tab: scan)
           Scan Screen → processing → Receipt Detail
                ↓ (tab: search)
           Search Results → Receipt Detail
                ↓ (gmail import, from settings or onboarding)
           Gmail Connect → Scanning → Receipt List (populated)
```

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

## Motion
- **Approach:** Intentional — only animations that aid comprehension or confirm action
- **Scan capture:** Brief white flash (80ms) + receipt card slides in from bottom (250ms, ease-out)
- **Card list load:** Cards stagger in on first load (50ms delay between each, 200ms duration)
- **Tab switch:** Instant — no transition animation on navigation
- **Easing:** Enter: ease-out | Exit: ease-in | Move: ease-in-out
- **Duration:** micro: 80ms | short: 200ms | medium: 300ms | long: 500ms

## Design Risks (deliberate departures from category norms)

1. **Teal accent `#0D9488`** — every competitor uses navy blue or corporate green. Teal is unowned in this category. It reads as confident and modern without signalling "accounting."

2. **Receipt cards styled like bank transactions (Revolut/Wise style)** — merchant logo prominent left, amount in bold right, date small. Not a text list row — a card that respects the receipt. Every competitor shows dense text rows.

3. **Scan screen goes dark** — when the camera is active, all UI drops away. Black background, receipt fills the frame, one large teal capture button. The 10-second scan feels like using a pro tool, not submitting a form.

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
