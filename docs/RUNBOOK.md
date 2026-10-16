# Runbook

What to do when something goes wrong in staging or production. Plain steps, in the order to do them. For how the system is built, see `docs/SPEC.md`. For setting it up, see `docs/DEPLOYMENT.md`.

## Rules for everything below

- **Never change `deals.status` by hand.** A deal moves only through the API (`transitionDeal`). To end a deal use the admin cancel. If a deal cannot move, ask engineering.
- **Never edit or delete a direct payment, an invoice or an event.** A correction is a new record.
- **Never write a UPI ID, a token or a sign-in code into a chat, a ticket or a commit.** The UPI ID is shown only to the brand on the pay screen.
- **Money moves outside ValueSkins** except the fee. The advance and the final are paid by the brand to the creator by UPI. We never refund those. We refund the fee only, by hand, in Razorpay.
- Write down what you did on the deal (a dispute resolution note, or the admin cancel note). The history is the record.

## Looking at the system

You need: the Render dashboard, the Razorpay dashboard, Sentry, and an admin sign-in (an Instagram account listed in `ADMIN_INSTAGRAM_USER_IDS`).

**Render Shell** (service `valueskins-api-staging`, or the production service). Define the query helper once per shell:

```bash
q() { pnpm --filter @valueskins/api exec node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(process.argv[1]).then(r=>{console.log(JSON.stringify(r.rows,null,1));return p.end()})" "$1"; }
```

Use `q` for `select` statements only. It prints rows, never UPI IDs if you do not select `payout_vpa` or `paid_to_vpa`: do not select them.

| I want to see                 | Look at                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One deal, everything          | Admin screens: `/admin/deals`, search by the 8-character short id. Or `GET /api/admin/deals/:id`.                                                       |
| What happened, in order       | The deal's activity (`deal_events`): status changes, payment recorded, payment not received, fee on a changed deal.                                     |
| Every email sent about a deal | The deal's communication list, or `q "select template, to_email, status, error, created_at from email_log where deal_id = '<id>' order by created_at"`. |
| What Razorpay told us         | `q "select id, event_type, received_at, processed_at, error from webhook_events order by received_at desc limit 20"`                                    |
| A request that failed         | Render Logs (search the request id from the `X-Request-Id` response header), and Sentry for errors.                                                     |
| A job that ran                | Render Logs, search `job finished`, `job skipped` or `job failed`.                                                                                      |

Logs and Sentry never contain emails, UPI IDs, cookies, tokens or request bodies (they are removed before they are written or sent). If you need the person, find them by user id in the database.

## 1. A UPI payment was not received

**What it is.** The brand paid the creator's UPI ID outside ValueSkins and recorded the reference. The creator pressed "I did not receive it". The record is kept and marked disputed, the deal stays where it was, both people got an email, and the admin got alert A1. The brand can pay and record again. Nothing was lost on our side: the money went from the brand to the creator, or it did not.

