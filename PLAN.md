# KeepSlip — Product Plan

> "One place for every receipt you will ever have."

---

## What We Are Building

KeepSlip is a universal receipt wallet. Every receipt a person generates — paper, email,
online checkout, in-store tap — ends up in one app, automatically, without the user
hunting for it. Once all receipts are in one place, the app does useful things with them:
spending summaries, expense reports, GST extraction, and BAS preparation.

The core insight is that every receipt solution today is **pull** — you go find your
receipts after the fact. KeepSlip makes receipts **push** — they find you at the moment
of purchase, regardless of where you bought.

**Who it is for:** Tradies, sole traders, freelancers, and everyday consumers in
Australia who lose receipts, hate paper, or spend hours hunting for a receipt at tax time.

**The problem it solves:**
- Paper receipts get lost, fade, and create waste
- Digital receipts are scattered across 20 different retailer apps and inboxes
- Finding one receipt can take hours
- Tax time for a sole trader involves weeks of receipt reconciliation
- No single product has solved the full lifecycle: capture → organise → use

---

## The Competitive Landscape

Research across the global market found no direct full-stack competitor.

| What exists | What it misses |
|---|---|
| **Slyp** (AU, $34.5M raised) — delivers receipts into NAB banking app via card link | No expense reports, no BAS prep, no universal inbox |
| **Dext** (AU/global, acquired by IRIS Dec 2024) — best-in-class OCR for accountants | Consumer-hostile ($31+/month), no at-checkout capture |
| **SimplyWise** (US) — camera scan + Gmail import | No GST/BAS awareness, no at-checkout capture |
| **Pi-xcels** (SG, $4.4M) — NFC tap at checkout, opens receipt in browser | No consumer wallet, no accounting tools |
| **Flux** (UK) — card-linked receipts in banking apps | **DEAD Oct 2022** — delivered receipts beautifully but did nothing with them |
| **Xero + Hubdoc** (AU, 60% market share) — receipt scanning bundled with accounting | Manual scan only, no at-checkout, no universal inbox |
| **Thriday** (AU) — banking + accounting + BAS for sole traders | Manual scan only, no at-checkout capture |

**The gap:** Nobody has combined a universal receipt inbox (all sources) + at-checkout
automatic capture (online and physical) + Australian accounting tools (GST, BAS, Xero).
That is KeepSlip.

**The failure to avoid:** Flux raised $9.1M, reached 1 million users, and shut down in
2022. They built beautiful receipt delivery into banking apps but the receipt sat there
doing nothing. No expense reports. No tax output. No downstream value. Users received
receipts and then forgot about them. The product must do something useful with receipts
once captured.

---

## The Stages

```
STAGE 1          STAGE 2A         STAGE 2B         STAGE 3
Consumer App  →  Online Stores  →  Physical Stores  →  Business Tools
(build users)    (prove push)      (scale push)        (monetise)

No hardware       Shopify/API       NFC device          BAS, Xero,
required          integration       at checkout         expense reports
```

---

## Stage 1 — Consumer App

### What it is

A mobile app (iOS + Android, Expo/React Native) with three ways to capture receipts:

1. **Camera scan** — point camera at any paper receipt. Claude AI reads merchant, date,
   amount, line items, and category. Receipt saved instantly.

2. **Email import** — connect Gmail once. The app scans Inbox and Updates for receipt
   emails (newest to oldest, per user-selected time period). Claude extracts receipt data.
   Already-scanned emails are remembered so repeat runs are fast and incremental.
   Link-only receipts (where the receipt is behind a URL) are flagged for manual upload.

3. **File upload** — pick any PDF or image from the phone. Claude reads it.

### What the app does with receipts

- Home screen: bold spend summary ("This month: $1,240 · 34 receipts") with a receipt
  feed sorted by date, filterable by category
- Receipt detail: merchant, date, amount, line items, category, original file viewer
- Search: filter by merchant, date range, amount, category
- Settings: Gmail connection, account, subscription

### Current state

Fully built and functional. Edge functions deployed on Supabase. Three open pre-ship
items tracked in TODOS.md:
- Email import needs to convert from synchronous (blocking) to background job
- Signed URLs need to be used everywhere (bucket is private)
- ARCHITECTURE.md needs rewriting to reflect actual stack

