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
- Razorpay account, test mode (Route is not used).
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
   - **Active events** to tick: `payment.captured`, `payment.failed`, `order.paid`. Only the commission goes through Razorpay (the advance and final are direct UPI payments), so no transfer or Route events are needed. Any other event is stored and ignored.
   - In test mode Razorpay may ask for an OTP; its docs give `754081` for test mode.
5. Payment capture must be **automatic** (**Accounts & Settings**, the payment capture setting). The API creates Orders without a capture flag; with manual capture, payments stop at `authorized` and the API answers "not captured" instead of moving the deal.

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

   | Variable                   | Value                                                                                 |
   | -------------------------- | ------------------------------------------------------------------------------------- |
   | `INSTAGRAM_APP_ID`         | from section 5                                                                        |
   | `INSTAGRAM_APP_SECRET`     | from section 5                                                                        |
   | `META_APP_SECRET`          | from section 5                                                                        |
   | `RAZORPAY_KEY_ID`          | from section 6 (`rzp_test_...`)                                                       |
   | `RAZORPAY_KEY_SECRET`      | from section 6                                                                        |
   | `RAZORPAY_WEBHOOK_SECRET`  | from section 6 step 3                                                                 |
   | `RESEND_API_KEY`           | from section 7                                                                        |
   | `ADMIN_INSTAGRAM_USER_IDS` | `none` for now (you set the real id in section 14)                                    |
   | `COMPANY_ADDRESS`          | the company address                                                                   |
   | `COMPANY_STATE`            | the company state, for example `Karnataka`                                            |
   | `COMPANY_GSTIN`            | the company GSTIN. Staging charges GST at 18%, so the API refuses to start without it |
   | `COMMISSION_SAC_CODE`      | the SAC code your CA confirms (SPEC 21)                                               |

4. Click **Deploy Blueprint** (or **Apply**). If Render rejects `plan: free` on the database, open Render's Blueprint spec page, find the current identifier for the free Postgres plan, and change that one line in `render.yaml`. Do not switch to a paid tier by accident. If it rejects the web plan `0.5c-512mb`, use the identifier Render's compute plans page lists for the 512 MB, 0.5 CPU plan (formerly "Starter").
5. Wait for the first deploy. The build installs, builds `packages/shared` and the API; the pre-deploy command then runs the database migrations; the service starts only when `/api/health` answers.
6. Open the service page and copy its default address, for example `https://valueskins-api-staging.onrender.com`. Check `<that address>/api/health`: it must show `{"ok":true}`.

**Migration 0010 (one open dispute per deal).** It adds a unique index so a deal has at most one open dispute. Before it does, it marks every extra open dispute on the same deal as resolved with the resolution "Closed automatically when one open dispute per deal became the rule.", keeping the newest one open. Staging may have such rows from testing. Nothing is emailed, and the closed disputes are still listed in the admin views.

If the deploy fails, open the **Logs** tab. A line starting `Invalid environment configuration` names the missing or wrong variable. A line starting `Startup guard failed` means a safety rule stopped the API on purpose (for example a live Razorpay key on staging, or `EMAIL_TRANSPORT=console` in production).

## 9. Vercel (web)

1. In Vercel, **Add New > Project**, import `valueskins/getvalueskins`.
2. **Root Directory:** click Edit and choose `apps/web`. Leave "Include source files outside of the Root Directory" enabled (the app imports `packages/shared`).
3. **Framework Preset:** Next.js. Leave the build and install commands alone: `apps/web/vercel.json` sets them.
4. Name the project `valueskins-staging-web`.
5. **Environment Variables** (add each for the Production environment):

   | Variable                       | Value                                |
   | ------------------------------ | ------------------------------------ |
   | `NEXT_PUBLIC_API_URL`          | `https://api-staging.valueskins.com` |
   | `NEXT_PUBLIC_RAZORPAY_KEY_ID`  | the `rzp_test_...` key id            |
   | `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | `true`                               |

6. Click **Deploy**. Then in **Settings > General**, set **Node.js Version** to `22.x`. In **Settings > Git**, check that **Production Branch** is `main`.
7. **Settings > Domains > Add Domain:** `staging.valueskins.com`. Vercel shows a CNAME value for this project. Copy it for section 10.

Variables starting `NEXT_PUBLIC_` are baked in at build time. After changing one, redeploy (**Deployments > ... > Redeploy**).

Pull request preview deployments on their own `*.vercel.app` address are build checks only: that address is not `WEB_ORIGIN`, the session cookie is set for `.valueskins.com`, and the Instagram callback sends you back to `WEB_ORIGIN`, so sign-in cannot work there. To try a web branch with sign-in, serve it on `staging.valueskins.com` for a while (section 9a).

"Sign in with email" on the home page follows the API's `GET /api/config` (`authEmailEnabled`, from Render's `AUTH_EMAIL_ENABLED`). There is no web variable for it any more: the web app no longer reads `NEXT_PUBLIC_AUTH_EMAIL_ENABLED`. If the project still has it, delete it in **Settings > Environment Variables** (it does nothing, but it suggests a switch that is not there).

## 9a. Checking a web branch on staging

Use this to check a web branch, for example a W1 to W3 branch, with real sign-in before it is merged. While it runs, `staging.valueskins.com` serves the branch instead of `main`. Nothing changes on Render or Meta.

1. In Vercel, project `valueskins-staging-web`, **Settings > Environment Variables**: make sure the three variables in step 5 above also exist for the **Preview** environment, with the same values. You can limit them to the branch (Vercel lets you scope a Preview variable to one Git branch). Then redeploy the branch's latest preview, because `NEXT_PUBLIC_` values are baked in at build time.
2. **Settings > Domains > `staging.valueskins.com` > Edit**: connect the domain to the **Preview** environment and enter the branch name in **Git Branch** (for example `feat/web-shell`). Save. Each new push to the branch now updates `staging.valueskins.com`. To pin one deployment instead, `vercel alias set <deployment-url> staging.valueskins.com` works too.
3. Check sign-in on `https://staging.valueskins.com`: section 13 steps 2 to 10.
4. When you are done, edit the domain again and connect it back to **Production** (branch `main`). Check that `staging.valueskins.com` shows `main` again.

