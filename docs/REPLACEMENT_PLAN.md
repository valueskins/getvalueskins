# getvalueskins - plan to replace the live app (from 10 Oct 2026)

`valueskins/getvalueskins` is the rebuild. `valueskins/valueskins` is the live app at valueskins.com, which Saketh maintains. The rebuild replaces it once it does everything the live app does, and does it better. This file is the plan and the prompts from Prompt 12 onward.

## 0. Where things stand

**getvalueskins** (local `main` = GitHub `main`, `2567e34b`, 10 Oct):

- Prompts 4 to 11 are merged. The API has:
  - Instagram and email-code sign-in, Meta callbacks, onboarding
  - Route linked-account payouts
  - deals, applications, payments with Route transfers, content review
  - invoices and the ADP, history, disputes and admin
  - about 100 test files
- The web app is only the temporary pages from Prompt 6. The design and the W1 to W3 web prompts have not been done.
- `docs/V0_LAUNCH.md` in the repo still says GST is not charged (`GST_RATE_BPS=0`) and that a creator needs an ACTIVE Route account to apply.

**The live app** (`valueskins/valueskins`, `3a9afb0a`, 10 Oct) has moved on. In particular:

1. **Razorpay Route is closed to ValueSkins.** RBI's Sept 2025 payment aggregator directions only allow paying out to third parties for merchants above ₹40 lakh annual turnover, and RazorpayX needs a current account.
   - So in the live app, only the ₹885 fee goes through Razorpay.
   - The 30% and the 70% go **directly from the brand to the creator's UPI ID**. The deal only moves forward when **the creator confirms the money arrived**.
   - This makes your Prompts 7 and 9 (Route payouts and transfers) unusable in production. They have to be replaced first.
2. **GST is charged.** ValueSkins' GSTIN is published on the live legal pages. The fee is a flat ₹750 + 18% GST = ₹885 for every deal.
3. **The role is not chosen by the user.** It is read from the Instagram account type: Business = brand, Creator = creator.
4. **Profile details are entered once and then locked:**
   - Creators: name, city, age, gender.
   - Brands: name, city, website, and a hiring pitch.
   - The hover resume shows them, plus the contact email (there is no chat, so the two sides email each other).
5. **Cancelling:** a brand can cancel free until it pays the fee. After that, the deal cannot be cancelled in the app.
6. **Other parts of the live app:**
   - WebSocket real-time updates
   - Sentry error reporting
   - reminders for late content
   - a "How it works" page that states the product's limits
   - rewritten Terms, Privacy and Refund pages

Section 2 turns these into rules for your repo. Prompts 12 to 15 bring the API to parity. The web track builds the real UI. Prompts 17 to 19 import the live data and switch valueskins.com over.

---

## 1. Before Prompt 12

1. **Live repo secrets (from the earlier review).** Rotating the live Razorpay keys and the Meta app secret affects both apps. Put the new **test** keys in getvalueskins staging. Put the new live keys only in production, at cutover (Prompt 19).
2. **Same Meta app.** The live app reads the Instagram account type at sign-in for every user, so the Meta app it uses already works for the public. Use **that same app** for getvalueskins, and add the staging and production redirect URIs and the deauthorize and data-deletion URLs from `docs/DEPLOYMENT.md` to it.
3. **Confirm with Saketh:**
   - the minimum deal budget the live app enforces (the plan below kept ₹5,000; it was ₹886 when this plan was last updated, and is ₹2,000 since 11 November 2026, see 2.2)
   - the GSTIN and SAC code for `COMPANY_GSTIN` and `COMMISSION_SAC_CODE`
   - the support address (the live app uses founder@valueskins.com)
   - whether the new app should keep the live site's look (section 6, D0)
4. **Replace `CLAUDE.md`** with the attached version. It points the overrides at this file instead of `V0_LAUNCH.md` and adds the direct-payment rules. Commit this file as `docs/REPLACEMENT_PLAN.md`.
5. **Agree a freeze point with Saketh.** He can keep shipping the live app until Prompt 18 starts. After that, any change to the live database schema has to be told to you, because the import script reads it.

---

## 2. Parity rules (these override `docs/SPEC.md` until cutover)

### 2.1 Payments: fee through Razorpay, the creator's share direct by UPI

- **Payment 1 (the fee)** is unchanged: Razorpay Order, Checkout, verify plus webhook through `markPaymentCaptured`, and the GST tax invoice.
- **Creator payout details** replace the Route linked account:
  - a **UPI ID**, matching `^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32}$`, enforced by Zod **and** a database CHECK
  - the **name on the account**, as the creator's UPI app shows it
  - a **consent timestamp**: "I agree my UPI ID and name are shown to a brand that confirms me on a deal"
  - Never accept a bank account number, PAN or IFSC.
  - Without a UPI ID and consent, a creator cannot apply ("Add your UPI ID to apply"), and a brand cannot confirm that creator.
- **Disclosure:**
  - The full UPI ID and name are returned only to the brand confirmed on that deal, only when the creator has consented, and only while a direct payment is due.
  - Everyone else, including the creator's own settings, sees a masked form like `cr•••@okhdfcbank`.