### Tech stack

- **Frontend:** Expo + React Native (iOS + Android)
- **Backend:** Supabase (Postgres, Edge Functions, Storage, Auth)
- **AI:** Claude Haiku for OCR and receipt extraction (via Anthropic API)
- **Auth:** Supabase Auth + Google OAuth (Gmail connect)
- **Storage:** Supabase private bucket, signed URLs

### Revenue model at Stage 1

Freemium. Free tier with a scan limit. Paid tier ($4.99–$9.99/month) removes limits and
adds expense export. The goal at Stage 1 is user acquisition, not revenue.

### Success metric

10,000 active users with receipts stored before moving to Stage 2A.

---

## Stage 2A — Online Store Integration

### What it is

When a user completes a purchase on a participating online store, a prompt appears on
the order confirmation page: **"Save receipt to KeepSlip — 1 tap."** The receipt is
pushed directly into the user's KeepSlip app. No email hunting. No scanning. The
receipt arrives at the exact moment of purchase.

This is the first **push** model — receipts find the user rather than the user finding
receipts.

### Why online stores first

- Zero hardware cost
- No store visit required
- Shopify App Store already has receipt apps (validates the channel)
- Proves the push model before investing in physical hardware
- Faster to market: weeks, not months

### How it works technically

```
USER CHECKS OUT ON SHOPIFY STORE
          │
          ▼
SHOPIFY ORDER WEBHOOK fires to KeepSlip API
          │
          ▼
KeepSlip creates receipt record (merchant, date, amount, items)
          │
          ▼
ORDER CONFIRMATION PAGE shows "Save to KeepSlip" button
          │
    ┌─────┴──────┐
    ▼            ▼
USER TAPS    USER IGNORES
    │
    ▼
KeepSlip checks: is this user's email linked to a KeepSlip account?
    │
  ┌─┴──────────────┐
  ▼                ▼
LOGGED IN USER   NEW USER
receipt saved    "Sign up to save this receipt"
instantly        (acquisition moment)
```

**Integration points to build:**
1. **Shopify app** — listed on Shopify App Store, installed by merchants. Sends order
   data to KeepSlip webhook. Adds "Save to KeepSlip" component to order confirmation page.
2. **WooCommerce plugin** — same model for WordPress/WooCommerce stores.
3. **Generic webhook API** — any e-commerce platform can POST order data to KeepSlip.
   Documentation-first approach for direct integrations.
4. **Browser extension (future)** — detects order confirmation pages on any site
   (Amazon, eBay, etc.) and prompts the user to save the receipt. Does not require
   merchant participation.

### What the store gets

For merchants installing the Shopify app:
- **Reduced customer service cost:** fewer "I can't find my receipt" support tickets
- **Return rate reduction:** customers with easy receipt access are more confident buying
- **Opt-in analytics (future):** aggregated, anonymised data on customer spending
  patterns within their store (requires explicit user opt-in)

The Shopify app is free for merchants to install. KeepSlip's revenue from merchants
comes in Stage 3 (data insights, premium integrations).

### What the user gets

- Receipt appears in the app immediately after purchase
- No email to search through, no retailer app to download
- Becomes the behaviour: "I bought it, it's in KeepSlip"

### Success metric

100 Shopify stores integrated. 50,000 receipts captured via online integration.
User retention improves because receipts arrive automatically, not just when users
remember to scan.

---

## Stage 2B — Physical Store NFC Device

### What it is

A small device that sits inline between the POS terminal and the existing receipt
printer at any physical checkout. The printer keeps working exactly as it always has —
paper receipts still print, nothing changes for the store. Simultaneously, the KeepSlip
device reads the same data going to the printer and stores the receipt digitally.

After the transaction completes, the device's LED activates and a small sign reads
**"Tap for e-receipt."** The customer taps their phone on the device. The receipt opens
instantly in the phone's browser — with no internet connection, no app, and no account
required. If the customer has the KeepSlip app, it saves automatically. If they don't,
they see the receipt in the browser and optionally sign up.

This is the **pull receipts from the physical world** phase.

