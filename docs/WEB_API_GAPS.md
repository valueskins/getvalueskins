# Web API gaps

What the screens in `docs/DESIGN_HANDOFF.md` need that the API did not give. Each entry says what was needed, and its status: **Done** (with where it is described), or **Not doing** with the reason. Web prompts add to this file. They never change `apps/api` or `packages/shared`.

Every entry below is closed: the W1 to W3 items were closed in the `feat/close-web-api-gaps` change.

The gaps below were closed in the `feat/web-api-gaps` change. SPEC section numbers say where each is described.

## Sign-in, onboarding, settings

- **Instagram step:** "Your Instagram" shows the bio and the account type.
  - **Done.** `GET /me` `profile` has `biography` and `accountType` (SPEC 6.4, 16). Both are null for an account with no Instagram data.
- **Brand billing in Settings:** the screen shows the saved billing details.
  - **Done.** `GET /me/billing` answers `{ billing }`, or `{ billing: null }` before anything is saved. `PUT /me/billing` also returns `billing` (SPEC 6.4, 16).
- **Support email:** the screens use founder@valueskins.com, as on the live site.
  - **Done.** `SUPPORT_EMAIL` is required in every environment and defaulted nowhere. `docs/DEPLOYMENT.md` documents `founder@valueskins.com` for staging and production, and `render.yaml` sets it for staging (SPEC 19, 21). The mailbox must exist before the deploy.

## Creator

- **Feed cards:** they show "You receive ₹9,115.00 (₹2,734.50 + ₹6,380.50)" and an "Applied" mark.
  - **Done.** Feed items have `advancePaise`, `finalPaise` and `applied` (SPEC 16).
- **My deals (creator):**
  - **Done.** `GET /deals/mine` takes a comma list of statuses, and each item has `yourTurn`, `nextStep` and, for a creator, `receivedPaise` (confirmed direct payments only, so not the fee) (SPEC 5.5, 16).
- **Applications on a cancelled deal:** the deal page answers 404 for an applicant, so the row shows no link. This works as designed. It is noted only so nobody adds a link.
  - **Done (no change needed).** Still true, and still tested.
- **Resume visibility:** every signed-in user sees the contact email and the deal amounts.
  - **Done.** Decided, and the SPEC 11 and 21 open decisions are closed.

## Brand

- **Campaigns rows:**
  - **Done.** Brand items in `GET /deals/mine` add `applicantCount`, `applicationsOpen`, `creator`, `completedAt`, `cancelledAt`, `cancelledByRole`, `cancellationReason`, `yourTurn` and `nextStep`, with the multi-status filter (SPEC 5.5, 16).
- **Applicants:**
  - **Done.** Each applicant has `confirm: { enabled, reason }` for a deleted account, a decided application, a deal that is no longer open, no UPI ID and no consent. "This creator has not added a UPI ID" and "The creator has not agreed to share their UPI ID" are in `copy.ts`. `PAY_ADVANCE` and `PAY_FINAL` in `allowedActions`, and the record-a-payment error, say which of the two applies (SPEC 16).
- **Deal template:**
  - **Done.** `DEAL_DESCRIPTION_TEMPLATE` is in `copy.ts`, rewritten to the copy rules ("1 to 3 Oct", "₹2,000.00"). SPEC 9 shows the same text.
- **Publish error wording:**
  - **Done.** Validation errors use the field labels "Apply by", "Content due" and "Deal ends" (SPEC 16).
- **Publish limit:**
  - **Done.** The 11th publish in a day answers `429 PUBLISH_LIMIT`, "You can publish up to 10 deals a day", with `Retry-After` (SPEC 13). Other limiters still answer `RATE_LIMITED`.

## Deal page

- **Fee wording:**
  - **Done.** Users see "ValueSkins fee" in `copy.ts` (`payFeeLabel`), email subjects and bodies, PDFs and error messages. Identifiers, enums, table names and URL slugs keep "commission". The old `payCommissionLabel` stays only for the temporary pay page, and goes when the pay page is rebuilt (SPEC 5.5, 8, 18).
- **Missing consent:**
  - **Done.** The string exists, and `allowedActions` gives the right reason for each case, so the page no longer has to read `blocked` to tell them apart.
- **Documents:**
  - **Done.** `documents: [{ kind, number, issuedAt }]`, where `kind` is the URL slug for `GET /deals/:id/documents/:kind`. The deal record appears once the deal is completed, with no number (SPEC 16).
- **Disputes:**
  - **Done.** `disputes: [{ id, subject, status, raisedByRole, createdAt, resolvedAt }]` for both parties, `RAISE_DISPUTE` is disabled while one is open (the server also refuses a second open dispute with `409 DISPUTE_ALREADY_OPEN`), and `deal:updated` is sent when a dispute is raised or resolved (SPEC 10, 12, 16).