- **Paying:**
  - The amount always comes from the frozen breakdown, never from the client.
  - The API returns the fields for a `upi://pay` link (`pa`, `pn`, `am` with two decimals, `cu=INR`, `tn="ValueSkins <shortId> advance"`). The web app shows it as a button and a QR code.
- **Recording:**
  - The brand records the UPI reference or UTR: 6 to 40 characters from `A-Z a-z 0-9 - /`, plus an optional note.
  - Recording **does not change the deal status**.
  - The row snapshots `paid_to_vpa` and the amount.
  - There is one live record per deal and stage: a partial unique index where the record is not disputed.
- **Confirming:** only the confirmed creator can do this.
  - "Received" moves the deal on: COMMISSION_PAID to ADVANCE_PAID for the advance, APPROVED to COMPLETED for the final.
  - "Not received", with a reason, marks the record disputed. It is never deleted or edited. The brand can then record again.
  - Database CHECKs: a record cannot be both confirmed and disputed, and `confirmed_by` is set exactly when `confirmed_at` is.
- **Emails:**
  - Brand recorded a payment: to the creator, "Check your UPI app and confirm".
  - Creator confirmed: to both.
  - Creator said not received: to both, plus the admin alert.
- **Documents:**
  - The advance and final documents become **payment records**, not receipts and not GST documents. They say: "Paid directly by the brand to the creator by UPI. ValueSkins did not receive or hold this money." Then the reference, recorded time and confirmed time.
  - The ADP lists every direct-payment record, including disputed ones, where it used to list transfers.
- **Remove entirely:**
  - Route linked accounts and `creator_payout_accounts`
  - `transfers` and its enums
  - the Route product and transfer webhook handlers
  - the payout account status email
  - admin transfer retry and mark-manual
  - SPEC 4.3's open fee decision: Razorpay now only charges a fee on the ₹885

### 2.2 Fee and GST

- A flat fee of ₹750 + 18% GST = **₹885** on every deal, whatever the budget, as on the live site. Set `COMMISSION_PERCENT_BPS = 0` and keep the flat ₹750.
- GST is charged: `GST_RATE_BPS=1800`, with `COMPANY_GSTIN` set. Keep the startup guard.
- The minimum budget was ₹886 when this was written (₹2,000 since 11 November 2026), just above the ₹885 fee, lowered for the founders' test (`MIN_BUDGET_PAISE`, with a test that keeps it above the fee including GST). It was ₹5,000. The creator's share at ₹886 is ₹1.00, split 30 / 70 as ₹0.30 and ₹0.70. Revisit before the public launch.

### 2.3 Sign-in and role

- Production sign-in is **Instagram only**. `AUTH_EMAIL_ENABLED=false` in production. Email-code sign-in stays for staging and tests.
- The **role comes from the Instagram account type** at every sign-in: `BUSINESS` = brand, `MEDIA_CREATOR` = creator.
  - Any other type, or none, stops the sign-in with: "ValueSkins needs a public Instagram Business or Creator account. A Business account posts deals as a brand. A Creator account applies to deals."
  - The type is stored.
  - A returning account follows a changed type only if it has no deals or applications in its current role. Otherwise sign-in is refused with a message to email support.
- The role-choice onboarding step is removed.
- Email-only accounts (staging only) cannot finish onboarding until Instagram is connected.

### 2.4 Onboarding and profile

Steps, in order:

1. Confirm the Instagram profile.
2. Email, verified.
3. **Profile details, saved once and then locked.**
   - Creators: name, city, age (18 to 99), gender.
   - Brands: name, city, website, and an optional hiring pitch (up to 1,000 characters).
   - Store age as the age given plus the time it was given, so the age shown increases by one each year without anyone editing it.
   - After locking, corrections go by email to support. Followers and engagement come from Instagram and refresh on sign-in.
4. Creators: UPI payout details (required before applying). Brands: billing details (required before publishing).

Also: an "I am 18 or older" checkbox, stored with a timestamp.

### 2.5 Virtual resume

The resume shows:
- the Instagram handle and link, picture, followers, engagement rate
- the profile details from 2.4 (age as currently computed)
- account type
- the **contact email**
- completed deals count, total value, member since
- the last 10 completed deals: counterparty, title, amount, date

### 2.6 Cancelling

- A brand can cancel free in OPEN and CONFIRMED.
- From COMMISSION_PAID on, only an admin can cancel, through a dispute. The fee is not refunded.
- Creators never cancel.

### 2.7 Contact and disputes

- `DISPUTE_EMAIL` and every "write to us" address is the support address agreed in section 1 (founder@valueskins.com on the live site).
- Disputes stay as built, with the in-app form and admin resolve. A creator's "not received" on a direct payment is an alert, not an automatic dispute.

### 2.8 Real-time and reminders

The live app has both, so the rebuild needs them before cutover: Socket.io (Prompt 16) and scheduled reminders (Prompt 15).

---

## 3. Order of work