### The key architectural difference from every competitor

Every other NFC or digital receipt player — Slyp, Flux, ReceiptHero, Pi-xcels — works
through the banking system or requires internet to fetch the receipt from a server.
KeepSlip's device works at the printer level, not the bank level.

| Competitor | How it works | Requires |
|---|---|---|
| Slyp | Card-linked via bank | Specific bank account |
| Flux (dead) | Card-linked via bank | Specific bank account |
| Pi-xcels | NFC → URL → fetches from server | Internet at tap time |
| NOUMI | NFC → opens their app | App installed |
| **KeepSlip** | **Printer data → NFC tag → browser** | **Nothing** |

No bank. No internet. No app. Just tap.

### How it works technically

```
POS TERMINAL
     │
     ├── existing cable ──► RECEIPT PRINTER  (unchanged — paper still prints)
     │
     └── same ESC/POS data ──► KEEPSLIP DEVICE
                                     │
                                     ▼
                              parses receipt data
                              (merchant, items, amounts, date)
                                     │
                                     ▼
                              writes full receipt as HTML
                              into NFC tag memory (offline)
                                     │
                              LED activates: "Tap for e-receipt"
                                     │
                              CUSTOMER TAPS PHONE
                                     │
                              phone reads NFC tag directly
                              (no network call, no server)
                                     │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                   KEEPSLIP USER          NON-USER
                   receipt saved          receipt opens in browser
                   to app automatically   "Save to KeepSlip" prompt
                                          (acquisition moment)
```

**Why offline works:**
NFC tags support NDEF records — data stored directly on the physical tag. A receipt
encoded as a simple HTML page is 2–5KB. NFC Type 4 tags hold up to 32KB. The entire
receipt (all line items, amounts, merchant, date) fits on the device and is delivered
to the phone in the tap — no network request, no latency, no dependency on internet
availability at the store.

**How the device reads printer data:**
Receipt printers use the ESC/POS protocol — an open standard used by virtually every
receipt printer on the market (Epson, Star Micronics, Citizen, Bixolon). The KeepSlip
device sits inline on the cable between the POS and the printer (USB, serial, or
ethernet). It reads the ESC/POS data stream, parses the text content, and extracts
the structured receipt. The printer receives the identical data stream unchanged —
paper prints as normal.

No POS software change. No POS vendor relationship required. Works with any POS
system on day one.

### What the store gets

- **Zero disruption:** Existing printer keeps working. No retraining of staff. No
  change to checkout workflow. Plug device in, done.
- **Customer satisfaction:** Modern checkout experience — customers who prefer
  digital get it, customers who prefer paper still get it
- **Reduced receipt disputes:** Customers have a verifiable digital record, so
  returns and "I never got a receipt" situations are easier to resolve
- **Opt-in analytics:** Anonymised, aggregated data on what customers buy
  (category, frequency, basket size) — shared only with user consent.
  Retailer pays a monthly fee for this insight.
- **No risk:** Pilot for free, no lock-in contract. Paper still works if the
  device ever has an issue.

**The sales pitch to stores:**
"Plug this into your existing printer cable. Paper still prints. Customers who want
a digital receipt tap their phone. You get optional data insights on your customers.
It costs you nothing to try."

### What the user gets

- Tap once at any KeepSlip-equipped store — receipt is in the app or browser
  before they've put their wallet away
- No app required to receive the receipt (browser works), but app users get
  automatic saving
- Works with zero internet on the customer's phone at tap time

### Hardware

The KeepSlip device:
- Inline cable adapter with NFC transmitter (fits between POS and printer cable)
- Supports USB, serial (RS-232), and ethernet printer connections
- NFC Type 4 tag with 32KB storage (refreshed after each transaction)
- LED strip: grey = idle, white pulse = receipt ready, green flash = tapped
- Small printed sign on top: "Tap here for e-receipt"
- Powered by USB from the POS terminal — no separate power cable
- WiFi or 4G SIM for optional cloud sync (receipt analytics, app user auto-save)
- If WiFi/internet is unavailable, offline tap still works — cloud sync queues
  and retries when connection restores

### Distribution strategy

- Start with independent cafes, food trucks, and small retailers (no procurement
  process, owner makes the decision on the spot)
