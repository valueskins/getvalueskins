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

`computeBreakdown` takes the GST rate as an optional parameter (basis points), defaulting to `GST_RATE_BPS` above. The API's `GST_RATE_BPS` env var controls the live rate; it is `0` until ValueSkins is GST-registered (V0_LAUNCH 2.6), so commission_gst is 0 and commission_total equals commission_base.

Worked example at GST 0, budget ₹10,000: commission base ₹750, GST ₹0, total ₹750, creator ₹9,250, advance ₹2,775, final ₹6,475.

### 4.3 Razorpay fees

ValueSkins absorbs Razorpay's fees. They are never shown to or charged to users, except as an informational line in the ADP.

**[CONFIRM in test mode, Prompt 12]** Route rules say a transfer plus its fees cannot exceed the captured payment. If transferring the full advance/final to the creator fails because of this, choose one:
- (A) Transfer from ValueSkins' Razorpay balance with a Direct Transfer, and keep a small float in the balance.
- (B) Add the gateway fee to what the brand pays for Payments 2 and 3 (breaks "brand pays exactly the budget").
Prompt 12 must test this with a real test-mode transaction and stop and report if the full transfer fails.

Status: the code transfers the full advance and final amount (section 7.3) and does not choose A or B. Razorpay's Route docs say fees come out of the platform balance and a transfer happens only if that balance covers them, so the concern is real. The result of the staging run (`docs/DEPLOYMENT.md` section 13 step 12: transfer status, fees and tax, any error) is recorded here once it exists; this decision stays open until then.

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

- One function, `transitionDeal({ dealId, from, to, actor, patch, note, metadata, prepare, within, afterCommit })`, in `apps/api/src/deals/stateMachine.ts`. Nothing else writes `deals.status`; a test fails if another file updates the deals table.
- It first checks the pair and the actor role against the table in `packages/shared` (`409 INVALID_TRANSITION`), then runs a single DB transaction: `UPDATE deals SET status = :to, ... WHERE id = :id AND status = :from RETURNING *`. Zero rows means someone else changed it first, so it returns `409 INVALID_TRANSITION`.
- The same transaction inserts a `deal_events` row (from, to, actor, note).
- `prepare(tx, deal)` runs first, on the row locked with `SELECT ... FOR UPDATE`, and returns more columns to set (publish validates the draft again and computes the money breakdown there, so an edit racing the publish cannot slip past). `within(tx, deal)` runs after the status update in the same transaction; if it throws, the whole transition rolls back (confirm uses it to confirm the application, reject the others and set `creator_id`).
- After commit, it runs the `afterCommit` list in order: emails now, WebSocket events when Socket.io exists (section 10). Side effects never run inside the transaction, and a failing task is logged and never fails the request or stops the next task.
- The allowed-transition table lives in `packages/shared` and is covered by exhaustive tests.

### 5.4 Deadlines

- Three dates: `application_deadline < content_upload_deadline <= deal_deadline`. All must be in the future at publish time: the end of that day in IST must be after now, so today's date is allowed until 23:59:59 IST.
- Dates are calendar dates interpreted in IST. A deadline means 23:59:59 IST on that date.
- After the application deadline, Apply is disabled with the message "Applications closed". The brand can still confirm an existing applicant.

### 5.5 Phases (user-facing)

1. **Brand posts deal.** Form: title, description (with template, see section 9), budget in rupees, the three deadlines. Brand sees the full payment breakdown before publishing. Publish sets status OPEN, broadcasts `deal:new` to all connected creators, sends Email 1.
2. **Creators apply.** Feed shows brand name (hover for virtual resume), budget, creator amount, deadlines, description. Apply needs an ACTIVE payout account. If it is missing, the button reads "Set up payouts to apply" and links to settings.
3. **Brand confirms a creator.** Application list with hover resumes. Confirm on one creator, and the rest are auto-rejected.
4. **Payment 1, commission.** "Pay commission: ₹885.00". Razorpay Checkout. On capture: COMMISSION_PAID, invoice issued (a tax invoice when GST is charged), Email 4 with it attached.
5. **Payment 2, advance.** "Pay advance: ₹2,734.50". On capture: transfer to the creator's linked account, ADVANCE_PAID, Email 5.
6. **Creator uploads content.** Countdown to the upload deadline. Paste a Google Drive link (validated as `https://drive.google.com/...` or `https://docs.google.com/...`). CONTENT_UPLOADED, Email 6. Every link is kept in `content_uploads`, so a re-upload never erases the earlier ones; at most 20 links per deal. Uploading after the deadline is allowed (the deal is only flagged overdue).
7. **Brand reviews.** Either "Suggest changes" (text, REVISION_REQUESTED, Email 7) or "Final approval" (APPROVED, Email 8). After 5 revisions, both see: "This deal has had 5 revisions. If you cannot agree, raise a dispute." The feedback text and its time are kept as the note of the deal event, and each round adds one to `revision_count`.
8. **Payment 3, final.** "Pay final: ₹6,380.50". On capture: transfer, COMPLETED, Email 9, then ADP ready, Email 10.
9. **ADP.** Downloadable by both parties from the deal page at any time after completion, and attached to Email 10. Generated on demand.