- **Activity:**
  - **Done.** Every event has `actor.role` and a `kind`. Recorded and not-received direct payments are events, written in the same transaction as the record. An admin cancel's refund reference is the event's `refundReference` field (SPEC 15).
- **Error messages:**
  - **Done.** `INVALID_TRANSITION`, `WRONG_DEAL_STATUS` and the admin cancel 409 give plain messages with no raw status. Recording a payment for a creator with no UPI ID returns the matching reason (SPEC 7.3a, 16).
- **Fee in progress:** there is no "fee payment in progress" state on the deal. The page relies on the `verify` result.
  - **Done.** No new status: verify answers the outcome. A fee captured after the deal changed answers `409 FEE_CAPTURED_DEAL_CHANGED` with the refund message (W2 below, SPEC 7.3).
- **Feedback text:**
  - **Done.** Trimmed, at least 1 and at most 5,000 characters, like a dispute (SPEC 16).
- **Deal record naming:**
  - **Done.** The PDF is titled "ValueSkins Deal Record", the file is `ValueSkins-Deal-Record-<short id>.pdf`, and email 10 is "Deal record ready" (SPEC 8, 17). An admin resend of an email stored under the old file name still works.

## Admin

- **Deals table:**
  - **Done.** List items have `hasOpenDispute`, `contentOverdue`, `awaitingConfirmation` and `updatedAt`, and the response has `total` (SPEC 12).
- **Dispute detail:**
  - **Done.** `GET /admin/disputes/:id`, with `raisedBy.role` and `resolvedBy` (SPEC 12, 16).
- **Admin deal detail:**
  - **Done.** Emails carry their `bodyText`. A deleted user shows as "Deleted user" in events, disputes, history and the deal record, never the anonymized username. Stored email addresses and usernames inside stored email bodies are a legal record and are not rewritten.
- **Refunds:** payments have no refund fields. Refunds are done by hand in Razorpay, and the reference is kept only in an event or a dispute.
  - **Not doing (after cutover).** Refunds are manual and rare, and the reference already has a field on the cancel event and on the dispute. A refund table needs a real refund flow, which v1 does not have.
- **Admin alerts:** these go by email only, and admins have no list of them.
  - **Not doing (after cutover).** It needs a new table and screens. The alerts reach `DISPUTE_EMAIL`, and the failed ones are on the `webhook_events` rows.

## W1: shell, sign-in, onboarding, settings, public pages

Found while building W1.

- **Pending email address:** onboarding's "Check your inbox" and the Settings "Confirm <new address>" panel need the address a link was last sent to, after a reload or in another tab.
  - **Done.** `GET /me` `user.pendingEmail`: the address of the last unused, unexpired link, null once verified or when it equals the verified one, and only the user's own (SPEC 6.4, 16). The web reads it; the sessionStorage copy is gone.
- **18 or older, confirmed on:** the design's Settings shows "18 or older: Confirmed on 14 Oct 2026".
  - **Done.** `profileDetails.adultConfirmedAt` (SPEC 6.4), shown in Settings, Profile.
- **Deleting an account keeps brand billing:** `DELETE /me` cleared a creator's UPI details but not the `brand_billing` row.
  - **Done.** `DELETE /me` deletes the row. Invoices and payment records keep the billing they were issued with in their snapshots, and the deal record reads it from the fee invoice's snapshot, so documents re-render the same (SPEC 15). The brand's delete text names billing details, and the Privacy note is gone.
- **Names with digits:** a brand called "Studio 9" or "21st Street" could not save its profile.
  - **Done.** Brand names may contain digits and start with one (`brandNameSchema`, `INVALID_BRAND_NAME`). Creator names keep the letters-only rule.
- **Unused copy:** `payCommissionLabel` in `copy.ts`.
  - **Done.** Deleted.
- **Preview deployments and sign-in:** a `*.vercel.app` preview cannot sign in (`WEB_ORIGIN` is one origin, the cookie is for `.valueskins.com`, the Instagram callback returns to `WEB_ORIGIN`).
  - **Not doing.** Sign-in is tested on `staging.valueskins.com` only, by pointing it at a branch for a while (DEPLOYMENT.md sections 9 and 9a). Supporting previews would need several origins in CORS, the Origin check and Socket.io, and a cookie and callback plan for another domain.
- **Deploy doc test:** `deployConfig.test.ts` still expected `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` in `docs/DEPLOYMENT.md`.
  - **Done.** The test now checks that the retired web variables are named nowhere in DEPLOYMENT.md or `apps/web/.env.example`.

