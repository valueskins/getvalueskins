# ValueSkins - Product and Technical Spec (v2)

**Version:** 2.0 (supersedes the Sep 23, 2026 build prompt)
**Date:** Sep 24, 2026
**Owner:** CTO (Melove Gupta)
**Status:** Ready to build. Items marked **[CONFIRM]** need sign-off from the co-founder before the prompt that uses them.

---

## 0. What changed from v1 and why

| #   | v1 said                                                                | v2 says                                                                                                                                                                                                                                                                                                                                                                                                                     | Why                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `amount INT` in rupees                                                 | All money is integer **paise** (`BIGINT`)                                                                                                                                                                                                                                                                                                                                                                                   | ₹2,734.50 cannot be stored as an INT. Razorpay works in paise.                                                                                                                                                   |
| 2   | Flat ₹750 + GST commission, Razorpay fees absorbed                     | A flat commission of ₹750 + 18% GST = **₹885** on every deal, whatever the budget, as on the live site (REPLACEMENT_PLAN 2.2, Prompt 14). Minimum budget ₹5,000.                                                                                                                                                                                                                                                            | Prompt 5 made it `max(₹750, 5% of budget)`. Only the fee now goes through Razorpay, and the live site charges ₹885 on every deal, so the percentage is gone. The formula keeps its shape with a percentage of 0. |
| 3   | "No escrow", but ValueSkins collects and pays out via Payouts          | **Razorpay Route**: each creator is a Route linked account, and advance and final payments are transferred to it automatically                                                                                                                                                                                                                                                                                              | Moving third-party money through your own account with generic payouts is the wrong product. Route is Razorpay's product for marketplaces.                                                                       | **Superseded by row 8.**                                                                |
| 4   | Bank details for everyone, "Razorpay stores"                           | Only creators give payout details, through Route linked-account onboarding (legal name, PAN, bank, IFSC). Brands give billing details for GST. We never store PAN or full bank numbers.                                                                                                                                                                                                                                     | Brands pay by card/UPI/netbanking and never need a bank account on file. Creators need KYC to receive transfers.                                                                                                 | **Superseded by row 8.**                                                                |
| 5   | Webhook events `payment.authorized` / `payment.failed`                 | `payment.captured`, `order.paid`, `payment.failed`, plus Route transfer and linked-account events (all gone, row 8). Idempotent processing.                                                                                                                                                                                                                                                                                 | Authorized is not money received. Razorpay retries webhooks, so duplicates must be harmless.                                                                                                                     | Route and linked-account events are gone (row 8); transfer events stay until Prompt 13. |
| 6   | "Production only, no test mode"                                        | Build and test in **test mode**. Live keys exist only in the production environment.                                                                                                                                                                                                                                                                                                                                        | Testing a 3-payment flow with real money creates real refunds and real GST invoices for every bug.                                                                                                               |
| 7   | Instagram type auto-detected from followers, immutable                 | The role **comes from the Instagram account type** at every sign-in: `BUSINESS` is a brand and `MEDIA_CREATOR` is a creator. Users never choose it (REPLACEMENT_PLAN 2.3, Prompt 14; Prompt 4 had users choose it once).                                                                                                                                                                                                    | Follower count cannot tell a brand from a creator, but the account type can.                                                                                                                                     |
| 8   | Route linked accounts for creator payouts (rows 3 to 5)                | Razorpay Route is not available to ValueSkins (REPLACEMENT_PLAN 0). Only the fee goes through Razorpay. The creator's share is paid by the brand directly to the creator's **UPI ID**, which the creator saves with the name on the account and a consent (section 7.2). Prompt 12 replaced the payout setup and Prompt 13 the advance and final payments (section 7.3); the `transfers` table and all Route code are gone. | RBI's payment aggregator directions only allow paying out to third parties above a turnover ValueSkins does not have.                                                                                            |
| 8   | Instagram OAuth for everyone                                           | **Instagram API with Instagram Login** (Business Login for Instagram). Only Professional (Business or Creator) accounts can sign in. Needs Meta app review.                                                                                                                                                                                                                                                                 | The old Basic Display API is gone. Personal accounts are not supported by the current API.                                                                                                                       |
| 9   | Status enum missing CANCELLED and CLOSED_FOR_APPLICATIONS              | CANCELLED added. "Applications closed" is **derived** from `application_deadline`, not a status.                                                                                                                                                                                                                                                                                                                            | Fewer states, no cron needed to close applications.                                                                                                                                                              |
| 10  | "Reject Deal" allowed at CONTENT_UPLOADED                              | Removed. A brand can cancel free until it pays the fee (OPEN and CONFIRMED). From COMMISSION_PAID on, only an **admin** can cancel, through dispute resolution (REPLACEMENT_PLAN 2.6, Prompt 14).                                                                                                                                                                                                                           | Contradicted "no cancellation after advance". Also gives a way out when a creator disappears with the advance.                                                                                                   |
| 11  | "No external services"                                                 | Transactional email through **Resend** (single provider, own domain).                                                                                                                                                                                                                                                                                                                                                       | You cannot send 15 kinds of email reliably from nothing.                                                                                                                                                         |
| 12  | Disputes: user emails a Gmail address, "auto-CC both"                  | In-app **Raise dispute** form. The server emails `DISPUTE_EMAIL` (the support address unless set otherwise) with both parties CC'd, and stores it. Direct email still works.                                                                                                                                                                                                                                                | A direct email to Gmail cannot be auto-CC'd by us.                                                                                                                                                               |
| 13  | Upload limit 5 per deal, and unlimited revisions                       | Upload limit 20 per deal (anti-abuse). Notice suggesting a dispute after 5 revisions.                                                                                                                                                                                                                                                                                                                                       | Daily at 23:59 while content is past its upload deadline (a deadline that falls today counts); each person once a day                                                                                            |
| 14  | `valueskins.vercel.app` + `api.valueskins.render.com`                  | `valueskins.com` (Vercel) + `api.valueskins.com` (Render)                                                                                                                                                                                                                                                                                                                                                                   | Daily at 10:00 after 3 days in CONTENT_UPLOADED                                                                                                                                                                  |
| 15  | Razorpay generates the GST invoice                                     | ValueSkins generates its own GST tax invoice for the commission, with sequential numbering                                                                                                                                                                                                                                                                                                                                  | Razorpay Invoices are payment requests, not a tax invoice for a Checkout payment already made.                                                                                                                   |
| 16  | Render (unspecified plan)                                              | Paid always-on Render web service and paid Postgres with backups                                                                                                                                                                                                                                                                                                                                                            | Free instances sleep, which kills WebSockets and cron jobs.                                                                                                                                                      |
| 17  | "Creator gets refund if payment already made (only before commission)" | Removed. Creators never pay anything.                                                                                                                                                                                                                                                                                                                                                                                       | It described a case that cannot happen.                                                                                                                                                                          |
| 18  | Profile was whatever Instagram returned                                | Name, city, age and gender (creators), or name, city, website and a hiring pitch (brands), are entered **once and then locked**. Age is stored with the date it was given, so it rises each year. The resume shows them with the contact email (REPLACEMENT_PLAN 2.4, 2.5, Prompt 14).                                                                                                                                      | The live site does this, and with no chat the two sides need each other's details.                                                                                                                               |
| 19  | Any address could be used for "write to us"                            | One `SUPPORT_EMAIL` is the footer of every email, the reply-to, and the address in error messages. `DISPUTE_EMAIL` defaults to it (REPLACEMENT_PLAN 2.7, Prompt 14).                                                                                                                                                                                                                                                        | One address to agree and to change.                                                                                                                                                                              |

---

## 1. Product in one paragraph

A brand posts a deal (for example "3 Instagram posts for ₹10,000"). Creators apply. The brand confirms one creator. The brand pays ValueSkins' commission (₹885). The brand pays the creator a 30% advance (₹2,734.50), paid directly by UPI to the creator and confirmed by the creator. The creator uploads the content as a Google Drive link. The brand requests changes or approves. The brand pays the remaining 70% (₹6,380.50), paid directly by UPI to the creator and confirmed by the creator. Both parties get a Deal Report (ADP) PDF with all invoices and proof of delivery. The brand's total is exactly the budget. No chat, no negotiation.

---

## 2. Tech stack

| Layer         | Choice                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo          | pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`                                                                                      |
| Language      | TypeScript, `strict: true`, everywhere                                                                                                        |
| Frontend      | Next.js (App Router, current stable), React, Tailwind CSS, TanStack Query, socket.io-client. Hosted on **Vercel** at `https://valueskins.com` |
| Backend       | Node.js 22 LTS, Express 5, Socket.io, Zod, pino. Hosted on **Render** (paid, always-on, single instance) at `https://api.valueskins.com`      |
| Database      | PostgreSQL on **Render** (paid plan with backups). Drizzle ORM + drizzle-kit migrations                                                       |
| Payments      | Razorpay: Standard Checkout + Orders (the commission only; the creator is paid directly by UPI, REPLACEMENT_PLAN 2.1)                         |
| Auth          | Instagram API with Instagram Login. Server-side sessions in Postgres, httpOnly cookie                                                         |
| Email         | Resend, sending from `notifications@valueskins.com` (SPF + DKIM on the domain)                                                                |
| PDF           | PDFKit, generated on demand, never stored                                                                                                     |
| Jobs          | node-cron inside the API process, each job guarded by a Postgres advisory lock                                                                |
| Rate limiting | rate-limiter-flexible with the Postgres store                                                                                                 |
| Tests         | Vitest. API integration tests run against a real Postgres (docker compose locally, service container in CI)                                   |
| CI            | GitHub Actions: typecheck, lint, test on every PR                                                                                             |
| File storage  | None. Google Drive links for content, Instagram URLs for profile pictures                                                                     |

