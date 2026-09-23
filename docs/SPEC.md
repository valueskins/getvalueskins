# ValueSkins - Product and Technical Spec (v2)

**Version:** 2.0 (supersedes the Sep 23, 2026 build prompt)
**Date:** Sep 24, 2026
**Owner:** CTO (Melove Gupta)
**Status:** Ready to build. Items marked **[CONFIRM]** need sign-off from the co-founder before the prompt that uses them.

---

## 0. What changed from v1 and why

| # | v1 said | v2 says | Why |
|---|---|---|---|
| 1 | `amount INT` in rupees | All money is integer **paise** (`BIGINT`) | ₹2,734.50 cannot be stored as an INT. Razorpay works in paise. |
| 2 | Flat ₹750 + GST commission, Razorpay fees absorbed | Commission = `max(₹750, 5% of budget)` + 18% GST, minimum budget ₹5,000 **[CONFIRM]** | A flat ₹750 with about 2% fees absorbed loses money on every deal above about ₹37,500. The formula gives the same ₹885 on a ₹10,000 deal, so every v1 example still holds. |
| 3 | "No escrow", but ValueSkins collects and pays out via Payouts | **Razorpay Route**: each creator is a Route linked account, and advance and final payments are transferred to it automatically | Moving third-party money through your own account with generic payouts is the wrong product. Route is Razorpay's product for marketplaces. |
| 4 | Bank details for everyone, "Razorpay stores" | Only creators give payout details, through Route linked-account onboarding (legal name, PAN, bank, IFSC). Brands give billing details for GST. We never store PAN or full bank numbers. | Brands pay by card/UPI/netbanking and never need a bank account on file. Creators need KYC to receive transfers. |
| 5 | Webhook events `payment.authorized` / `payment.failed` | `payment.captured`, `order.paid`, `payment.failed`, plus Route transfer and linked-account events. Idempotent processing. | Authorized is not money received. Razorpay retries webhooks, so duplicates must be harmless. |
| 6 | "Production only, no test mode" | Build and test in **test mode**. Live keys exist only in the production environment. | Testing a 3-payment flow with real money creates real refunds and real GST invoices for every bug. |
| 7 | Instagram type auto-detected from followers, immutable | User **chooses** Creator or Brand once at onboarding (pre-selected from Instagram `account_type`), then it is locked. A wrong choice is fixed by hand in the database on request. | Follower count cannot tell a brand from a creator. |
| 8 | Instagram OAuth for everyone | **Instagram API with Instagram Login** (Business Login for Instagram). Only Professional (Business or Creator) accounts can sign in. Needs Meta app review. | The old Basic Display API is gone. Personal accounts are not supported by the current API. |
| 9 | Status enum missing CANCELLED and CLOSED_FOR_APPLICATIONS | CANCELLED added. "Applications closed" is **derived** from `application_deadline`, not a status. | Fewer states, no cron needed to close applications. |
| 10 | "Reject Deal" allowed at CONTENT_UPLOADED | Removed. After the advance is paid, only an **admin** can cancel, through dispute resolution. | Contradicted "no cancellation after advance". Also gives a way out when a creator disappears with the advance. |
| 11 | "No external services" | Transactional email through **Resend** (single provider, own domain). | You cannot send 15 kinds of email reliably from nothing. |
| 12 | Disputes: user emails a Gmail address, "auto-CC both" | In-app **Raise dispute** form. The server emails valueskinsfounder@gmail.com with both parties CC'd, and stores it. Direct email still works. | A direct email to Gmail cannot be auto-CC'd by us. |
| 13 | Upload limit 5 per deal, and unlimited revisions | Upload limit 20 per deal (anti-abuse). Notice suggesting a dispute after 5 revisions. | 5 uploads capped revisions at 4, which contradicted "unlimited". |
| 14 | `valueskins.vercel.app` + `api.valueskins.render.com` | `valueskins.com` (Vercel) + `api.valueskins.com` (Render) | Same-site cookies. Cross-site cookies between vercel.app and onrender.com break in Safari and are fragile everywhere. |
| 15 | Razorpay generates the GST invoice | ValueSkins generates its own GST tax invoice for the commission, with sequential numbering | Razorpay Invoices are payment requests, not a tax invoice for a Checkout payment already made. |
| 16 | Render (unspecified plan) | Paid always-on Render web service and paid Postgres with backups | Free instances sleep, which kills WebSockets and cron jobs. |
| 17 | "Creator gets refund if payment already made (only before commission)" | Removed. Creators never pay anything. | It described a case that cannot happen. |

---

## 1. Product in one paragraph