| # | Prompt | Track | Rough size |
|---|---|---|---|
| 12 | UPI payout details, remove Route | API | 1 session |
| 13 | Direct payments: record, confirm, dispute, documents, admin | API | 1 to 2 sessions |
| 14 | Live-rule parity: fee, role, profile, resume, cancelling | API | 1 session |
| 15 | Scheduled jobs and reminders | API | 1 session |
| 16 | Real-time with Socket.io | API | 1 session |
| D0 to D5 | Claude Design | Design | run in parallel with 12 to 16 |
| W1 to W3 | Web app from the design handoff | Web (second session, own worktree) | 3 sessions |
| 17 | Hardening and full-flow test | API | 1 session |
| 18 | Import from the live database, and cutover rehearsal | API | 1 to 2 sessions |
| 19 | Production and cutover | Both | 1 session plus the switch |

One branch and one fresh Claude Code session per prompt. Before merging: read the diff, run `pnpm typecheck && pnpm lint && pnpm test`, and try the feature by hand on staging.

---

## 4. API prompts

### Prompt 12 - UPI payout details, and remove Route

```
Read CLAUDE.md, docs/REPLACEMENT_PLAN.md sections 0 and 2.1, and docs/SPEC.md sections 6.4, 7.2, 13 and 15.

Razorpay Route is not available to ValueSkins (REPLACEMENT_PLAN 0). Replace the Route linked-account payout setup with UPI payout details. Payments 2 and 3 are rebuilt in the next prompt. In this prompt, make the advance and final order endpoints answer 409 PAYMENT_RAIL_CHANGED, so nothing can create a Route transfer.

1. Schema (new Drizzle migration):
   - users: payout_vpa (text, nullable), payout_name (text, nullable), payout_vpa_consent_at (timestamptz, nullable). Add a CHECK so payout_vpa is null or matches the UPI pattern in REPLACEMENT_PLAN 2.1.
   - Drop creator_payout_accounts and its enum.
   - Keep transfers for now (Prompt 13 replaces it).
2. packages/shared:
   - A payout UPI schema (vpa, name, consent) that refuses anything shaped like a bank account number, PAN or IFSC with a clear message.
   - maskVpa().
   - copy.ts strings: "Add your UPI ID to apply", the consent sentence, and "We do not verify UPI IDs. Enter yours carefully. A payment to a wrong UPI ID cannot be recalled."
   - Onboarding: the payout step is done when the UPI ID, name and consent are saved.
3. API:
   - PUT /api/me/payout-upi (creators only, rate limited).
   - GET /api/me/payout-upi returns the masked ID, the name and the consent time, never the full ID.
   - Remove POST/GET /api/me/payout-account, the refresh route, the Razorpay account, stakeholder and product client calls, the product-status webhook handlers, and the PAYOUT_ACCOUNT_STATUS email.
4. Gating, replacing V0_LAUNCH 2.2:
   - Apply needs a UPI ID and consent (403 PAYOUT_NOT_SET, "Add your UPI ID to apply").
   - Confirm needs the applicant to still have them (409 CREATOR_PAYOUT_NOT_SET).
   - allowedActions reasons updated.
5. Update the seed, the temporary onboarding page's payout section (UPI form), docs/SPEC.md (sections 0, 3, 6.4, 7.2, 8, 13, 15, 16) and docs/DEPLOYMENT.md (remove the Route steps and webhook events). Mark the payout gating in docs/V0_LAUNCH.md 2.2 as replaced by REPLACEMENT_PLAN 2.1.
6. Tests:
   - UPI validation, including bank account numbers refused by Zod and by the database CHECK
   - masking everywhere the ID appears
   - creators only
   - apply and confirm gating
   - advance and final orders return 409
   - no full UPI ID in any log line

Done when a creator on staging can save a UPI ID, sees it masked, and can apply to a deal.
```

### Prompt 13 - Direct payments: record, confirm, dispute, documents, admin