- Partner with POS resellers and hospitality IT installers who already service
  these stores — they install the device as part of a site visit
- Approach Eftpos Australia and payment terminal distributors for co-distribution
  at scale
- Chain retailers (Coles, Woolworths, Officeworks) require enterprise sales —
  approach after 500+ independent sites proven

### Success metric

1,000 physical store locations installed. Receipt tap rate above 25% at equipped
checkouts (1 in 4 customers taps). Proves consumer behaviour change without requiring
internet, app, or bank account.

---

## Stage 3 — Business and Accounting Tools

### What it is

Once all receipts are in one place — from camera scan, email, online stores, and
physical checkout — the app becomes the foundation for Australian business compliance
tools. Every dollar a sole trader or small business has spent is already verified,
categorised, and timestamped. The accounting work that used to take weeks becomes
automated.

### What gets built

**For sole traders and micro-businesses:**

- **GST extraction:** Every receipt is automatically flagged for GST-eligible amounts.
  Claude reads the receipt and determines if GST was charged based on merchant type
  and line items. Running GST total is always visible.

- **BAS preparation:** At the end of each quarter, the app generates a draft BAS
  (Business Activity Statement) based on all captured receipts. User reviews and
  confirms. One-tap lodge to ATO (via ATO's digital API — already available to
  registered tax software providers).

- **Business vs personal split:** "Mark as Business" toggle per receipt. Business
  expense total is tracked separately from personal spending. This is the most
  common request from tradies — they want to know what they can claim.

- **Tax time export:** Generate a PDF or CSV of all business receipts in a date range,
  formatted for a bookkeeper or accountant. Clean, sorted by category, with totals.
  The accountant receives a file they can work with directly instead of a shoebox
  of photos.

- **Xero integration:** Sync verified receipts and their extracted data directly into
  the user's Xero account. Each receipt becomes a verified transaction with the
  original image attached.

- **MYOB integration:** Same sync for MYOB users.

**For small businesses (2–20 employees):**

- **Multi-user accounts:** Employees scan or tap receipts, they flow into the employer's
  KeepSlip account. Owner reviews and approves or rejects each expense.

- **Approval workflows:** Employee submits receipt → manager gets notification →
  approve or reject with a note → employee is notified. Simple, mobile-first.

- **Per-project coding:** Receipt tagged to a job or project code. Tradies can see how
  much each job cost in materials.

- **Corporate card integration (future):** Connect to a business bank card. Every card
  transaction is automatically matched to a receipt. Missing receipts are flagged
  for follow-up.

### Revenue model at Stage 3

This is where the business becomes profitable.

| Tier | Price | Target |
|---|---|---|
| Free | $0/month | Consumer, light use, up to 20 receipts/month |
| Solo | $9.99/month | Freelancers and sole traders, unlimited receipts + BAS prep |
| Business | $24.99/month | Small businesses, multi-user + approval workflows |
| Accountant (future) | $99+/month | Accountants managing multiple clients |

At 10,000 Solo subscribers, monthly recurring revenue is $99,900.

Additionally: **store data analytics** revenue from retailers who want anonymised
customer spending insights (opt-in only). This is a B2B SaaS revenue stream layered
on top of the consumer subscription.

### Competitive position at Stage 3

| Competitor | Their gap | KeepSlip advantage |
|---|---|---|
| Xero + Hubdoc | Manual scan only, no at-checkout | All receipts already captured, no manual work |
| Dext | Accountant-facing, $31+/month | Consumer-friendly, built around at-checkout capture |
| Thriday | Manual scan only, full banking product (high lock-in) | Receipt-first, integrates with any bank |
| ATO myDeductions | Basic, no accounting output | Full BAS prep + Xero sync |

The moat is not the accounting tools themselves — Xero does accounting. The moat is
that every receipt is already in KeepSlip before the user opens the accounting tool.
After two years of using KeepSlip, a sole trader has a verified, categorised, complete
record of every dollar they spent. No competitor can replicate that history.

### Success metric

5,000 paid subscribers at Stage 3 launch. BAS lodgment feature used by 1,000+ users
in first quarter available.

---