A brand posts a deal (for example "3 Instagram posts for ₹10,000"). Creators apply. The brand confirms one creator. The brand pays ValueSkins' commission (₹885). The brand pays the creator a 30% advance (₹2,734.50), which Razorpay Route transfers to the creator. The creator uploads the content as a Google Drive link. The brand requests changes or approves. The brand pays the remaining 70% (₹6,380.50), which Route transfers to the creator. Both parties get a Deal Report (ADP) PDF with all invoices and proof of delivery. The brand's total is exactly the budget. No chat, no negotiation.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Repo | pnpm monorepo: `apps/web`, `apps/api`, `packages/shared` |
| Language | TypeScript, `strict: true`, everywhere |
| Frontend | Next.js (App Router, current stable), React, Tailwind CSS, TanStack Query, socket.io-client. Hosted on **Vercel** at `https://valueskins.com` |
| Backend | Node.js 22 LTS, Express 5, Socket.io, Zod, pino. Hosted on **Render** (paid, always-on, single instance) at `https://api.valueskins.com` |
| Database | PostgreSQL on **Render** (paid plan with backups). Drizzle ORM + drizzle-kit migrations |
| Payments | Razorpay: Standard Checkout + Orders + **Route** (linked accounts, transfers) |
| Auth | Instagram API with Instagram Login. Server-side sessions in Postgres, httpOnly cookie |
| Email | Resend, sending from `notifications@valueskins.com` (SPF + DKIM on the domain) |
| PDF | PDFKit, generated on demand, never stored |
| Jobs | node-cron inside the API process, each job guarded by a Postgres advisory lock |
| Rate limiting | rate-limiter-flexible with the Postgres store |
| Tests | Vitest. API integration tests run against a real Postgres (docker compose locally, service container in CI) |
| CI | GitHub Actions: typecheck, lint, test on every PR |
| File storage | None. Google Drive links for content, Instagram URLs for profile pictures |

`packages/shared` holds: money math, the deal state machine definition, Zod request/response schemas, enums, and UI copy constants. Both apps import it so the numbers and rules can never disagree.

---

## 3. Core constraints (the product rules)

1. One brand and one creator per deal. No multi-creator deals, no creator-creator collabs.
2. Real-time deal feed: new deals appear for creators instantly over WebSocket.
3. No niches, no categories, no filtering. All open deals are visible to all creators.
4. No negotiation. The budget is final.
5. No chat. The only brand-to-creator text is revision feedback.
6. Money moves brand -> Razorpay -> creator via Route. ValueSkins keeps only the commission.
7. Account type (Creator or Brand) is chosen once at onboarding and is locked.
8. Instagram is the profile. It is fetched automatically and refreshed daily.
9. Creators set up payouts once (Route linked account). Brands set up billing details once.
10. A verified email is required before using the marketplace.
11. The virtual resume is visible on hover over any user, everywhere.
12. Everyone is equal: no tiers, no levels, no badges.
13. No length limits on deal descriptions.
14. Deal communication happens by email, and every email about a deal is visible to both parties on the deal page.
15. No phone numbers shown or used for communication. (See 7.2 about Razorpay possibly requiring one for KYC.)
16. Web app only, responsive for desktop and tablet, usable on mobile browsers.
17. Commission is non-refundable once paid.
18. After the advance is paid, neither party can cancel. Only an admin can, through a dispute.
19. Plain black UI. No gradients, no shadows, no emojis, no em dashes, no marketing language.

---

## 4. Money

### 4.1 Rules

- All amounts are stored and computed as **integer paise** (`BIGINT` in Postgres, `number` in TS, validated as safe integers). Never floats.
- Brands enter the budget in **whole rupees**. The server converts it to paise.
- All money math lives in `packages/shared/src/money.ts`. Nothing else computes amounts.
- The breakdown is computed **once, at publish**, and frozen on the deal row. Later config changes never affect published deals.

### 4.2 Formula **[CONFIRM commission rate and minimum]**

Config (in `packages/shared/src/config.ts`):

```
MIN_BUDGET_PAISE          = 5_000_00     // ₹5,000
COMMISSION_FLAT_PAISE     = 750_00       // ₹750
COMMISSION_PERCENT_BPS    = 500          // 5.00%
GST_RATE_BPS              = 1800         // 18%
ADVANCE_PERCENT           = 30
```

Computation:

```
commission_base  = max(COMMISSION_FLAT_PAISE, round_half_up(budget * COMMISSION_PERCENT_BPS / 10000))
commission_gst   = round_half_up(commission_base * GST_RATE_BPS / 10000)
commission_total = commission_base + commission_gst
creator_amount   = budget - commission_total
advance          = round_half_up(creator_amount * ADVANCE_PERCENT / 100)
final            = creator_amount - advance
```

Invariant (tested): `commission_total + advance + final == budget`, all positive.

Worked example, budget ₹10,000 (1,000,000 paise):

| Item | Paise | Rupees |
|---|---|---|
| Commission base | 75,000 | 750.00 |
| GST 18% | 13,500 | 135.00 |
| Commission total (Payment 1) | 88,500 | 885.00 |
| Creator amount | 911,500 | 9,115.00 |
| Advance 30% (Payment 2) | 273,450 | 2,734.50 |
| Final 70% (Payment 3) | 638,050 | 6,380.50 |
| Brand pays in total | 1,000,000 | 10,000.00 |

Worked example, budget ₹50,000: commission base ₹2,500, GST ₹450, total ₹2,950, creator ₹47,050, advance ₹14,115, final ₹32,935.

### 4.3 Razorpay fees

ValueSkins absorbs Razorpay's fees. They are never shown to or charged to users, except as an informational line in the ADP.

**[CONFIRM in test mode, Prompt 12]** Route rules say a transfer plus its fees cannot exceed the captured payment. If transferring the full advance/final to the creator fails because of this, choose one:
- (A) Transfer from ValueSkins' Razorpay balance with a Direct Transfer, and keep a small float in the balance.
- (B) Add the gateway fee to what the brand pays for Payments 2 and 3 (breaks "brand pays exactly the budget").
Prompt 12 must test this with a real test-mode transaction and stop and report if the full transfer fails.

---

## 5. Deal lifecycle

### 5.1 Statuses

`DRAFT, OPEN, CONFIRMED, COMMISSION_PAID, ADVANCE_PAID, CONTENT_UPLOADED, REVISION_REQUESTED, APPROVED, COMPLETED, CANCELLED`