```
Read CLAUDE.md, docs/REPLACEMENT_PLAN.md section 2.1, and docs/SPEC.md sections 5, 7.3, 7.4, 8, 12, 15, 16 and 17.

Build payments 2 and 3 as direct brand-to-creator UPI payments, exactly per REPLACEMENT_PLAN 2.1. Payment 1 (the fee through Razorpay) does not change.

1. Schema (migration):
   - direct_payments: id, deal_id, stage (ADVANCE | FINAL), amount_paise, reference, paid_to_vpa, note, recorded_by, recorded_at, confirmed_by, confirmed_at, disputed_at, dispute_reason, created_at.
   - CHECKs: not both confirmed and disputed; confirmed_by set exactly when confirmed_at is.
   - Partial unique index on (deal_id, stage) where disputed_at is null.
   - Drop transfers and its enums.
   - Invoice kinds: ADVANCE_RECEIPT and FINAL_RECEIPT become ADVANCE_PAYMENT_RECORD and FINAL_PAYMENT_RECORD.
2. API:
   - GET /api/deals/:id/direct-payment: for the confirmed brand. Returns the stage due, the amount, the creator's full UPI ID and name (only when consented and a stage is due), and the upi://pay fields. Otherwise a blocked reason: no_creator, creator_has_no_upi, no_consent, not_due.
   - POST /api/deals/:id/direct-payment { stage, reference, note }: brand. Amount comes from the frozen breakdown. No status change.
   - POST /api/direct-payments/:id/confirm and POST /api/direct-payments/:id/not-received { reason }: confirmed creator only.
     - Confirm goes through transitionDeal (COMMISSION_PAID to ADVANCE_PAID, or APPROVED to COMPLETED) in the same transaction as the update, and issues the payment record document there.
     - Not received marks the record disputed.
   - Emails: brand recorded (to the creator), confirmed (both), not received (both, plus admin alert A1). Email 10 (deal report) on COMPLETED as before.
   - Delete the advance and final Razorpay order paths, the transfer webhook handlers and the transfer code. PAY_ADVANCE and PAY_FINAL now mean "pay by UPI and record it". Add CONFIRM_PAYMENT_RECEIVED to allowedActions with reasons.
3. Documents:
   - The payment record renderer with the wording in REPLACEMENT_PLAN 2.1.
   - The ADP lists every direct-payment record, disputed ones included, where it used to list transfers.
   - Commission invoice unchanged.
4. Admin:
   - The deal detail shows commission payments and direct-payment records.
   - Remove transfer retry and mark-manual.
   - Admin cancel is allowed from any status after COMMISSION_PAID, with a note.
5. Update the temporary pay page so a brand can see the UPI details and record a reference, and a creator can confirm or say not received (styling stays temporary).
6. Update docs/SPEC.md (sections 0, 1, 3, 4.3 closed, 5, 7, 8, 12, 15, 16, 17) and docs/DEPLOYMENT.md's run-through.
7. Tests:
   - recording never changes status
   - only the confirmed creator can confirm, never the brand or a stranger
   - confirm advances exactly one step, and two parallel confirms advance once
   - not-received then record again
   - amounts are server-derived (a client amount is ignored)
   - the UPI ID is hidden from every other caller
   - documents render
   - the full flow: draft, publish, apply, confirm, fee via Razorpay (mocked), advance recorded and confirmed, content, approve, final recorded and confirmed, COMPLETED, ADP with the records

Done when the full deal runs on staging. To check the UPI link and QR code, open them on a phone: the UPI app must show the right payee name and amount. You do not need to send the money, because the creator's confirmation is what moves the deal.
```

### Prompt 14 - Live-rule parity: fee, role, profile, resume, cancelling

```
Read CLAUDE.md, docs/REPLACEMENT_PLAN.md sections 2.2 to 2.7, and docs/SPEC.md sections 4, 5.2, 6, 11 and 15.

1. Fee (2.2): COMMISSION_PERCENT_BPS = 0 (flat ₹750). Default GST_RATE_BPS 1800, with the startup guard requiring COMPANY_GSTIN. Update the money tests and both worked examples. Already-published deals keep their frozen breakdown.
2. Role from Instagram (2.3):
   - Read account_type from the profile endpoint at every Instagram sign-in. Map it, refuse the rest with the copy in 2.3, and store it.
   - Follow a changed type only when the account has no deals or applications in its current role.
   - Remove POST /api/me/role and the role step. Email-only accounts cannot finish onboarding until Instagram is connected.
   - Production config sets AUTH_EMAIL_ENABLED=false. Add a startup guard that refuses AUTH_EMAIL_ENABLED=true when NODE_ENV=production.
3. Profile details (2.4):
   - Migration: name, city, age, age_recorded_at, gender, website, pitch, profile_locked_at, adult_confirmed_at.
   - PUT /api/me/profile saves once, with the fields per role, then locks (409 PROFILE_LOCKED with the support address).
   - Age is 18 to 99, and the current age is computed from age plus years since age_recorded_at.
   - Onboarding steps become: Instagram profile, email, profile, then UPI (creators) or billing (brands).
4. Resume (2.5): add the profile fields, contact email, account type, completed deals count, total value and member since to GET /api/users/:id/resume.
5. Cancelling (2.6): brand cancel only in OPEN and CONFIRMED. Update the transition table in packages/shared, the exhaustive tests, allowedActions reasons ("The deal cannot be cancelled after the fee is paid. Write to us if something is wrong."), and email 11.
6. Support address (2.7): SUPPORT_EMAIL env used in every email footer, error copy and DISPUTE_EMAIL default.
7. Update docs/SPEC.md everywhere these change, and retire docs/V0_LAUNCH.md (a short note pointing to REPLACEMENT_PLAN.md).
8. Tests:
   - account type mapping and the change rule
   - the production guard
   - profile lock, age bounds and the computed age
   - resume fields
   - the cancel rules for every status
   - fee and GST at several budgets

Done when an Instagram Business account signs in as a brand and a Creator account as a creator on staging, with no role question.
```

### Prompt 15 - Scheduled jobs and reminders

```
Read CLAUDE.md, docs/REPLACEMENT_PLAN.md section 2.8, and docs/SPEC.md sections 8 and 14.

- node-cron in the API process, Asia/Kolkata time. Each job holds a Postgres advisory lock and logs its duration and counts. Add a pnpm script to run any job once by hand.
- Jobs:
  - Instagram refresh, daily 03:00: profile, followers, engagement and the long-lived token for accounts active in the last 30 days, within Meta's rate limits.
  - Fee reminder, daily 10:00: CONFIRMED for more than 24h.
  - Payment due reminder, daily 10:00, to the brand: COMMISSION_PAID with no advance record, or APPROVED with no final record, for more than 24h.
  - Confirm-payment reminder, every 6 hours, to the creator: a direct-payment record unconfirmed and undisputed for more than 12h.
  - Review reminder, daily 10:00: CONTENT_UPLOADED for more than 3 days.
  - Content overdue, daily 23:59.
  - Cleanup, daily 04:00: expired sessions, verification tokens and email codes.
- Each reminder email at most once per deal per day, recorded in email_log.
- Tests: each job selects exactly the right rows, the lock prevents a double run, and there is no second reminder on the same day.
```