`packages/shared` holds: money math, the deal state machine definition, Zod request/response schemas, enums, and UI copy constants. Both apps import it so the numbers and rules can never disagree.

---

## 3. Core constraints (the product rules)

1. One brand and one creator per deal. No multi-creator deals, no creator-creator collabs.
2. Real-time deal feed: new deals appear for creators instantly over WebSocket.
3. No niches, no categories, no filtering. All open deals are visible to all creators.
4. No negotiation. The budget is final.
5. No chat. The only brand-to-creator text is revision feedback.
6. The ValueSkins fee goes brand -> Razorpay -> ValueSkins. The creator's share is paid by the brand directly to the creator's UPI ID and never passes through ValueSkins (REPLACEMENT_PLAN 2.1).
7. Account type (Creator or Brand) is chosen once at onboarding and is locked.
8. Instagram is the profile. It is fetched automatically and refreshed daily.
9. Creators save their UPI ID and the name on the account once. Brands set up billing details once.
10. A verified email is required before using the marketplace.
11. The virtual resume is visible on hover over any user, everywhere.
12. Everyone is equal: no tiers, no levels, no badges.
13. No length limits on deal descriptions.
14. Deal communication happens by email, and every email about a deal is visible to both parties on the deal page.
15. No phone numbers shown or used for communication. (See 7.2 about Razorpay possibly requiring one for KYC.)
16. Web app only, responsive for desktop and tablet, usable on mobile browsers.
17. The fee (commission) is non-refundable once paid.
18. After the fee is paid, neither party can cancel. Only an admin can, through a dispute.
19. Plain black UI. No gradients, no shadows, no emojis, no em dashes, no marketing language.

---

## 4. Money

### 4.1 Rules

- All amounts are stored and computed as **integer paise** (`BIGINT` in Postgres, `number` in TS, validated as safe integers). Never floats.
- Brands enter the budget in **whole rupees**. The server converts it to paise.
- All money math lives in `packages/shared/src/money.ts`. Nothing else computes amounts.
- The breakdown is computed **once, at publish**, and frozen on the deal row. Later config changes never affect published deals.

### 4.2 Formula **[CONFIRM the ₹5,000 minimum budget with the live site]**

Config (in `packages/shared/src/config.ts`):

```
MIN_BUDGET_PAISE          = 5_000_00     // ₹5,000
COMMISSION_FLAT_PAISE     = 750_00       // ₹750
COMMISSION_PERCENT_BPS    = 0            // no percentage: the fee is flat (REPLACEMENT_PLAN 2.2)
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

| Item                         | Paise     | Rupees    |
| ---------------------------- | --------- | --------- |
| Commission base              | 75,000    | 750.00    |
| GST 18%                      | 13,500    | 135.00    |
| Commission total (Payment 1) | 88,500    | 885.00    |
| Creator amount               | 911,500   | 9,115.00  |
| Advance 30% (Payment 2)      | 273,450   | 2,734.50  |
| Final 70% (Payment 3)        | 638,050   | 6,380.50  |
| Brand pays in total          | 1,000,000 | 10,000.00 |

Worked example, budget ₹50,000: commission base ₹750, GST ₹135, total ₹885, creator ₹49,115, advance ₹14,734.50, final ₹34,380.50. The fee is ₹885 at every budget; only the creator's share grows.

`computeBreakdown` takes the GST rate as an optional parameter (basis points), defaulting to `GST_RATE_BPS` above. The API passes its `GST_RATE_BPS` env var, which defaults to `1800`. GST is charged (REPLACEMENT_PLAN 2.2), so a startup guard refuses to start when it is above 0 and `COMPANY_GSTIN` is empty. A deal keeps the breakdown frozen when it was published, whatever the rate is later.

Worked example at GST 0 (a test environment, no GST): budget ₹10,000: commission base ₹750, GST ₹0, total ₹750, creator ₹9,250, advance ₹2,775, final ₹6,475.

### 4.3 Razorpay fees

ValueSkins absorbs Razorpay's fees. They are never shown to or charged to users, except as an informational line in the ADP.

**Closed (Prompt 13).** Razorpay now charges a fee only on ValueSkins' commission. The advance and final are paid directly by the brand to the creator's UPI ID (section 7.3), so there is no Route transfer, no platform float and no gateway fee to add to what the brand pays. The brand's total is exactly the budget.

---

## 5. Deal lifecycle

### 5.1 Statuses

`DRAFT, OPEN, CONFIRMED, COMMISSION_PAID, ADVANCE_PAID, CONTENT_UPLOADED, REVISION_REQUESTED, APPROVED, COMPLETED, CANCELLED`

Derived flags (not statuses):

- `applications_open` = `status == OPEN && now < end_of_day_IST(application_deadline)`
- `content_overdue` = `status in (ADVANCE_PAID, REVISION_REQUESTED) && now > end_of_day_IST(content_upload_deadline)`

### 5.2 Transitions (the only allowed ones)

| From                                                                          | To                 | Who     | Trigger                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DRAFT                                                                         | OPEN               | Brand   | Publish (validates fields, computes and freezes money breakdown)                                                                                                                                                                                                                                                                                                               |
| DRAFT                                                                         | (deleted)          | Brand   | Delete draft                                                                                                                                                                                                                                                                                                                                                                   |
| OPEN                                                                          | CONFIRMED          | Brand   | Confirm one application. All other applications become REJECTED in the same transaction. Creator must have a UPI ID, a name and consent saved (`409 CREATOR_PAYOUT_NOT_SET`).                                                                                                                                                                                                  |
| OPEN                                                                          | CANCELLED          | Brand   | Cancel, free                                                                                                                                                                                                                                                                                                                                                                   |
| CONFIRMED                                                                     | COMMISSION_PAID    | System  | Commission payment captured (webhook)                                                                                                                                                                                                                                                                                                                                          |
| CONFIRMED                                                                     | CANCELLED          | Brand   | Cancel, free                                                                                                                                                                                                                                                                                                                                                                   |
| COMMISSION_PAID                                                               | ADVANCE_PAID       | Creator | The confirmed creator confirms the brand's direct UPI advance payment arrived (`POST /direct-payments/:id/confirm`). The brand recording a payment never moves the deal.                                                                                                                                                                                                       |
| ADVANCE_PAID                                                                  | CONTENT_UPLOADED   | Creator | Upload a Google Drive link                                                                                                                                                                                                                                                                                                                                                     |
| CONTENT_UPLOADED                                                              | REVISION_REQUESTED | Brand   | Send feedback                                                                                                                                                                                                                                                                                                                                                                  |
| CONTENT_UPLOADED                                                              | APPROVED           | Brand   | Final approval                                                                                                                                                                                                                                                                                                                                                                 |
| REVISION_REQUESTED                                                            | CONTENT_UPLOADED   | Creator | Upload a new link                                                                                                                                                                                                                                                                                                                                                              |
| APPROVED                                                                      | COMPLETED          | Creator | The confirmed creator confirms the brand's direct UPI final payment arrived.                                                                                                                                                                                                                                                                                                   |
| COMMISSION_PAID, ADVANCE_PAID, CONTENT_UPLOADED, REVISION_REQUESTED, APPROVED | CANCELLED          | Admin   | Dispute resolution (`POST /admin/deals/:id/cancel`); the brand cannot cancel from COMMISSION_PAID on. The note is required and becomes the cancellation reason; a manual refund reference is optional. Both are kept in the deal event (its note, and its metadata `refundReference`), because the deals table has no column for the reference. The commission is always kept. |

Everything else is rejected with `409 INVALID_TRANSITION`. Creators cannot cancel at any stage. A brand can cancel free until it pays the fee (OPEN and CONFIRMED). From COMMISSION_PAID to APPROVED the brand's cancel answers `409 CANCELLATION_NOT_POSSIBLE` and its CANCEL action is disabled with "The deal cannot be cancelled after the fee is paid. Write to us if something is wrong." The table has 16 rows.

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
2. **Creators apply.** Feed shows brand name (hover for virtual resume), budget, creator amount, deadlines, description. Apply needs a saved UPI ID, name and consent (`403 PAYOUT_NOT_SET`). If it is missing, the button reads "Add your UPI ID to apply" and links to settings.
3. **Brand confirms a creator.** Application list with hover resumes. Confirm on one creator, and the rest are auto-rejected.
4. **Payment 1, commission.** "Pay commission: ₹885.00". Razorpay Checkout. On capture: COMMISSION_PAID, invoice issued (a tax invoice when GST is charged), Email 4 with it attached.
5. **Payment 2, advance, paid directly.** "Pay advance: ₹2,734.50". The brand pays the creator's UPI ID outside ValueSkins (a `upi://pay` link and QR code from `GET /deals/:id/direct-payment`) and records the UPI reference (`POST /deals/:id/direct-payment`); recording does not move the deal. The creator gets Email 17, checks their UPI app and confirms (`POST /direct-payments/:id/confirm`): ADVANCE_PAID, Email 5 to both with the payment record attached. If the money did not arrive the creator says so (`POST /direct-payments/:id/not-received`, Email 18 to both, alert A1 to the admin): the record is kept, marked not received, and the brand records again.
6. **Creator uploads content.** Countdown to the upload deadline. Paste a Google Drive link (validated as `https://drive.google.com/...` or `https://docs.google.com/...`). CONTENT_UPLOADED, Email 6. Every link is kept in `content_uploads`, so a re-upload never erases the earlier ones; at most 20 links per deal. Uploading after the deadline is allowed (the deal is only flagged overdue).
7. **Brand reviews.** Either "Suggest changes" (text, REVISION_REQUESTED, Email 7) or "Final approval" (APPROVED, Email 8). After 5 revisions, both see: "This deal has had 5 revisions. If you cannot agree, raise a dispute." The feedback text and its time are kept as the note of the deal event, and each round adds one to `revision_count`.
8. **Payment 3, final, paid directly.** "Pay final: ₹6,380.50". The same flow as the advance. When the creator confirms: COMPLETED, Email 9 with the payment record attached, then ADP ready, Email 10.
9. **ADP.** Downloadable by both parties from the deal page at any time after completion, and attached to Email 10. Generated on demand.