Derived flags (not statuses):
- `applications_open` = `status == OPEN && now < end_of_day_IST(application_deadline)`
- `content_overdue` = `status in (ADVANCE_PAID, REVISION_REQUESTED) && now > end_of_day_IST(content_upload_deadline)`

### 5.2 Transitions (the only allowed ones)

| From | To | Who | Trigger |
|---|---|---|---|
| DRAFT | OPEN | Brand | Publish (validates fields, computes and freezes money breakdown) |
| DRAFT | (deleted) | Brand | Delete draft |
| OPEN | CONFIRMED | Brand | Confirm one application. All other applications become REJECTED in the same transaction. Creator must have an ACTIVE payout account. |
| OPEN | CANCELLED | Brand | Cancel, free |
| CONFIRMED | COMMISSION_PAID | System | Commission payment captured (webhook) |
| CONFIRMED | CANCELLED | Brand | Cancel, free |
| COMMISSION_PAID | ADVANCE_PAID | System | Advance payment captured and transfer created |
| COMMISSION_PAID | CANCELLED | Brand | Cancel. Commission is kept. UI states this before confirming. |
| ADVANCE_PAID | CONTENT_UPLOADED | Creator | Upload a Google Drive link |
| CONTENT_UPLOADED | REVISION_REQUESTED | Brand | Send feedback |
| CONTENT_UPLOADED | APPROVED | Brand | Final approval |
| REVISION_REQUESTED | CONTENT_UPLOADED | Creator | Upload a new link |
| APPROVED | COMPLETED | System | Final payment captured and transfer created |
| ADVANCE_PAID, CONTENT_UPLOADED, REVISION_REQUESTED, APPROVED | CANCELLED | Admin only | Dispute resolution. Records a resolution note and any manual refund reference. |

Everything else is rejected with `409 INVALID_TRANSITION`. Creators cannot cancel at any stage. The cancel button is not rendered from ADVANCE_PAID onward.

### 5.3 How transitions are implemented

- One function, `transitionDeal(dealId, from, to, actor, patch)`, in `apps/api/src/deals/stateMachine.ts`.
- It runs in a single DB transaction: `UPDATE deals SET status = :to, ... WHERE id = :id AND status = :from RETURNING *`. Zero rows means someone else changed it first, so it returns 409.
- The same transaction inserts a `deal_events` row (from, to, actor, note).
- After commit, it emits the WebSocket event and queues the emails. Side effects never run inside the transaction.
- The allowed-transition table lives in `packages/shared` and is covered by exhaustive tests.

### 5.4 Deadlines

- Three dates: `application_deadline < content_upload_deadline <= deal_deadline`. All must be in the future at publish time.
- Dates are calendar dates interpreted in IST. A deadline means 23:59:59 IST on that date.
- After the application deadline, Apply is disabled with the message "Applications closed". The brand can still confirm an existing applicant.

### 5.5 Phases (user-facing)

1. **Brand posts deal.** Form: title, description (with template, see section 9), budget in rupees, the three deadlines. Brand sees the full payment breakdown before publishing. Publish sets status OPEN, broadcasts `deal:new` to all connected creators, sends Email 1.
2. **Creators apply.** Feed shows brand name (hover for virtual resume), budget, creator amount, deadlines, description. Apply needs an ACTIVE payout account. If it is missing, the button reads "Set up payouts to apply" and links to settings.
3. **Brand confirms a creator.** Application list with hover resumes. Confirm on one creator, and the rest are auto-rejected.
4. **Payment 1, commission.** "Pay commission: ₹885.00". Razorpay Checkout. On capture: COMMISSION_PAID, tax invoice issued, Email 4.
5. **Payment 2, advance.** "Pay advance: ₹2,734.50". On capture: transfer to the creator's linked account, ADVANCE_PAID, Email 5.
6. **Creator uploads content.** Countdown to the upload deadline. Paste a Google Drive link (validated as `https://drive.google.com/...` or `https://docs.google.com/...`). CONTENT_UPLOADED, Email 6.
7. **Brand reviews.** Either "Suggest changes" (text, REVISION_REQUESTED, Email 7) or "Final approval" (APPROVED, Email 8). After 5 revisions, both see: "This deal has had 5 revisions. If you cannot agree, raise a dispute."
8. **Payment 3, final.** "Pay final: ₹6,380.50". On capture: transfer, COMPLETED, Email 9, then ADP ready, Email 10.
9. **ADP.** Downloadable by both parties from the deal page at any time after completion. Generated on demand.

---

## 6. Authentication and onboarding

### 6.1 Instagram login

- Product: **Instagram API with Instagram Login** (Business Login for Instagram), host `graph.instagram.com`, scope `instagram_business_basic`.
- Only Instagram Professional accounts (Business or Creator) can sign in. If login fails for this reason, show: "ValueSkins needs an Instagram Professional account. You can switch for free in Instagram settings: Account type and tools, Switch to professional account."
- Flow:
  1. Web "Continue with Instagram" goes to `GET https://api.valueskins.com/api/auth/instagram/start`. The API sets a signed `state` cookie and redirects to Instagram's authorize URL.
  2. Instagram redirects to `GET /api/auth/instagram/callback?code&state`. The API verifies state, exchanges the code for a short-lived token, exchanges that for a long-lived token (about 60 days), and fetches the profile.
  3. Upsert the user by Instagram user id. Create a session. Redirect to `https://valueskins.com/onboarding` if onboarding is incomplete, else `/home`.