### Prompt 16 - Real-time with Socket.io

```
Read CLAUDE.md and docs/SPEC.md section 10.

- Socket.io on the API's HTTP server, authenticated with the session cookie in the handshake.
- Rooms: feed:creators, user:<id>, and deal:<id> (join checked: brand, confirmed creator or admin only).
- Events, all emitted from transitionDeal's after-commit hook and the application and direct-payment services:
  - deal:new and deal:closed to feed:creators
  - deal:updated to deal:<id>, including when a direct payment is recorded, confirmed or not received
  - application:new to the brand
- Clients refetch over REST on every event and on reconnect. Sockets are never the source of truth.
- Single instance for now. Note in SPEC 10 that a second instance needs the Redis adapter.
- Tests: unauthenticated connections refused, a stranger cannot join a deal room, one event per transition, and payment record events reach both sides.
```

### Prompt 17 - Hardening and full-flow test

```
Read CLAUDE.md, docs/REPLACEMENT_PLAN.md section 2, and docs/SPEC.md sections 20 and 22.

1. An end-to-end API test of the whole live flow (REPLACEMENT_PLAN 2): Instagram sign-in mocked for a Business and a Creator account, profiles, UPI, deal, fee via Razorpay with signed webhooks, advance recorded and confirmed, content and revision, approval, final recorded and confirmed, COMPLETED, all documents, all emails. Add a second test for "not received" then record again, and a third for admin cancel after the fee.
2. A test that lists every Express route and fails if one has no guard and is not on an explicit public allowlist.
3. Sentry for the API and the web app: errors only, with emails, UPI IDs, cookies, tokens, request bodies and IPs removed before sending. Off unless SENTRY_DSN is set.
4. Run EXPLAIN on the feed, deal page, resume and admin list queries, and add any missing index.
5. pnpm audit, and confirm log redaction covers UPI IDs.
6. Write docs/RUNBOOK.md: a payment not received, a stuck deal, a dispute, a fee refund by hand in Razorpay, an Instagram token failure, a Render outage, a database restore.
Report what you fixed and what needs a human.
```

### Prompt 18 - Import from the live database, and cutover rehearsal

Give Claude Code a **read-only** connection string to a copy of the live database (a Render or Supabase snapshot restored somewhere private), never the live database itself. Also give it the list of live migration files (`marketplace/src/lib/migrations/` in valueskins/valueskins) so it knows the old schema.

```
Read CLAUDE.md, docs/REPLACEMENT_PLAN.md sections 2 and 5, and docs/SPEC.md section 15. LIVE_DB_URL points to a read-only copy of the live app's database. Its schema comes from the migration files I paste below. Never write to it.

Write apps/api/src/import/ and a pnpm script import:live, with --dry-run as the default:
- Users: Instagram user id, username, account type and role, email and verified flag, UPI ID, payout name and consent time, profile details (name, city, age and when it was given, gender, website, pitch, locked time), followers. Old BIGINT ids map to new UUIDs in an import_id_map table.
- Deals:
  - Completed and cancelled deals with their frozen amounts (old amounts are rupees in NUMERIC: convert exactly to paise and fail on any fraction of a paisa), events, content links, fee payments and direct-payment records. They are history for the resume and the ADP.
  - Deals in progress are imported in their current status only if every field maps. Otherwise list them in the report for a manual decision.
- Fee invoices: copy them with their numbers. Set invoice_counters so the next number continues the live sequence for the current financial year, with no gap and no repeat.
- Sessions and Instagram tokens are not imported. Users sign in again.
- The import is idempotent: running it twice changes nothing the second time.
- The dry run prints counts per table, every row it would skip and why, and every deal needing a decision.
Then write docs/CUTOVER.md: the step-by-step switch from the live app to this one, with timings, who does what, and the rollback (DNS back to the old Vercel project). Rehearse it on staging with the copy and report the timings.
```

### Prompt 19 - Production and cutover

```
Read CLAUDE.md, docs/CUTOVER.md, docs/DEPLOYMENT.md and docs/SPEC.md section 22.

Add production to render.yaml and the Vercel project, and add a production section to docs/DEPLOYMENT.md:
- Render API (paid) and Postgres (paid, backups on) in Singapore
- Vercel on valueskins.com, and api.valueskins.com
- live Razorpay keys (the newly rotated ones) and the live webhook (payment.captured, payment.failed, order.paid only)
- Resend production, the same Meta app with production URIs
- ADMIN_INSTAGRAM_USER_IDS, COMPANY_* values, COMPANY_GSTIN, COMMISSION_SAC_CODE, GST_RATE_BPS=1800
- SUPPORT_EMAIL, SESSION_COOKIE_NAME=vs_session, AUTH_EMAIL_ENABLED=false, no ENABLE_DEV_LOGIN
Do not touch any account yourself. Walk me through docs/CUTOVER.md and the SPEC 22 checklist one step at a time, telling me how to verify each. The last step is one real deal at the minimum budget (₹886 at the time of writing, ₹2,000 since 11 November 2026; it was ₹5,000 when this was drafted) between the two founders on production, including a real ₹885 fee, before DNS moves.
```