---

## 6. Authentication and onboarding

### 6.1 Instagram login

- Product: **Instagram API with Instagram Login** (Business Login for Instagram), host `graph.instagram.com`, scope `instagram_business_basic`.
- Only public Instagram **Business** and **Creator** accounts can sign in, and the **role comes from the account type at every sign-in**: `BUSINESS` is a brand and `MEDIA_CREATOR` is a creator (`roleFromAccountType` in `packages/shared`). Any other type, or none, stops the sign-in with: "ValueSkins needs a public Instagram Business or Creator account. A Business account posts deals as a brand. A Creator account applies to deals." (redirect code `account_type_unsupported`). Meta's docs list the values as Business and Media_Creator; the API sends them in capitals and the mapping ignores case.
- The type is stored (`users.ig_account_type`). A returning account follows a changed type only if it has no deals as a brand, and no deals or applications as a creator (a draft counts); the check and the change run in one transaction with the user row locked, so a deal cannot be created in between. Otherwise sign-in is refused with `409 ACCOUNT_TYPE_CHANGE_BLOCKED`, which names the support address (redirect code `account_type_change_blocked`), and nothing changes. When the type does change, the saved profile details start again, because they are for the old role. Link mode follows the same rules, and is how an email-only account gets its role.
- Flow:
  1. Web "Continue with Instagram" goes to `GET https://api.valueskins.com/api/auth/instagram/start`. The API sets a signed `state` cookie and redirects to Instagram's authorize URL.
  2. Instagram redirects to `GET /api/auth/instagram/callback?code&state`. The API verifies state, exchanges the code for a short-lived token, exchanges that for a long-lived token (about 60 days), and fetches the profile.
  3. Upsert the user by Instagram user id, with the role from the account type (above). Create a session. Redirect to `https://valueskins.com/onboarding` if onboarding is incomplete, else `/home`.
- **Link mode**: `GET /api/auth/instagram/start?link=1` (must already be logged in) attaches the fetched Instagram account to the current user instead of creating a session, and redirects to `/home` on success. If that Instagram account already belongs to a different user, nothing is mutated and the browser is redirected with an error instead.
- Profile fields fetched from `/me`: `user_id, username, name, account_type, profile_picture_url, followers_count, follows_count, media_count, biography`. Verify the exact field list against Meta's docs at build time. If `biography` is not available on `/me`, drop it.
- Engagement rate = average of (likes + comments) over the latest 12 media, divided by followers, as a percentage with 2 decimals. Null if fewer than 3 posts or 0 followers.
- The long-lived token is stored **encrypted** (AES-256-GCM, key from env `TOKEN_ENCRYPTION_KEY`). It is renewed by the daily `instagram-refresh` job when it has less than 10 days left (section 14).
- Profile is refreshed on every login and by the daily `instagram-refresh` job (section 14). The name is the Instagram name only until the user's profile is locked (section 6.4); after that it is the name the user gave. `is_admin` is recomputed from `ADMIN_INSTAGRAM_USER_IDS` on every login/upsert, in both directions.
- Meta app requirements, built into the product: `/privacy` and `/terms` pages on the web app, a **data deletion callback** (`POST /api/meta/data-deletion`, returns a confirmation code and status URL, `GET /api/meta/deletion-status/:code` to check it) and a **deauthorize callback** (`POST /api/meta/deauthorize`). Both verify Meta's `signed_request` with `META_APP_SECRET`. Deauthorize only clears the now-invalid stored token (`ig_token_encrypted`, `ig_token_expires_at`) for that Instagram user id — it does not delete the account; full soft-delete and anonymization (section 15) is exclusive to data-deletion and `DELETE /me`.

### 6.2 Dev login (non-production only)

Meta app review takes weeks, and building cannot wait. In development and staging, `POST /api/dev/login` accepts `{ username, role }` and creates or logs in a fake user with fake Instagram data (the account type is set to match the role, `BUSINESS` or `MEDIA_CREATOR`; the role is a dev-only shortcut and never comes from a request in production). It is registered only when `NODE_ENV !== 'production'` **and** `ENABLE_DEV_LOGIN=true`. A startup check crashes the process if both `NODE_ENV=production` and `ENABLE_DEV_LOGIN=true` are set.

### 6.3 Sessions and security

- Session = random 32-byte token in an httpOnly, Secure, `SameSite=Lax` cookie with `Domain=.valueskins.com`. Only its SHA-256 hash is stored in `sessions`. 30-day expiry, sliding.
- Every mutating request must carry an `Origin` header equal to `WEB_ORIGIN` (`https://valueskins.com` in production), checked server side as CSRF protection, in addition to SameSite. Webhook and Meta callback routes are exempt (they verify signatures instead).
- Logout deletes the session row.
- Socket.io authenticates with the same cookie during the handshake.

### 6.4 Onboarding (all steps required, in order)

1. **Instagram profile.** Show the fetched Instagram data. "Is this you?" There is no account type question: the role comes from the Instagram account type (section 6.1).
2. **Email.** Required. The server sends a verification link (token valid 24 hours, single use, only the hash stored). The user must click it before continuing. Changing email later re-runs verification.
3. **Profile details, saved once and then locked** (`PUT /me/profile`). The fields depend on the role of the session, never on the request.
   - Creators: name, city, age (18 to 99) and gender (`MALE`, `FEMALE`, `OTHER`, `PREFER_NOT_TO_SAY`).
   - Brands: name, city, website (`http://` or `https://`, up to 200 characters) and an optional hiring pitch (up to 1,000 characters).
   - Both tick "I am 18 or older" (`adultConfirmed: true`), stored as `adult_confirmed_at`. Names and cities are 2 to 100 characters; a name uses letters, spaces, dots, hyphens and apostrophes. Bodies are strict: a field for the other role is rejected.
4. **Type-specific setup.**
   - Creator: **UPI payout details** (section 7.2). Creators may browse deals before finishing, but cannot apply until they have saved a UPI ID, the name on the account and consent.
   - Brand: **Billing details**: billing name, billing state (for GST place of supply), billing address, GSTIN (optional, validated format). Required before publishing a deal.
5. **Marketplace.**

Which steps apply, which are done and which is next is returned by `GET /me` as `onboarding` (`{ completed, nextStep, steps: [{ id, done, required }] }`, step ids `instagram`, `email`, `profile`, `billing`, `payout`), computed by `computeOnboarding` in `packages/shared`. `GET /me` also returns `profileDetails` (the locked details with the current age, or null before they are saved). Marketplace is UI-only and not tracked.

- **Completion.** `onboarding_completed_at` is set, once and never unset, when Instagram is connected, the email is verified, the profile is saved, plus billing details for a brand. The UPI payout step is not required to complete: creators may browse before finishing it. It is done when the UPI ID, name and consent are all saved, and it gates applying and being confirmed, not onboarding.
- **Email-only accounts** (staging and tests, section 6.5) have no role, so they see only the Instagram and email steps and cannot finish until they connect Instagram (`GET /auth/instagram/start?link=1`, which also gives them their role). Until then every role-gated route answers `403 INSTAGRAM_NOT_CONNECTED` ("Connect your Instagram account to continue.").
- **Profile** (`PUT /me/profile`): once only, by one conditional `UPDATE ... WHERE profile_locked_at IS NULL`, so two racing requests cannot both win. A second save answers `409 PROFILE_LOCKED`, naming `SUPPORT_EMAIL`: corrections go to support by email, who fix the row by hand. It saves the age and the time it was given (`age`, `age_recorded_at`); the **current age** is the age plus the whole years since, worked out on read (`currentAge` in `packages/shared`) and never stored. `users.name` becomes the name given, and Instagram sign-in stops overwriting it. Followers and engagement still come from Instagram and refresh on sign-in. Rate limited (section 13). Users who finished onboarding before Prompt 14 keep their completion and may save the profile later; nothing is gated on it yet.
- **Email for Instagram accounts** (`POST /me/email`, `/me/email/verify`, `/me/email/resend`). `users.email` changes only when the new address is verified, so a changed address leaves the old verified one in place until then. The link is `WEB_ORIGIN/verify-email?token=...`, valid 24 hours, single use, only the hash stored, bound to the signed-in user; every bad token is the same `400 INVALID_TOKEN`. `POST /me/email` always answers 200 whether or not another account uses the address; a clash is reported at verify time as `409 EMAIL_TAKEN`. Email-only accounts cannot use these routes (`409 EMAIL_IS_SIGN_IN`): their email is their sign-in. Resend is rate limited (section 13).
- **Brand billing** (`PUT /me/billing`): brands only, GSTIN format-validated.