- Profile fields fetched from `/me`: `user_id, username, name, account_type, profile_picture_url, followers_count, follows_count, media_count, biography`. Verify the exact field list against Meta's docs at build time. If `biography` is not available on `/me`, drop it.
- Engagement rate = average of (likes + comments) over the latest 12 media, divided by followers, as a percentage with 2 decimals. Null if fewer than 3 posts or 0 followers.
- The long-lived token is stored **encrypted** (AES-256-GCM, key from env `TOKEN_ENCRYPTION_KEY`). It is refreshed when it has less than 10 days left.
- Profile is refreshed on every login and by the daily cron.
- Meta app requirements, built into the product: `/privacy` and `/terms` pages on the web app, a **data deletion callback** (`POST /api/meta/data-deletion`, returns a confirmation code and status URL) and a **deauthorize callback** (`POST /api/meta/deauthorize`). Both verify Meta's `signed_request`.

### 6.2 Dev login (non-production only)

Meta app review takes weeks, and building cannot wait. In development and staging, `POST /api/dev/login` accepts `{ username, role }` and creates or logs in a fake user with fake Instagram data. It is registered only when `NODE_ENV !== 'production'` **and** `ENABLE_DEV_LOGIN=true`. A startup check crashes the process if both `NODE_ENV=production` and `ENABLE_DEV_LOGIN=true` are set.

### 6.3 Sessions and security

- Session = random 32-byte token in an httpOnly, Secure, `SameSite=Lax` cookie with `Domain=.valueskins.com`. Only its SHA-256 hash is stored in `sessions`. 30-day expiry, sliding.
- Every mutating request must carry an `Origin` header equal to `WEB_ORIGIN` (`https://valueskins.com` in production), checked server side as CSRF protection, in addition to SameSite. Webhook and Meta callback routes are exempt (they verify signatures instead).
- Logout deletes the session row.
- Socket.io authenticates with the same cookie during the handshake.

### 6.4 Onboarding (all steps required, in order)

1. **Confirm profile.** Show the fetched Instagram data. "Is this you?" Continue.
2. **Choose account type.** Creator or Brand. Pre-selected: Instagram `MEDIA_CREATOR` means Creator, `BUSINESS` means Brand. Warning: "You cannot change this later." Stored once, locked.
3. **Email.** Required. The server sends a verification link (token valid 24 hours, single use, only the hash stored). The user must click it before continuing. Changing email later re-runs verification.
4. **Type-specific setup.**
   - Creator: **Payout setup** (section 7.2). Creators may browse deals before finishing, but cannot apply until the payout account is ACTIVE.
   - Brand: **Billing details**: billing name, billing state (for GST place of supply), billing address, GSTIN (optional, validated format). Required before publishing a deal.
5. **Marketplace.**

---

## 7. Razorpay