---

## 5. Cutover in one paragraph

**No import was needed.** The live app's database holds only the two founders' test accounts, with no deals, payments or invoices, so nothing is carried over: Prompt 18's import is not used. Everyone signs in again with Instagram, and fee invoice numbering starts at `VS/2026-27/000001` for the current financial year. Production starts with `PAYMENTS_MODE=off` and `DEAL_POSTING_MODE=off` and opens later without a deploy. The new app is checked on production first, on a temporary hostname. Then the Meta deauthorize and data-deletion URLs point to the new API, `WEB_ORIGIN` moves to `https://valueskins.com`, and the `valueskins.com` and `www` domains move to the new Vercel project. The old app stays deployed on another hostname for a week as the rollback. The Razorpay webhook is registered on the new API only when payments open. The steps, who does them, how to check each one and the rollback are in `docs/CUTOVER.md`.

---

## 6. Claude Design prompts

Run these in one Claude Design project, in order. Fix things by replying in the same project. When D5 is approved, use Claude Design's handoff to Claude Code and give that instruction to the web session together with W1.

### D0 - Context and design system

```
We are designing the web app for ValueSkins, an Indian marketplace where brands hire Instagram creators for fixed-price content deals. I will send the screens over several messages. In this step set up the design system and the app shell only.

How the product works:
- Sign-in is with Instagram only. An Instagram Business account is a brand. An Instagram Creator account is a creator. Nobody picks a role.
- A brand posts a deal with a fixed amount and deadlines. Every creator sees every open deal and can apply. The brand confirms one creator.
- Payment 1: the brand pays ValueSkins a flat fee of ₹885 (₹750 + 18% GST) through Razorpay.
- Payment 2: the brand pays the creator 30% of the rest directly by UPI. The brand records the UPI reference, and the creator confirms the money arrived.
- The creator shares the content as a Google Drive link. The brand approves it or asks for changes.
- Payment 3: the brand pays the creator the final 70% by UPI, and the creator confirms it.
- Both sides download a PDF record of the deal.
- There is no chat and no negotiation. ValueSkins never holds the creator's money.
- There is also an admin.

Visual rules (strict):
- Background #000000. Text #FFFFFF. Secondary text #A3A3A3. Borders #262626. One accent #FF0000, used only for primary actions and the focus ring. Error text #FF4D4D.
- No gradients, shadows, glow, blur, illustrations or stock photos. Corner radius at most 4px.
- One sans-serif font. A clear type scale. Tabular numbers for money.
- Money looks like "₹10,000.00" with Indian digit grouping. Dates look like "30 Sep 2026". Times are IST.
- Only simple line icons, and only where needed.
(If I attach screenshots of the current site, keep its typeface and spacing feel, but these color rules win.)

Copy rules (strict): no emojis, no em dashes (use a hyphen), no marketing words such as unlock, seamless, powered by, effortless, elevate. Short, plain sentences. Every disabled button shows its reason as a short line under it.

Build:
1. A design system page with the colors, type scale, spacing (4px base), and these components in every state (default, hover, focus, disabled with reason, loading):
   - primary, secondary and text buttons
   - input, textarea, date, select, checkbox
   - card, modal, toast
   - status badges for each deal status: Draft, Open, Confirmed, Fee paid, Advance confirmed, Content shared, Changes requested, Approved, Completed, Cancelled
   - money display, countdown (with an overdue state)
   - empty, error and loading states
   - a 9-step progress bar: Posted, Creator confirmed, Fee paid, Advance confirmed, Content shared, Review, Approved, Final confirmed, Completed
   - a user chip with avatar and @username
   - a UPI ID display in full and masked (cr•••@okhdfcbank) forms
   - a QR code block
2. The app shell at 1440px and 390px:
   - wordmark "ValueSkins" as text
   - Creator navigation: Deals, Applications, My deals, Settings
   - Brand navigation: Campaigns, Settings, and a "Post a deal" button
   - Admin navigation: Deals, Disputes
   - On mobile, the navigation collapses into a menu.
Use realistic Indian data: @riya.eats, @urbanthreads.in, Pune, Mumbai.
```

### D1 - Public pages, sign-in, onboarding, settings

