# Staging deployment

Every manual step to put staging on the internet, in order. Nothing here is done by code: `render.yaml` and `apps/web/vercel.json` describe the setup, and you click through the dashboards below.

Dashboard menu names change often. Where a name below could not be checked against the current dashboard, it says "look for". The values and URLs are exact.

## 1. What you are building

| Piece           | URL                                  | Where it runs                                                            | Deploys from                      |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------ | --------------------------------- |
| Web (Next.js)   | `https://staging.valueskins.com`     | Vercel, project `valueskins-staging-web`                                 | `main`, root directory `apps/web` |
| API (Express)   | `https://api-staging.valueskins.com` | Render web service `valueskins-api-staging` (paid, always-on, Singapore) | `main`, after CI passes           |
| Database        | internal only                        | Render Postgres `valueskins-staging-db` (free plan, Singapore)           | created by the Blueprint          |
| Email           | from `notifications@valueskins.com`  | Resend                                                                   | -                                 |
| Payments        | test mode only                       | Razorpay                                                                 | -                                 |
| Instagram login | tester accounts only                 | Meta app in Development mode                                             | -                                 |

Cookies: the web app and the API are both under `valueskins.com`, so the session cookie (`vs_session_staging`, domain `.valueskins.com`, Secure, SameSite=Lax) is sent between them.

## 2. Before you start

Accounts and access you need:

- GitHub: admin on `valueskins/getvalueskins` (to install the Render and Vercel apps).
- Render account with a payment method (the API service is paid).
- Vercel account. Vercel's free Hobby plan is for personal, non-commercial use; check Vercel's terms and use a paid plan for a company project.
- Meta developer account (developers.facebook.com).
- Razorpay account, test mode, with Route enabled (SPEC 7.1).
- Resend account.
- Access to the DNS records of `valueskins.com`.
- An Instagram **Professional** (Business or Creator) account to use as a tester. A personal account cannot sign in.

Values you will collect (write them down in a private place, never in the repo):

| Value                                    | You get it in |
| ---------------------------------------- | ------------- |
| Instagram app id, Instagram app secret   | section 5     |
| Meta app secret                          | section 5     |
| Razorpay test key id and key secret      | section 6     |
| Razorpay webhook secret (you make it up) | section 6     |
| Resend API key                           | section 7     |
| Company address and state                | you know them |

Start section 7 (Resend) early: DNS verification can take from minutes to hours.

## 3. Merge to main

`render.yaml` and `apps/web/vercel.json` must be on `main` before you create anything, because both platforms read `main`. Merge the pull request that added them, then continue.

## 4. Check the local build (optional, 2 minutes)

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All four must pass; CI runs the same commands.

## 5. Meta app (Instagram login)

1. Go to developers.facebook.com, **My Apps**, **Create App**. Choose the business-type app. Name it `ValueSkins`.
2. Add the **Instagram** product, then open **Instagram > API setup with Instagram login**. Look for the section called **Set up Instagram business login**, then **Business login settings**.
3. Copy these two values (the Instagram app id is **not** the Meta app id):
   - **Instagram app ID** is `INSTAGRAM_APP_ID`.
   - **Instagram app secret** (click Show) is `INSTAGRAM_APP_SECRET`.
4. In **Business login settings**, fill in:
   - **OAuth redirect URIs:** `https://api-staging.valueskins.com/api/auth/instagram/callback` (exact match: https, no trailing slash).
   - **Deauthorize callback URL:** `https://api-staging.valueskins.com/api/meta/deauthorize`
   - **Data deletion request URL:** `https://api-staging.valueskins.com/api/meta/data-deletion`

   Click Save. If you start with Facebook's own screens and cannot find these fields, search the dashboard for "Deauthorize callback URL".

5. Open **App settings > Basic**:
   - Copy **App secret** (click Show) as `META_APP_SECRET`.
   - Set **Privacy policy URL** to `https://staging.valueskins.com/privacy` (do this after section 10 makes the page live; Meta may check that the URL loads).
   - Fill the **App icon** (1024x1024), **Category**, and a **Business email** when you prepare the review (section 15).
6. Add your tester: **App roles > Roles**, add your Instagram account under **Instagram Testers** (look for "Add Instagram testers"). Then open the Instagram app on the tester account: **Settings > Apps and websites > Tester invites**, and accept.
7. Leave the app in **Development** mode. Only people with a role on the app (including Instagram testers) can sign in until Meta approves the app review.

Which secret signs Meta's callbacks is not stated in Meta's docs. The API accepts a `signed_request` signed with either `META_APP_SECRET` or `INSTAGRAM_APP_SECRET`, so both must be set.

## 6. Razorpay (test mode)

1. In the Razorpay dashboard, switch to **Test Mode**.
2. Open **Accounts & Settings** and look for **API keys** (under Website and app settings). Generate a **test** key. Copy:
   - Key id (starts with `rzp_test_`) is `RAZORPAY_KEY_ID` (and `NEXT_PUBLIC_RAZORPAY_KEY_ID` on Vercel).
   - Key secret (shown once) is `RAZORPAY_KEY_SECRET`.