## The Full Flywheel

```
MORE USERS
    │
    ▼
MORE VALUE TO STORES (more consumers tap)
    │
    ▼
MORE STORES INSTALL DEVICE
    │
    ▼
MORE RECEIPTS CAPTURED AUTOMATICALLY
    │
    ▼
MORE USERS STAY (app is genuinely complete, no other tool needed)
    │
    ▼
MORE BUSINESS ACCOUNT CONVERSIONS
    │
    └──────────────── MORE USERS
```

Each stage feeds the next. Stage 1 proves users want a receipt inbox. Stage 2A proves
push model works without hardware. Stage 2B scales push to the physical world. Stage 3
converts captured receipts into business value and sustainable revenue.

---

## What We Are Not Building

- A payments product. We capture receipts from existing payments. We do not process
  payments or hold money.
- A corporate expense management tool (Expensify, Concur territory). Our primary user
  is an individual, not a corporate finance team.
- A loyalty/rewards platform (Fetch Rewards territory). Receipts are not a mechanism
  to earn points — they are a financial record.
- A bank account. Receipts sync to banks (Xero/MYOB), not the other way around.

---

## Key Risks

| Risk | Mitigation |
|---|---|
| Slyp signs exclusive deals with major retailers before Stage 2B | Start with small/independent retailers where Slyp has no presence. Position KeepSlip as the consumer wallet that receives Slyp receipts |
| Apple or Google builds a receipt wallet as a platform feature | Deepen the accounting layer — a platform feature will never do BAS prep or Xero sync |
| ESC/POS parsing fails for unusual printer configurations | ESC/POS is an open standard used by 95%+ of receipt printers. Edge cases (non-standard encodings) get added to the parser incrementally. Paper printer always works regardless. |
| Consumer adoption of NFC tap at checkout is low | Gamification (first tap reward), prominently displayed device, staff training. NOUMI achieved 27.5% improvement with Golden Ticket feature |
| Three-sided cold start at Stage 2B (store + user + device) | Stage 1 builds users first. Stage 2A proves push model with no hardware. Stage 2B hardware enters a market with existing user base |
| ATO changes BAS requirements | Design BAS module as a configurable rule set, not hardcoded. Monitor ATO developer portal for updates |

---

## Timeline

| Stage | Target | Key Deliverable |
|---|---|---|
| Stage 1 — Ship ready | Weeks 1–4 | Background job email import, signed URLs fixed, ARCHITECTURE.md updated |
| Stage 1 — User growth | Months 1–6 | 10,000 active users |
| Stage 2A — Shopify | Months 3–6 | Shopify app live in App Store, 100 merchant installs |
| Stage 2A — WooCommerce + API | Months 6–9 | Open webhook API, WooCommerce plugin |
| Stage 2B — Prototype device | Months 6–9 | 10 stores in pilot, NFC device hardware V1 |
| Stage 2B — Rollout | Months 9–18 | 1,000 store locations |
| Stage 3 — Solo tools | Months 9–12 | GST extraction, BAS prep, tax export |
| Stage 3 — Business tools | Months 12–18 | Multi-user, Xero sync, approval workflows |
| Stage 3 — Paid growth | Months 18–24 | 5,000 paid subscribers |

---

## 10-Year Picture

In ten years, KeepSlip is not a receipt app. It is the financial memory layer for
independent workers in Australia.

Every purchase flows in automatically. When tax time arrives, the BAS is already
drafted. The accountant receives a clean, verified file. The 40-hour receipt hunt
becomes a one-hour review. Warranties, insurance claims, and business expense
deductions are handled without any manual effort.

The product expands beyond receipts into the broader "prove what you spent" category:
invoices sent, contracts signed, warranties on equipment, insurance documents. Everything
a tradesperson or small business needs to substantiate their financial life in one place.

At that scale KeepSlip becomes infrastructure — accounting platforms, insurance providers,
and tax tools connect to it via API to pull verified spending records with user permission.
The data is more trusted than a bank statement because it includes itemised line-item
detail, not just totals.

The moat is the scan history. After two years of using KeepSlip, a user has a complete,
verified record of their financial life that no competitor can replicate from scratch.
That is a durable business.