### 6.5 Email login (staging and tests only)

Production sign-in is **Instagram only** (REPLACEMENT_PLAN 2.3): `AUTH_EMAIL_ENABLED` is `false` in production, and a startup guard refuses to start with `NODE_ENV=production` and `AUTH_EMAIL_ENABLED=true`. On staging and in tests it enables an email-code login path alongside Instagram login. Codes are tracked in `email_login_codes` (section 15); a user created this way has `instagram_user_id`, `ig_account_type`, `ig_token_encrypted` and `ig_token_expires_at` all null until they later link Instagram.

- `POST /auth/email/start { email }`: always responds `200 { ok: true }`, regardless of whether an account exists for that email — this is the whole non-enumeration mechanism, not a special case on top of it. Generates a 6-digit numeric code, invalidates any prior unused code for that email, and sends it with the "Your sign-in code" template. Valid for 10 minutes. Rate limited as a login attempt (section 13).
- `POST /auth/email/verify { email, code }`: on a correct, unexpired, unused code with fewer than 5 prior wrong attempts on it, marks the code used, finds the user by email or creates one (`email_verified_at` set immediately), and creates a session. Every failure (no code, wrong code, expired, 5 attempts already used) returns the identical `400 INVALID_CODE` — never distinguished. Also rate limited as a login attempt.
- A brand-new email-only user has no Instagram handle to derive a username from; `username` and `name` default to the email's local-part. It has no role until it connects Instagram (section 6.4).

---

## 7. Razorpay