3. Make up a webhook secret: run `openssl rand -hex 32` and keep the result. It is `RAZORPAY_WEBHOOK_SECRET`.
4. The webhook: the API now has `POST /api/webhooks/razorpay`, so register it once the API is deployed (section 8):
   - **Accounts & Settings > Webhooks > + Add New Webhook** (make sure Test Mode is on).
   - **Webhook URL:** `https://api-staging.valueskins.com/api/webhooks/razorpay`
   - **Secret:** the value from step 3. Same value as the Render variable.
   - **Alert email:** `valueskinsfounder@gmail.com`
   - **Active events** to tick: `product.route.under_review`, `product.route.needs_clarification`, `product.route.activated` (linked-account status; Razorpay documents no `account.*` events for Route, and none for a suspended account: use **Refresh status** for that), and for payments `payment.captured`, `payment.failed`, `order.paid`, `transfer.processed`, `transfer.failed`. Tick `transfer.reversed` too if the dashboard offers it. Any other event is stored and ignored.
   - In test mode Razorpay may ask for an OTP; its docs give `754081` for test mode.
   - Razorpay's Route payload page lists only `transfer.processed`, `transfer.failed` and `settlement.processed` for transfers. A reversal event (`transfer.reversed`) appears in other Razorpay material but not on that page: the API handles it if it is ever sent, and you confirm in the dashboard's event list whether it exists.
5. Route must be enabled on the account in test mode (SPEC 7.1). If it is not, ask Razorpay support to enable it.
6. Payment capture must be **automatic** (**Accounts & Settings**, the payment capture setting). The API creates Orders without a capture flag; with manual capture, payments stop at `authorized` and the API answers "not captured" instead of moving the deal.

The API refuses to start if `RAZORPAY_KEY_ID` does not start with `rzp_test_` on staging. Never put a live key on staging.

## 7. Resend (email)

1. In Resend, **Domains > Add Domain**: `valueskins.com`. Pick the region closest to India if it asks.
2. Resend shows DNS records. You will add them in section 10 (copy them exactly as shown; do not retype). They are normally a DKIM TXT record at `resend._domainkey`, an SPF TXT record, and an MX record on a `send` subdomain.
3. Click **Verify** once the DNS records exist (section 10).
4. **API Keys > Create API Key**, permission "Sending access", domain `valueskins.com`. Copy it as `RESEND_API_KEY` (shown once).

Until the domain is verified, sends fail and are recorded as FAILED in the `email_log` table; nothing crashes.

## 8. Render (API and database)

1. In Render, **New > Blueprint**.
2. Connect GitHub and pick `valueskins/getvalueskins`. Branch `main`. Render reads `render.yaml`.
3. Render lists the web service `valueskins-api-staging` and the database `valueskins-staging-db`, and asks for the variables marked "sync: false". Enter them:

   | Variable                   | Value                                                                               |
   | -------------------------- | ----------------------------------------------------------------------------------- |
   | `INSTAGRAM_APP_ID`         | from section 5                                                                      |
   | `INSTAGRAM_APP_SECRET`     | from section 5                                                                      |
   | `META_APP_SECRET`          | from section 5                                                                      |
   | `RAZORPAY_KEY_ID`          | from section 6 (`rzp_test_...`)                                                     |
   | `RAZORPAY_KEY_SECRET`      | from section 6                                                                      |
   | `RAZORPAY_WEBHOOK_SECRET`  | from section 6 step 3                                                               |
   | `RESEND_API_KEY`           | from section 7                                                                      |
   | `ADMIN_INSTAGRAM_USER_IDS` | `none` for now (you set the real id in section 14)                                  |
   | `COMPANY_ADDRESS`          | the company address                                                                 |
   | `COMPANY_STATE`            | the company state, for example `Karnataka`                                          |
   | `COMMISSION_SAC_CODE`      | the SAC code your CA confirms (SPEC 21); `000000` is fine on staging while GST is 0 |

4. Click **Deploy Blueprint** (or **Apply**). If Render rejects `plan: free` on the database, open Render's Blueprint spec page, find the current identifier for the free Postgres plan, and change that one line in `render.yaml`. Do not switch to a paid tier by accident. If it rejects the web plan `0.5c-512mb`, use the identifier Render's compute plans page lists for the 512 MB, 0.5 CPU plan (formerly "Starter").
5. Wait for the first deploy. The build installs, builds `packages/shared` and the API; the pre-deploy command then runs the database migrations; the service starts only when `/api/health` answers.
6. Open the service page and copy its default address, for example `https://valueskins-api-staging.onrender.com`. Check `<that address>/api/health`: it must show `{"ok":true}`.

If the deploy fails, open the **Logs** tab. A line starting `Invalid environment configuration` names the missing or wrong variable. A line starting `Startup guard failed` means a safety rule stopped the API on purpose (for example a live Razorpay key on staging, or `EMAIL_TRANSPORT=console` in production).