### 7.1 Modes and keys

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` come from env.
- Local and staging use **test keys**. Production uses live keys. The API logs the mode (`test` or `live`) at startup, and refuses to start if `NODE_ENV=production` with a test key, or non-production with a live key.
- Route must be enabled on the ValueSkins Razorpay account (request it from Razorpay) in both test and live mode.

### 7.2 Creator payout setup (Route linked account)

- Form fields: legal name, PAN, bank account number, IFSC, account holder name, and a phone number **only if Razorpay's linked-account API requires it** (verify at build time). If a phone is required, it is sent to Razorpay and not stored by us, and is never shown or used anywhere else.
- Server calls: create linked account (`POST /v2/accounts`, type `route`, `reference_id` = our user id), create stakeholder, request Route product configuration, update it with settlement bank details.
- We store only: `razorpay_account_id`, `razorpay_stakeholder_id`, `razorpay_product_id`, `status`, `bank_last4`, `ifsc`, `requirements` (JSON from Razorpay), timestamps. **Never PAN, never the full account number.**
- Status: `PENDING` -> `ACTIVE`, or `NEEDS_CLARIFICATION` (show Razorpay's requirement reasons and let the creator fix them), or `SUSPENDED`. Updated from webhooks, plus a "Refresh status" button that fetches it from Razorpay.
- Creator must confirm: "I agree that Razorpay will store my bank and KYC details to pay me."

### 7.3 Payments

- For each of the 3 payments, the server creates a Razorpay Order: amount from the frozen breakdown, `currency: INR`, `receipt` = `<dealShortId>-<type>`, notes `{ deal_id, type }`, automatic capture.
- Advance and final Orders include a `transfers` array: the full advance/final amount to the creator's linked account, `on_hold: false`, notes `{ deal_id, type }`. (Subject to the 4.3 check.)
- Only one open Order per deal per payment type. If one exists and is unpaid, reuse it.
- The endpoint checks: the caller is the deal's brand, and the deal is in the correct status (CONFIRMED for commission, COMMISSION_PAID for advance, APPROVED for final).
- Frontend opens Razorpay Checkout with the Order id. On the Checkout success handler it calls `POST /api/payments/verify` with `razorpay_order_id, razorpay_payment_id, razorpay_signature`. The server verifies the signature.
- **Both** the verify endpoint and the webhook call the same idempotent function `markPaymentCaptured(orderId, paymentId)`. Whichever arrives first performs the transition. The second is a no-op.
- Webhook endpoint `POST /api/webhooks/razorpay`:
  - Uses the raw body for HMAC-SHA256 signature verification with the webhook secret. Invalid signature returns 400.
  - Deduplicates on the `x-razorpay-event-id` header, stored in `webhook_events`. Duplicates return 200 immediately.
  - Handles: `payment.captured`, `order.paid`, `payment.failed`, Route transfer events (processed, failed, reversed), linked-account and product activation events. Verify exact event names in the Razorpay dashboard at build time.
  - Always returns 200 quickly after storing the event. Processing errors are recorded on the event row and alerted to the admin by email, never retried in a loop.
- A failed transfer (after payment was captured) sets the transfer row to FAILED, emails the admin, and shows the admin a "Retry transfer" button. The deal still advances, because the brand did pay.

### 7.4 Invoices

- **Commission tax invoice**, issued by Valueskins Private Limited to the brand when Payment 1 is captured. Sequential number per financial year: `VS/2026-27/000001`. Contents: ValueSkins legal name, address, GSTIN, SAC code, brand billing name, address, state and GSTIN if any, place of supply, taxable value, CGST+SGST (same state) or IGST (different state), total, Razorpay payment id, date. **[CONFIRM format with the CA before go-live.]**
- **Advance receipt** and **Final receipt**: non-GST payment receipts showing that the brand paid the creator's advance/final through ValueSkins via Razorpay. Creator name and Instagram username, amount, Razorpay payment id and transfer id, date. Sequential numbers `VS-R/2026-27/000001`.
- The invoice number and a JSON snapshot of all its data are stored in `invoices` when issued, so re-rendering later always produces the same document. PDFs are rendered on demand.

---

## 8. Emails

Sent through Resend from `ValueSkins <notifications@valueskins.com>`, reply-to `valueskinsfounder@gmail.com`. Every email is plain text plus minimal HTML (black text on white for email-client readability), no images except the wordmark, and no emojis. Every send is logged in `email_log`. Every deal-related email is visible to both parties in the deal's Communication history.

In development, `EMAIL_TRANSPORT=console` prints emails to the log instead of sending.

| # | Template | To | When |
|---|---|---|---|
| E0 | Verify your email | User | Email entered or changed |
| 1 | Deal published | Brand | Deal goes OPEN |
| 2 | New application | Brand | Creator applies |
| 3 | You were selected | Creator | Brand confirms |
| 3b | Application not selected | Other applicants | Brand confirms someone else |
| 4 | Commission paid | Brand (tax invoice attached), Creator (notice only) | Payment 1 captured |
| 5 | Advance paid | Creator and Brand (advance receipt attached) | Payment 2 captured |
| 6 | Content uploaded | Brand | Creator uploads |
| 7 | Changes requested | Creator | Brand sends feedback (feedback text included) |
| 8 | Content approved | Creator | Brand approves ("waiting for final payment") |
| 9 | Final payment done | Creator and Brand (final receipt attached) | Payment 3 captured |
| 10 | Deal report ready | Creator and Brand (ADP attached) | Deal COMPLETED |
| 11 | Deal cancelled | Brand, and Creator if confirmed | Deal CANCELLED (includes reason, and whether commission was kept) |
| 12 | Commission payment reminder | Brand | Daily while CONFIRMED |
| 13 | Content overdue | Creator and Brand | Daily while content_overdue |
| 14 | Review reminder | Brand | Daily after 3 days in CONTENT_UPLOADED |
| 15 | Dispute raised | valueskinsfounder@gmail.com, CC both parties | Dispute form submitted |
| 16 | Payout account status | Creator | Linked account becomes ACTIVE or NEEDS_CLARIFICATION |
| A1 | Admin alert | Admin | Webhook processing error, transfer failed |

Settlement timing copy: "Razorpay will send this to your bank account on its settlement schedule." Never promise a number of days we do not control.

---

## 9. Deal description template

Shown in the create form as placeholder text and as a "Insert template" button:

```
Content type: [3 Instagram posts + 1 reel]
Shooting: [On location required. Studio address: ...]
Travel: [Travel allowance: 2000 INR / Not provided]
Timeline: [Shooting Oct 1-3, posting Oct 5-7, one post per day]
Approval: [1 round of revisions, brand replies within 2 days]
Rights: [Brand may repost for 6 months from posting date]
Deliverables: [1080x1350 JPG, captions in English and Hindi]
Restrictions: [No competitor brands, no explicit content]
Delivery: [Upload to Google Drive and share the link on ValueSkins]

Additional notes:
```

No length limit. Scripts or storyboards go into the description as text.

Drafts: the form auto-saves to browser localStorage every 30 seconds and on blur. "Save draft" saves to the server as a DRAFT deal. Published deals are immutable (cancel only).

---

## 10. Real-time (Socket.io)

- Served from the API on the same origin as the REST API (`api.valueskins.com`), path `/socket.io`, CORS origin `https://valueskins.com` with credentials.
- Handshake authenticates with the session cookie. Unauthenticated connections are refused.
- Rooms: `feed:creators` (all creators), `user:<userId>`, `deal:<dealId>` (only the brand and confirmed creator; joining is checked).
- Events:
  - `deal:new` to `feed:creators` when a deal is published: `{ id, title, brand: {username, profilePicUrl}, budgetPaise, creatorAmountPaise, applicationDeadline, contentUploadDeadline }`
  - `deal:closed` to `feed:creators` when a deal leaves OPEN (confirmed or cancelled), so it disappears from feeds.
  - `deal:updated` to `deal:<id>` on every transition: `{ id, status }`. Clients refetch the deal.
  - `application:new` to `user:<brandId>`.
