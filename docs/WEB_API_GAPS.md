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

## W2: the deal flow

Found while building W2. The web works around each one as described.

- **No step field:** the deal page's 9-step bar has no API field. Shared has no helper that maps a status to a step.
  - **Open.** The web maps it in `apps/web/lib/dealStatus.ts` from the status and the deal's timestamps (a cancelled deal stops where its timestamps end). A shared `dealSteps()` would keep the PDF, emails and web in step.
- **No feedback history on the detail:** `GET /deals/:id` has only the latest `feedback`.
  - **Open (works today).** The web reads the history from `GET /deals/:id/events`: each move from CONTENT_UPLOADED to REVISION_REQUESTED carries the feedback in `note`.
- **No `applied` flag on the detail:** a creator's "already applied" shows only as `APPLY` disabled with "You have already applied".
  - **Open (works today).** The web shows the Applied state from that reason. A boolean would make it independent of the wording.
- **Dispute response is not a shared schema:** `POST /deals/:id/disputes` answers an API-local `DisputeView`.
  - **Open.** The web only needs the call to succeed and then re-reads the deal's `disputes`.
- **Fee verify can succeed without moving the deal:** if the deal changed during Checkout, verify answers `CAPTURED` with the deal unchanged.
  - **Not doing (later)**, as before ("Fee in progress"). The web goes by `deal.status`: it says the payment is being confirmed, offers "Check payment", and never invites a second payment.
- **`NEXT_PUBLIC_RAZORPAY_KEY_ID` is unused:** Checkout uses the `keyId` the fee order returns.
  - **Open.** Delete it from the Vercel projects and from the deploy-doc test's list (`apps/api/test/deploy/deployConfig.test.ts`) in the next API prompt. DEPLOYMENT.md marks it unused.
- **Lists and live updates:** a socket may join only 30 deal rooms a minute, so Campaigns and My deals do not join every listed deal's room.
  - **Not doing (later).** Lists re-read on focus and reconnect, and on `application:new` for the brand. A per-user "my deals changed" event would make them live.
- **Technical API messages:** `WRONG_ROLE` names the raw role, and `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_NOT_CAPTURED` and some `WRONG_DEAL_STATUS` messages are technical or name a step.
  - **Open.** The web maps those codes to plain text (`apps/web/lib/dealErrors.ts`). Plain API messages would let it show them as they are.
- **SPEC 16 field name:** SPEC 16 says `creatorPayoutStatus` on `GET /deals/:id`; the API returns `creatorPayoutSet: boolean | null`.
  - **Open.** The web does not need it (the `PAY_*` reasons say which UPI detail is missing). Fix the SPEC wording in the next API prompt.

## W3: admin, copy check, page pass, CSP

Found while building W3. The web works around each one as described.

- **Admin analytics:** SPEC 12 lists an analytics screen (`GET /admin/analytics`), but there is no endpoint and no design board for it.
  - **Open.** Not built. The admin starts on the deals list. It needs an API prompt and a design.
- **Admin responses are not shared schemas:** `GET /admin/deals`, `GET /admin/deals/:id`, the disputes routes and the resend answer use API-local types.
  - **Open.** The web writes the shapes out in `apps/web/lib/api/admin.ts`. Shared Zod schemas would keep both sides in step.
- **No admin `allowedActions`:** an admin reads a deal as viewer `NONE`, so the detail lists no actions and no reasons.
  - **Open.** The web enables Cancel from the shared transition table (`canTransition(status, 'CANCELLED', 'ADMIN')`) and shows `ADMIN_CANCEL_WINDOW`, or "This deal is already cancelled", as the reason. The API still refuses outside the window. Admin actions (cancel, resolve, resend) with reasons in the detail would remove the web's rule.
- **No counts on the disputes tabs:** `GET /admin/disputes` has no `total`, unlike the deals list.
  - **Open.** The tabs show no counts. A `total` per status would match the design.
- **No party emails on the admin deal:** the design shows each person's email under their name on the admin deal page. The detail has only usernames. The addresses appear only on the email rows.
  - **Open.** Left out of the header. Adding `email` to the parties in the admin detail only would match the design.
- **Admins are not in deal rooms:** the admin pages get no socket events.
  - **Not doing (later).** They re-read after every admin action and on window focus, which is enough for a few admins.
- **Dispute detail loads the whole admin deal:** the dispute view has no deal status or amounts, so the side card calls `GET /admin/deals/:id`.
  - **Open (works today).** One extra call per dispute page. The deal's status and money in the dispute view would save it.
- **Sentry in the CSP:** Sentry is added in Prompt 17, so the CSP allows its ingest hosts by pattern (`*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.ingest.de.sentry.io`).
  - **Open (Prompt 17).** Narrow `SENTRY` in `apps/web/lib/csp.ts` to the DSN's host when Sentry is added.
- **Checking the admin screens locally:** dev login never sets `is_admin` (it comes only from `ADMIN_INSTAGRAM_USER_IDS` at Instagram sign-in).
  - **Open (works today).** Locally, set it by hand on a dev user (`update users set is_admin = true where username = '...'`). This is deliberate, so nothing to change unless a local admin is wanted often.
- **Copy rules in the email templates and shared copy:** the copy check found em dashes in 18 code comments in `apps/api/src/email` and `packages/shared/src/copy.ts`.
  - **Done.** Replaced with hyphens in this change, comments only, as W3 asked. No user-facing text had a hit.