## 9. Vercel (web)

1. In Vercel, **Add New > Project**, import `valueskins/getvalueskins`.
2. **Root Directory:** click Edit and choose `apps/web`. Leave "Include source files outside of the Root Directory" enabled (the app imports `packages/shared`).
3. **Framework Preset:** Next.js. Leave the build and install commands alone: `apps/web/vercel.json` sets them.
4. Name the project `valueskins-staging-web`.
5. **Environment Variables** (add each for the Production environment):

   | Variable                         | Value                                |
   | -------------------------------- | ------------------------------------ |
   | `NEXT_PUBLIC_API_URL`            | `https://api-staging.valueskins.com` |
   | `NEXT_PUBLIC_RAZORPAY_KEY_ID`    | the `rzp_test_...` key id            |
   | `NEXT_PUBLIC_ENABLE_DEV_LOGIN`   | `true`                               |
   | `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` | `true`                               |

6. Click **Deploy**. Then in **Settings > General**, set **Node.js Version** to `22.x`. In **Settings > Git**, check that **Production Branch** is `main`.
7. **Settings > Domains > Add Domain:** `staging.valueskins.com`. Vercel shows a CNAME value for this project. Copy it for section 10.

Variables starting `NEXT_PUBLIC_` are baked in at build time. After changing one, redeploy (**Deployments > ... > Redeploy**).

Pull request preview deployments are only build checks: their web address will not match `WEB_ORIGIN`, so sign-in does not work on them.

## 10. DNS records

Add these where the DNS for `valueskins.com` is managed. Lower the TTL (for example 300 seconds) first if your provider lets you.

| Name               | Type                    | Value                                                        | Where the value comes from        |
| ------------------ | ----------------------- | ------------------------------------------------------------ | --------------------------------- |
| `api-staging`      | CNAME                   | the Render address from section 8 step 6, without `https://` | Render service page               |
| `staging`          | CNAME                   | the value Vercel showed in section 9 step 7                  | Vercel project, Domains           |
| the Resend records | as shown (TXT, TXT, MX) | as shown                                                     | Resend, Domains, `valueskins.com` |

Rules:

- Remove any `AAAA` record on `api-staging` (Render uses IPv4).
- Do not turn on a proxy (for example Cloudflare orange cloud) for these two names unless you know the proxy chain; the API's client-IP handling assumes Render's own proxy (section 19).
- Add the Resend records exactly as Resend displays them, including the host names.

Then:

1. **Render:** service > **Settings > Custom Domains**. The Blueprint already lists `api-staging.valueskins.com`. Click **Verify**. Render then issues the HTTPS certificate on its own.
2. **Vercel:** **Settings > Domains** shows `staging.valueskins.com` turn valid. HTTPS is automatic.
3. **Resend:** **Domains > valueskins.com > Verify**.

Check from your computer:

```bash
dig +short CNAME api-staging.valueskins.com
dig +short CNAME staging.valueskins.com
curl -s https://api-staging.valueskins.com/api/health
curl -sI https://staging.valueskins.com/privacy | head -1
```

The third prints `{"ok":true}` and the fourth `HTTP/2 200`.

## 11. Finish the Meta settings that need live URLs

Now that `https://staging.valueskins.com/privacy` loads, set it as the **Privacy policy URL** in **App settings > Basic** (section 5 step 5).

Optional check that the callbacks are reachable and that signatures verify (uses an app secret from your own shell, never committed):

```bash
SECRET='paste the Instagram app secret or the Meta app secret' node -e '
const c = require("crypto");
const p = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", issued_at: Math.floor(Date.now() / 1000), user_id: "deploy-check" })).toString("base64url");
console.log(c.createHmac("sha256", process.env.SECRET).update(p).digest("base64url") + "." + p);
' > /tmp/signed_request.txt

curl -s -X POST https://api-staging.valueskins.com/api/meta/deauthorize \
  --data-urlencode "signed_request=$(cat /tmp/signed_request.txt)"
rm /tmp/signed_request.txt
```

Expected: `{"ok":true}`. A bad signature gives `403 INVALID_SIGNED_REQUEST`.

## 12. Razorpay webhook

Register it in section 6 step 4. To check it end to end, create a creator's linked account (section 13 step 9) and watch its status move from the webhook, or press **Refresh status**.

Razorpay's dashboard shows each delivery and its response code. A healthy delivery answers `200`. A `400` means the signature did not match: the `RAZORPAY_WEBHOOK_SECRET` on Render and the secret in the webhook form differ. A processing problem does not change the `200`: it is recorded on the event row and emailed to `DISPUTE_EMAIL` as an "Admin alert".

## 13. Verification run-through

Do these in order on a clean browser profile. This is the "done" check for staging.