---

## 6. Authentication and onboarding

### 6.1 Instagram login

- Product: **Instagram API with Instagram Login** (Business Login for Instagram), host `graph.instagram.com`, scope `instagram_business_basic`.
- Only Instagram Professional accounts (Business or Creator) can sign in. If login fails for this reason, show: "ValueSkins needs an Instagram Professional account. You can switch for free in Instagram settings: Account type and tools, Switch to professional account."
- Flow:
  1. Web "Continue with Instagram" goes to `GET https://api.valueskins.com/api/auth/instagram/start`. The API sets a signed `state` cookie and redirects to Instagram's authorize URL.
  2. Instagram redirects to `GET /api/auth/instagram/callback?code&state`. The API verifies state, exchanges the code for a short-lived token, exchanges that for a long-lived token (about 60 days), and fetches the profile.
  3. Upsert the user by Instagram user id. Create a session. Redirect to `https://valueskins.com/onboarding` if onboarding is incomplete, else `/home`.
- **Link mode**: `GET /api/auth/instagram/start?link=1` (must already be logged in) attaches the fetched Instagram account to the current user instead of creating a session, and redirects to `/home` on success. If that Instagram account already belongs to a different user, nothing is mutated and the browser is redirected with an error instead.
- Profile fields fetched from `/me`: `user_id, username, name, account_type, profile_picture_url, followers_count, follows_count, media_count, biography`. Verify the exact field list against Meta's docs at build time. If `biography` is not available on `/me`, drop it.
- Engagement rate = average of (likes + comments) over the latest 12 media, divided by followers, as a percentage with 2 decimals. Null if fewer than 3 posts or 0 followers.
- The long-lived token is stored **encrypted** (AES-256-GCM, key from env `TOKEN_ENCRYPTION_KEY`). It is refreshed when it has less than 10 days left.
- Profile is refreshed on every login and by the daily cron. `is_admin` is recomputed from `ADMIN_INSTAGRAM_USER_IDS` on every login/upsert, in both directions.
- Meta app requirements, built into the product: `/privacy` and `/terms` pages on the web app, a **data deletion callback** (`POST /api/meta/data-deletion`, returns a confirmation code and status URL, `GET /api/meta/deletion-status/:code` to check it) and a **deauthorize callback** (`POST /api/meta/deauthorize`). Both verify Meta's `signed_request` with `META_APP_SECRET`. Deauthorize only clears the now-invalid stored token (`ig_token_encrypted`, `ig_token_expires_at`) for that Instagram user id — it does not delete the account; full soft-delete and anonymization (section 15) is exclusive to data-deletion and `DELETE /me`.

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

Which steps apply, which are done and which is next is returned by `GET /me` as `onboarding` (`{ completed, nextStep, steps: [{ id, done, required }] }`, step ids `instagram_username`, `role`, `email`, `billing`, `payout`), computed by `computeOnboarding` in `packages/shared`. Confirm profile and Marketplace are UI-only and not tracked.

- **Completion.** `onboarding_completed_at` is set, once and never unset, when the role is chosen and the email is verified, plus billing details for a brand, plus the Instagram username for an email-only account (V0_LAUNCH 2.2). Payout setup is a step but not required to complete: creators may browse before finishing it.
- **Role** (`POST /me/role`): once only. A second call answers `409 ROLE_ALREADY_SET` and never overwrites.
- **Email for Instagram accounts** (`POST /me/email`, `/me/email/verify`, `/me/email/resend`). `users.email` changes only when the new address is verified, so a changed address leaves the old verified one in place until then. The link is `WEB_ORIGIN/verify-email?token=...`, valid 24 hours, single use, only the hash stored, bound to the signed-in user; every bad token is the same `400 INVALID_TOKEN`. `POST /me/email` always answers 200 whether or not another account uses the address; a clash is reported at verify time as `409 EMAIL_TAKEN`. Email-only accounts cannot use these routes (`409 EMAIL_IS_SIGN_IN`): their email is their sign-in. Resend is rate limited (section 13).
- **Brand billing** (`PUT /me/billing`): brands only, GSTIN format-validated.
- **Email-only accounts** (V0_LAUNCH 2.2): they sign in with a verified email, so they type their Instagram username instead of confirming a fetched profile (`POST /me/instagram-username`). It is unverified, stored in `users.username`, not unique, editable until Instagram is connected (`409 INSTAGRAM_ALREADY_CONNECTED` afterwards), and replaced by the real handle when they connect.