Pushes to the branch while it holds the domain go live on staging straight away, so tell anyone else testing staging first.

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

Register it in section 6 step 4. To check it end to end, pay a commission (section 13 step 12) and watch the payment become `CAPTURED` from the webhook.

Razorpay's dashboard shows each delivery and its response code. A healthy delivery answers `200`. A `400` means the signature did not match: the `RAZORPAY_WEBHOOK_SECRET` on Render and the secret in the webhook form differ. A processing problem does not change the `200`: it is recorded on the event row and emailed to `DISPUTE_EMAIL` (which is `SUPPORT_EMAIL` unless you set it) as an "Admin alert".

## 13. Verification run-through

Do these in order on a clean browser profile. This is the "done" check for staging.

1. `https://api-staging.valueskins.com/api/health` shows `{"ok":true}` over HTTPS.
2. `https://staging.valueskins.com/` loads over HTTPS and shows "Sign in with Instagram", and "Sign in with email" under it (staging only: it follows `AUTH_EMAIL_ENABLED`).
3. `/how-it-works`, `/terms`, `/privacy`, `/refunds` and `/contact` load without signing in. Yellow "Not in this version" boxes mark passages about things the app does not do yet; they never show on a production build. `/no-such-page` shows the 404 page.
4. `https://staging.valueskins.com/dev/login`: enter a username, pick a role, click **Sign in**. You land on `/onboarding`. Click **Sign out** at the top.
5. **Email sign-in:** **Sign in with email**, enter your email, **Send code**. The email arrives from `notifications@valueskins.com` (check spam). Enter the code. You land on `/onboarding` at "Connect your Instagram". Click **Sign out**.
6. **Instagram sign-in:** **Sign in with Instagram** with the tester account. Approve the permission. You land on `/onboarding` at "Is this you?", showing the picture, name, username, account type, followers, posts, engagement and bio.
7. A personal Instagram account, or any account that is not Business or Creator, lands on `/login?error=account_type_unsupported`: "This Instagram account cannot sign in" with the "How to switch" steps. An Instagram **Business** account signs in as a brand and a **Creator** account as a creator, with no account type question.
8. In Render, **Logs** shows requests and no errors.
9. **Creator onboarding.** Sign in with a Creator Instagram account (or dev login as a creator):
   1. "Is this you?": check the details, click **This is me**. There is no account type question: the role comes from the Instagram account type. (An email-only account is asked to **Connect Instagram** first and cannot finish setting up until it does.)
   2. **Add your email**, **Send link**. The page shows "Check your inbox". Open the emailed link in the same browser: "Email confirmed". Click **Continue**.
   3. **Your profile:** name, city, age (18 to 99) and gender, and tick "I am 18 or older". **Save profile**. It saves once and is then locked.
   4. **Get paid by UPI:** a bank account number, PAN or IFSC code in the UPI ID field is explained at once. Enter a UPI ID such as `yourname@okaxis`, the name on the account, tick the consent box, **Save UPI ID** (or **Do this later**). You land on **Deals**.
   5. **Settings** shows the email as verified, the profile read-only with "write to us", the UPI ID masked like `yo•••@okaxis` with the name and consent date, and the Instagram numbers. The full UPI ID never appears again. `GET /api/me/payout-upi` returns the same masked form.
   6. Opening `/campaigns` as a creator shows the 404 page.