## W2: the deal flow

Found while building W2.

- **No step field:** the 9-step bar had no shared mapping.
  - **Done.** `dealStep(status)` and `dealSteps(deal)` in `packages/shared/src/dealSteps.ts` (a cancelled deal stops where its timestamps end). The web uses them (SPEC 18).
- **No feedback history on the detail:** `GET /deals/:id` had only the latest `feedback`.
  - **Done.** `feedbackHistory: [{ feedback, at }]`, oldest first, for the two parties and admins (SPEC 16). The deal page and the admin deal page show it.
- **No `applied` flag on the detail:** a creator's "already applied" showed only as a reason text.
  - **Done.** `applied`, for a creator viewer; null for brands and admins (SPEC 16). The Apply panel uses it.
- **Dispute response is not a shared schema.**
  - **Done.** `disputeViewSchema` and `disputeResponseSchema` in `packages/shared/src/schemas/dispute.ts`, used by the API and the web.
- **Fee verify can succeed without moving the deal:** if the deal changed during Checkout, verify answered `CAPTURED` with the deal unchanged.
  - **Done.** The fee stays CAPTURED and the deal does not move; a `FEE_CAPTURED_DEAL_CHANGED` event, admin alert A1 and email 21 to the brand follow, once; verify answers `409 FEE_CAPTURED_DEAL_CHANGED` with "Your payment of ₹885.00 went through, but the deal had already changed. We will refund it." in either order (SPEC 7.3). The web shows that message.
- **`NEXT_PUBLIC_RAZORPAY_KEY_ID` is unused.**
  - **Done.** Removed from `apps/web/.env.example`, DEPLOYMENT.md and SPEC 19 (it was not in CI). The test checks it stays gone.
- **Lists and live updates:** Campaigns and My deals could not join every deal's room.
  - **Done.** `deal:summary` to `user:<brandId>` and `user:<creatorId>` on every transition and every direct payment record or not-received (SPEC 10). The lists re-read on it.
- **Technical API messages:** `WRONG_ROLE`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_NOT_CAPTURED` and some `WRONG_DEAL_STATUS` messages named a role, a status, a step or provider details.
  - **Done.** Plain messages from `copy.ts`, with the technical detail kept for the admin alert and the webhook record only (SPEC 16). The web shows them as they are.
- **SPEC 16 field name:** SPEC 16 said `creatorPayoutStatus`.
  - **Done.** SPEC 16 says `creatorPayoutSet`.

## W3: admin, copy check, page pass, CSP

Found while building W3.

- **Admin analytics:** SPEC 12 lists an analytics screen (`GET /admin/analytics`), with no endpoint and no design board.
  - **Not doing (after cutover).** The admin starts on the deals list. It needs an API prompt and a design.
- **Admin responses are not shared schemas.**
  - **Done.** `packages/shared/src/schemas/admin.ts` has the deals list, deal detail, disputes list and detail and resend schemas. The API returns them (a contract test parses every answer) and `apps/web/lib/api/admin.ts` uses them.
- **No admin `allowedActions`.**
  - **Done.** `adminActions` on `GET /admin/deals/:id` (`CANCEL`, `RESEND_EMAIL`, each with its reason, from shared `computeAdminDealActions`, SPEC 12). The web's own rule is gone.
- **No counts on the disputes tabs.**
  - **Done.** `total` on `GET /admin/disputes`; the tabs show both counts.
- **No party emails on the admin deal.**
  - **Done.** `parties` on `GET /admin/deals/:id`, each with `email` (null for a deleted account), admins only. The header shows them.
- **Admins are not in deal rooms:** the admin pages got no socket events.
  - **Done.** Admins could already join any deal room (tested); the admin layout now connects, and the admin deal page joins its room and re-reads on `deal:updated`.
- **Dispute detail loads the whole admin deal.**
  - **Done.** `GET /admin/disputes/:id` answers `{ dispute, deal, otherDisputes }`, with the deal's status, parties, amounts and dates. The page makes one request.
- **Sentry in the CSP:** the CSP allows Sentry's ingest hosts by pattern.
  - **Done (Prompt 17).** Sentry is in, errors only. The CSP allows the exact host of `NEXT_PUBLIC_SENTRY_DSN` and nothing for Sentry while it is unset (`apps/web/lib/csp.ts`).
- **Checking the admin screens locally:** dev login could not make an admin.
  - **Done.** `POST /api/dev/login` takes `admin: true` for a new user, outside production only, and the web form has an Admin box (SPEC 6.2). A test proves it is impossible in production.
- **Copy rules in the email templates and shared copy.**
  - **Done.** The em dashes in 18 code comments were replaced in W3. No user-facing text had a hit.
