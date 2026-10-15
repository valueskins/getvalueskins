# Web API gaps

What the screens in `docs/DESIGN_HANDOFF.md` need that the API did not give. Each entry says what was needed, and its status: **Done** (with where it is described), or **Not doing (later)** with the reason. Web prompts add to this file. They never change `apps/api` or `packages/shared`.

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
  - **Not doing (later).** A new deal status would change the state machine, its tests and SPEC 5.2 for a screen state that `POST /payments/verify` already answers. Revisit if the web needs it after W2.
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
  - **Not doing (later).** Refunds are manual and rare, and the reference already has a field on the cancel event and on the dispute. A refund table needs a real refund flow, which v1 does not have.
- **Admin alerts:** these go by email only, and admins have no list of them.
  - **Not doing (later).** It needs a new table and screens. The alerts reach `DISPUTE_EMAIL`, and the failed ones are on the `webhook_events` rows. Revisit when the admin screens are built.

## W1: shell, sign-in, onboarding, settings, public pages

Found while building W1. Open items need a short API prompt or a decision; the web works around each one as described.

- **Pending email address:** `GET /me` does not say which address a verification link was last sent to (it is only in `email_verification_tokens`). Onboarding's "Check your inbox" and the Settings "Confirm <new address>" panel need it after a reload or on another tab.
  - **Open.** The web keeps the address in `sessionStorage` for the tab, so a reload in the same tab still shows it. In a new tab the page falls back to the email form, and sending again replaces the old link. Suggested fix: `GET /me` adds `pendingEmail: string | null`.
- **18 or older, confirmed on:** the design's Settings shows "18 or older: Confirmed on 14 Oct 2026". `adult_confirmed_at` is stored but never returned.
  - **Open.** The row is left out. Suggested fix: `profileDetails.adultConfirmedAt`.
- **Deleting an account keeps brand billing:** `DELETE /me` clears a creator's UPI details but not the `brand_billing` row (DEPLOYMENT.md section 19). The design's delete text said billing details are removed, and so does the Privacy text.
  - **Open.** The brand's delete text leaves billing out, and the Privacy page has a "Not in this version" note. Decide whether billing is kept as part of the invoice record (then say so in Privacy) or cleared (then change the deletion).
- **Names with digits:** the shared name rule (`^\p{L}[\p{L}\p{M} .'’-]*$`) is used for a brand's name too, so a brand called "Studio 9" or "21st Street" cannot save its profile.
  - **Open, needs a decision.** The web shows the shared message. A brand name rule that allows digits and `&` would fix it.
- **Unused copy:** `payCommissionLabel` in `copy.ts` was kept only for the temporary pay page, which W1 deleted.
  - **Open.** Remove it in the next API prompt (SPEC 5.5 already says so).
- **Preview deployments and sign-in:** a `*.vercel.app` preview cannot sign in, because `WEB_ORIGIN` is a single origin, the session cookie is set for `.valueskins.com`, and the Instagram callback returns to `WEB_ORIGIN`.
  - **Not doing (later).** Decided for W1: a web branch is checked by pointing `staging.valueskins.com` at it for a while (DEPLOYMENT.md section 9a). Supporting previews would need several allowed origins in CORS, the Origin check and Socket.io, plus a cookie and callback plan for another domain.
- **Deploy doc test:** `apps/api/test/deploy/deployConfig.test.ts` ("documents the web env vars") still expects `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` in `docs/DEPLOYMENT.md`. W1 retired that variable: "Sign in with email" follows `GET /api/config` `authEmailEnabled`.
  - **Open.** DEPLOYMENT.md section 9 now names the variable only to say it is unused and can be deleted from Vercel, which is a real manual step. Drop the key from that test's list in the next API prompt.