10. **Brand onboarding.** Sign in with a Business Instagram account (or dev login as a brand): the same steps, with brand name, city, website and an optional hiring pitch, then **Billing details** (a GSTIN, if entered, must be valid). **Save and finish** lands on **Campaigns**, with **Post a deal** in the top bar. `/deals` shows the 404 page. **Sign out** from the menu under your username goes back to the home page.
11. **Deal flow, draft to CONFIRMED (curl).** There is no deals screen yet, so this uses the API directly. You need `curl` and `jq`, two email addresses you can read (one brand, one creator), and a Render **Shell** for the payout fallback. Each person gets a cookie file, so run everything in one terminal session:

    ```bash
    API=https://api-staging.valueskins.com/api
    ORIGIN=https://staging.valueskins.com
    # call METHOD PATH COOKIEFILE [JSON]  (Origin is required on every non-GET request)
    call() { curl -sS -X "$1" "$API$2" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -b "$3" -c "$3" ${4:+-d "$4"}; echo; }

    # 1. Sign in with dev login (staging only). In dev login the role stands in for the Instagram account type.
    call POST /dev/login brand.jar '{"username":"test_brand","role":"BRAND"}'
    # 2. Onboard the brand: verified email (open the emailed link, copy the token from its address), profile (saved once), billing.
    call POST /me/email brand.jar '{"email":"brand-test@example.com"}'
    call POST /me/email/verify brand.jar '{"token":"PASTE-THE-TOKEN"}'
    call PUT /me/profile brand.jar '{"name":"Test Brand","city":"Bengaluru","website":"https://brand.example","adultConfirmed":true}'
    call PUT /me/billing brand.jar '{"billingName":"Test Brand Pvt Ltd","billingAddress":"1 Main Road, Bengaluru","billingState":"Karnataka"}'
    # 3. Do the same for the creator: role CREATOR, creator.jar, a second email, and a profile of
    #    {"name":"Test Creator","city":"Pune","age":24,"gender":"FEMALE","adultConfirmed":true}. No billing.

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

    The creator can only apply once they have saved a UPI ID, name and consent (section 13 step 9). With curl, using the creator's cookie file:

    ```bash
    call PUT /me/payout-upi creator.jar '{"vpa":"test.creator@okaxis","name":"Test Creator","consent":true}'   # answers the masked ID
    ```

    Then continue:

    ```bash
    # 7. Creator applies; brand sees the applicant and confirms.
    call POST /deals/$DEAL/applications creator.jar '{}'    # email 2 goes to the brand
    APP=$(call GET /deals/$DEAL/applications brand.jar | jq -r '.items[0].id')
    call POST /applications/$APP/confirm brand.jar '{}'     # deal CONFIRMED, email 3 goes to the creator
    call GET /deals/$DEAL brand.jar                         # status CONFIRMED, creatorPayoutSet true
    call GET /users/$(call GET /me creator.jar | jq -r .user.id)/resume brand.jar
    ```

    Expected: every call answers with JSON and no `error`; the deal ends `CONFIRMED`; emails 1, 2 and 3 arrive; a second `confirm` answers `409`. To cancel instead: `call POST /deals/$DEAL/cancel brand.jar '{"reason":"changed plans"}'` while the deal is `OPEN` or `CONFIRMED`. Once the fee is paid (`COMMISSION_PAID` onward) the brand's cancel answers `409 CANCELLATION_NOT_POSSIBLE`; only an admin can cancel then (section 13 step 13).

12. **The three payments (test mode).** Prerequisites: step 11 done so a deal is `CONFIRMED` with a creator who has saved a UPI ID (step 9); the webhook from section 6 step 4 registered with the payment events ticked; automatic capture on (section 6 step 6). The commission uses a Razorpay test card or test UPI id from Razorpay's test-payment page; nothing real is charged. The advance and final are paid outside Razorpay and need no money to move.

    In a Render **Shell**, define a small query helper once:

    ```bash
    q() { pnpm --filter @valueskins/api exec node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(process.argv[1]).then(r=>{console.log(JSON.stringify(r.rows,null,1));return p.end()})" "$1"; }
    DEAL=PASTE-THE-DEAL-ID
    ```

    1. **Commission.** Signed in as the brand in a browser, open `https://staging.valueskins.com/deals/<DEAL>/pay`. Click **Pay commission: ...**, pay in Checkout. Expected: the page says "Payment recorded.", the deal moves to `COMMISSION_PAID`, and the brand and creator get an email. If the page shows an error, `q "select * from webhook_events order by received_at desc limit 5"` shows what Razorpay sent and any error.
    2. **Advance: pay the creator by UPI, record it, the creator confirms.** The advance is not paid through Razorpay. The brand pays the creator's UPI ID itself, and the creator confirms the money arrived; that confirmation is what moves the deal. With the deal in `COMMISSION_PAID`:

       ```bash
       call GET /deals/$DEAL/direct-payment brand.jar          # the amount, the creator's name and UPI ID, upiUri, "blocked" if not payable
       call POST /deals/$DEAL/direct-payment brand.jar '{"stage":"ADVANCE","reference":"TEST12345678"}'   # records it; the deal does not move; email 17 to the creator
       call GET /deals/$DEAL creator.jar                       # directPayments[0].id, status AWAITING_CONFIRMATION, action CONFIRM_PAYMENT_RECEIVED
       DP=PASTE-THE-RECORD-ID
       call POST /direct-payments/$DP/confirm creator.jar '{}' # ADVANCE_PAID, email 5 to both with the payment record PDF
       ```

       To try the other path first, say it did not arrive: `call POST /direct-payments/$DP/not-received creator.jar '{"reason":"Nothing arrived"}'` (emails 18 and an admin alert; the deal stays in `COMMISSION_PAID`), then record again with another reference.

    3. **Check the UPI link and QR code on a phone.** Open `https://staging.valueskins.com/deals/<DEAL>/pay` as the brand while the advance is due. It shows the payee name, the UPI ID, the amount, **Open in a UPI app** and a QR code. Scan the QR code, or open the link on a phone with a UPI app: the app must show the creator's name on the account and exactly the advance amount. **You do not need to send the money**: close the app, then record any reference (6 to 40 characters) and confirm as the creator.
    4. **Upload and approve.** With the deal in `ADVANCE_PAID`:

       ```bash
       call POST /deals/$DEAL/content creator.jar '{"link":"https://drive.google.com/file/d/test/view"}'   # CONTENT_UPLOADED, email 6 to the brand
       call POST /deals/$DEAL/approve brand.jar '{}'                                                        # APPROVED, email 8 to the creator
       ```

       To try a revision first: `call POST /deals/$DEAL/feedback brand.jar '{"feedback":"Please reshoot the intro"}'` (email 7), then upload again.

    5. **Final: the same, with `"stage":"FINAL"`.** `GET /deals/$DEAL/direct-payment` now returns the final; record it and confirm as the creator. Expected: `COMPLETED`, email 9 to both with the final payment record attached, then email 10 with the deal report.
    6. **The four PDFs.** Download them as the brand (or the creator) and open them:

       ```bash
       for kind in commission-invoice advance-payment-record final-payment-record adp; do curl -sS -b brand.jar -o "$kind.pdf" "$API/deals/$DEAL/documents/$kind"; done
       ```

       Expected: four PDFs with the rupee sign showing, the numbers `VS/...` on the invoice and `VS-PR/...` on the two payment records, and the wording "Paid directly by the brand to the creator by UPI. ValueSkins did not receive or hold this money." on the records. The creator's UPI ID is masked on every document, and the deal report lists every direct payment, a not-received one included. `call GET /deals/$DEAL/emails brand.jar` and `call GET /deals/$DEAL/events brand.jar` show the deal's communication history and timeline.

    The `adp` document is the deal record: its PDF is titled "ValueSkins Deal Record" and downloads as `ValueSkins-Deal-Record-<short id>.pdf`, and email 10 is "Deal record ready". Emails and PDFs say "ValueSkins fee", never "commission". The deal's `documents` list (`GET /api/deals/$DEAL`) gives the number and date of each document that exists.

    Deals paid through Route before Prompt 13 have no payment records: use a fresh deal. On staging the commission document is a GST tax invoice: ₹750 plus 18% GST is ₹885.

    The fee is the only Razorpay payment: `q "select type, amount_paise, status from payments where deal_id = '$DEAL'"` shows the commission as `CAPTURED`, and `direct_payments` holds the other two: `q "select stage, amount_paise, reference, confirmed_at, disputed_at from direct_payments where deal_id = '$DEAL' order by recorded_at"`. The three amounts add up to the budget.

13. **Disputes and the admin API (curl).** Needs a deal from step 12 (any status from `COMMISSION_PAID`), and your admin session: sign in at `https://staging.valueskins.com` with the Instagram account listed in `ADMIN_INSTAGRAM_USER_IDS` (section 14), then copy the value of the `vs_session_staging` cookie from the browser's developer tools (Application > Cookies). Admin accounts are Instagram accounts: an email-only account is never an admin. Every admin route answers 404 to anyone else, so a 404 on the first call means the cookie or the admin id is wrong.

    ```bash
    ADMIN_SESSION=PASTE-THE-COOKIE-VALUE
    # acall METHOD PATH [JSON]
    acall() { curl -sS -X "$1" "$API$2" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -H "Cookie: vs_session_staging=$ADMIN_SESSION" ${3:+-d "$3"}; echo; }

    # 1. Raise a dispute as the brand or the creator. Email 15 goes to DISPUTE_EMAIL with both parties in CC.
    call POST /deals/$DEAL/disputes brand.jar '{"subject":"Test dispute","description":"Checking the admin flow"}'

    # 2. Resolve it as the admin. Email 15b goes to both parties.
    acall GET '/admin/disputes?status=OPEN'
    DISPUTE=PASTE-THE-DISPUTE-ID
    acall POST /admin/disputes/$DISPUTE/resolve '{"resolution":"Checked and settled","refundReference":"rfnd_test_1"}'

    # 3. Find a deal, see everything about it, and force-cancel a stuck one (COMMISSION_PAID to APPROVED). Email 11 goes to both parties.
    acall GET '/admin/deals?q=SHORTID'                     # the short id is on the deal and in every email
    acall GET /admin/deals/$DEAL
    acall POST /admin/deals/$DEAL/cancel '{"note":"Creator unreachable; refunded in the Razorpay dashboard","refundReference":"rfnd_test_1"}'

    # 4. Resend any email (the id is in /admin/deals/$DEAL, "emails"). Invoices and payment records are attached again.
    acall POST /admin/emails/PASTE-THE-EMAIL-ID/resend '{}'
    ```

    The API never moves money. The advance and final are paid by the brand directly to the creator, so an admin who cancels a deal records any refund the parties arranged in the cancel or resolve call (the optional reference); the commission is refunded by hand in the Razorpay dashboard, if at all. `/admin/deals/$DEAL` lists every direct payment, a not-received one included.

14. **Scheduled jobs.** The API runs seven jobs on a timetable in Indian time (SPEC 14). There is nothing to set up: they start with the service, and each run writes one log line, `job finished` (or `job skipped` or `job failed`), with `job`, `status`, `durationMs` and counts such as `selected` and `sent`. Read them in Render, **Logs**, by searching for `"job"`. `instagram-refresh` runs at 03:00, `cleanup` at 04:00, `fee-reminder`, `payment-due-reminder` and `review-reminder` at 10:00, `confirm-payment-reminder` at 00:00, 06:00, 12:00 and 18:00, and `content-overdue` at 23:59.

    To try one now, in the Render **Shell** (add `SUPPORT_EMAIL` first if the shell has no `.env`; on Render it is already in the service environment):

    ```bash
    pnpm --filter @valueskins/api run job:deploy -- --list                  # the jobs and their schedules
    pnpm --filter @valueskins/api run job:deploy -- fee-reminder            # run one once, with the real clock
    ```

    Expected: it prints the result, for example `{"job":"fee-reminder","status":"ok","durationMs":58,"counts":{"selected":1,"sent":1}}`, and exits 0 (1 if the job failed, or the name is wrong). Run it a second time the same day: `sent` is 0 and `alreadySent` is 1, because a reminder goes to a person at most once per deal per day (`email_log`). A reminder is sent only when the deal fits its rule: the fee reminder needs a deal in `CONFIRMED` for over 24 hours, the payment-due reminder a deal in `COMMISSION_PAID` (or `APPROVED`) for over 24 hours with no advance (or final) payment recorded, the confirm-payment reminder a recorded payment waiting over 12 hours, the review reminder content waiting over 3 days. To see one by hand on staging, move a test deal's timestamp back in the Render shell database, for example `update deals set confirmed_at = now() - interval '2 days' where short_id = '...'`.

    Notes:

    - A job takes a Postgres lock, so a run started by hand while the schedule is running it answers `status: skipped` and does nothing. The same lock keeps two instances, or a deploy overlap, from running a job twice.
    - `instagram-refresh` covers users who used the app in the last 30 days (`users.last_active_at`, written at most once an hour). The column was empty before this feature, so the first runs refresh only people who come back after the deploy.
    - The seeded deals on staging sit in `CONFIRMED`, `COMMISSION_PAID` and `APPROVED`, so after 24 hours the seeded `@example.com` addresses get reminders. Resend rejects those addresses and the rows are logged as `FAILED`; that is expected and harmless.
    - There is no switch to turn the jobs off without a code change. To stop all of them quickly, suspend the Render service.

15. **Live updates (Socket.io).** Nothing to set up. To check it end to end, use two terminals on your laptop (Node 22) in the repo, `pnpm install` done. Sign in as a creator in a browser at `https://staging.valueskins.com`, then copy the value of the `vs_session_staging` cookie from the developer tools (Application > Cookies) into the command:

    ```bash
    # An unauthenticated socket is refused: expect "refused: unauthorized".
    node --input-type=module -e "
    import { io } from 'socket.io-client';
    const s = io('https://api-staging.valueskins.com', { transports: ['websocket'], reconnection: false });
    s.on('connect', () => { console.log('connected (unexpected)'); s.close(); });
    s.on('connect_error', (e) => { console.log('refused:', e.message); s.close(); });
    "

    # A signed-in creator connects and hears deals as they are published: expect "connected", then one line per event.
    node --input-type=module -e "
    import { io } from 'socket.io-client';
    const s = io('https://api-staging.valueskins.com', { transports: ['websocket'], extraHeaders: { cookie: 'vs_session_staging=PASTE-THE-COOKIE-VALUE' } });
    s.on('connect', () => console.log('connected'));
    s.on('connect_error', (e) => console.log('refused:', e.message));
    for (const name of ['deal:new', 'deal:closed', 'deal:updated', 'application:new']) s.on(name, (p) => console.log(name, JSON.stringify(p)));
    "
    ```

    Run them from `apps/api` (where `socket.io-client` is installed), for example with `pnpm --filter @valueskins/api exec node ...`. With the second command running, publish a deal as a brand (step 11): the creator's terminal prints `deal:new` with the title, the brand's username and picture, the budget, the creator amount and the two deadlines, and nothing else. Confirm the creator for a deal: it prints `deal:closed`. A creator is only in `feed:creators` after finishing onboarding. If every websocket attempt fails on staging but works locally, check that nothing in front of Render blocks `Upgrade: websocket` (Render's web services support WebSockets with no extra setting; confirm this on first deploy).

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

- [ ] Replace the text in `apps/web/content/privacy.md` and `terms.md` with the real, lawyer-reviewed text, resolve every "Not in this version" note, and deploy it. It must say what is collected, why, and how to delete data.
- [ ] App settings > Basic is complete: privacy policy URL, app icon 1024x1024, category, business email. Open the app's **App Review** area and read its requirements list; Meta may also ask for Business Verification.
- [ ] A dedicated Instagram Professional test account is added as an Instagram Tester and has accepted.
- [ ] The redirect URI, deauthorize callback and data deletion URL are saved (section 5).
- [ ] Staging is healthy (section 13). The free database is not about to expire (section 17).
- [ ] Do one full dry run first.

Recording:

- [ ] English narration or captions. 1080p. Browser address bar visible, showing `https://staging.valueskins.com`.
- [ ] Be signed out of Instagram first so the login screen shows.
- [ ] Open the home page, click **Sign in with Instagram**.
- [ ] Show the Instagram permission screen and say which permission it asks for (`instagram_business_basic`) and why.
- [ ] Approve. Show the onboarding "Is this you?" step with the username, name, picture, followers, posts, engagement rate and bio, and say how each is used (shown to brands when the creator applies to a deal).
- [ ] Open `/privacy` and scroll to the deletion section.
- [ ] In **Settings**, click **Delete account** to show data deletion, or say that Instagram's deauthorize and data deletion callbacks do the same.
- [ ] Do not show secrets: no app secret, tokens, `.env`, or dashboard variable values.

Submission text for reviewers: the staging URL, the step-by-step above, and the tester login for the test account (and a note about two-factor authentication if it is on).

## 16. Rollback

**API (Render).** Service > **Events** (or **Deploys**) > pick the last good deploy > **Rollback**. Database migrations are not undone by a rollback. Write migrations so the previous code still works after them (add columns before using them; remove them in a later change). If a migration itself is bad: the pre-deploy command fails, the deploy fails, and the old version keeps serving. Fix forward with a new migration. The free staging database has no backups, so there is no restore; staging data is disposable, so recreate and reseed (section 17).

**Web (Vercel).** Project > **Deployments** > open the last good Production deployment > the menu > **Instant Rollback** (or **Promote to Production**).

**Switch features off without code.**

- Email sign-in: Render `AUTH_EMAIL_ENABLED=false` (production must always have it `false`: the API refuses to start otherwise). The web hides "Sign in with email" within a minute (`GET /api/config` is cached for 60 seconds); no web redeploy is needed.
- Dev login: Render `ENABLE_DEV_LOGIN=false`; Vercel `NEXT_PUBLIC_ENABLE_DEV_LOGIN=false` and redeploy.

**Undo a merge.** Revert the pull request on GitHub; Render and Vercel deploy `main` again.

## 17. The free Postgres expires after 30 days

Render's free Postgres expires 30 days after creation, with a 14-day grace period before deletion, and has no backups. Put a reminder in your calendar for day 25.

- To keep the data: Render > `valueskins-staging-db` > upgrade to a paid plan.
- To start fresh: delete the database in the dashboard, then in the Blueprint choose **Manual Sync** so it is recreated. The service gets the new connection string, the pre-deploy command runs the migrations, then reseed (section 14). Everyone signs in again.

Only one free Postgres can be active per Render workspace.

## 18. Reference: environment variables

### Render, API service `valueskins-api-staging`

| Variable                   | Staging value                                                    | Where it comes from                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_VERSION`             | `22`                                                             | `render.yaml` (Render setting, not read by the app)                                                                                    |
| `PORT`                     | injected by Render                                               | Render sets it (default 10000); not in `render.yaml`                                                                                   |
| `NODE_ENV`                 | `staging`                                                        | `render.yaml`                                                                                                                          |
| `DATABASE_URL`             | internal connection string                                       | `render.yaml`, from `valueskins-staging-db`                                                                                            |
| `TEST_DATABASE_URL`        | omitted (defaults to empty)                                      | Vitest only                                                                                                                            |
| `WEB_ORIGIN`               | `https://staging.valueskins.com`                                 | `render.yaml`                                                                                                                          |
| `COOKIE_DOMAIN`            | `.valueskins.com`                                                | `render.yaml`                                                                                                                          |
| `SESSION_COOKIE_NAME`      | `vs_session_staging`                                             | `render.yaml`                                                                                                                          |
| `SESSION_SECRET`           | generated                                                        | Render generates it                                                                                                                    |
| `TOKEN_ENCRYPTION_KEY`     | generated                                                        | Render generates it; if you change it, stored Instagram tokens cannot be decrypted (users sign in again)                               |
| `INSTAGRAM_APP_ID`         | prompted                                                         | Meta, Instagram business login settings (section 5)                                                                                    |
| `INSTAGRAM_APP_SECRET`     | prompted                                                         | Meta, Instagram business login settings (section 5)                                                                                    |
| `INSTAGRAM_REDIRECT_URI`   | `https://api-staging.valueskins.com/api/auth/instagram/callback` | `render.yaml`; must match Meta exactly                                                                                                 |
| `META_APP_SECRET`          | prompted                                                         | Meta, App settings > Basic (section 5)                                                                                                 |
| `RAZORPAY_KEY_ID`          | prompted, `rzp_test_...`                                         | Razorpay test mode (section 6)                                                                                                         |
| `RAZORPAY_KEY_SECRET`      | prompted                                                         | Razorpay test mode (section 6)                                                                                                         |
| `RAZORPAY_WEBHOOK_SECRET`  | prompted                                                         | you make it up (section 6); same value in the Razorpay webhook form                                                                    |
| `RESEND_API_KEY`           | prompted                                                         | Resend (section 7)                                                                                                                     |
| `EMAIL_FROM`               | `ValueSkins <notifications@valueskins.com>`                      | `render.yaml`                                                                                                                          |
| `EMAIL_TRANSPORT`          | `resend`                                                         | `render.yaml`; `console` is refused in production                                                                                      |
| `ADMIN_INSTAGRAM_USER_IDS` | prompted (`none`, then your id)                                  | section 14                                                                                                                             |
| `SUPPORT_EMAIL`            | `founder@valueskins.com`                                         | `render.yaml`. Required, with no default anywhere. The one address users write to: every email footer, the reply-to and error messages |
| `DISPUTE_EMAIL`            | omitted (defaults to `SUPPORT_EMAIL`)                            | optional: where disputes and admin alerts go, if not the support address                                                               |
| `ENABLE_DEV_LOGIN`         | `true`                                                           | `render.yaml`; must be false or absent in production                                                                                   |
| `COMPANY_LEGAL_NAME`       | `Valueskins Private Limited`                                     | `render.yaml`                                                                                                                          |
| `COMPANY_ADDRESS`          | prompted                                                         | you                                                                                                                                    |
| `COMPANY_STATE`            | prompted                                                         | you                                                                                                                                    |
| `COMPANY_GSTIN`            | prompted                                                         | your GSTIN; required while `GST_RATE_BPS` is above 0, which is the default                                                             |
| `COMMISSION_SAC_CODE`      | prompted                                                         | your CA (SPEC 21)                                                                                                                      |
| `AUTH_EMAIL_ENABLED`       | `true`                                                           | `render.yaml`; staging and tests only, the API refuses `true` when `NODE_ENV=production`                                               |
| `GST_RATE_BPS`             | `1800`                                                           | `render.yaml`; optional, defaults to 1800 (18%). The fee is a flat ₹750 plus this GST                                                  |
| `LOG_LEVEL`                | optional, default `info`                                         | set `debug` only while debugging                                                                                                       |

**`SUPPORT_EMAIL` in every environment.** The API refuses to start without it, and no code or example file supplies a value. The value is `founder@valueskins.com` on staging (set in `render.yaml`) and in production (set in the production service's environment when it is created; there is no production blueprint yet). Create that mailbox before the deploy: it becomes the reply-to, the footer line of every email and the address in error messages, and `DISPUTE_EMAIL` follows it unless you set one. Local development and CI use a test value of your own in `apps/api/.env`.

### Vercel, project `valueskins-staging-web`

| Variable                       | Staging value                        | Where it comes from                                                                  |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`          | `https://api-staging.valueskins.com` | fixed                                                                                |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`  | `rzp_test_...`                       | Razorpay test mode (section 6)                                                       |
| `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | `true`                               | fixed on staging; a build with this true and the production API URL fails on purpose |

### Local development

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`. For the web app locally use `NEXT_PUBLIC_API_URL=http://localhost:4000`, and set both flags to `true`.

## 19. Known limitations

- **Client IP behind Render.** The API trusts one proxy hop (`trust proxy` is 1). Render's docs do not state how many proxies sit in front of a service. If the real count is higher, per-IP rate limits (SPEC 13) could key on a shared address. Check this before production, for example by testing the login limit from two networks.
- **Invoices for older payments:** payments captured before invoicing shipped have no invoice, receipt or deal report. Documents are rendered on demand and never stored.
- **Migration 0008 is destructive on staging.** It deletes the old Route advance and final payments, their receipts and the receipt counter, drops the `transfers` table, and renumbers payment records from `VS-PR/.../000001`. Deals already past `COMMISSION_PAID` keep their status but have no direct payment records: use fresh deals.
- **Migration 0007 is destructive on staging.** It drops the `creator_payout_accounts` table, so test creators' old Route linked-account rows are gone and every creator must save a UPI ID (section 13 step 9) before applying. Linked accounts in Razorpay's dashboard are not touched.
- **Settlement events** (`settlement.processed`) are stored and ignored.
- **Webhook processing runs after the response.** If the API stops between storing an event and processing it, that event stays unprocessed (`processed_at` empty in `webhook_events`) and is not retried. Re-trigger the delivery from Razorpay's dashboard to catch up.
- **Deleting an account** does not yet remove brand billing rows (the creator's UPI details are cleared).
- **Jobs run inside the API process.** Render keeps one instance, so they run once; a second instance is safe (the lock) but does nothing extra. A job that fails is logged, not emailed (SPEC 14). Reminder emails carry no link to the deal, because the temporary pages are replaced soon.
- **Live updates run in the API process.** Socket.io is attached to the API's HTTP server (SPEC 10), so there is one instance and nothing extra to configure; the web app must connect with credentials to the API origin, and its CSP needs `connect-src` for the API origin and `wss://` (done with the real web screens). A second Render instance would need the Redis adapter and sticky sessions first. The temporary pages do not listen to sockets yet, so they still update only on reload.
- **Resume shows deal amounts.** `GET /api/users/:id/resume` returns the budget of each completed deal, as SPEC 11 says. Whether showing amounts publicly is intended is still SPEC open decision 5.
- **Terms, Privacy, Refunds and How it works** are rendered from `apps/web/content/*.md`. The text is adapted from the live site and waits for the final wording; passages about things the app does not do yet are marked (see `apps/web/content/README.md`).
- **Free database** has no backups and expires (section 17).
- **OAuth state cookie** `vs_ig_oauth_state` has the same name in every environment, and staging and production will share the cookie domain `.valueskins.com`. Complete one sign-in at a time when testing both.
- **Meta review** can require Business Verification; check the App Review requirements in the Meta dashboard.
- **Deal screens are not built yet.** After W1 the creator's Deals, Applications and My deals pages and the brand's Campaigns and Post a deal pages show only their heading; the deal flow arrives with W2. Until then use the curl steps in section 13.

## 20. Troubleshooting

| Symptom                                                                           | Likely cause and fix                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram says "Invalid redirect_uri"                                             | The URI in Meta must equal `INSTAGRAM_REDIRECT_URI` character for character (https, no trailing slash).                                                                                                                       |
| After Instagram you land on `/login?error=state_invalid`                          | The sign-in took more than 5 minutes, was opened in a different browser, or cookies are blocked. Start again from the home page.                                                                                              |
| `/login?error=account_type_unsupported`                                           | The Instagram account is not a Business or Creator account (a personal account, or Meta sent no account type). Switch it to a Professional Business or Creator account in Instagram settings.                                 |
| `/login?error=account_type_change_blocked`                                        | The account's Instagram type changed (Business to Creator or back), but it already has deals or applications in its old role. Write to `SUPPORT_EMAIL`; the account type is not changed automatically once there is activity. |
| `409 PROFILE_LOCKED`                                                              | The profile is saved once. To correct it, update the row by hand (Render Shell: set the fields and, to let the user save again, `profile_locked_at = null`).                                                                  |
| Render deploy fails with `COMPANY_GSTIN is required when GST_RATE_BPS is above 0` | GST is charged by default. Set `COMPANY_GSTIN` in Render, or set `GST_RATE_BPS=0` on a test service that should not charge GST.                                                                                               |
| Sign-in works but `/me` says you are signed out                                   | `COOKIE_DOMAIN` must be `.valueskins.com`, and both hosts must be under `valueskins.com`. Check the cookie in the browser developer tools.                                                                                    |
| API returns `403 ORIGIN_MISMATCH`                                                 | `WEB_ORIGIN` must equal the web address exactly, with no trailing slash.                                                                                                                                                      |
| "Sign in with email" button missing                                               | `AUTH_EMAIL_ENABLED` is not `true` on Render. The web reads it from `GET /api/config`, cached for 60 seconds.                                                                                                                 |
| Email routes return 404                                                           | `AUTH_EMAIL_ENABLED` is not `true` on Render.                                                                                                                                                                                 |
| Emails do not arrive                                                              | The Resend domain is not verified, or the key is wrong. Look for FAILED rows in `email_log` (Shell, then `psql`-style query as in section 14).                                                                                |
| Render deploy fails with `Invalid environment`                                    | A required variable is missing or wrong; the log names it.                                                                                                                                                                    |
| Render build fails on `--frozen-lockfile`                                         | `pnpm-lock.yaml` is out of date. Run `pnpm install` locally and commit the lockfile.                                                                                                                                          |
| Vercel build fails mentioning `NEXT_PUBLIC_ENABLE_DEV_LOGIN`                      | The guard stopped a build that has dev login on and the production API URL. Set the flag to false for that project.                                                                                                           |
| Everyone gets `429`                                                               | See the client IP limitation in section 19.                                                                                                                                                                                   |
| Webhook deliveries show `400`                                                     | `RAZORPAY_WEBHOOK_SECRET` on Render differs from the secret in the Razorpay webhook form.                                                                                                                                     |
| `/dev/login` is a 404                                                             | `NEXT_PUBLIC_ENABLE_DEV_LOGIN` is not `true` for that build. Set it and redeploy.                                                                                                                                             |
