# Web API gaps

What the screens in `docs/DESIGN_HANDOFF.md` need that the API does not give today. Each entry says what is needed, what the API returns now, and a suggestion. Web prompts add to this file. They never change `apps/api` or `packages/shared`.

## Sign-in, onboarding, settings

- **Instagram step:** "Your Instagram" shows the bio and the account type.
  - **Today:** `GET /me` `profile` has neither.
  - **Suggestion:** add `biography` and `accountType`.
- **Brand billing in Settings:** the screen shows the saved billing details.
  - **Today:** there is only `PUT /me/billing`.
  - **Suggestion:** add `GET /me/billing`.
- **Support email:** the screens use founder@valueskins.com, as on the live site.
  - **Suggestion:** confirm the `SUPPORT_EMAIL` value in every environment.

## Creator

- **Feed cards:** they show "You receive ₹9,115.00 (₹2,734.50 + ₹6,380.50)" and an "Applied" mark.
  - **Today:** feed items have `creatorAmountPaise` only, and no applied flag.
  - **Suggestion:** add `advancePaise`, `finalPaise` and `applied`, so the web never computes money.
- **My deals (creator):**
  - Needs a "Your turn" hint (for example, a payment waiting for the creator to confirm) and the amount received so far.
  - The list also filters by only one `status`.
  - **Suggestion:** add `nextActor` or `yourTurn`, `receivedPaise`, and a multi-status filter.
- **Applications on a cancelled deal:** the deal page answers 404 for an applicant, so the row shows no link. This works as designed. It is noted only so nobody adds a link.
- **Resume visibility:** SPEC 11 [CONFIRM] still stands: every signed-in user sees the contact email and the deal amounts.

## Brand

- **Campaigns rows:**
  - Need the applicant count, whether applications are still open, and the confirmed creator.
  - Also `completedAt`, `cancelledAt`, `cancelledByRole` with the reason, and a "your turn" hint.
  - **Today:** `GET /deals/mine` items have none of these, and filter by one status only.
  - **Suggestion:** add these fields to the brand's summary, and a multi-status filter.
- **Applicants:**
  - Confirm should be disabled ahead of time, with a reason, for a creator with no UPI ID (imported accounts) or a deleted account.
  - **Today:** applicant items carry no confirm flag or reason. The short reason "This creator has not added a UPI ID" is not in `copy.ts`.
  - **Suggestion:** add a per-applicant `confirm: { enabled, reason }`.
- **Deal template:** it exists only in SPEC 9.
  - **Suggestion:** add it to `copy.ts`, and rewrite its examples to the copy rules ("1 to 3 Oct", "₹2,000.00").
- **Publish error wording:** the errors say "application deadline" and "content upload deadline", but the fields are labelled "Apply by" and "Content due". Align one side.
- **Publish limit:** the publish 429 says only "Too many requests". The web turns it into "You can publish up to 10 deals a day" using `Retry-After`. A specific code would help.

## Deal page

- **Fee wording:** the screens say "ValueSkins fee", but `payCommissionLabel` and the email subjects say "commission". Pick one term.
- **Missing consent:**
  - It has no copy string.
  - `allowedActions` gives "The creator has not added a UPI ID yet" for both missing UPI and missing consent, so the page must read `blocked` from `GET /deals/:id/direct-payment`.
  - **Suggestion:** add the string "The creator has not agreed to share their UPI ID".
- **Documents:**
  - The deal detail has no invoice or record numbers; they appear only in the PDF filenames. There is no documents list.
  - **Suggestion:** add `documents: [{ kind, number, issuedAt }]`.
- **Disputes:**
  - After raising one, neither side can see it.
  - There is no field, no endpoint and no socket event, and `RAISE_DISPUTE` stays enabled.
  - **Suggestion:** add `disputes` (subject, status, dates) to the deal detail for both parties.
- **Activity:**
  - Events have no actor role, and UPI records are not events.
  - An admin cancel's refund reference sits only inside the event note.
  - **Suggestion:** add `actor.role`, and add events for recorded and not-received payments.
- **Error messages:** `INVALID_TRANSITION`, `WRONG_DEAL_STATUS` and the admin cancel 409 name raw statuses, so the web shows its own text for these codes. Recording a payment for a creator with no UPI ID returns a message about confirming a creator.
- **Fee in progress:** there is no "fee payment in progress" state on the deal. The page relies on the `verify` result.
- **Feedback text:** no length limit and no trim.
- **Deal record naming:** the screens say "Deal record", but the PDF and Email 10 say "Deal Report". Align one side.

## Admin

- **Deals table:**
  - Needs "Open dispute" and "Content overdue" marks, and an updated time.
  - **Today:** list items have no flags, no `updatedAt` and no total count.
  - **Suggestion:** add `hasOpenDispute`, `contentOverdue`, `awaitingConfirmation` and `updatedAt`.
- **Dispute detail:**
  - There is no `GET /admin/disputes/:id`.
  - The dispute view lacks the raiser's role and who resolved it.
  - **Suggestion:** add the endpoint, `raisedBy.role` and `resolvedBy`.
- **Admin deal detail:**
  - Emails have no body text.
  - Events show a deleted user as the raw `deleted_xxxxxxxx` instead of "Deleted user".
- **Refunds:** payments have no refund fields. Refunds are done by hand in Razorpay, and the reference is kept only in an event note or a dispute.
- **Admin alerts:** these go by email only, and admins have no list of them.