1. `https://api-staging.valueskins.com/api/health` shows `{"ok":true}` over HTTPS.
2. `https://staging.valueskins.com/` loads over HTTPS and shows "Continue with Instagram" and "Sign in with email".
3. `https://staging.valueskins.com/privacy` and `/terms` load without signing in (the draft banner is visible).
4. `https://staging.valueskins.com/dev/login`: enter a username, click **Dev login**. You land on `/me`. Click **Log out**.
5. **Email sign-in:** **Sign in with email**, enter your email, **Send code**. The email arrives from `notifications@valueskins.com` (check spam). Enter the code. You land on `/me` showing "No Instagram account is linked". Click **Log out**.
6. **Instagram sign-in:** **Continue with Instagram** with the tester account. Approve the permission. You land on `/me` showing username, name, picture, followers, posts and engagement rate.
7. A personal (non-professional) Instagram account shows the "needs an Instagram Professional account" message on `/auth/error`.
8. In Render, **Logs** shows requests and no errors.
9. **Creator payout account (the Route linked account, test mode).** Sign in as a creator with a verified email (the email sign-in or an Instagram sign-in plus `/onboarding`). Open `https://staging.valueskins.com/onboarding`:
   1. **Choose your account type:** Creator. Save. (This cannot be undone: use a fresh test account, or a different one for each role.)
   2. **Instagram sign-in only:** enter an email, **Send verification link**, open the emailed link in the same browser, then click **Continue**. (Email sign-in accounts skip this: their email is already verified. They are asked for their Instagram username first.)
   3. The page now shows **Payout setup**. Fill in the form with test details: any legal name of 4 or more characters, a PAN shaped like `ABCPE1234F` (the 4th letter must be `P`), your 10 digit mobile number (sent to Razorpay, never stored), a bank account number, IFSC `HDFC0001234` or another valid test IFSC, the account holder name. Tick the consent box and click **Submit payout details**.
   4. Expected: a **Status** appears (usually `PENDING`, Razorpay verifies the bank account for about 10 to 15 minutes). If it shows an error, the message names the problem (see "Razorpay rejects the setup" in section 20).
   5. When the status changes, either wait for the webhook (the status and an "Your payout account is active" or "needs attention" email arrive by themselves) or click **Refresh status**. `ACTIVE` is the goal.
   6. In Razorpay's dashboard (test mode) the linked account `acc_...` appears under **Route**; Render's database has a `creator_payout_accounts` row with the bank account's last 4 digits only.