**Who does what.** The brand and creator sort it out between themselves (they have each other's contact email on the resume card). We do not hold the money and cannot move it.

1. Open the deal in the admin screens. Read the activity: a `Payment marked not received` entry has the creator's reason.
2. Check the stage: advance (deal is `COMMISSION_PAID`) or final (deal is `APPROVED`). The deal does not move until the creator confirms a payment arrived.
3. Wait one working day. Most cases are a wrong UPI reference or a slow bank. The brand records the payment again (a new record), the creator confirms, the deal moves.
4. If the brand says it paid and the creator says it did not, ask the brand for a screenshot of the debit from its UPI app (do not ask for the creator's UPI ID back; the brand already saw it). Ask the creator to check the right UPI app and the bank statement.
5. If they cannot agree after two working days, either of them raises a dispute from the deal page. See section 4.
6. If the brand says the creator vanished, use section 3 (stuck deal) and, if the fee is paid, the admin cancel.

**Reminders that fire by themselves.** Payment due reminder (to the brand, daily 10:00 IST) and confirm payment reminder (to the creator, every 6 hours). To send one now: section "Running a job by hand".

**Do not:** edit the record, delete it, mark it confirmed from the database, or move the deal.

## 2. A fee was captured on a deal that changed (and its refund)

**What it is.** The brand paid the ValueSkins fee in Razorpay Checkout, but the deal had already changed (usually the brand cancelled while Checkout was open). Razorpay has the money. We kept the payment, issued no invoice, did not move the deal, added a deal event, emailed the brand ("We will refund it") and sent the admin the alert "Fee received on a deal that had changed, refund by hand". It can also happen when the same deal is paid twice.

**You must refund it by hand.** Nothing refunds automatically.

1. Find the alert in the support inbox (`DISPUTE_EMAIL`, usually `founder@valueskins.com`). It has the deal short id. Or look for the event: `q "select deal_id, created_at from deal_events where metadata->>'kind' = 'FEE_CAPTURED_DEAL_CHANGED' order by created_at desc limit 10"`.
2. Open the deal in the admin screens. Confirm the deal is cancelled (or otherwise not `CONFIRMED`), the payment is `CAPTURED`, and there is **no** invoice for it. Note the amount (normally ₹885.00) and the Razorpay payment id: `q "select razorpay_payment_id, amount_paise, status from payments where deal_id = '<id>'"`.
3. In the Razorpay dashboard: **Transactions > Payments**, find the payment id, open it, issue a **full refund** (a normal refund takes 5 to 7 working days; an instant refund is quicker and may cost a fee). Razorpay shows a refund id starting `rfnd_`. Refunds are not possible for a payment older than 6 months.
4. Record it. Ask the brand to raise a dispute on the deal ("Fee taken after the deal was cancelled"), or raise it on their behalf if they write to us. Then resolve it in the admin screens with the note "Refunded the fee in the Razorpay dashboard." and the `rfnd_` id as the refund reference. Both people get the resolution email with the reference.
5. Tell the brand the expected time for the money to reach them.
6. If the deal is still live and the brand wants to go ahead instead, do not refund: ask engineering. A captured payment on a live deal is the normal path and issues an invoice.

If the fee was captured twice on the same deal, the second payment is marked `FAILED` ("Duplicate capture ... Refund it.") and the same alert fires. Refund the second payment.

**An invoice is never issued for a refunded fee.** If a tax invoice was issued and the fee must still be refunded (a rare dispute outcome), ask the CA how to credit it; the numbers are gapless and an issued invoice is never deleted.

## 3. A deal is stuck

First find out **whose turn it is**. A deal waits for exactly one person (the same table drives "Your turn" in the app).

| Deal status          | Waiting for                                                             | What moves it                                          | Reminder that fires                            |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `DRAFT`              | the brand to publish                                                    | brand publishes or deletes the draft                   | none                                           |
| `OPEN`               | the brand to choose a creator (if any applied)                          | brand confirms one applicant, or cancels               | none                                           |
| `CONFIRMED`          | the brand to pay the ValueSkins fee                                     | fee captured (webhook or verify), or the brand cancels | fee reminder, daily 10:00                      |
| `COMMISSION_PAID`    | the brand to pay and record the advance, then the creator to confirm it | creator confirms the advance arrived                   | payment due (brand), confirm payment (creator) |
| `ADVANCE_PAID`       | the creator to upload content                                           | creator uploads a Drive link                           | content overdue, after the deadline            |
| `CONTENT_UPLOADED`   | the brand to review                                                     | brand approves or asks for changes                     | review reminder after 3 days                   |
| `REVISION_REQUESTED` | the creator to upload again                                             | creator uploads                                        | content overdue, after the deadline            |
| `APPROVED`           | the brand to pay and record the final, then the creator to confirm      | creator confirms the final arrived                     | payment due, confirm payment                   |
| `COMPLETED`          | nobody                                                                  |                                                        |                                                |
| `CANCELLED`          | nobody                                                                  |                                                        |                                                |

Find deals that have been in a status a long time:

```bash
q "select short_id, status, updated_at from deals where status not in ('COMPLETED','CANCELLED','DRAFT') and updated_at < now() - interval '7 days' order by updated_at limit 50"
```

Steps:

1. Open the deal in the admin screens and read the activity and the emails sent. Check the reminder actually went out (`email_log`, status `SENT`). A reminder that failed shows `FAILED` and an error.
2. If a reminder did not go out, run the job by hand (below) and read its log line.
3. If a person is not answering, the app is not broken. Write to them from the support address. There is no automatic cancel in v1.
4. If a webhook never arrived and the brand paid the fee (deal still `CONFIRMED` but Razorpay shows `captured`), ask the brand to reload the deal page: the page calls verify, which completes the capture. Or re-send the event from the Razorpay dashboard (**Accounts & Settings > Webhooks**, the endpoint, its failed delivery, and its resend option if the dashboard shows one). Both paths are safe to repeat.
5. If it must end: from `COMMISSION_PAID` to `APPROVED`, only an admin can cancel (admin cancel with a note, and a refund reference if a refund was arranged by hand). In `OPEN` and `CONFIRMED` the brand can cancel. An admin cannot cancel `CONFIRMED`, `OPEN`, `DRAFT`, `COMPLETED` or `CANCELLED` (the API says so in plain words).
6. A deal that is in a state the table above does not explain (for example `CONTENT_UPLOADED` with no uploaded link) is a bug: do not fix it in the database. Save the deal id and the activity, and tell engineering.

## 4. A dispute

A deal's brand or confirmed creator raises it from the deal page (from `CONFIRMED` on, and on a cancelled deal that had a creator). Only one dispute can be open on a deal. The support inbox gets email 15 with both people in CC. The deal does not change.

1. Open the dispute: admin screens, **Disputes**, or `GET /api/admin/disputes/:id`. Read the subject, the text, who raised it (brand or creator) and the deal activity and emails.
2. Ask each side for what you need, from the support address. Give them a date.
3. Decide. The usual outcomes:
   - **Settled between them.** Resolve with a note saying so.
   - **Fee refund.** Refund by hand in Razorpay (section 2), then resolve with the `rfnd_` id as the refund reference.
   - **End the deal.** Admin cancel (section 3, step 5) first, then resolve the dispute.
4. Resolve it: a resolution note is required, the refund reference is optional. Both people get email 15b. A second resolve of the same dispute is refused.
5. Resolving does **not** move or cancel the deal. Cancelling is a separate action.
6. Never promise money we do not hold. The advance and final went directly between the people; we can only help them agree.

## 5. Instagram sign-in or token problems

**Signing in fails.** Look at the redirect: the app shows `/login?error=...`.

- `account_type_unsupported`: the account is Personal. They must switch to Business or Creator in Instagram and try again.
- `account_type_change_blocked`: the account type changed (Business to Creator or back) but the user already has deals or applications in the old role. The role is not changed automatically once there is activity. Ask engineering to review; do not edit `users.role`.
- Anything else, or "Instagram did not respond": check the Meta app in the Meta dashboard (Live mode, `instagram_business_basic` approved, redirect URI exactly `INSTAGRAM_REDIRECT_URI`) and Meta's status page. If Meta is down, sign-in is down; nothing in our system helps.

**A user's Instagram data is stale or their token died.** A long-lived token lasts 60 days and is refreshed daily by the `instagram-refresh` job when fewer than 10 days remain, for users active in the last 30 days. A user who is away for more than 60 days loses the token. When Meta reports the token invalid (error code 190) the job clears the stored token so it is not retried every day. A user whose token was cleared can still use ValueSkins; their Instagram numbers just stop refreshing until they sign in again. Fix: ask them to sign out and sign in with Instagram.

**The refresh job is failing for everyone.**

1. Render Logs, search `instagram-refresh`. The line has `status` and counts.
2. If it says it stopped on a rate limit (Meta codes 4, 17, 32, 613 or HTTP 429): it stops by design and picks up tomorrow, least recently synced first. Do nothing unless it repeats for days.
3. If every call fails: the Meta app secret or the app status changed. Check the Meta dashboard first. `INSTAGRAM_APP_SECRET` and `META_APP_SECRET` must match the app.
4. Run it by hand once the cause is fixed (below).

**A user removes the app from Instagram.** Meta calls `POST /api/meta/deauthorize` (signed). We clear their stored token and keep their account and deals. A data deletion request (`/api/meta/data-deletion`) starts account deletion: the account is soft deleted and anonymized, deals and invoices are kept as legal records and show "Deleted user". The user can check status at the confirmation link Meta shows them. If a callback is failing, the signature check is failing: `META_APP_SECRET` is wrong.

## 6. Render or Vercel is down

**First check** what is actually down.

- API: `https://api.valueskins.com/api/health` (staging: `api-staging...`) must answer `{"ok":true}`. Also check Render's status page.
- Web: open the site. Check Vercel's status page.
- Sign-in with Instagram needs Meta; payments need Razorpay; email needs Resend. A status page for each tells you if the cause is outside our system.

**The API is down or deploying badly.**

1. Render > service > **Events**. Find the last deploy that worked and use **Rollback**. Database migrations are not undone by a rollback (migrations are written so the previous code keeps working).
2. If the deploy failed at startup, open **Logs**. A line `Invalid environment configuration` names the missing variable. A line `Startup guard failed` is a safety rule stopping the API on purpose.
3. The API process also runs the schedules and the sockets. While it is down: reminders do not fire (they resume at their next time; run them by hand afterwards), sockets reconnect by themselves, and people see errors.
4. **Razorpay webhooks are not retried by us.** Razorpay retries failed deliveries for a while. After an outage, open the Razorpay dashboard (**Accounts & Settings > Webhooks**) and re-deliver any `payment.captured` or `order.paid` events that failed. Re-delivery is safe: events are de-duplicated and the capture is idempotent. Brands who paid during the outage and then reloaded their deal page were also completed by verify.
5. After recovery, check for fees that were paid during the outage: `q "select d.short_id, p.razorpay_order_id, p.status from payments p join deals d on d.id = p.deal_id where p.status = 'CREATED' and p.created_at > now() - interval '2 days'"`. For each, look the order up in Razorpay. If it is captured, re-deliver the webhook.

**The web app is down or deploying badly.** Vercel > the project > **Deployments**: **Instant Rollback** (or promote an earlier deployment). A build that fails with a message about `NEXT_PUBLIC_ENABLE_DEV_LOGIN` is the safety rule that stops a production build with the dev login on.

**Switches** (Render environment, then redeploy): `AUTH_EMAIL_ENABLED=false` turns off email sign-in (staging only anyway), `ENABLE_DEV_LOGIN=false` turns off the dev login. Neither can be on in production (startup guards).

**Email is down.** Sends are logged first and a failed send never fails a request. Failed emails stay `FAILED` in `email_log` with an error. When the provider is back, an admin can resend one from the deal's email list (**Resend**), which rebuilds the attachments.

## 7. Restoring the database

Use this when data was lost or corrupted (a bad migration, a bad script, an accidental delete). It needs a **paid** Render Postgres plan; the free staging database has no backups and cannot be restored (recreate and reseed it, `docs/DEPLOYMENT.md` section 17).

Render keeps point-in-time recovery for the last 3 days (Hobby plans) or 7 days (Pro and above). A restore creates a **new** database; the old one is left alone.

1. **Stop the harm.** If a bad deploy is writing, roll the API back first (section 6). Note the time the problem began (IST) and convert to the time zone Render shows.
2. Render dashboard > the Postgres instance > **Recovery** > **Restore database**. Pick a time **just before** the problem. Give the new instance a name (for example `valueskins-restore-YYYYMMDD`). Choose the same plan.
3. **Check the restored data in isolation** before switching anything. Connect with the new instance's external connection string and run these checks:
   - Row counts look right: `select count(*) from deals; select count(*) from users; select count(*) from invoices;`
   - Invoice numbers are gapless per financial year and kind: `select kind, financial_year, count(*), max(sequence) from invoices group by 1,2;` (count must equal max).
   - No deal is in a state that its events do not explain: `select count(*) from deals d where d.status <> 'DRAFT' and not exists (select 1 from deal_events e where e.deal_id = d.id);` should be 0.
4. **Switch.** Change `DATABASE_URL` on the API service to the new instance's internal connection string and deploy. Then check `/api/health`, sign in, open a recent deal.
5. **Replay what the restore lost.** Everything after the restore point is gone, including sessions (people sign in again; sessions are in the database) and anything that happened at Razorpay.
   - Razorpay: in the dashboard, re-deliver every webhook event since the restore time. Events are de-duplicated and idempotent. Compare captured payments in Razorpay with `payments` for the same period and re-deliver any that are missing.
   - Direct UPI payments recorded after the restore point are lost. Brands and creators will notice: ask them to record again. Their money is unaffected.
   - Invoices issued after the restore point and sent by email still exist in people's inboxes. The numbers they carry may be reissued to different documents. Tell the CA the restore time and the number range affected before issuing more.
6. Email the people affected, from the support address, in plain words: what was lost, from when, and what they need to do.
7. Keep the old instance for a few days, then delete it. Do not point anything at it again.
8. Write up what happened, and add the cause to this runbook if it will happen again.

**Practice it.** Run steps 2 to 3 once on production-like data before launch (SPEC 22 asks for "restore tested once"). Write down how long it took.

## Running a job by hand

Jobs: `instagram-refresh`, `cleanup`, `fee-reminder`, `payment-due-reminder`, `confirm-payment-reminder`, `review-reminder`, `content-overdue`. In the Render Shell:

```bash
pnpm --filter @valueskins/api run job:deploy -- --list
pnpm --filter @valueskins/api run job:deploy -- fee-reminder
```

It prints one JSON line with `status` (`ok`, `skipped` if the job is already running, or `failed`) and counts. Reminders send at most one email per deal per day, so running one again is safe.

## Errors in Sentry

Sentry gets **errors only** (no performance data, no sessions, no replays). Before an event leaves the process, the user and IP, request headers, cookies, bodies and query strings, breadcrumbs, stack variables, email addresses, UPI IDs, bank-account-shaped numbers, PAN and IFSC shapes and tokens are removed. So an event shows the error, the stack and a request path, not who caused it. To find the person, use the time and the request path with the Render Logs.

- It is **off** until `SENTRY_DSN` (API, on Render) or `NEXT_PUBLIC_SENTRY_DSN` (web, on Vercel) is set. To turn it off, blank the variable and redeploy.
- The web policy (CSP) allows only the host in the web DSN. If you change the Sentry region or project, update the DSN; the policy follows it.
- One error shows as one issue. If an issue repeats, find the cause; do not mute it for a quiet week.
- A 4xx a person caused is never sent. A 5xx, an uncaught exception, a failed job, a failed webhook processing, a failed after-commit step (email, document) and a failed realtime event are.

## Accepted dependency advisories

`pnpm audit --prod --audit-level critical` must pass (CI blocks on it). These remain, none reachable from outside the running app, reviewed at the time of writing:

- **Test and build tooling only** (`vitest`, `tinypool`, `vite`, `source-map-js`, `esbuild` via `drizzle-kit`, `braces` via Tailwind 3): they run on developer machines and in CI, not in production. Fix by moving to a patched Vitest and Tailwind 4 in a planned upgrade.
- **`vite` inside `@sentry/nextjs`** (an optional dependency of its Cloudflare package that we never run): dev-server issues only.

When `pnpm audit --prod` lists a new advisory in something that ships, treat it as a bug: upgrade the package the same day for critical and high.