```
Same system. At 1440px and 390px:

1. Home (logged out): "ValueSkins - Where creators and brands connect to collaborate." Then "Brands: Post a deal. Select a creator. Pay. Done." and "Creators: Browse deals. Apply. Deliver. Get paid." One primary button, "Sign in with Instagram". A short line: "Your Instagram account must be public and a Business or Creator account." Footer: How it works, Terms, Privacy, Refunds, Contact.
2. How it works: a long readable page with numbered steps (sign in, post, apply, pick, fee, 30% by UPI, deliver, review, 70% by UPI, deal record), then a section "What ValueSkins does not do yet" listing short items with a title and one or two sentences each. Use long realistic text.
3. Sign-in error:
   - Personal account: "ValueSkins needs a public Instagram Business or Creator account. A Business account posts deals as a brand. A Creator account applies to deals." with "How to switch" steps.
   - Role changed: the account type changed but the account has deals; "write to us".
   - A generic error.
4. Onboarding stepper:
   - "Your Instagram": picture, name, @username, account type, followers, posts, engagement, bio; "This is me".
   - "Email": enter it, "Check your inbox" state, "Verified" state.
   - "Your profile" for creators: name, city, age, gender, and the "I am 18 or older" checkbox. For brands: name, city, website, hiring pitch (optional, with a character count). A warning: "Saved once. To correct it later, write to us."
   - Creator "Get paid by UPI": UPI ID, name on the account, consent checkbox "I agree my UPI ID and name are shown to a brand that confirms me on a deal", and the note "We do not verify UPI IDs. Enter yours carefully. A payment to a wrong UPI ID cannot be recalled." Include the error for a bank account number typed in.
   - Brand "Billing details": billing name, address, state, GSTIN optional.
5. Settings, per role: email (change and re-verify), profile (read-only once locked, with "To correct this, write to us"), UPI (masked, with Change) or billing, the Instagram account, and delete account.
6. Terms, Privacy and Refund pages (long text layout), Contact, and 404.
```

### D2 - Creator screens

```
Same system, 1440px and 390px:

1. Deals feed: open deal cards with the brand chip (hover or tap shows the resume card), title, two lines of description, "Budget ₹10,000.00", "You receive ₹9,115.00 (₹2,734.50 + ₹6,380.50)", "Apply by 2 Oct", "Content due 10 Oct". A "New" label on fresh deals. An empty state. A banner "Add your UPI ID to apply" when it is missing.
2. Open deal page: the full description, an amounts panel, the deadlines, and the Apply button in every state: Apply; Applied; Applications closed; Add your UPI ID to apply.
3. Applications: my applications with status (Applied, Confirmed, Not selected).
4. My deals: Active and Completed tabs.
5. Resume card (used everywhere):
   - picture, @username with a link to Instagram, name, account type, city, age, gender, followers, engagement
   - "Contact: riya@example.com"
   - completed deals count, total value, member since
   - up to 10 recent completed deals
   - Brand version: website and hiring pitch instead of age and gender.
```

### D3 - Brand screens

```
Same system, 1440px and 390px:

1. Campaigns: my deals grouped Drafts, Open, In progress, Completed, Cancelled. A "Post a deal" button. An empty state.
2. Post a deal form:
   - Title.
   - A large description with an "Insert template" button (content type, shooting, travel, timeline, approval, rights, deliverables, restrictions, delivery, additional notes).
   - Budget in whole rupees, with commas as you type and a minimum error (the minimum comes from `GET /config`; it was ₹5,000 when this was drafted, ₹886 when last updated, ₹2,000 since 11 November 2026).
   - Three dates, each with helper text: apply by, content due, deal ends. Plus the order error.
   - Directly under the budget, a live breakdown: "ValueSkins fee ₹885.00 (₹750.00 + GST ₹135.00), paid by you through Razorpay. To the creator by UPI: ₹2,734.50 before work starts, ₹6,380.50 after you approve. Total ₹10,000.00."
   - Autosave note, Save draft, Publish.
   - A publish confirmation modal saying the deal cannot be edited, and can be cancelled only until the fee is paid.
3. The applicants list on an open deal: rows with the resume (expandable inline on mobile), followers, engagement, applied time, and Confirm with a modal. A disabled Confirm with the reason "This creator has not added a UPI ID".
```

### D4 - The deal page in every state

```
One deal page layout, shown in every state below. Show the brand and creator views where they differ, at 1440px, plus a 390px version of the states marked *.

Layout:
- Header: title, status, short id "VS-8K2M4Q", the two user chips.
- The 9-step progress bar.
- A "Next step" area showing the one action this person can take now, or what they are waiting for.
- Side panel: amounts with paid or confirmed marks, deadlines with countdowns.
- Sections: Content links, Feedback, Payments (the fee, and each UPI record with its reference, recorded time, and Confirmed / Waiting for creator / Not received), Documents, Emails sent, Activity, and "Raise a dispute".

States:
1. * Open (brand): applicants with Confirm, and Cancel deal.
2. Confirmed: brand "Pay ValueSkins fee ₹885.00" (Razorpay) and Cancel deal. Creator: waiting.
3. * Fee paid, brand: a "Pay the creator ₹2,734.50 by UPI" panel showing:
   - the creator's UPI ID in full and the name on the account, with "Check that your UPI app shows this name before you pay"
   - a "Pay with UPI app" button (opens the UPI app with the amount filled in) and a QR code for paying from a phone
   - then a form "Record the payment": UPI reference / UTR, optional note, "I have paid".
   Also the blocked versions: "The creator has not added a UPI ID yet" and "The creator has not agreed to share their UPI ID".
   No Cancel button: show "The deal cannot be cancelled after the fee is paid. Write to us if something is wrong."
4. * Advance recorded, creator: "The brand says it paid ₹2,734.50 to cr•••@okhdfcbank. Reference 412345678901. Check your UPI app." Two buttons: "I received it" (primary) and "Not received" (opens a reason field). Brand view: "Waiting for the creator to confirm."
5. Not received, brand: "The creator says the payment did not arrive: <reason>." Shows the old record crossed out as Not received, and the record form again.
6. * Advance confirmed: creator "Share your content" (Drive link, countdown, overdue version). Brand: waiting.
7. Content shared, brand review: the link, "Suggest changes" (textarea) and "Approve" (modal "Approve the content? You will then pay the final ₹6,380.50 to the creator by UPI.").
8. Changes requested: creator sees the feedback and shares again. The 5-revision notice.
9. Approved: brand pays the final ₹6,380.50 (same UPI panel as state 3). Then the creator confirms (same as state 4).
10. Completed: summary, documents (Fee invoice, Advance payment record, Final payment record, Deal record PDF) and "Download deal record".
11. Cancelled: who cancelled, when, why, and whether the fee was kept.
```