### 6.5 Email login (V0 launch)

Until Meta app review completes, `AUTH_EMAIL_ENABLED` can enable an email-code login path alongside Instagram login (V0_LAUNCH 2.1). Codes are tracked in `email_login_codes` (section 15); a user created this way has `instagram_user_id`, `ig_account_type`, `ig_token_encrypted` and `ig_token_expires_at` all null until they later link Instagram.

- `POST /auth/email/start { email }`: always responds `200 { ok: true }`, regardless of whether an account exists for that email — this is the whole non-enumeration mechanism, not a special case on top of it. Generates a 6-digit numeric code, invalidates any prior unused code for that email, and sends it with the "Your sign-in code" template. Valid for 10 minutes. Rate limited as a login attempt (section 13).
- `POST /auth/email/verify { email, code }`: on a correct, unexpired, unused code with fewer than 5 prior wrong attempts on it, marks the code used, finds the user by email or creates one (`email_verified_at` set immediately), and creates a session. Every failure (no code, wrong code, expired, 5 attempts already used) returns the identical `400 INVALID_CODE` — never distinguished. Also rate limited as a login attempt.
- A brand-new email-only user has no Instagram handle to derive a username from; `username` and `name` default to the email's local-part.

---

## 7. Razorpay

### 7.1 Modes and keys

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` come from env.
- Local and staging use **test keys**. Production uses live keys. The API logs the mode (`test` or `live`) at startup, and refuses to start if `NODE_ENV=production` with a test key, or non-production with a live key.
- Route must be enabled on the ValueSkins Razorpay account (request it from Razorpay) in both test and live mode.

### 7.2 Creator payout setup (Route linked account)

- Form fields: legal name, PAN, phone, bank account number, IFSC, account holder name. Razorpay's create-linked-account API requires a phone number (checked against Razorpay's docs, October 2026), so it is on the form; it is sent to Razorpay and never stored by us, never shown or used anywhere else. The PAN must be an individual's (4th character `P`, Razorpay's stakeholder rule), the legal name at least 4 characters, the account number 5 to 20 digits, the phone a 10 digit Indian mobile number.
- Server calls, in order: create linked account (`POST /v2/accounts`: `type` `route`, `business_type` `individual`, `profile.category`/`subcategory` from one constant in the code, `profile.addresses.registered` = `{ country: "IN" }` because the form collects no address, `notes.user_id` = our user id), create stakeholder (name, email, phone, `kyc.pan`), request the Route product (`product_name` `route`), update it with the settlement bank details and `tnc_accepted`. `reference_id` is not used: Razorpay allows 3 to 20 characters and gates it behind a feature flag, so our user id cannot be sent there. Razorpay's category lists could not be retrieved when this was written: confirm them in test mode.
- Progress is saved after every step (a row exists as soon as the linked account does), so a retry after a partial failure resumes instead of creating duplicates. If creating the account succeeded but the response was lost, Razorpay's "Merchant email already exists for account" answer is adopted only after the account's `notes.user_id` proves it is ours. One setup runs at a time per user (`409 PAYOUT_SETUP_IN_PROGRESS`). After `NEEDS_CLARIFICATION`, submitting again re-sends the settlement details.
- We store only: `razorpay_account_id`, `razorpay_stakeholder_id`, `razorpay_product_id`, `status`, `bank_last4`, `ifsc`, `requirements` (JSON from Razorpay), timestamps. **Never PAN, never the full account number.**
- Status: `PENDING` -> `ACTIVE`, or `NEEDS_CLARIFICATION` (show Razorpay's requirement reasons and let the creator fix them), or `SUSPENDED`. Razorpay's `activated` is `ACTIVE`, `needs_clarification` is `NEEDS_CLARIFICATION`, `suspended` is `SUSPENDED`, anything else (`requested`, `under_review`) is `PENDING`. Updated from the `product.route.under_review`, `.needs_clarification` and `.activated` webhooks (Razorpay documents no `account.*` events for Route, and none for `suspended`), plus a "Refresh status" button that fetches the product configuration from Razorpay. An update older than the last one applied is ignored (webhooks can arrive out of order), and email #16 is sent once, when the status changes to `ACTIVE` or `NEEDS_CLARIFICATION`.
- Razorpay's responses contain the full bank account number and PAN, so they are never stored or logged: only the status and the requirement reasons are kept.
- Creator must confirm: "I agree that Razorpay will store my bank and KYC details to pay me."

### 7.3 Payments

- For each of the 3 payments, the server creates a Razorpay Order: amount from the frozen breakdown, `currency: INR`, `receipt` = `<dealShortId>-<type>` (type as in the URL: `commission`, `advance`, `final`), notes `{ deal_id, type }`. Capture is automatic through the Razorpay account setting (the Orders API takes no per-order flag).
- Advance and final Orders include a `transfers` array: the full advance/final amount to the creator's linked account, `on_hold: false`, notes `{ deal_id, type }`. (Subject to the 4.3 check.) Razorpay creates the transfer once the payment is captured; a transfer cannot exceed its order's amount.
- Only one open Order per deal per payment type (a partial unique index enforces it, and a lock stops two simultaneous requests creating two). If one exists and is unpaid, it is reused. A declined attempt does not close the order: `payment.failed` marks the payment FAILED with Razorpay's reason and leaves the deal untouched, and the next order request reuses the same Razorpay order and reopens it (CREATED). A late successful capture is accepted from CREATED or FAILED.
- The endpoint checks: the caller is the deal's brand (anyone else gets 404), and the deal is in the correct status (CONFIRMED for commission, COMMISSION_PAID for advance, APPROVED for final; otherwise `409 WRONG_DEAL_STATUS`). The advance also needs the creator's payout account to be ACTIVE (`409 CREATOR_PAYOUT_NOT_ACTIVE`); the final does not, because a transfer to an account that went bad takes the failed-transfer path below.
- Frontend opens Razorpay Checkout with the Order id. On the Checkout success handler it calls `POST /api/payments/verify` with `razorpay_order_id, razorpay_payment_id, razorpay_signature`. The server verifies the signature.
- **Both** the verify endpoint and the webhook call the same idempotent function `markPaymentCaptured(orderId, paymentId)`. Whichever arrives first performs the transition. The second is a no-op. It does not trust the browser or the webhook body: it fetches the payment from Razorpay and requires status `captured`, the same order, the order's amount and `INR`; a mismatch records nothing, answers `409 PAYMENT_AMOUNT_MISMATCH` (or `PAYMENT_ORDER_MISMATCH`, `PAYMENT_NOT_CAPTURED`) and alerts the admin (A1). In one transaction it marks the payment CAPTURED, stores the transfer row (id and status from `GET /v1/payments/:id/transfers`, or PENDING without an id until the first transfer webhook), and transitions the deal with a SYSTEM actor (CONFIRMED to COMMISSION_PAID, COMMISSION_PAID to ADVANCE_PAID, APPROVED to COMPLETED). Emails 4, 5 and 9 go out after commit (attachments arrive with section 7.4). If the deal is no longer in the status the payment moves it from (for example the brand cancelled while Checkout was open), the payment is still recorded as CAPTURED, the deal is left alone, and the admin is alerted to refund it by hand (section 12). A second captured payment for the same deal and type is marked FAILED and flagged for refund.
- `POST /payments/verify` checks the Checkout signature (HMAC-SHA256 of `order_id|payment_id` with the key secret, constant-time compare, `400 INVALID_SIGNATURE`), then calls `markPaymentCaptured`. Only the deal's brand can verify its payments.
- Webhook endpoint `POST /api/webhooks/razorpay`:
  - Uses the raw body for HMAC-SHA256 signature verification with the webhook secret. Invalid signature returns 400.
  - Deduplicates on the `x-razorpay-event-id` header, stored in `webhook_events`. Duplicates return 200 immediately.
  - Handles, by a registry keyed by event type: `product.route.under_review`, `product.route.needs_clarification`, `product.route.activated` (section 7.2). `payment.captured`, `order.paid` (both call `markPaymentCaptured`) and `payment.failed`; and the Route `transfer.processed`, `transfer.failed` and `transfer.reversed` events, which update the transfer row (status only moves forward; a transfer event that arrives before its payment was recorded records the payment first). `transfer.reversed` is not on Razorpay's Route payload page, so check the dashboard's event list for it. An event with no handler (for example `settlement.processed`) is stored and marked processed.
  - Always returns 200 quickly after storing the event: the event is processed after the response. The stored payload is redacted (PAN, KYC, phone and legal info removed, account numbers reduced to their last 4 digits, and the payer's email, contact, VPA, card, bank and wallet details removed). Processing errors are recorded on the event row (the message, never the payload) and alerted to the admin (template A1, sent to `DISPUTE_EMAIL`), never retried in a loop.
- A failed transfer (after payment was captured) sets the transfer row to FAILED with Razorpay's reason, emails the admin once (A1), and shows the admin a "Retry transfer" button (the button comes with the admin work). The deal still advances, because the brand did pay.

### 7.4 Invoices

- **Commission invoice**, issued by Valueskins Private Limited to the brand when Payment 1 is captured. Number `VS/2026-27/000001`. Contents: ValueSkins legal name, address, GSTIN (when it has one), SAC code, brand billing name, address, state and GSTIN if any, place of supply (the brand's billing state), taxable value, tax, total, Razorpay payment id, date. **[CONFIRM format with the CA before go-live.]**
  - With GST charged, the document is titled "Tax Invoice" and splits the GST into CGST + SGST when the brand's billing state is the company's state (`COMPANY_STATE`), or IGST when it is not. The two states are compared as text, ignoring case and spacing, so a misspelled state is billed as IGST. The odd paisa of an odd GST amount goes to SGST so the halves add up.
  - With GST 0 (V0_LAUNCH 2.6) the document is titled "Invoice" and has no tax lines. The amounts always come from the deal's frozen breakdown, never from today's rate.
- **Advance receipt** and **Final receipt**: non-GST payment receipts showing that the brand paid the creator's advance/final through ValueSkins via Razorpay. Creator name, Instagram username and Instagram user id, amount, Razorpay payment id and transfer id (or a note that Razorpay had not created the transfer yet), date. Both draw from one sequence, `VS-R/2026-27/000001`, `000002`, and so on.
- Tax invoices and receipts are numbered in separate gapless sequences per financial year (April to March, in IST). One upsert on the counter row (`invoice_counters`) takes its lock and holds it until the transaction that issues the invoice ends, so concurrent captures queue up and a rollback leaves no hole. The receipt sequence is the `ADVANCE_RECEIPT` counter row; `FINAL_RECEIPT` uses the same one.
- An invoice or receipt is issued inside the transaction that marks its payment captured (section 7.3), once per payment (unique on `payment_id`). A payment recorded on a deal that cannot take it (to be refunded by hand) gets none.
- The invoice number and a JSON snapshot of all its data (company details from env at that moment included) are stored in `invoices` when issued, so re-rendering later always produces the same document, byte for byte. PDFs are rendered on demand with PDFKit and never stored, in an embedded DejaVu Sans font (the built-in fonts have no rupee sign), plain black on white.
- Each document is downloaded from `GET /deals/:id/documents/:kind` (section 16) by the deal's brand, its confirmed creator or an admin, once its payment is captured; the deal report only when the deal is COMPLETED. They are also attached to emails 4 (brand), 5, 9 and 10 (section 8).

---

## 8. Emails

Sent through Resend from `ValueSkins <notifications@valueskins.com>`, reply-to `valueskinsfounder@gmail.com`. Every email is plain text plus minimal HTML (black text on white for email-client readability), no images except the wordmark, and no emojis. Every send is logged in `email_log`. Every deal-related email is visible to both parties in the deal's Communication history.

In development, `EMAIL_TRANSPORT=console` prints emails to the log instead of sending. A startup guard crashes the process if `EMAIL_TRANSPORT=console` with `NODE_ENV=production` — printed emails include verification links and sign-in codes, which must never reach production logs (section 20).

| # | Template | To | When |
|---|---|---|---|
| E0 | Verify your email | User | Email entered or changed |
| E1 | Your sign-in code | User | Email-code login started (V0_LAUNCH 2.1, section 6.5) |
| 1 | Deal published | Brand | Deal goes OPEN |
| 2 | New application | Brand | Creator applies |
| 3 | You were selected | Creator | Brand confirms |
| 3b | Application not selected | Other applicants | Brand confirms someone else |
| 4 | Commission paid | Brand (invoice attached), Creator (notice only) | Payment 1 captured |
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

On hover (desktop) or tap (touch) over any username or avatar: Instagram username, name, profile picture, followers, engagement rate, account type, and the last 10 **completed** deals (counterparty username, amount, deliverables summary = deal title, date completed). Endpoint `GET /api/users/:id/resume` (by user id, not username: email-only usernames are not unique, V0_LAUNCH 2.2), for signed-in users, cached in the API process for 5 minutes (`Cache-Control: private, max-age=300`). It returns `{ user, completedDeals }`. For an account without a linked Instagram profile (V0_LAUNCH 2.1, 2.2) `user.instagramVerified` is `false`, the username is the one the user typed, and the picture, followers, engagement rate and account type are `null`. Each completed deal is `{ counterparty: { id, username }, budgetPaise, title, completedAt }`, the 10 most recent first; a deleted counterparty shows as "Deleted user". Unknown, deleted and role-less users are a 404. **[CONFIRM that showing deal amounts publicly is intended.]**

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
| Content upload | 20 per deal (a permanent cap: `429 UPLOAD_LIMIT_REACHED`, no `Retry-After`) | Deal |
| API requests | 100 per minute | User |
| Signup (new user created) | 5 per hour | IP |
| Login attempts | 20 per hour, then 15-minute lockout | IP |
| Email verification resend | 5 per hour | User |
| Dispute | 3 per deal per 24h | User |

Publish and apply are counted only once the request has passed validation (and, for apply, the payout and deadline checks), so a form full of errors does not use up the day's allowance.

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
`id, instagram_user_id (unique, nullable — V0 allows email-only accounts, V0_LAUNCH 2.1), username (unique only among rows with instagram_user_id set), instagram_username_set_at (when an email-only account typed its Instagram username, V0_LAUNCH 2.2), name, ig_account_type (nullable — null for an email-only account), role (CREATOR | BRAND, null until chosen), role_locked_at, followers_count, follows_count, media_count, engagement_rate numeric(5,2), bio, profile_picture_url, ig_token_encrypted (nullable), ig_token_expires_at (nullable), instagram_synced_at, email (unique, nullable until set), email_verified_at, is_admin, onboarding_completed_at, last_active_at, created_at, updated_at, deleted_at`

**brand_billing** (1:1 users)
`user_id (pk), billing_name, billing_address, billing_state, gstin (nullable), created_at, updated_at`

**creator_payout_accounts** (1:1 users)
`user_id (pk), razorpay_account_id (unique), razorpay_stakeholder_id (nullable until created), razorpay_product_id (nullable until created), status (PENDING | ACTIVE | NEEDS_CLARIFICATION | SUSPENDED), bank_last4, ifsc, requirements jsonb, consent_at, status_synced_at, created_at, updated_at`

**sessions**
`id, user_id, token_hash (unique), expires_at, ip, user_agent, created_at`

**email_verification_tokens**
`id, user_id, email, token_hash (unique), expires_at, used_at, created_at`

**email_login_codes** (V0 launch, section 6.5 — no user_id: a code can be requested before any user row exists)
`id, email, code_hash, expires_at, attempts, used_at, created_at`, index on `email`

**deals**
`id, short_id (unique, 8 chars, for receipts), brand_id, creator_id (nullable), title, description, budget_paise, commission_base_paise, commission_gst_paise, commission_total_paise, creator_amount_paise, advance_paise, final_paise, application_deadline date, content_upload_deadline date, deal_deadline date, status, content_link, content_uploaded_at, upload_count, feedback, revision_count, published_at, confirmed_at, commission_paid_at, advance_paid_at, approved_at, completed_at, cancelled_at, cancelled_by_id, cancelled_by_role (BRAND | ADMIN), cancellation_reason, created_at, updated_at`
A draft is saved as typed: `title`, `description` and the three deadlines are nullable, and `budget_paise` holds the budget in paise. The six breakdown columns (`commission_base_paise`, `commission_gst_paise`, `commission_total_paise`, `creator_amount_paise`, `advance_paise`, `final_paise`) are null while DRAFT and set at publish. A CHECK constraint (`deals_published_fields_check`) requires all of them to be set once the status is anything but DRAFT.

**content_uploads** (history, so an edited or deleted Drive link stays on record)
`id, deal_id, link, uploaded_at`

**applications**
`id, deal_id, creator_id, status (APPLIED | CONFIRMED | REJECTED), created_at, updated_at`, unique `(deal_id, creator_id)`

**payments**
`id, deal_id, type (COMMISSION | ADVANCE | FINAL), amount_paise, razorpay_order_id (unique), razorpay_payment_id (unique, nullable), status (CREATED | CAPTURED | FAILED), failure_reason, captured_at, razorpay_fee_paise (nullable), razorpay_tax_paise (nullable), created_at, updated_at`
The fee and tax are Razorpay's own, from its payment entity, for the deal report (section 17). Null when not recorded.
Partial unique indexes: one CAPTURED payment per `(deal_id, type)`, and one open (CREATED or FAILED) payment per `(deal_id, type)`.

**transfers**
`id, deal_id, payment_id, creator_id, type (ADVANCE | FINAL), amount_paise, razorpay_transfer_id (unique, nullable), status (PENDING | PROCESSED | FAILED | REVERSED), failure_reason, processed_at, razorpay_fee_paise (nullable), razorpay_tax_paise (nullable), manual_reference (nullable), manual_by_id (nullable), manual_at (nullable), created_at, updated_at`

**invoices**
`id, deal_id, payment_id, kind (COMMISSION_TAX_INVOICE | ADVANCE_RECEIPT | FINAL_RECEIPT), number (unique), financial_year, sequence, snapshot jsonb, issued_at`
Unique on `payment_id` (one invoice or receipt per payment). Numbering uses a row lock on a per-financial-year counter table (`invoice_counters`), so numbers are gapless and never duplicated. The tax invoice has its own counter; advance and final receipts share the `ADVANCE_RECEIPT` row (section 7.4).

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

All under `https://api.valueskins.com/api`. JSON. Errors are `{ error: { code, message } }` with correct HTTP status; validation errors additionally carry a `details` array of `{ path, message }` field errors. Every request body and query is validated with the Zod schemas from `packages/shared`. Lists use cursor pagination (`?cursor=&limit=`, max 50).