- Clients always fetch the current state over REST on load and on reconnect. Sockets are only for live updates, never the source of truth.
- Single Render instance for v1. Scaling to more than one instance later needs the Socket.io Redis adapter and sticky sessions.

---

## 11. Virtual resume (hover card)

On hover (desktop) or tap (touch) over any username or avatar: Instagram username, name, profile picture, followers, engagement rate, account type, and the last 10 **completed** deals (counterparty username, amount, deliverables summary = deal title, date completed). Endpoint `GET /api/users/:username/resume`, cached for 5 minutes. **[CONFIRM that showing deal amounts publicly is intended.]**

---

## 12. Disputes and admin

- **Raise dispute** button on any deal from CONFIRMED onward, for both parties. Form: subject, description. Creates a `disputes` row and sends Email 15.
- Admins are users whose Instagram user id is in env `ADMIN_INSTAGRAM_USER_IDS`. `is_admin` is set on login from that list.
- `/admin` (admin only, 404 for everyone else):
  - **Analytics** (auto-refresh every 30 seconds):
    - All time: deals created, deals completed, active creators, active brands, total value transacted.
    - This week: deals created, completed, average deal value, average time from OPEN to COMPLETED.
    - This month: deals created, completed, commission revenue (base, excluding GST), creator payouts, completion rate.
    - Charts: deals by status, daily deals created (30 days), daily commission revenue (30 days), histogram of hours from final payment to transfer processed.
    - Tables: recent deals, recent transfers, open disputes. Every row links to a detail view.
  - **Deal detail**: full event log, payments, transfers, emails, disputes. Actions: cancel deal (admin override, requires a resolution note and optional manual refund reference), retry failed transfer, resend any email.
  - **Disputes**: list, mark resolved with a resolution note (emails both parties).
- Refunds, when needed, are done manually in the Razorpay dashboard. The admin records the refund id in the resolution. No automated refunds in v1.

---

## 13. Rate limits

| What | Limit | Scope |
|---|---|---|
| Publish deal | 10 per 24h | Brand |
| Apply | 20 per 24h | Creator |
| Content upload | 20 per deal | Deal |
| API requests | 100 per minute | User |
| Signup (new user created) | 5 per hour | IP |
| Login attempts | 20 per hour, then 15-minute lockout | IP |
| Email verification resend | 5 per hour | User |
| Dispute | 3 per deal per 24h | User |

Response: `429` with `Retry-After`. Razorpay API calls from our server retry up to 3 times with exponential backoff, only for network errors and 5xx.

---

## 14. Scheduled jobs

All run in the API process via node-cron, in `Asia/Kolkata` time, each wrapped in a Postgres advisory lock so a redeploy overlap cannot double-run them.

| Job | Schedule (IST) | Does |
|---|---|---|
| Instagram refresh | 03:00 daily | Refresh profile and engagement for users active in the last 30 days. Refresh tokens under 10 days to expiry. Stay under Meta's per-account rate limits. |
| Commission reminders | 10:00 daily | Email 12 for deals in CONFIRMED for more than 24h |
| Review reminders | 10:00 daily | Email 14 for deals in CONTENT_UPLOADED for more than 3 days |
| Content overdue | 23:59 daily | Email 13 for overdue deals. Deal stays in its status. |
| Cleanup | 04:00 daily | Delete expired sessions and verification tokens |

---

## 15. Database schema

Conventions: UUID v7 primary keys, `created_at`/`updated_at` `timestamptz` default now, money columns `_paise BIGINT`, enums as Postgres enums. Foreign keys everywhere, with indexes on every foreign key and every column used in a filter.

**users**
`id, instagram_user_id (unique), username (unique), name, ig_account_type, role (CREATOR | BRAND, null until chosen), role_locked_at, followers_count, follows_count, media_count, engagement_rate numeric(5,2), bio, profile_picture_url, ig_token_encrypted, ig_token_expires_at, instagram_synced_at, email (unique, nullable until set), email_verified_at, is_admin, onboarding_completed_at, last_active_at, created_at, updated_at, deleted_at`

**brand_billing** (1:1 users)
`user_id (pk), billing_name, billing_address, billing_state, gstin (nullable), created_at, updated_at`

**creator_payout_accounts** (1:1 users)
`user_id (pk), razorpay_account_id (unique), razorpay_stakeholder_id, razorpay_product_id, status (PENDING | ACTIVE | NEEDS_CLARIFICATION | SUSPENDED), bank_last4, ifsc, requirements jsonb, consent_at, created_at, updated_at`

**sessions**
`id, user_id, token_hash (unique), expires_at, ip, user_agent, created_at`

**email_verification_tokens**
`id, user_id, email, token_hash (unique), expires_at, used_at, created_at`

**deals**
`id, short_id (unique, 8 chars, for receipts), brand_id, creator_id (nullable), title, description, budget_paise, commission_base_paise, commission_gst_paise, commission_total_paise, creator_amount_paise, advance_paise, final_paise, application_deadline date, content_upload_deadline date, deal_deadline date, status, content_link, content_uploaded_at, upload_count, feedback, revision_count, published_at, confirmed_at, commission_paid_at, advance_paid_at, approved_at, completed_at, cancelled_at, cancelled_by_id, cancelled_by_role (BRAND | ADMIN), cancellation_reason, created_at, updated_at`
Money columns are null while DRAFT and set at publish.

**content_uploads** (history, so an edited or deleted Drive link stays on record)
`id, deal_id, link, uploaded_at`