### D5 - Admin

```
Same system, 1440px (768px tablet is enough):

1. Deals table with status filter, short id search and pagination.
2. Deal detail: everything on the deal page, plus:
   - the fee payment (Razorpay order and payment ids)
   - every UPI record, including Not received ones with their reasons
   - emails with Resend
   - disputes
   - "Cancel deal" (note required, optional refund reference, and "Refunds of the fee are done by hand in Razorpay")
3. Disputes list and detail with "Mark resolved" (note required, "Both sides will be emailed").
Then check every screen from D0 to D5 for consistency, and prepare the handoff to Claude Code.
```

---

## 7. Web prompts (second Claude Code session, own worktree)

Start after the D5 handoff, and after Prompt 14 is merged so the API contract is stable: `git worktree add ../getvalueskins-web -b web/shell`. Paste Claude Design's handoff instruction first, then the prompt.

### W1 - Shell, sign-in, onboarding, settings, public pages

```
Read CLAUDE.md, docs/REPLACEMENT_PLAN.md section 2, and docs/SPEC.md sections 6 and 18. The design handoff I just gave you is the visual source of truth. apps/api routes and packages/shared schemas are the data source of truth. Do not change apps/api or packages/shared. Write any missing API need into docs/WEB_API_GAPS.md and carry on.

Delete apps/web/app/(temporary) and apps/web/lib/temporary, and the next.config.ts path mappings that served them. Build to the design:
- Tailwind theme from the design tokens, and the UI primitives.
- A typed API client (credentials included, errors mapped) and TanStack Query.
- useMe(), route protection by onboarding state and role (wrong role gets 404), logout.
- Home with Instagram sign-in only (email sign-in only when GET /api/config says it is enabled, for staging), How it works, sign-in errors, the onboarding stepper, settings for both roles, Terms, Privacy, Refunds, Contact, 404.
- Legal and How it works text: take the current wording from the live site's pages (I will paste it into apps/web/content), and mark anything that refers to features we do not have.
- The ResumeCard component (hover on desktop, tap on touch, keyboard accessible).
- /dev/login only outside production builds.
Done when, on a Vercel preview against staging, a Business and a Creator account can sign in and finish onboarding.
```

### W2 - The deal flow

```
Read CLAUDE.md, docs/REPLACEMENT_PLAN.md sections 2.1 and 2.6, and docs/SPEC.md sections 5, 9, 10 and 18. Use the design handoff for every screen. Do not change apps/api or packages/shared. Record gaps in docs/WEB_API_GAPS.md.

- Creator: deals feed, open deal page with every Apply state, applications, my deals.
- Brand: campaigns, the post-a-deal form (template, commas in the budget, the live breakdown from computeBreakdown with GET /api/config values, local autosave every 30s and on blur, drafts, publish modal), applicants with Confirm.
- The deal page in every state, driven only by allowedActions and reasons from GET /api/deals/:id:
  - the fee via Razorpay Checkout, then verify, with confirming and failed states
  - the UPI panel from GET /api/deals/:id/direct-payment: the upi://pay link, a QR code (use the qrcode package, loaded only on that step), and the record form
  - the creator's I received it / Not received
  - content, review, history, documents, emails, activity, dispute
- Socket.io: connect when signed in; refetch on deal:new, deal:closed, deal:updated and application:new; refetch on reconnect and on window focus.
Done when a full deal runs on the preview against staging with two browsers.
```

### W3 - Admin, copy check, responsive pass

```
Read CLAUDE.md and docs/SPEC.md sections 12 and 18.
1. Admin pages from the design.
2. A test that fails if an emoji, an em dash, or a banned word from CLAUDE.md appears in apps/web, apps/api/src/email or packages/shared/src/copy.ts. Fix every hit.
3. A pass over every page:
   - disabled reasons, and empty, loading and error states
   - 390, 768 and 1440 widths
   - keyboard focus
   - CSP allowing Razorpay Checkout and the Sentry host only
4. Give me the pages to check by hand, and the contents of docs/WEB_API_GAPS.md.
```

After W3, close the gaps in `docs/WEB_API_GAPS.md` with a short API prompt before Prompt 17.