Auth and account
- `GET /auth/instagram/start` (`?link=1` to attach to the current user instead of logging in)
- `GET /auth/instagram/callback`
- `POST /auth/email/start` and `POST /auth/email/verify` (V0 launch, only when `AUTH_EMAIL_ENABLED`)
- `POST /auth/logout`
- `POST /dev/login` (non-production only)
- `GET /me` (returns `{ user, profile, onboarding }`: `profile` is the fetched Instagram profile - username, name, picture, followers, follows, media count, engagement rate, last sync - or `null` when no Instagram account is linked; `onboarding` is described in section 6.4)
- `POST /me/role` (once)
- `POST /me/instagram-username` (email-only accounts, before Instagram is connected)
- `POST /me/email` and `POST /me/email/verify` (token) and `POST /me/email/resend`
- `PUT /me/billing` (brand)
- `POST /me/payout-account`, `GET /me/payout-account`, `POST /me/payout-account/refresh` (creator)
- `DELETE /me` (account deletion)
- `POST /meta/data-deletion`, `POST /meta/deauthorize`, `GET /meta/deletion-status/:code`

Users
- `GET /users/:id/resume` (section 11)

Config
- `GET /config` (public: `{ gstRateBps, minBudgetPaise, advancePercent, authEmailEnabled, razorpayKeyId }`, used by the web app for the live breakdown preview and the sign-in options)