**applications**
`id, deal_id, creator_id, status (APPLIED | CONFIRMED | REJECTED), created_at, updated_at`, unique `(deal_id, creator_id)`

**payments**
`id, deal_id, type (COMMISSION | ADVANCE | FINAL), amount_paise, razorpay_order_id (unique), razorpay_payment_id (unique, nullable), status (CREATED | CAPTURED | FAILED), failure_reason, captured_at, created_at, updated_at`
Partial unique index: one CAPTURED payment per `(deal_id, type)`.

**transfers**
`id, deal_id, payment_id, creator_id, type (ADVANCE | FINAL), amount_paise, razorpay_transfer_id (unique, nullable), status (PENDING | PROCESSED | FAILED | REVERSED), failure_reason, processed_at, created_at, updated_at`

**invoices**
`id, deal_id, payment_id, kind (COMMISSION_TAX_INVOICE | ADVANCE_RECEIPT | FINAL_RECEIPT), number (unique), financial_year, sequence, snapshot jsonb, issued_at`
Numbering uses a row lock on a per-kind, per-financial-year counter table (`invoice_counters`), so numbers are gapless and never duplicated.

**deal_events**
`id, deal_id, from_status, to_status, actor_id (nullable), actor_type (USER | SYSTEM | ADMIN), note, metadata jsonb, created_at`

**email_log**
`id, deal_id (nullable), user_id (nullable), to_email, cc jsonb, template, subject, body_text, attachment_names jsonb, provider_message_id, status (QUEUED | SENT | FAILED), error, created_at, sent_at`

**disputes**
`id, deal_id, raised_by_id, subject, description, status (OPEN | RESOLVED), resolution, refund_reference, resolved_by_id, resolved_at, created_at`

**webhook_events**
`id (Razorpay event id, pk), event_type, payload jsonb, received_at, processed_at, error`

**meta_deletion_requests**
`id, instagram_user_id, confirmation_code (unique), status, created_at, completed_at`

User deletion: soft delete (`deleted_at`), anonymize username, email and Instagram fields, delete tokens and sessions. Deals, payments and invoices are kept (legal record) but show "Deleted user".

---

## 16. API

All under `https://api.valueskins.com/api`. JSON. Errors are `{ error: { code, message } }` with correct HTTP status. Every request body and query is validated with the Zod schemas from `packages/shared`. Lists use cursor pagination (`?cursor=&limit=`, max 50).

Auth and account
- `GET /auth/instagram/start`
- `GET /auth/instagram/callback`
- `POST /auth/logout`
- `POST /dev/login` (non-production only)
- `GET /me`
- `POST /me/role` (once)
- `POST /me/email` and `POST /me/email/verify` (token) and `POST /me/email/resend`
- `PUT /me/billing` (brand)
- `POST /me/payout-account`, `GET /me/payout-account`, `POST /me/payout-account/refresh` (creator)
- `DELETE /me` (account deletion)
- `POST /meta/data-deletion`, `POST /meta/deauthorize`, `GET /meta/deletion-status/:code`

Users
- `GET /users/:username/resume`