10. **Brand billing** (optional check): sign in with a second account, choose **Brand**, add an email if needed, fill in **Billing details**. A GSTIN, if entered, must be valid.
11. **Deal flow, draft to CONFIRMED (curl).** There is no deals screen yet, so this uses the API directly. You need `curl` and `jq`, two email addresses you can read (one brand, one creator), and a Render **Shell** for the payout fallback. Each person gets a cookie file, so run everything in one terminal session:

    ```bash
    API=https://api-staging.valueskins.com/api
    ORIGIN=https://staging.valueskins.com
    # call METHOD PATH COOKIEFILE [JSON]  (Origin is required on every non-GET request)
    call() { curl -sS -X "$1" "$API$2" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -b "$3" -c "$3" ${4:+-d "$4"}; echo; }

    # 1. Sign in by email code. Read the 6-digit code from the email, then verify.
    call POST /auth/email/start brand.jar '{"email":"brand-test@example.com"}'
    call POST /auth/email/verify brand.jar '{"email":"brand-test@example.com","code":"123456"}'
    # 2. Onboard the brand: role (permanent), typed Instagram username, billing.
    call POST /me/role brand.jar '{"role":"BRAND"}'
    call POST /me/instagram-username brand.jar '{"username":"test_brand"}'
    call PUT /me/billing brand.jar '{"billingName":"Test Brand Pvt Ltd","billingAddress":"1 Main Road, Bengaluru","billingState":"Karnataka"}'
    # 3. Do the same for the creator (role CREATOR, creator.jar, a second email, no billing).

    # 4. Read the public config the web app will use.
    curl -sS $API/config

    # 5. Brand: create a draft, edit it, publish it. Deadlines must be in the future (a deadline is 23:59:59 IST on that date).
    DEAL=$(call POST /deals brand.jar '{"title":"Test deal"}' | jq -r .deal.id)
    call PATCH /deals/$DEAL brand.jar "{\"description\":\"Content type: 3 posts\",\"budgetRupees\":10000,\"applicationDeadline\":\"$(date -d '+3 days' +%F)\",\"contentUploadDeadline\":\"$(date -d '+10 days' +%F)\",\"dealDeadline\":\"$(date -d '+15 days' +%F)\"}"
    call POST /deals/$DEAL/publish brand.jar '{}'          # status OPEN, breakdown frozen, email 1 arrives

    # 6. Creator: the deal is in the feed; see whether Apply is allowed.
    call GET /deals/feed creator.jar
    call GET /deals/$DEAL creator.jar                       # allowedActions[].reason says why Apply is disabled
    ```

    The creator can only apply once their payout account is `ACTIVE` (V0_LAUNCH 2.2). Either finish step 9 above for the creator, or, for a test creator only, in the Render **Shell** insert an account row (`USER_ID` is the creator's `id` from `GET /api/me`):

    ```bash
    pnpm --filter @valueskins/api exec node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"insert into creator_payout_accounts (user_id, razorpay_account_id, status) values ('USER_ID', 'acc_manual_test_1', 'ACTIVE')\").then(()=>p.end())"
    ```

    Then continue:

    ```bash
    # 7. Creator applies; brand sees the applicant and confirms.
    call POST /deals/$DEAL/applications creator.jar '{}'    # email 2 goes to the brand
    APP=$(call GET /deals/$DEAL/applications brand.jar | jq -r '.items[0].id')
    call POST /applications/$APP/confirm brand.jar '{}'     # deal CONFIRMED, email 3 goes to the creator
    call GET /deals/$DEAL brand.jar                         # status CONFIRMED, creatorPayoutStatus ACTIVE
    call GET /users/$(call GET /me creator.jar | jq -r .user.id)/resume brand.jar
    ```

    Expected: every call answers with JSON and no `error`; the deal ends `CONFIRMED`; emails 1, 2 and 3 arrive; a second `confirm` answers `409`. To cancel instead: `call POST /deals/$DEAL/cancel brand.jar '{"reason":"changed plans"}'` while the deal is `OPEN`, `CONFIRMED` or `COMMISSION_PAID`.

12. **Payments: commission, advance and final (test mode).** Prerequisites: step 11 done so a deal is `CONFIRMED` with a creator whose payout account is `ACTIVE` (a real Razorpay test-mode linked account is better than the SQL fallback here, because the transfer needs a real `acc_...`); the webhook from section 6 step 4 registered with the payment and transfer events ticked; automatic capture on (section 6 step 6). Use a Razorpay test card or test UPI id from Razorpay's test-payment page. Nothing real is charged.

    In a Render **Shell**, define a small query helper once:

    ```bash
    q() { pnpm --filter @valueskins/api exec node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(process.argv[1]).then(r=>{console.log(JSON.stringify(r.rows,null,1));return p.end()})" "$1"; }
    DEAL=PASTE-THE-DEAL-ID
    ```

    1. **Commission.** Signed in as the brand in a browser, open `https://staging.valueskins.com/deals/<DEAL>/pay`. Click **Pay commission: ...**, pay in Checkout. Expected: the page says "Payment recorded.", the deal moves to `COMMISSION_PAID`, and the brand and creator get an email. If the page shows an error, `q "select * from webhook_events order by received_at desc limit 5"` shows what Razorpay sent and any error.
    2. **Advance, with a transfer of the full amount. This is the SPEC 4.3 check.** Reload the page and click **Pay advance: ...**. Expected: the deal moves to `ADVANCE_PAID`. Then run, and keep the output:

       ```bash
       q "select type, status, amount_paise, razorpay_order_id, razorpay_payment_id, failure_reason from payments where deal_id = '$DEAL' order by created_at"
       q "select type, status, amount_paise, razorpay_transfer_id, failure_reason, processed_at from transfers where deal_id = '$DEAL'"
       q "select id, event_type, processed_at, error, payload #>> '{payload,payment,entity,fee}' as payment_fee, payload #>> '{payload,payment,entity,tax}' as payment_tax, payload #>> '{payload,transfer,entity,fees}' as transfer_fees, payload #>> '{payload,transfer,entity,tax}' as transfer_tax, payload #>> '{payload,transfer,entity,status}' as transfer_status, payload #>> '{payload,transfer,entity,error}' as transfer_error from webhook_events order by received_at desc limit 10"
       ```

       What to look for: the transfer row is `PROCESSED` with the full advance amount (the full transfer worked, the fees came out of the platform balance), or it is `FAILED` or never leaves `PENDING` (for example `BAD_REQUEST_TRANSFER_INSUFFICIENT_BALANCE`). Also open the Razorpay dashboard in test mode, **Route > Linked accounts > the creator's account > Transfers**, and check the transfer is listed. **If the transfer is rejected or fails, stop here and report it: SPEC 4.3 needs a decision (direct transfer from the platform balance, or adding the fee to what the brand pays) and nobody should choose it from the code.** The admin alert email "Transfer to creator failed" arrives at `DISPUTE_EMAIL` in that case.

    3. **Upload and approve.** The creator uploads a Drive link and the brand approves it, with the same `call` helper as step 11 (the deal must be `ADVANCE_PAID`):

       ```bash
       call POST /deals/$DEAL/content creator.jar '{"link":"https://drive.google.com/file/d/test/view"}'   # CONTENT_UPLOADED, email 6 to the brand
       call POST /deals/$DEAL/approve brand.jar '{}'                                                        # APPROVED, email 8 to the creator
       ```

       To try a revision first: `call POST /deals/$DEAL/feedback brand.jar '{"feedback":"Please reshoot the intro"}'` (email 7), then upload again.

    4. **Final.** Reload the pay page and click **Pay final: ...**. Expected: the deal moves to `COMPLETED`, both parties get the "Final payment" email followed by the "Deal report ready" email, and the second transfer shows on the creator's linked account in Razorpay's test dashboard.
    5. **The four PDFs.** Download them as the brand (or the creator) and open them:

       ```bash
       for kind in commission-invoice advance-receipt final-receipt adp; do curl -sS -b brand.jar -o "$kind.pdf" "$API/deals/$DEAL/documents/$kind"; done
       ```

       Expected: four PDFs, with the rupee sign showing and the numbers `VS/...` and `VS-R/...` on the invoice and receipts. Check that the brand received the invoice with email 4, both parties the receipts with emails 5 and 9, and both the deal report with email 10. `call GET /deals/$DEAL/emails brand.jar` and `call GET /deals/$DEAL/events brand.jar` show the deal's communication history and timeline.

    Deals paid before the invoices change shipped have no invoices or receipts (their documents answer `409`): use a fresh deal for this step. With GST 0 the commission document is titled "Invoice" with no tax lines. The tax split compares the brand's billing state with `COMPANY_STATE` as text, so a misspelled state is billed as IGST once GST is on.

    The three payments add up to the budget: `q "select type, amount_paise, status from payments where deal_id = '$DEAL'"`.

Both sign-in methods working for tester accounts and `/privacy` being public is the definition of done for this setup.

## 14. Seed staging and set the admin

Seed (loads fixed demo data; safe to run twice; refuses `NODE_ENV=production`):

1. Render > service `valueskins-api-staging` > **Shell**.
2. Run:

   ```bash
   pnpm --filter @valueskins/api run db:seed:deploy
   ```

   It prints `seed complete`.

Admin: after your first Instagram sign-in, find your Instagram user id in the same Shell:

```bash
pnpm --filter @valueskins/api exec node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('select username, instagram_user_id from users where instagram_user_id is not null order by created_at desc limit 5').then(r=>{console.table(r.rows);return p.end()})"
```

Copy your `instagram_user_id`, then Render > service > **Environment**, set `ADMIN_INSTAGRAM_USER_IDS` to it (comma-separated for several), and save. The service redeploys. Sign in again to pick up `is_admin`.

## 15. Meta app review screencast checklist

Meta needs a screencast for `instagram_business_basic` showing the end-to-end experience and how the data is used. Before you record:

- [ ] Replace the placeholder text in `apps/web/content/privacy.md` and `terms.md` with the real, lawyer-reviewed text, and deploy it. It must say what is collected, why, and how to delete data.
- [ ] App settings > Basic is complete: privacy policy URL, app icon 1024x1024, category, business email. Open the app's **App Review** area and read its requirements list; Meta may also ask for Business Verification.
- [ ] A dedicated Instagram Professional test account is added as an Instagram Tester and has accepted.
- [ ] The redirect URI, deauthorize callback and data deletion URL are saved (section 5).
- [ ] Staging is healthy (section 13). The free database is not about to expire (section 17).
- [ ] Do one full dry run first.

Recording:

- [ ] English narration or captions. 1080p. Browser address bar visible, showing `https://staging.valueskins.com`.
- [ ] Be signed out of Instagram first so the login screen shows.
- [ ] Open the home page, click **Continue with Instagram**.
- [ ] Show the Instagram permission screen and say which permission it asks for (`instagram_business_basic`) and why.
- [ ] Approve. Show `/me` with the username, name, picture, followers, posts and engagement rate, and say how each is used (shown to brands when the creator applies to a deal).
- [ ] Open `/privacy` and scroll to the deletion section.
- [ ] Click **Delete my account** to show data deletion, or say that Instagram's deauthorize and data deletion callbacks do the same.
- [ ] Do not show secrets: no app secret, tokens, `.env`, or dashboard variable values.

Submission text for reviewers: the staging URL, the step-by-step above, and the tester login for the test account (and a note about two-factor authentication if it is on).

## 16. Rollback

**API (Render).** Service > **Events** (or **Deploys**) > pick the last good deploy > **Rollback**. Database migrations are not undone by a rollback. Write migrations so the previous code still works after them (add columns before using them; remove them in a later change). If a migration itself is bad: the pre-deploy command fails, the deploy fails, and the old version keeps serving. Fix forward with a new migration. The free staging database has no backups, so there is no restore; staging data is disposable, so recreate and reseed (section 17).

**Web (Vercel).** Project > **Deployments** > open the last good Production deployment > the menu > **Instant Rollback** (or **Promote to Production**).

**Switch features off without code.**

- Email sign-in: Render `AUTH_EMAIL_ENABLED=false`; Vercel `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false` and redeploy.
- Dev login: Render `ENABLE_DEV_LOGIN=false`; Vercel `NEXT_PUBLIC_ENABLE_DEV_LOGIN=false` and redeploy.

**Undo a merge.** Revert the pull request on GitHub; Render and Vercel deploy `main` again.

## 17. The free Postgres expires after 30 days

Render's free Postgres expires 30 days after creation, with a 14-day grace period before deletion, and has no backups. Put a reminder in your calendar for day 25.

- To keep the data: Render > `valueskins-staging-db` > upgrade to a paid plan.
- To start fresh: delete the database in the dashboard, then in the Blueprint choose **Manual Sync** so it is recreated. The service gets the new connection string, the pre-deploy command runs the migrations, then reseed (section 14). Everyone signs in again.

Only one free Postgres can be active per Render workspace.

## 18. Reference: environment variables

### Render, API service `valueskins-api-staging`

| Variable                   | Staging value                                                    | Where it comes from                                                                                      |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_VERSION`             | `22`                                                             | `render.yaml` (Render setting, not read by the app)                                                      |
| `PORT`                     | injected by Render                                               | Render sets it (default 10000); not in `render.yaml`                                                     |
| `NODE_ENV`                 | `staging`                                                        | `render.yaml`                                                                                            |
| `DATABASE_URL`             | internal connection string                                       | `render.yaml`, from `valueskins-staging-db`                                                              |
| `TEST_DATABASE_URL`        | omitted (defaults to empty)                                      | Vitest only                                                                                              |
| `WEB_ORIGIN`               | `https://staging.valueskins.com`                                 | `render.yaml`                                                                                            |
| `COOKIE_DOMAIN`            | `.valueskins.com`                                                | `render.yaml`                                                                                            |
| `SESSION_COOKIE_NAME`      | `vs_session_staging`                                             | `render.yaml`                                                                                            |
| `SESSION_SECRET`           | generated                                                        | Render generates it                                                                                      |
| `TOKEN_ENCRYPTION_KEY`     | generated                                                        | Render generates it; if you change it, stored Instagram tokens cannot be decrypted (users sign in again) |
| `INSTAGRAM_APP_ID`         | prompted                                                         | Meta, Instagram business login settings (section 5)                                                      |
| `INSTAGRAM_APP_SECRET`     | prompted                                                         | Meta, Instagram business login settings (section 5)                                                      |
| `INSTAGRAM_REDIRECT_URI`   | `https://api-staging.valueskins.com/api/auth/instagram/callback` | `render.yaml`; must match Meta exactly                                                                   |
| `META_APP_SECRET`          | prompted                                                         | Meta, App settings > Basic (section 5)                                                                   |
| `RAZORPAY_KEY_ID`          | prompted, `rzp_test_...`                                         | Razorpay test mode (section 6)                                                                           |
| `RAZORPAY_KEY_SECRET`      | prompted                                                         | Razorpay test mode (section 6)                                                                           |
| `RAZORPAY_WEBHOOK_SECRET`  | prompted                                                         | you make it up (section 6); same value in the Razorpay webhook form                                      |
| `RESEND_API_KEY`           | prompted                                                         | Resend (section 7)                                                                                       |
| `EMAIL_FROM`               | `ValueSkins <notifications@valueskins.com>`                      | `render.yaml`                                                                                            |
| `EMAIL_TRANSPORT`          | `resend`                                                         | `render.yaml`; `console` is refused in production                                                        |
| `ADMIN_INSTAGRAM_USER_IDS` | prompted (`none`, then your id)                                  | section 14                                                                                               |
| `DISPUTE_EMAIL`            | `valueskinsfounder@gmail.com`                                    | `render.yaml`                                                                                            |
| `ENABLE_DEV_LOGIN`         | `true`                                                           | `render.yaml`; must be false or absent in production                                                     |
| `COMPANY_LEGAL_NAME`       | `Valueskins Private Limited`                                     | `render.yaml`                                                                                            |
| `COMPANY_ADDRESS`          | prompted                                                         | you                                                                                                      |
| `COMPANY_STATE`            | prompted                                                         | you                                                                                                      |
| `COMPANY_GSTIN`            | omitted (defaults to empty)                                      | set when GST-registered; required once `GST_RATE_BPS` is above 0                                         |
| `COMMISSION_SAC_CODE`      | prompted                                                         | your CA (SPEC 21)                                                                                        |
| `AUTH_EMAIL_ENABLED`       | `true`                                                           | `render.yaml`                                                                                            |
| `GST_RATE_BPS`             | `0`                                                              | `render.yaml` (V0_LAUNCH 2.6)                                                                            |
| `LOG_LEVEL`                | optional, default `info`                                         | set `debug` only while debugging                                                                         |

### Vercel, project `valueskins-staging-web`

| Variable                         | Staging value                        | Where it comes from                                                                  |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`            | `https://api-staging.valueskins.com` | fixed                                                                                |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`    | `rzp_test_...`                       | Razorpay test mode (section 6)                                                       |
| `NEXT_PUBLIC_ENABLE_DEV_LOGIN`   | `true`                               | fixed on staging; a build with this true and the production API URL fails on purpose |
| `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` | `true`                               | fixed on staging                                                                     |

### Local development

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`. For the web app locally use `NEXT_PUBLIC_API_URL=http://localhost:4000`, and set both flags to `true`.

## 19. Known limitations

- **Client IP behind Render.** The API trusts one proxy hop (`trust proxy` is 1). Render's docs do not state how many proxies sit in front of a service. If the real count is higher, per-IP rate limits (SPEC 13) could key on a shared address. Check this before production, for example by testing the login limit from two networks.
- **Invoices for older payments:** payments captured before invoicing shipped have no invoice, receipt or deal report. Documents are rendered on demand and never stored.
- **Failed transfers** alert the admin by email; there is no admin screen to retry one yet (SPEC 12).
- **Settlement events** (`settlement.processed`) are stored and ignored.
- **Razorpay category and address.** Linked accounts are created with `profile.category` `services`, `profile.subcategory` `ad_and_marketing` and a registered address of only `{ country: "IN" }`. Razorpay's allowed category lists could not be retrieved when this was written. If staging shows Razorpay rejecting them, change the constants in `apps/api/src/payout/razorpayProfile.ts`; if it rejects the address, add street, city, state and PIN to the payout form.
- **Webhook processing runs after the response.** If the API stops between storing an event and processing it, that event stays unprocessed (`processed_at` empty in `webhook_events`) and is not retried. Press **Refresh status** to catch up.
- **Deleting an account** does not yet remove brand billing or payout rows.
- **No live updates.** Socket.io is not built, so the deal feed does not update by itself (SPEC 10). The deals API is the only source of truth for now.
- **Resume shows deal amounts.** `GET /api/users/:id/resume` returns the budget of each completed deal, as SPEC 11 says. Whether showing amounts publicly is intended is still SPEC open decision 5.
- **Privacy policy and terms** are placeholder drafts.
- **Free database** has no backups and expires (section 17).
- **OAuth state cookie** `vs_ig_oauth_state` has the same name in every environment, and staging and production will share the cookie domain `.valueskins.com`. Complete one sign-in at a time when testing both.
- **Meta review** can require Business Verification; check the App Review requirements in the Meta dashboard.
- **Temporary web pages** live in `apps/web/app/(temporary)` and `apps/web/lib/temporary` and are deleted when the design handoff lands.

## 20. Troubleshooting

| Symptom                                                                       | Likely cause and fix                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram says "Invalid redirect_uri"                                         | The URI in Meta must equal `INSTAGRAM_REDIRECT_URI` character for character (https, no trailing slash).                                                                                                                                                       |
| After Instagram you land on `/auth/error?error=state_invalid`                 | The sign-in took more than 5 minutes, was opened in a different browser, or cookies are blocked. Start again from the home page.                                                                                                                              |
| `/auth/error?error=professional_account_required`                             | The Instagram account is a personal account. Switch it to Professional in Instagram settings.                                                                                                                                                                 |
| Sign-in works but `/me` says you are signed out                               | `COOKIE_DOMAIN` must be `.valueskins.com`, and both hosts must be under `valueskins.com`. Check the cookie in the browser developer tools.                                                                                                                    |
| API returns `403 ORIGIN_MISMATCH`                                             | `WEB_ORIGIN` must equal the web address exactly, with no trailing slash.                                                                                                                                                                                      |
| "Sign in with email" button missing                                           | `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` is not `true` on Vercel, or you did not redeploy after setting it.                                                                                                                                                           |
| Email routes return 404                                                       | `AUTH_EMAIL_ENABLED` is not `true` on Render.                                                                                                                                                                                                                 |
| Emails do not arrive                                                          | The Resend domain is not verified, or the key is wrong. Look for FAILED rows in `email_log` (Shell, then `psql`-style query as in section 14).                                                                                                                |
| Render deploy fails with `Invalid environment`                                | A required variable is missing or wrong; the log names it.                                                                                                                                                                                                    |
| Render build fails on `--frozen-lockfile`                                     | `pnpm-lock.yaml` is out of date. Run `pnpm install` locally and commit the lockfile.                                                                                                                                                                          |
| Vercel build fails mentioning `NEXT_PUBLIC_ENABLE_DEV_LOGIN`                  | The guard stopped a build that has dev login on and the production API URL. Set the flag to false for that project.                                                                                                                                           |
| Everyone gets `429`                                                           | See the client IP limitation in section 19.                                                                                                                                                                                                                   |
| Razorpay rejects the setup (`422`, "Razorpay could not accept these details") | The message names the field when Razorpay says which one. Typical causes: the email is already used by another Razorpay linked account, the PAN is not an individual's, the category or address constants (section 19), or Route is not enabled in test mode. |
| The payout status never changes                                               | Check the webhook delivery in Razorpay's dashboard (section 12), and press **Refresh status**. Bank verification takes about 10 to 15 minutes.                                                                                                                |
| Webhook deliveries show `400`                                                 | `RAZORPAY_WEBHOOK_SECRET` on Render differs from the secret in the Razorpay webhook form.                                                                                                                                                                     |
| `/dev/login` is a 404                                                         | `NEXT_PUBLIC_ENABLE_DEV_LOGIN` is not `true` for that build. Set it and redeploy.                                                                                                                                                                             |