Deals
- `GET /deals/feed` (creator: OPEN deals with applications open, newest first, cursor pagination)
- `GET /deals/mine` (brand: my deals including drafts, optional `?status=`; creator: deals I'm confirmed on)
- `POST /deals` (create draft), `PATCH /deals/:id` (edit draft only; a field set to `null` is cleared), `DELETE /deals/:id` (draft only)
- `POST /deals/:id/publish` (needs billing details; validation failures are `400 VALIDATION_ERROR` with `details`; `409 BILLING_REQUIRED`; computes and freezes the breakdown with the live `GST_RATE_BPS`; sends email 1)
- `GET /deals/:id` (visibility: OPEN deals to any signed-in, onboarded user; otherwise only its brand, confirmed creator, admin; everyone else gets 404). The body is `{ deal }` with the deal fields, the frozen breakdown, the brand and creator, the derived flags `applicationsOpen` and `contentOverdue` (section 5.1), `allowedActions`, and, for the deal's brand and admins only, `applicationCount` and `creatorPayoutStatus`. `allowedActions` is a list of `{ action, enabled, reason }` for the signed-in user: `reason` says why a disabled action is disabled (section 18) and is null when enabled. Actions today: `EDIT_DRAFT`, `DELETE_DRAFT`, `PUBLISH`, `CONFIRM_CREATOR`, `CANCEL`, `APPLY`, `PAY_COMMISSION`, `PAY_ADVANCE` (disabled until the creator's payout account is ACTIVE), `PAY_FINAL`, `UPLOAD_CONTENT` (disabled once 20 links are used), `SEND_FEEDBACK`, `APPROVE`; the actions of later phases are added with their endpoints. `GET /deals/:id` also returns the delivery state (`contentLink`, `uploadCount`, `revisionCount`, `feedback`, `contentUploads[]`, the payment and approval times) and `revisionNotice` (the 5-revision warning) once the deal has had 5 revisions.
- `POST /deals/:id/cancel` (brand, from OPEN, CONFIRMED or COMMISSION_PAID, body `{ reason }`; `409 CANCELLATION_NOT_POSSIBLE` from ADVANCE_PAID to APPROVED; sends email 11)
- `POST /deals/:id/content` (the confirmed creator, body `{ link }`, from ADVANCE_PAID or REVISION_REQUESTED; a Drive or Docs https link; `409 WRONG_DEAL_STATUS`, `429 UPLOAD_LIMIT_REACHED` after 20; email 6)
- `POST /deals/:id/feedback` (brand, body `{ feedback }`, from CONTENT_UPLOADED; email 7)
- `POST /deals/:id/approve` (brand, from CONTENT_UPLOADED; email 8)
- `GET /deals/:id/emails` (communication history: the deal's emails to the brand and the creator, newest first, as `{ template, subject, bodyText, status, attachmentNames, recipient { role, username }, createdAt }`, without addresses; admins see every email logged for the deal; cursor pagination)
- `GET /deals/:id/events` (status changes from `deal_events`, oldest first, as `{ fromStatus, toStatus, actor { type, username }, note, createdAt }`; cursor pagination)
- `GET /deals/:id/documents/:kind` (PDF: `commission-invoice`, `advance-receipt`, `final-receipt`, `adp`; the deal's brand, its confirmed creator and admins, everyone else 404; `409 DOCUMENT_NOT_AVAILABLE` until the payment is captured, and for the report until COMPLETED)
- `POST /deals/:id/disputes`

Applications
- `POST /deals/:id/applications` (creator; needs an ACTIVE payout account, `403 PAYOUT_NOT_ACTIVE`; `409 APPLICATIONS_CLOSED`, `409 ALREADY_APPLIED`; sends email 2)
- `GET /deals/:id/applications` (brand that owns the deal)
- `GET /applications/mine` (creator: each application with a small summary of its deal)
- `POST /applications/:id/confirm` (brand that owns the deal; one transaction through `transitionDeal`; the creator's payout account must be ACTIVE, `409 CREATOR_PAYOUT_NOT_ACTIVE`; sends emails 3 and 3b)

Payments
- `POST /deals/:id/payments/:type/order` (type: `commission | advance | final`; the deal's brand; body `{}`; answers `{ orderId, amountPaise, currency, keyId, type }` for Checkout; `409 WRONG_DEAL_STATUS`, `409 CREATOR_PAYOUT_NOT_ACTIVE` for the advance)
- `POST /payments/verify` (the deal's brand; body `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`; answers `{ payment: { status }, deal }`)
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
10. Razorpay fees absorbed by ValueSkins (from Razorpay payment and transfer entities, stored on `payments` and `transfers` when captured; "Not recorded" for older rows), for information.
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
`NODE_ENV, PORT, DATABASE_URL, WEB_ORIGIN, COOKIE_DOMAIN, SESSION_COOKIE_NAME, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI, META_APP_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, EMAIL_TRANSPORT, ADMIN_INSTAGRAM_USER_IDS, DISPUTE_EMAIL, ENABLE_DEV_LOGIN, COMPANY_LEGAL_NAME, COMPANY_ADDRESS, COMPANY_STATE, COMPANY_GSTIN, COMMISSION_SAC_CODE, AUTH_EMAIL_ENABLED, GST_RATE_BPS` (the last two are V0 launch additions, V0_LAUNCH 2.1 and 2.6). `TEST_DATABASE_URL`, `COMPANY_GSTIN` and `ADMIN_INSTAGRAM_USER_IDS` default to empty when omitted, so a host that cannot define empty variables can leave them out. `PORT` is injected by Render.

Web env: `NEXT_PUBLIC_API_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID`, plus `NEXT_PUBLIC_ENABLE_DEV_LOGIN` and `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` (V0 launch, V0_LAUNCH 2.7). `next build` always runs with `NODE_ENV=production`, so the web dev login page is gated by `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` instead, and a build with that flag true and `NEXT_PUBLIC_API_URL` set to `https://api.valueskins.com` fails.

Staging (V0_LAUNCH 2.7) runs on Render's free Postgres plan: it expires 30 days after creation and has no backups. Production must use a paid plan with backups (section 2). Setup steps are in `docs/DEPLOYMENT.md`.

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