Deals
- `GET /deals/feed` (creator: OPEN deals with applications open, newest first)
- `GET /deals/mine` (brand: my deals by status; creator: deals I'm confirmed on)
- `POST /deals` (create draft), `PATCH /deals/:id` (edit draft only), `DELETE /deals/:id` (draft only)
- `POST /deals/:id/publish`
- `GET /deals/:id` (visibility: OPEN deals to any logged-in user; otherwise only its brand, confirmed creator, admin)
- `POST /deals/:id/cancel` (brand, allowed statuses only, body `{ reason }`)
- `POST /deals/:id/content` (creator, body `{ link }`)
- `POST /deals/:id/feedback` (brand, body `{ feedback }`)
- `POST /deals/:id/approve` (brand)
- `GET /deals/:id/emails` (communication history)
- `GET /deals/:id/documents/:kind` (PDF: `commission-invoice`, `advance-receipt`, `final-receipt`, `adp`)
- `POST /deals/:id/disputes`

Applications
- `POST /deals/:id/applications` (creator)
- `GET /deals/:id/applications` (brand)
- `GET /applications/mine` (creator)
- `POST /applications/:id/confirm` (brand)

Payments
- `POST /deals/:id/payments/:type/order` (type: `commission | advance | final`)
- `POST /payments/verify`
- `POST /webhooks/razorpay` (no auth, signature verified, raw body)

Admin (`/admin/*`, admin only)
- `GET /admin/analytics`, `GET /admin/deals`, `GET /admin/deals/:id`, `POST /admin/deals/:id/cancel`, `POST /admin/transfers/:id/retry`, `POST /admin/emails/:id/resend`, `GET /admin/disputes`, `POST /admin/disputes/:id/resolve`

Health
- `GET /health` (DB check, used by Render)

---

## 17. ADP (Deal Report) contents

Generated on demand with PDFKit, same document for both parties.

1. Header: "ValueSkins Deal Report", deal short id, generated timestamp (IST).
2. Parties: brand and creator Instagram usernames and Instagram user ids, brand billing name and GSTIN if any.
3. Terms: title, full description, budget, the three deadlines, published and confirmed dates.
4. Money: budget, commission base, GST, commission total, creator amount, advance, final.
5. Commission tax invoice (full).
6. Advance receipt (full).
7. Final receipt (full).
8. Delivery proof: every content link uploaded with its timestamp, number of revisions, each feedback timestamp, final approval timestamp.
9. Transfers: Razorpay transfer ids and statuses for advance and final.
10. Razorpay fees absorbed by ValueSkins (from Razorpay payment entities), for information.
11. Event timeline from `deal_events`.

---

## 18. UI and copy

- Background `#000000`, text `#FFFFFF`, secondary text `#A3A3A3`, borders `#262626`, single accent `#FF0000` for primary actions, error text `#FF4D4D`. No gradients, no shadows, no rounded-pill decoration beyond a 4px radius.
- One sans-serif system font stack. No icon fonts. Minimal inline SVG icons only where needed (close, external link).
- No emojis. No em dashes (use hyphens). No "unlock", "seamless", "powered by", "effortless", "supercharge", or similar.
- Every amount is shown as `₹10,000.00` (Indian digit grouping, `en-IN`).
- Homepage: "ValueSkins - Where creators and brands connect to collaborate." Then two lines: "Brands: Post a deal. Select a creator. Pay. Done." and "Creators: Browse deals. Apply. Deliver. Get paid." Then "Continue with Instagram".
- Navigation, creator: Home (live feed), Applications, Deals, Profile, Settings (payouts, email).
- Navigation, brand: Campaigns (my deals, and a "New deal" button), Profile, Settings (billing, email). Browsing creators is v2.
- Deal page shows: status, a step indicator for the 9 phases, the one action available to this user right now, deadlines with countdown, payment breakdown, content link history, feedback history, communication history, documents, and "Raise dispute".
- Every disabled action says why (for example "Applications closed", "Set up payouts to apply", "Cancellation is not possible after the advance is paid").
- Responsive: desktop and tablet first, usable at 375px wide.
- Accessibility: all actions keyboard reachable, visible focus ring (accent color), text contrast AA.

---

## 19. Environments and config

| | Local | Staging | Production |
|---|---|---|---|
| Web | localhost:3000 | staging.valueskins.com (Vercel) | valueskins.com |
| API | localhost:4000 | api-staging.valueskins.com (Render) | api.valueskins.com |
| DB | docker compose Postgres | Render Postgres | Render Postgres (paid, backups) |
| Razorpay | test | test | live |
| Email | console | Resend | Resend |
| Dev login | on | on | impossible |
| Session cookie | vs_session_dev | vs_session_staging | vs_session |

Local cookies: API and web both on `localhost` (cookie without Domain). Local webhooks: expose the API with a tunnel (cloudflared or ngrok) and register the tunnel URL in Razorpay test mode.

API env (validated with Zod at startup, the process exits on any missing value):
`NODE_ENV, PORT, DATABASE_URL, WEB_ORIGIN, COOKIE_DOMAIN, SESSION_COOKIE_NAME, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI, META_APP_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, EMAIL_TRANSPORT, ADMIN_INSTAGRAM_USER_IDS, DISPUTE_EMAIL, ENABLE_DEV_LOGIN, COMPANY_LEGAL_NAME, COMPANY_ADDRESS, COMPANY_STATE, COMPANY_GSTIN, COMMISSION_SAC_CODE`

Web env: `NEXT_PUBLIC_API_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID`

---

## 20. Security checklist

- Secrets only in env, never in the repo. `.env.example` lists names only.
- Never log tokens, secrets, email bodies, PAN, bank numbers, or full webhook payloads at info level.
- Webhook signature always verified on the raw body. Meta signed requests always verified.
- Every endpoint checks ownership (brand of this deal, confirmed creator, admin). Tested.
- Helmet security headers on the API. Strict CSP on the web app that allows Razorpay Checkout.
- Google Drive links are rendered as plain external links with `rel="noopener noreferrer"`, never embedded.
- Admin routes return 404 to non-admins.
- Dependabot enabled. `pnpm audit` in CI (non-blocking warnings, blocking on critical).

---

## 21. Open decisions (sign-off needed)

1. **Commission formula and minimum budget** (section 4.2). Needed before Prompt 2.
2. **Razorpay fee handling on Route transfers** (section 4.3). Verified in Prompt 12.
3. **GST and tax.** ValueSkins must be GST registered to charge GST on commission. Have the CA confirm the invoice format and SAC code, and whether marketplace TDS (Income Tax section 194-O) or GST TCS obligations apply to ValueSkins. If they apply, they change the payout math. Needed before go-live.
4. **Stuck deals.** v1 only sends reminders when a brand does not pay the commission or does not review content. Decide whether to auto-cancel after N days in v2.
5. **Public deal amounts** in the virtual resume (section 11).
6. **Phone number for Razorpay KYC** if the linked-account API requires it (section 7.2).

---

## 22. Go-live checklist

- [ ] Meta app approved for `instagram_business_basic`, app in Live mode
- [ ] Razorpay live account activated with Route enabled, live webhook registered with all events
- [ ] One complete deal run end to end in test mode on staging, then one small real deal (minimum budget) in live mode between the founders
- [ ] Commission invoice format approved by CA, company GSTIN and SAC code in env
- [ ] Resend domain verified (SPF, DKIM), test emails land in inbox (not spam) for Gmail and Outlook
- [ ] Domains live with HTTPS: valueskins.com, api.valueskins.com
- [ ] Render Postgres backups on, restore tested once
- [ ] `ENABLE_DEV_LOGIN` absent in production, startup guard verified
- [ ] Privacy policy and terms published and reviewed
- [ ] Admin Instagram ids set, admin dashboard reachable only by admins
- [ ] Error alerts reaching the admin email