### 7.1 Modes and keys

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` come from env.
- Local and staging use **test keys**. Production uses live keys. The API logs the mode (`test` or `live`) at startup, and refuses to start if `NODE_ENV=production` with a test key, or non-production with a live key.
- Route is not used (REPLACEMENT_PLAN 0). Only the commission is paid through Razorpay.

### 7.2 Creator payout details (UPI)

Replaces the Route linked-account setup (REPLACEMENT_PLAN 2.1). Nothing is sent to Razorpay.

- **Fields:** the UPI ID (`vpa`), the name on the account as the creator's UPI app shows it (`name`), and consent. Body of `PUT /me/payout-upi`: `{ vpa, name, consent: true }`, unknown fields rejected.
- **UPI ID format:** `^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32}$`, trimmed and stored in lower case. Enforced by the Zod schema and by a database CHECK (`users_payout_vpa_check`). Anything shaped like a bank account number (9 to 18 digits), a PAN or an IFSC code is refused with a message that says so; the same shapes are refused as the name. Messages never repeat what was typed.
- **Name:** 2 to 80 characters, letters in any script, spaces, dots, hyphens and apostrophes.
- **Consent:** "I agree my UPI ID and name are shown to a brand that confirms me on a deal." Saving stamps `payout_vpa_consent_at`; saving again replaces everything. The page also says: "We do not verify UPI IDs. Enter yours carefully. A payment to a wrong UPI ID cannot be recalled."
- **Storage:** `users.payout_vpa`, `payout_name`, `payout_vpa_consent_at`. Never PAN, bank account numbers or IFSC. Account deletion clears all three.
- **Disclosure:** the full UPI ID goes only to the brand confirmed on a deal, only when the creator consented and only while a direct payment is due (`GET /deals/:id/direct-payment`, section 7.3a). Everywhere else, including the creator's own settings, it is masked: `cr•••@okhdfcbank` (the first two characters before the @, or one if there are only two). `GET /me/payout-upi` answers `{ payoutUpi: { maskedVpa, name, consentAt } | null }`. It is never logged: the logger redacts UPI-shaped values and the keys `vpa`, `upi` and `payout`.
- **Endpoints:** `PUT /me/payout-upi` (creators only, 10 saves per hour per user) answers `{ payoutUpi, onboarding }`; `GET /me/payout-upi` (creators only).
- **Gating:** applying needs all three (`403 PAYOUT_NOT_SET`, "Add your UPI ID to apply"); confirming an applicant needs them still saved (`409 CREATOR_PAYOUT_NOT_SET`).

### 7.3 Payments

- For the commission, the server creates a Razorpay Order: amount from the frozen breakdown, `currency: INR`, `receipt` = `<dealShortId>-<type>` (`commission` is the only type), notes `{ deal_id, type }`. Capture is automatic through the Razorpay account setting (the Orders API takes no per-order flag).
- **The advance and final are not Razorpay payments.** They are direct brand-to-creator UPI payments (section 7.3a). `POST /deals/:id/payments/:type/order` accepts only `commission`; any other type is `400 VALIDATION_ERROR`.
- Only one open Order per deal per deal for the commission (a partial unique index enforces it, and a lock stops two simultaneous requests creating two). If one exists and is unpaid, it is reused. A declined attempt does not close the order: `payment.failed` marks the payment FAILED with Razorpay's reason and leaves the deal untouched, and the next order request reuses the same Razorpay order and reopens it (CREATED). A late successful capture is accepted from CREATED or FAILED.
- The endpoint checks: the caller is the deal's brand (anyone else gets 404), and the deal is in the correct status (CONFIRMED; otherwise `409 WRONG_DEAL_STATUS`).
- Frontend opens Razorpay Checkout with the Order id. On the Checkout success handler it calls `POST /api/payments/verify` with `razorpay_order_id, razorpay_payment_id, razorpay_signature`. The server verifies the signature.
- **Both** the verify endpoint and the webhook call the same idempotent function `markPaymentCaptured(orderId, paymentId)`. Whichever arrives first performs the transition. The second is a no-op. It does not trust the browser or the webhook body: it fetches the payment from Razorpay and requires status `captured`, the same order, the order's amount and `INR`; a mismatch records nothing, answers `409 PAYMENT_AMOUNT_MISMATCH` (or `PAYMENT_ORDER_MISMATCH`, `PAYMENT_NOT_CAPTURED`) and alerts the admin (A1). In one transaction it marks the payment CAPTURED, issues the commission invoice and transitions the deal with a SYSTEM actor (CONFIRMED to COMMISSION_PAID). Email 4 goes out after commit, with the invoice attached (section 7.4). If the deal is no longer in the status the payment moves it from (for example the brand cancelled while Checkout was open), the payment is still recorded as CAPTURED, the deal is left alone, and the admin is alerted to refund it by hand (section 12). A second captured payment for the same deal is marked FAILED and flagged for refund.
- `POST /payments/verify` checks the Checkout signature (HMAC-SHA256 of `order_id|payment_id` with the key secret, constant-time compare, `400 INVALID_SIGNATURE`), then calls `markPaymentCaptured`. Only the deal's brand can verify its payments.
- Webhook endpoint `POST /api/webhooks/razorpay`:
  - Uses the raw body for HMAC-SHA256 signature verification with the webhook secret. Invalid signature returns 400.
  - Deduplicates on the `x-razorpay-event-id` header, stored in `webhook_events`. Duplicates return 200 immediately.
  - Handles, by a registry keyed by event type: `payment.captured`, `order.paid` (both call `markPaymentCaptured`) and `payment.failed`. An event with no handler (for example `settlement.processed`, or an old `transfer.*` or `product.route.*`) is stored and marked processed.
  - Always returns 200 quickly after storing the event: the event is processed after the response. The stored payload is redacted (PAN, KYC, phone and legal info removed, account numbers reduced to their last 4 digits, and the payer's email, contact, VPA, card, bank and wallet details removed). Processing errors are recorded on the event row (the message, never the payload) and alerted to the admin (template A1, sent to `DISPUTE_EMAIL`), never retried in a loop.

### 7.3a Direct payments (advance and final)

REPLACEMENT_PLAN 2.1. The brand pays the creator's UPI ID itself; ValueSkins never receives or holds that money. A `direct_payments` row records each attempt and is never edited or deleted once it is confirmed or disputed (a correction is a new row).

- **What to pay** (`GET /deals/:id/direct-payment`, the deal's brand only, `Cache-Control: no-store`): the stage due (the advance in COMMISSION_PAID, the final in APPROVED), the amount from the frozen breakdown, the creator's full UPI ID and name, the `upi://pay` fields (`pa`, `pn`, `am` with two decimals built with integer math, `cu=INR`, `tn` = `ValueSkins <shortId> advance|final`) and the ready link. This is the only response that carries the full UPI ID, and only while a stage is due and the creator has saved all three payout details. Otherwise `blocked` is `no_creator`, `not_due`, `creator_has_no_upi` or `no_consent` and nothing about the creator comes back. While a record waits for the creator, `record` shows it and the details stay visible.
- **Record** (`POST /deals/:id/direct-payment`, the deal's brand, body `{ stage, reference, note? }`): the reference is 6 to 40 characters from `A-Z a-z 0-9 - /`; the note is optional (500). The stage must be the one due (`409 WRONG_DEAL_STATUS`), the creator must have details (`409 CREATOR_PAYOUT_NOT_SET`). The amount is the frozen one; a client amount is rejected. The row snapshots the creator's UPI ID in `paid_to_vpa` and the amount. A partial unique index allows one live (not disputed) record per deal and stage, so a second record while one waits is `409 DIRECT_PAYMENT_ALREADY_RECORDED`. Recording never changes the deal status. Email 17 goes to the creator. 10 per hour per brand.
- **Confirm** (`POST /direct-payments/:id/confirm`, the deal's confirmed creator only; the brand, other creators and admins cannot): one `transitionDeal` with a CREATOR actor (COMMISSION_PAID to ADVANCE_PAID, or APPROVED to COMPLETED, with `advance_paid_at` or `completed_at`) in the same transaction as the record's confirmation and the payment record document (section 7.4). Two confirms at once: one wins, the other is `409`. A deal cancelled in the meantime answers `409 INVALID_TRANSITION`. Emails 5 or 9 go to both with the payment record attached; on the final, email 10 follows. 20 an hour per creator, shared with not received.
- **Not received** (`POST /direct-payments/:id/not-received`, the confirmed creator, body `{ reason }`): marks the record disputed (`disputed_at`, `dispute_reason`). The deal does not move. Email 18 goes to both and alert A1 to the admin. It is an alert, not a row in `disputes` (REPLACEMENT_PLAN 2.7). The brand can then record again. A confirmed or disputed record cannot be decided again (`409 DIRECT_PAYMENT_NOT_PENDING`).
- **Database rules:** not both confirmed and disputed; `confirmed_by` set exactly when `confirmed_at` is; `dispute_reason` set exactly when `disputed_at` is.
- **Privacy:** the UPI ID is masked everywhere else: the deal detail's `directPayments[]`, the creator's own views, documents, the report, emails, deal events and logs. It is never in `deal_events` metadata or an email body.

### 7.4 Invoices

- **Commission invoice**, issued by Valueskins Private Limited to the brand when Payment 1 is captured. Number `VS/2026-27/000001`. Contents: ValueSkins legal name, address, GSTIN (when it has one), SAC code, brand billing name, address, state and GSTIN if any, place of supply (the brand's billing state), taxable value, tax, total, Razorpay payment id, date. **[CONFIRM format with the CA before go-live.]**
  - With GST charged, the document is titled "Tax Invoice" and splits the GST into CGST + SGST when the brand's billing state is the company's state (`COMPANY_STATE`), or IGST when it is not. The two states are compared as text, ignoring case and spacing, so a misspelled state is billed as IGST. The odd paisa of an odd GST amount goes to SGST so the halves add up.
  - With GST 0 (a test environment: GST is charged by default, section 4.2) the document is titled "Invoice" and has no tax lines. The amounts always come from the deal's frozen breakdown, never from today's rate.
- **Advance payment record** and **Final payment record** (REPLACEMENT_PLAN 2.1): issued when the creator confirms a direct payment. They are not receipts and not GST documents. They say: "Paid directly by the brand to the creator by UPI. ValueSkins did not receive or hold this money." Contents: the creator's name on the account, username, Instagram user id and masked UPI ID, the brand's billing name, the amount, the UPI reference and note, the time the brand recorded it and the time the creator confirmed it. Both stages share one gapless series, `VS-PR/2026-27/000001`, `000002`, and so on.
- Tax invoices and payment records are numbered in separate gapless sequences per financial year (April to March, in IST). One upsert on the counter row (`invoice_counters`) takes its lock and holds it until the transaction that issues the invoice ends, so concurrent captures queue up and a rollback leaves no hole. The payment record sequence is the `ADVANCE_PAYMENT_RECORD` counter row; `FINAL_PAYMENT_RECORD` uses the same one.
- The commission invoice is issued inside the transaction that marks its payment captured (section 7.3), once per payment (unique on `payment_id`; a payment recorded on a deal that cannot take it gets none). A payment record is issued inside the transaction that confirms its direct payment (section 7.3a), once per direct payment (unique on `direct_payment_id`). An invoice row belongs to exactly one of the two.
- The invoice number and a JSON snapshot of all its data (company details from env at that moment included) are stored in `invoices` when issued, so re-rendering later always produces the same document, byte for byte. PDFs are rendered on demand with PDFKit and never stored, in an embedded DejaVu Sans font (the built-in fonts have no rupee sign), plain black on white.
- Each document is downloaded from `GET /deals/:id/documents/:kind` (section 16) by the deal's brand, its confirmed creator or an admin, once its payment is captured; the deal report only when the deal is COMPLETED. They are also attached to emails 4 (brand), 5, 9 and 10 (section 8).

---

## 8. Emails

Sent through Resend from `ValueSkins <notifications@valueskins.com>`, reply-to `SUPPORT_EMAIL`. Every email ends with the line "Questions? Write to <SUPPORT_EMAIL>." (text and HTML), added in one place when the email is logged and sent, so it is in the stored text and in an admin resend, and never doubled. Every email is plain text plus minimal HTML (black text on white for email-client readability), no images except the wordmark, and no emojis. Every send is logged in `email_log`. Every deal-related email is visible to both parties in the deal's Communication history.

In development, `EMAIL_TRANSPORT=console` prints emails to the log instead of sending. A startup guard crashes the process if `EMAIL_TRANSPORT=console` with `NODE_ENV=production` — printed emails include verification links and sign-in codes, which must never reach production logs (section 20).

| #   | Template                        | To                                                                | When                                                                                                                                                                                                |
| --- | ------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E0  | Verify your email               | User                                                              | Email entered or changed                                                                                                                                                                            |
| E1  | Your sign-in code               | User                                                              | Email-code login started (staging and tests only, section 6.5)                                                                                                                                      |
| 1   | Deal published                  | Brand                                                             | Deal goes OPEN                                                                                                                                                                                      |
| 2   | New application                 | Brand                                                             | Creator applies                                                                                                                                                                                     |
| 3   | You were selected               | Creator                                                           | Brand confirms                                                                                                                                                                                      |
| 3b  | Application not selected        | Other applicants                                                  | Brand confirms someone else                                                                                                                                                                         |
| 4   | Commission paid                 | Brand (invoice attached), Creator (notice only)                   | Payment 1 captured                                                                                                                                                                                  |
| 5   | Advance confirmed               | Creator and Brand (advance payment record attached)               | The creator confirms the direct UPI advance arrived                                                                                                                                                 |
| 6   | Content uploaded                | Brand                                                             | Creator uploads                                                                                                                                                                                     |
| 7   | Changes requested               | Creator                                                           | Brand sends feedback (feedback text included)                                                                                                                                                       |
| 8   | Content approved                | Creator                                                           | Brand approves ("waiting for final payment")                                                                                                                                                        |
| 9   | Final payment confirmed         | Creator and Brand (final payment record attached)                 | The creator confirms the direct UPI final arrived                                                                                                                                                   |
| 10  | Deal report ready               | Creator and Brand (ADP attached)                                  | Deal COMPLETED                                                                                                                                                                                      |
| 11  | Deal cancelled                  | Brand, and Creator if confirmed                                   | Deal CANCELLED, by the brand (OPEN or CONFIRMED: "No fee was charged.") or by an admin ("The fee already paid was kept."); includes the reason                                                      |
| 12  | Commission payment reminder     | Brand                                                             | Daily at 10:00 while CONFIRMED for more than 24 hours                                                                                                                                               |
| 13  | Content overdue                 | Creator and Brand                                                 | Daily while content_overdue                                                                                                                                                                         |
| 14  | Review reminder                 | Brand                                                             | Daily after 3 days in CONTENT_UPLOADED                                                                                                                                                              |
| 15  | Dispute raised                  | `DISPUTE_EMAIL` (the support address by default), CC both parties | Dispute form submitted                                                                                                                                                                              |
| 15b | Dispute resolved                | Brand and Creator                                                 | Admin resolves a dispute (includes the resolution note and the refund reference when given)                                                                                                         |
| 16  | (retired) Payout account status | -                                                                 | Removed with the Route linked account (section 7.2)                                                                                                                                                 |
| 17  | Payment recorded                | Creator                                                           | The brand records a direct UPI payment: "Check your UPI app and confirm" (no UPI ID in it)                                                                                                          |
| 18  | Payment not received            | Brand and Creator, plus the admin alert A1                        | The creator says a direct payment did not arrive (includes the reason)                                                                                                                              |
| 19  | Payment due reminder            | Brand                                                             | Daily at 10:00 while the advance (COMMISSION_PAID) or final (APPROVED) has been due for over 24 hours with no payment recorded; "Pay the creator by UPI, then record the payment" (no UPI ID in it) |
| 20  | Confirm payment reminder        | Creator                                                           | Every 6 hours while a recorded payment has waited over 12 hours for the creator; "Check your UPI app and confirm, or say it did not arrive" (no UPI ID in it)                                       |
| A1  | Admin alert                     | Admin                                                             | Webhook processing error, a creator says a direct payment did not arrive                                                                                                                            |

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

On hover (desktop) or tap (touch) over any username or avatar. Endpoint `GET /api/users/:id/resume` (by user id, not username), for signed-in users, cached in the API process for 5 minutes (`Cache-Control: private, max-age=300`, so a profile saved just now, or an age that has just risen, shows after the cache expires). It returns `{ user, stats, completedDeals }`:

- `user`: `id`, `role`, `username` (the Instagram handle and, in the UI, its link), `name` (the name the user gave once the profile is locked), `profilePictureUrl`, `instagramVerified`, `igAccountType` (the account type, `BUSINESS` or `MEDIA_CREATOR`), `followersCount`, `engagementRate`, and from the locked profile `city`, `age` (the **current** age, section 6.4), `gender`, `website`, `pitch` (each null until the profile is saved), the verified **`contactEmail`** (there is no chat, so the two sides write to each other, REPLACEMENT_PLAN 2.5; null if the email is not verified) and `memberSince` (when the account was created).
- `stats`: `completedDealsCount` and `totalValuePaise`, over every completed deal of the user, not only the last 10.
- `completedDeals`: the last 10 completed deals, `{ counterparty: { id, username }, budgetPaise, title, completedAt }`, the most recent first; a deleted counterparty shows as "Deleted user".

Unknown, deleted and role-less users (an email-only account that has not connected Instagram) are a 404. **[CONFIRM that showing deal amounts and the contact email to every signed-in user is intended.]**

---

## 12. Disputes and admin

- **Raise dispute** (`POST /deals/:id/disputes`) on any deal that has a confirmed creator and is past OPEN (CONFIRMED to COMPLETED, and a CANCELLED deal that had a creator), for its brand and its confirmed creator only (everyone else, admins included, gets 404; `409 DISPUTE_NOT_ALLOWED` before that). Body: subject (1 to 150 characters), description (1 to 5000). Creates a `disputes` row and sends Email 15 to `DISPUTE_EMAIL` with both parties in CC. 3 per deal per 24 hours per user (section 13). A deal can have several disputes. The deal's actions list `RAISE_DISPUTE` when it is allowed.
- Admins are users whose Instagram user id is in env `ADMIN_INSTAGRAM_USER_IDS`. `is_admin` is set on login from that list.
- `/admin` (admin only, 404 for everyone else):
  - **Analytics** (auto-refresh every 30 seconds):
    - All time: deals created, deals completed, active creators, active brands, total value transacted.
    - This week: deals created, completed, average deal value, average time from OPEN to COMPLETED.
    - This month: deals created, completed, commission revenue (base, excluding GST), creator payouts, completion rate.
    - Charts: deals by status, daily deals created (30 days), daily commission revenue (30 days), histogram of hours from a direct payment being recorded to the creator confirming it.
    - Tables: recent deals, recent direct payments, open disputes. Every row links to a detail view.
  - **Deal list** (`GET /admin/deals?status=&q=`): every deal including drafts, newest first, filtered by status and searched by short id (prefix, any case).
  - **Deal detail** (`GET /admin/deals/:id`): full event log, payments (with the invoice number each produced), direct payments (every record, disputed ones too, with the UPI ID masked), emails (with recipient addresses, the 200 newest), disputes. Actions: cancel deal (`POST /admin/deals/:id/cancel`, admin override from COMMISSION_PAID to APPROVED, section 5.2: requires a resolution note, optional manual refund reference, sends email 11), resend any email. There is no transfer to retry: the advance and final are paid by the brand directly (section 7.3a).
  - **Resend** (`POST /admin/emails/:id/resend`): sends the stored subject and text again to the stored address and CC list as a new `email_log` row (the original stays). Only the plain text is stored, so the HTML is rebuilt from it. Invoices, payment records and the deal report that the first email carried are rebuilt from their stored snapshots (the report from the database as it is now); an attachment that cannot be rebuilt is left off and named in `missingAttachments`.
  - **Disputes** (`GET /admin/disputes?status=`, `POST /admin/disputes/:id/resolve`): list, mark resolved with a resolution note and an optional refund reference (a second resolve is `409 DISPUTE_ALREADY_RESOLVED`). Email 15b goes to both parties. Resolving does not change the deal; cancelling it is a separate action.
  - Every admin route answers 404 to signed-out users and non-admins alike. The analytics (`GET /admin/analytics`) and the admin screens are not built yet.
- Refunds, when needed, are done manually in the Razorpay dashboard. The admin records the refund id in the resolution. No automated refunds in v1.

---

## 13. Rate limits

| What                                               | Limit                                                                       | Scope          |
| -------------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| Publish deal                                       | 10 per 24h                                                                  | Brand          |
| Apply                                              | 20 per 24h                                                                  | Creator        |
| Content upload                                     | 20 per deal (a permanent cap: `429 UPLOAD_LIMIT_REACHED`, no `Retry-After`) | Deal           |
| API requests                                       | 100 per minute                                                              | User           |
| Signup (new user created)                          | 5 per hour                                                                  | IP             |
| Login attempts                                     | 20 per hour, then 15-minute lockout                                         | IP             |
| Email verification resend                          | 5 per hour                                                                  | User           |
| Dispute                                            | 3 per deal per 24h (counted once the request is valid and allowed)          | User           |
| Save profile details                               | 10 per hour (each request counts, valid or not)                             | User           |
| Save payout UPI details                            | 10 per hour                                                                 | User           |
| Record a direct payment                            | 10 per hour                                                                 | User (brand)   |
| Confirm a direct payment, or say it did not arrive | 20 per hour (both together)                                                 | User (creator) |

Publish and apply are counted only once the request has passed validation (and, for apply, the UPI details and deadline checks), so a form full of errors does not use up the day's allowance.

Response: `429` with `Retry-After`. Razorpay API calls from our server retry up to 3 times with exponential backoff, only for network errors and 5xx.

---

## 14. Scheduled jobs

All run in the API process via `node-cron` (`apps/api/src/jobs/`), in `Asia/Kolkata` time. They start in `src/index.ts` after the server listens and stop first on SIGTERM (a running job finishes before the database closes); `createApp` never starts them, so tests do not. Each run:

- takes a Postgres advisory lock named `job:<name>` on a dedicated connection (`pg_try_advisory_lock`). A run that finds it taken does nothing and is logged as `skipped`: it never queues. This keeps a redeploy overlap, a second instance, or a run started by hand from double-running a job. The lock is released in `finally`, and a process that dies drops its connection, which frees it.
- logs one line: `{ job, status: ok | skipped | failed, durationMs, ...counts }`. A job that throws is logged with the error, reported as `failed`, and never crashes the process. Count names avoid the words the logger redacts (`token`, `code`, `account`, `pan`). No email address, token or UPI ID is logged. A failed run is not emailed.
- can be run once by hand: `pnpm job <name>` (or `pnpm job --list`), from `dist` as `pnpm --filter @valueskins/api run job:deploy -- <name>` on Render. It uses the real clock and the same lock, and exits 1 on failure.

| Job                        | Schedule (IST)                             | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instagram-refresh`        | 03:00 daily                                | For users with a stored token and `last_active_at` in the last 30 days: renew the long-lived token if under 10 days remain (section 6.1), then refresh username, name (unless the profile is locked), followers, follows, media count, engagement rate, bio and picture, and `instagram_synced_at`. It never changes the role, account type, admin flag or profile details (those change at sign-in only). About three Meta calls per user, one at a time with a 250 ms pause, least recently synced first. Meta's limit is 4,800 calls x impressions per account per 24 hours. It stops the whole run if Meta answers a rate-limit code (4, 17, 32, 613) or HTTP 429, and the rest are done the next day. Meta code 190 (invalid token) clears that user's stored token so it is not retried; a token that does not decrypt (dev login) is skipped. |
| `cleanup`                  | 04:00 daily                                | Delete expired sessions, email verification links and email sign-in codes. Nothing else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `fee-reminder`             | 10:00 daily                                | Email 12 to the brand: status CONFIRMED and `confirmed_at` more than 24 hours ago.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `payment-due-reminder`     | 10:00 daily                                | Email 19 to the brand: COMMISSION_PAID more than 24 hours with no ADVANCE direct payment, or APPROVED more than 24 hours with no FINAL one. A payment marked "not received" does not count as a record, so the brand is reminded to pay again. A recorded payment waiting for the creator belongs to the next job.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `review-reminder`          | 10:00 daily                                | Email 14 to the brand: CONTENT_UPLOADED and `content_uploaded_at` more than 3 days ago (the latest upload, so after a revision it counts from the new one).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `confirm-payment-reminder` | every 6 hours (00:00, 06:00, 12:00, 18:00) | Email 20 to the creator: a direct payment with no confirmation and no "not received", recorded more than 12 hours ago, on a deal still in the status of its stage (ADVANCE with COMMISSION_PAID, FINAL with APPROVED).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `content-overdue`          | 23:59 daily                                | Email 13 to the brand and the creator: ADVANCE_PAID or REVISION_REQUESTED and past `content_upload_deadline` (section 5.4). It runs a minute before the deadline day ends, so it looks five minutes ahead and a deadline that falls today counts. The deal keeps its status.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**One reminder per deal per day.** Before a reminder is sent, the job looks in `email_log` for the same template, deal and recipient created on the current IST day with a status other than `FAILED`. If there is one it sends nothing. A failed send is tried again on the next run; a queued one counts as sent. So the 6-hourly job still sends a creator at most one reminder a day for a deal. Time in a status is read from the deal's own timestamps (`confirmed_at`, `commission_paid_at`, `approved_at`, `content_uploaded_at`), which carry the clock the job was given.

`users.last_active_at` is stamped by the session middleware, at most once an hour per user, on any signed-in request. It was never written before, so users who do not return after the deploy are not refreshed.

-------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram refresh | 03:00 daily | Refresh profile and engagement for users active in the last 30 days. Refresh tokens under 10 days to expiry. Stay under Meta's per-account rate limits. |
| Commission reminders | 10:00 daily | Email 12 for deals in CONFIRMED for more than 24h |
| Review reminders | 10:00 daily | Email 14 for deals in CONTENT_UPLOADED for more than 3 days |
| Content overdue | 23:59 daily | Email 13 for overdue deals. Deal stays in its status. |
| Cleanup | 04:00 daily | Delete expired sessions and verification tokens |

---

## 15. Database schema

Conventions: UUID v7 primary keys, `created_at`/`updated_at` `timestamptz` default now, money columns `_paise BIGINT`, enums as Postgres enums. Foreign keys everywhere, with indexes on every foreign key and every column used in a filter.

**users**
`id, instagram_user_id (unique, nullable — an email-only account has none until it connects Instagram), username (unique only among rows with instagram_user_id set), name (the Instagram name until the profile is locked, then the name the user gave), ig_account_type (nullable — null for an email-only account), role (CREATOR | BRAND, from the Instagram account type, null for an email-only account until it connects Instagram), role_locked_at (when the role was first set), followers_count, follows_count, media_count, engagement_rate numeric(5,2), bio, profile_picture_url, ig_token_encrypted (nullable), ig_token_expires_at (nullable), instagram_synced_at, email (unique, nullable until set), email_verified_at, is_admin, onboarding_completed_at, payout_vpa (nullable, CHECK on the UPI format), payout_name (nullable), payout_vpa_consent_at (nullable), city (varchar 100, nullable), age (smallint, nullable) with age_recorded_at (set together: CHECK, and CHECK age between 18 and 99), gender (user_gender enum MALE | FEMALE | OTHER | PREFER_NOT_TO_SAY, nullable), website (nullable), pitch (nullable, CHECK at most 1000 characters), profile_locked_at (set once, when the profile is saved), adult_confirmed_at, last_active_at (stamped by the session middleware at most once an hour, section 14), created_at, updated_at, deleted_at`

**brand_billing** (1:1 users)
`user_id (pk), billing_name, billing_address, billing_state, gstin (nullable), created_at, updated_at`

**sessions**
`id, user_id, token_hash (unique), expires_at, ip, user_agent, created_at`

**email_verification_tokens**
`id, user_id, email, token_hash (unique), expires_at, used_at, created_at`

**email_login_codes** (V0 launch, section 6.5 — no user_id: a code can be requested before any user row exists)
`id, email, code_hash, expires_at, attempts, used_at, created_at`, index on `email`

**deals**
`id, short_id (unique, 8 chars, for documents and UPI payment notes), brand_id, creator_id (nullable), title, description, budget_paise, commission_base_paise, commission_gst_paise, commission_total_paise, creator_amount_paise, advance_paise, final_paise, application_deadline date, content_upload_deadline date, deal_deadline date, status, content_link, content_uploaded_at, upload_count, feedback, revision_count, published_at, confirmed_at, commission_paid_at, advance_paid_at, approved_at, completed_at, cancelled_at, cancelled_by_id, cancelled_by_role (BRAND | ADMIN), cancellation_reason, created_at, updated_at`
A draft is saved as typed: `title`, `description` and the three deadlines are nullable, and `budget_paise` holds the budget in paise. The six breakdown columns (`commission_base_paise`, `commission_gst_paise`, `commission_total_paise`, `creator_amount_paise`, `advance_paise`, `final_paise`) are null while DRAFT and set at publish. A CHECK constraint (`deals_published_fields_check`) requires all of them to be set once the status is anything but DRAFT.

**content_uploads** (history, so an edited or deleted Drive link stays on record)
`id, deal_id, link, uploaded_at`

**applications**
`id, deal_id, creator_id, status (APPLIED | CONFIRMED | REJECTED), created_at, updated_at`, unique `(deal_id, creator_id)`

**payments**
`id, deal_id, type (COMMISSION), amount_paise, razorpay_order_id (unique), razorpay_payment_id (unique, nullable), status (CREATED | CAPTURED | FAILED), failure_reason, captured_at, razorpay_fee_paise (nullable), razorpay_tax_paise (nullable), created_at, updated_at`
The fee and tax are Razorpay's own, from its payment entity, for the deal report (section 17). Null when not recorded.
Partial unique indexes: one CAPTURED payment per `(deal_id, type)`, and one open (CREATED or FAILED) payment per `(deal_id, type)`.

**direct_payments** (REPLACEMENT_PLAN 2.1)
`id, deal_id, stage (ADVANCE | FINAL), amount_paise, reference (the UPI reference, 6 to 40 characters), paid_to_vpa (the creator's UPI ID when the brand paid), note, recorded_by, recorded_at, confirmed_by (nullable), confirmed_at (nullable), disputed_at (nullable), dispute_reason (nullable), created_at`
CHECKs: not both confirmed and disputed; `confirmed_by` is set exactly when `confirmed_at` is; `dispute_reason` exactly when `disputed_at` is. Partial unique index on `(deal_id, stage)` where `disputed_at` is null: one live record per stage. Rows are never edited or deleted once confirmed or disputed. `paid_to_vpa` is never returned in full.

**invoices**
`id, deal_id, payment_id (nullable), direct_payment_id (nullable), kind (COMMISSION_TAX_INVOICE | ADVANCE_PAYMENT_RECORD | FINAL_PAYMENT_RECORD), number (unique), financial_year, sequence, snapshot jsonb, issued_at`
Exactly one of `payment_id` (the commission invoice) and `direct_payment_id` (a payment record) is set, each unique. Numbering uses a row lock on a per-financial-year counter table (`invoice_counters`), so numbers are gapless and never duplicated. The tax invoice has its own counter; advance and final payment records share the `ADVANCE_PAYMENT_RECORD` row (section 7.4).

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
- `POST /auth/email/start` and `POST /auth/email/verify` (staging and tests only: `AUTH_EMAIL_ENABLED` is false in production)
- `POST /auth/logout`
- `POST /dev/login` (non-production only)
- `GET /me` (returns `{ user, profile, profileDetails, onboarding }`: `profileDetails` is the locked profile with the current age, or `null` before it is saved; `profile` is the fetched Instagram profile - username, name, picture, followers, follows, media count, engagement rate, last sync - or `null` when no Instagram account is linked; `onboarding` is described in section 6.4)
- `POST /me/email` and `POST /me/email/verify` (token) and `POST /me/email/resend`
- `PUT /me/profile` (once, then `409 PROFILE_LOCKED`; creators: name, city, age, gender; brands: name, city, website, optional pitch; both `adultConfirmed: true`)
- `PUT /me/billing` (brand)
- `PUT /me/payout-upi`, `GET /me/payout-upi` (creator; the UPI ID is always masked)
- `DELETE /me` (account deletion)
- `POST /meta/data-deletion`, `POST /meta/deauthorize`, `GET /meta/deletion-status/:code`

Users

- `GET /users/:id/resume` (section 11)

Config

- `GET /config` (public: `{ gstRateBps, minBudgetPaise, advancePercent, authEmailEnabled, razorpayKeyId, supportEmail }`, used by the web app for the live breakdown preview and the sign-in options)

Deals

- `GET /deals/feed` (creator: OPEN deals with applications open, newest first, cursor pagination)
- `GET /deals/mine` (brand: my deals including drafts, optional `?status=`; creator: deals I'm confirmed on)
- `POST /deals` (create draft), `PATCH /deals/:id` (edit draft only; a field set to `null` is cleared), `DELETE /deals/:id` (draft only)
- `POST /deals/:id/publish` (needs billing details; validation failures are `400 VALIDATION_ERROR` with `details`; `409 BILLING_REQUIRED`; computes and freezes the breakdown with the live `GST_RATE_BPS`; sends email 1)
- `GET /deals/:id` (visibility: OPEN deals to any signed-in, onboarded user; otherwise only its brand, confirmed creator, admin; everyone else gets 404). The body is `{ deal }` with the deal fields, the frozen breakdown, the brand and creator, the derived flags `applicationsOpen` and `contentOverdue` (section 5.1), `allowedActions`, and, for the deal's brand and admins only, `applicationCount` and `creatorPayoutStatus`. `allowedActions` is a list of `{ action, enabled, reason }` for the signed-in user: `reason` says why a disabled action is disabled (section 18) and is null when enabled. Actions today: `EDIT_DRAFT`, `DELETE_DRAFT`, `PUBLISH`, `CONFIRM_CREATOR`, `CANCEL`, `APPLY`, `PAY_COMMISSION`, `PAY_ADVANCE` and `PAY_FINAL` (the brand pays by UPI and records it; disabled with a reason when the creator has no UPI ID or a record waits for them), `PAY_FINAL`, `UPLOAD_CONTENT` (disabled once 20 links are used), `SEND_FEEDBACK`, `APPROVE`, `CONFIRM_PAYMENT_RECEIVED` (the confirmed creator, enabled while the brand's payment waits for them), `RAISE_DISPUTE` (the deal's brand and confirmed creator, once the deal allows a dispute, section 12); the actions of later phases are added with their endpoints. `GET /deals/:id` also returns the delivery state (`contentLink`, `uploadCount`, `revisionCount`, `feedback`, `contentUploads[]`, the payment and approval times) and `revisionNotice` (the 5-revision warning) once the deal has had 5 revisions.
- `POST /deals/:id/cancel` (brand, from OPEN or CONFIRMED, body `{ reason }`; `409 CANCELLATION_NOT_POSSIBLE` from COMMISSION_PAID to APPROVED, "The deal cannot be cancelled after the fee is paid. Write to us if something is wrong."; sends email 11)
- `POST /deals/:id/content` (the confirmed creator, body `{ link }`, from ADVANCE_PAID or REVISION_REQUESTED; a Drive or Docs https link; `409 WRONG_DEAL_STATUS`, `429 UPLOAD_LIMIT_REACHED` after 20; email 6)
- `POST /deals/:id/feedback` (brand, body `{ feedback }`, from CONTENT_UPLOADED; email 7)
- `POST /deals/:id/approve` (brand, from CONTENT_UPLOADED; email 8)
- `GET /deals/:id/emails` (communication history: the deal's emails to the brand and the creator, newest first, as `{ template, subject, bodyText, status, attachmentNames, recipient { role, username }, createdAt }`, without addresses; admins see every email logged for the deal; cursor pagination)
- `GET /deals/:id/events` (status changes from `deal_events`, oldest first, as `{ fromStatus, toStatus, actor { type, username }, note, createdAt }`; cursor pagination)
- `GET /deals/:id/documents/:kind` (PDF: `commission-invoice`, `advance-payment-record`, `final-payment-record`, `adp`; the deal's brand, its confirmed creator and admins, everyone else 404; `409 DOCUMENT_NOT_AVAILABLE` until the payment is captured or the direct payment is confirmed, and for the report until COMPLETED)
- `POST /deals/:id/disputes` (the deal's brand or confirmed creator, body `{ subject, description }`, answers 201 `{ dispute }`; `409 DISPUTE_NOT_ALLOWED`, `429` over 3 per deal per day; email 15)

Applications

- `POST /deals/:id/applications` (creator; needs a saved UPI ID, name and consent, `403 PAYOUT_NOT_SET`; `409 APPLICATIONS_CLOSED`, `409 ALREADY_APPLIED`; sends email 2)
- `GET /deals/:id/applications` (brand that owns the deal)
- `GET /applications/mine` (creator: each application with a small summary of its deal)
- `POST /applications/:id/confirm` (brand that owns the deal; one transaction through `transitionDeal`; the creator must still have a UPI ID, name and consent saved, `409 CREATOR_PAYOUT_NOT_SET`; sends emails 3 and 3b)

Payments

- `POST /deals/:id/payments/:type/order` (type: `commission` only; the deal's brand; body `{}`; answers `{ orderId, amountPaise, currency, keyId, type }` for Checkout; `409 WRONG_DEAL_STATUS`)
- `POST /payments/verify` (the deal's brand; body `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`; answers `{ payment: { status }, deal }`)
- `POST /webhooks/razorpay` (no auth, signature verified, raw body)

Direct payments (section 7.3a)

- `GET /deals/:id/direct-payment` (the deal's brand; the stage due, the amount, the creator's full UPI ID and name, the `upi://pay` fields and link, or `blocked`: `no_creator | creator_has_no_upi | no_consent | not_due`)
- `POST /deals/:id/direct-payment` (the deal's brand; body `{ stage, reference, note? }`; `201 { directPayment }`; `409 WRONG_DEAL_STATUS`, `409 CREATOR_PAYOUT_NOT_SET`, `409 DIRECT_PAYMENT_ALREADY_RECORDED`; email 17)
- `POST /direct-payments/:id/confirm` (the deal's confirmed creator; answers `{ directPayment, deal }`; `409 DIRECT_PAYMENT_NOT_PENDING`, `409 INVALID_TRANSITION`; emails 5 or 9, then 10)
- `POST /direct-payments/:id/not-received` (the deal's confirmed creator; body `{ reason }`; emails 18 and alert A1)

Admin (`/admin/*`, admin only)

- `GET /admin/analytics` (not built yet)
- `GET /admin/deals` (`?status=&q=&cursor=&limit=`), `GET /admin/deals/:id`
- `POST /admin/deals/:id/cancel` (body `{ note, refundReference? }`; from COMMISSION_PAID, ADVANCE_PAID, CONTENT_UPLOADED, REVISION_REQUESTED or APPROVED, otherwise `409 INVALID_TRANSITION`; email 11)
- `POST /admin/emails/:id/resend` (answers `{ emailLogId, status, missingAttachments }`)
- `GET /admin/disputes` (`?status=OPEN|RESOLVED`), `POST /admin/disputes/:id/resolve` (body `{ resolution, refundReference? }`; `409 DISPUTE_ALREADY_RESOLVED`; email 15b)
- All admin routes: 404 for everyone who is not an admin.

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
6. Advance payment record (full).
7. Final payment record (full).
8. Delivery proof: every content link uploaded with its timestamp, number of revisions, each feedback timestamp, final approval timestamp.
9. Direct payments: every record for the advance and final, disputed and waiting ones included, with stage, amount, UPI reference, masked payee UPI ID, recorded time and its status (confirmed time, or not received with the reason).
10. Razorpay fees absorbed by ValueSkins (from the commission payment's Razorpay entity, stored on `payments` when captured; "Not recorded" for older rows), for information. Only the commission goes through Razorpay.
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
- Every disabled action says why (for example "Applications closed", "Add your UPI ID to apply", "Cancellation is not possible after the advance is paid").
- Responsive: desktop and tablet first, usable at 375px wide.
- Accessibility: all actions keyboard reachable, visible focus ring (accent color), text contrast AA.

---

## 19. Environments and config

|                | Local                   | Staging                             | Production                      |
| -------------- | ----------------------- | ----------------------------------- | ------------------------------- |
| Web            | localhost:3000          | staging.valueskins.com (Vercel)     | valueskins.com                  |
| API            | localhost:4000          | api-staging.valueskins.com (Render) | api.valueskins.com              |
| DB             | docker compose Postgres | Render Postgres                     | Render Postgres (paid, backups) |
| Razorpay       | test                    | test                                | live                            |
| Email          | console                 | Resend                              | Resend                          |
| Dev login      | on                      | on                                  | impossible                      |
| Session cookie | vs_session_dev          | vs_session_staging                  | vs_session                      |

Local cookies: API and web both on `localhost` (cookie without Domain). Local webhooks: expose the API with a tunnel (cloudflared or ngrok) and register the tunnel URL in Razorpay test mode.

API env (validated with Zod at startup, the process exits on any missing value):
`NODE_ENV, PORT, DATABASE_URL, WEB_ORIGIN, COOKIE_DOMAIN, SESSION_COOKIE_NAME, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI, META_APP_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, EMAIL_TRANSPORT, ADMIN_INSTAGRAM_USER_IDS, SUPPORT_EMAIL, DISPUTE_EMAIL, ENABLE_DEV_LOGIN, COMPANY_LEGAL_NAME, COMPANY_ADDRESS, COMPANY_STATE, COMPANY_GSTIN, COMMISSION_SAC_CODE, AUTH_EMAIL_ENABLED, GST_RATE_BPS` `SUPPORT_EMAIL` is the one address users write to (every email footer, the reply-to, error messages). `DISPUTE_EMAIL` is optional and defaults to it. `GST_RATE_BPS` is optional and defaults to `1800`, and a blank value counts as unset, not as 0. `AUTH_EMAIL_ENABLED` is `true` only on staging. Startup guards refuse: `ENABLE_DEV_LOGIN=true` in production, `AUTH_EMAIL_ENABLED=true` in production, a Razorpay key of the wrong mode, `GST_RATE_BPS` above 0 with an empty `COMPANY_GSTIN`, and `EMAIL_TRANSPORT=console` in production. `TEST_DATABASE_URL`, `COMPANY_GSTIN` and `ADMIN_INSTAGRAM_USER_IDS` default to empty when omitted, so a host that cannot define empty variables can leave them out (staging sets `COMPANY_GSTIN`, because GST is charged). `PORT` is injected by Render.

Web env: `NEXT_PUBLIC_API_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID`, plus `NEXT_PUBLIC_ENABLE_DEV_LOGIN` and `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` (staging only). `next build` always runs with `NODE_ENV=production`, so the web dev login page is gated by `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` instead, and a build with that flag true and `NEXT_PUBLIC_API_URL` set to `https://api.valueskins.com` fails.

Staging runs on Render's free Postgres plan: it expires 30 days after creation and has no backups. Production must use a paid plan with backups (section 2). Setup steps are in `docs/DEPLOYMENT.md`.

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

1. **Minimum budget** (section 4.2). The fee is decided (a flat ₹750 + 18% GST, REPLACEMENT_PLAN 2.2). The ₹5,000 minimum stays until the live site's value is confirmed.
2. **Razorpay fee handling on Route transfers** (section 4.3). Closed: Route is not used and there are no transfers (Prompt 13).
3. **GST and tax.** ValueSkins must be GST registered to charge GST on commission. Have the CA confirm the invoice format and SAC code, and whether marketplace TDS (Income Tax section 194-O) or GST TCS obligations apply to ValueSkins. If they apply, they change the payout math. Needed before go-live.
4. **Stuck deals.** v1 only sends reminders when a brand does not pay the commission or does not review content. Decide whether to auto-cancel after N days in v2.
5. **Public deal amounts and the contact email** in the virtual resume (section 11).
6. **Phone number for Razorpay KYC.** Moot: no linked accounts any more (section 7.2).
7. **The support address.** `SUPPORT_EMAIL` is `valueskinsfounder@gmail.com` until it is agreed (the live site uses founder@valueskins.com).

---

## 22. Go-live checklist

- [ ] Meta app approved for `instagram_business_basic`, app in Live mode
- [ ] Razorpay live account activated live webhook registered with the payment events
- [ ] One complete deal run end to end in test mode on staging, then one small real deal (minimum budget) in live mode between the founders
- [ ] Commission invoice format approved by CA, company GSTIN and SAC code in env
- [ ] Resend domain verified (SPF, DKIM), test emails land in inbox (not spam) for Gmail and Outlook
- [ ] Domains live with HTTPS: valueskins.com, api.valueskins.com
- [ ] Render Postgres backups on, restore tested once
- [ ] `ENABLE_DEV_LOGIN` absent in production, startup guard verified
- [ ] Privacy policy and terms published and reviewed
- [ ] Admin Instagram ids set, admin dashboard reachable only by admins
- [ ] Error alerts reaching the admin email
