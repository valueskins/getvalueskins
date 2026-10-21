# Staging deployment

Every manual step to put staging on the internet, in order. **Production is section 21**, and the order of the switch from the live app is in `docs/CUTOVER.md`.

**Staging is managed by hand.** The staging services on Render (`valueskins-api-staging` and its database) were created from an earlier `render.yaml`. They are now changed only in the Render dashboard, and `render.yaml` describes production only, so applying it creates production only. Render never deletes a resource because it left the file. Sections 1 to 20 describe staging, and section 18 lists its settings: use them to change staging, or to recreate it by hand, where "Blueprint" steps appear (create the web service and the database in the dashboard with the same settings). The one new variable, `HOSTING_TIER`, is optional on staging: unset means `free`, and the guard that uses it applies only in production. Nothing here is done by code: `render.yaml` and `apps/web/vercel.json` describe the setup, and you click through the dashboards below.

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
   - Key id (starts with `rzp_test_`) is `RAZORPAY_KEY_ID`. The web app opens Checkout with the key the fee order returns, so it always matches the server, and the web needs no Razorpay variable.
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

> `render.yaml` no longer contains staging (see the top of this file). The Blueprint steps below show how staging was set up and which settings it has. To recreate it, create the web service and the Postgres database by hand in the dashboard with the same settings.

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

**Migration 0011 (indexes).** It creates five indexes on `deals` (composite and partial, SPEC 15) and then drops the three single-column ones they replace. It only builds indexes, so it is safe to run while the app serves; on a large table it takes seconds.

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
   | `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | `true`                               |

6. Click **Deploy**. Then in **Settings > General**, set **Node.js Version** to `22.x`. In **Settings > Git**, check that **Production Branch** is `main`.
7. **Settings > Domains > Add Domain:** `staging.valueskins.com`. Vercel shows a CNAME value for this project. Copy it for section 10.

Variables starting `NEXT_PUBLIC_` are baked in at build time. The web project also takes an optional `NEXT_PUBLIC_SENTRY_DSN` (section 12a). After changing one, redeploy (**Deployments > ... > Redeploy**).

Pull request preview deployments on their own `*.vercel.app` address are build checks only: that address is not `WEB_ORIGIN`, the session cookie is set for `.valueskins.com`, and the Instagram callback sends you back to `WEB_ORIGIN`, so sign-in cannot work there. This is decided, not a gap: sign-in is tested on `staging.valueskins.com` only. To try a web branch with sign-in, serve it there for a while (section 9a).

"Sign in with email" on the home page follows the API's `GET /api/config` (`authEmailEnabled`, from Render's `AUTH_EMAIL_ENABLED`). There is no web variable for it. The project needs only the two variables above: delete any other `NEXT_PUBLIC_` variable it still has in **Settings > Environment Variables**.

## 9a. Checking a web branch on staging

Use this to check a web branch with real sign-in before it is merged. It is the only way to test sign-in on a branch: `*.vercel.app` previews cannot sign in (section 9). While it runs, `staging.valueskins.com` serves the branch instead of `main`. Nothing changes on Render or Meta.

1. In Vercel, project `valueskins-staging-web`, **Settings > Environment Variables**: make sure the two variables in step 5 above also exist for the **Preview** environment, with the same values. You can limit them to the branch (Vercel lets you scope a Preview variable to one Git branch). Then redeploy the branch's latest preview, because `NEXT_PUBLIC_` values are baked in at build time.
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

## 12a. Sentry (optional, errors only)

Sentry is off until you give it a DSN. It receives errors only: no performance data, no replays, no sessions. Before an event leaves, the user and IP, request headers, cookies, bodies and query strings, breadcrumbs, stack variables, emails, UPI IDs, bank-account-shaped numbers, PAN, IFSC and tokens are removed (`packages/shared/src/scrub.ts`; the same scrubber cleans the logs).

1. In Sentry, create two projects: **Node.js** (the API) and **Next.js** (the web app). A DSN is a public ingest URL, not a secret; copy each.
2. Render > the API service > **Environment**: `SENTRY_DSN` = the Node project's DSN. Save (it redeploys).
3. Vercel > the web project > **Settings > Environment Variables**: `NEXT_PUBLIC_SENTRY_DSN` = the Next.js project's DSN. Redeploy the project (the value is baked in at build time).
4. Check the API. In the Render **Shell**:

   ```bash
   pnpm --filter @valueskins/api exec node -e "import('./dist/observability/sentry.js').then(async (m) => { m.initSentry(process.env.SENTRY_DSN, 'staging'); m.captureError(new Error('Sentry test from DEPLOYMENT 12a'), 'manual test'); await m.flushSentry(); console.log('sent'); })"
   ```

   It prints `sent`, and the error appears in the Node project within a minute.

5. Check the web app. Open `https://staging.valueskins.com`, the browser's developer tools, **Console**, and run `setTimeout(() => { throw new Error('Sentry web test') })`. The error appears in the Next.js project, and the console shows no "Content Security Policy" error.
6. Open one of the events. It must show no email address, UPI ID, cookie, user or IP. If it does, turn Sentry off (blank both variables) and tell engineering.

To turn it off: blank `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` and redeploy. See `docs/RUNBOOK.md` for what to do with the errors.

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
11. **A full deal on the screens, in two browsers (the web done check).** Use two browsers, or one normal window and one private window, so the brand and the creator are signed in at the same time. Keep both open side by side: every step below should appear in the other window within a second or two, without a reload, with a short note at the top right.
    1. **Brand: post.** Sign in as a Business account (or dev login as a brand with billing details). **Post a deal**: a title, **Insert template**, a budget (commas appear as you type, and the breakdown shows from ₹5,000.00), and three dates from the calendars. Leave the page and come back: "You have changes saved on this device" offers them back. **Publish**, read the confirm, **Publish**. The deal page opens on "Confirm one creator".
    2. **Creator: apply.** Sign in as a Creator account with a UPI ID saved. **Deals** shows "1 new deal" at the top; press it. Open the deal, **Apply**, confirm. The button turns to Applied, and **Applications** lists it.
    3. **Brand: confirm.** The applicant appears without a reload. **Confirm**, read the amounts, confirm. The creator's page shows "Waiting for ... to pay the ValueSkins fee".
    4. **Brand: the fee.** **Pay ValueSkins fee: ₹885.00** opens Razorpay Checkout (test mode). Close it once: "Checkout closed. Nothing was charged." Then pay with a test card or test UPI ID from Razorpay's test-payment page. The page shows "Fee paid" and moves on; the tax invoice appears under Documents.
    5. **Brand: the advance by UPI.** The panel shows the creator's full UPI ID and name, **Pay with UPI app** and a QR code. On a phone, scan the code or open the link: the UPI app must show the creator's name and exactly the advance. **You do not need to send money**: close the app, enter any reference of 6 to 40 characters, **I have paid**.
    6. **Creator: confirm.** "The brand says it paid ... to cr•••@...". Press **Not received** once, with a reason: the brand sees the reason and the struck-through record, and records again. Then **I received it**: both pages move to Advance confirmed.
    7. **Creator: share.** A non-Drive link is refused ("Must be a Google Drive link"). Share a Google Drive link.
    8. **Brand: review.** **Suggest changes**, write what should change, send. The creator sees the feedback, shares a new link, and the brand **Approve**s (the confirm names the final amount).
    9. **The final.** The brand pays and records the final the same way; the creator confirms. Both pages show "This deal is complete", the four documents, and **Download deal record**.
    10. **On a phone width** (390 px) the pages fit without sideways scrolling, the sections fold, and the steps show as "Step 4 of 9".

11a. **The same deal through the API (curl, optional).** Useful when a screen misbehaves, to tell a web problem from an API one. You need `curl` and `jq`, two email addresses you can read (one brand, one creator), and a Render **Shell** for the payout fallback. Each person gets a cookie file, so run everything in one terminal session:

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

    1. **Fee.** Signed in as the brand in a browser, open `https://staging.valueskins.com/deals/<DEAL>`. Click **Pay ValueSkins fee: ...**, pay in Checkout. Expected: the page says "Fee paid", the deal moves to `COMMISSION_PAID`, and the brand and creator get an email. If the page shows an error, `q "select * from webhook_events order by received_at desc limit 5"` shows what Razorpay sent and any error.
    2. **Advance: pay the creator by UPI, record it, the creator confirms.** The advance is not paid through Razorpay. The brand pays the creator's UPI ID itself, and the creator confirms the money arrived; that confirmation is what moves the deal. With the deal in `COMMISSION_PAID`:

       ```bash
       call GET /deals/$DEAL/direct-payment brand.jar          # the amount, the creator's name and UPI ID, upiUri, "blocked" if not payable
       call POST /deals/$DEAL/direct-payment brand.jar '{"stage":"ADVANCE","reference":"TEST12345678"}'   # records it; the deal does not move; email 17 to the creator
       call GET /deals/$DEAL creator.jar                       # directPayments[0].id, status AWAITING_CONFIRMATION, action CONFIRM_PAYMENT_RECEIVED
       DP=PASTE-THE-RECORD-ID
       call POST /direct-payments/$DP/confirm creator.jar '{}' # ADVANCE_PAID, email 5 to both with the payment record PDF
       ```

       To try the other path first, say it did not arrive: `call POST /direct-payments/$DP/not-received creator.jar '{"reason":"Nothing arrived"}'` (emails 18 and an admin alert; the deal stays in `COMMISSION_PAID`), then record again with another reference.

    3. **Check the UPI link and QR code on a phone.** Open `https://staging.valueskins.com/deals/<DEAL>` as the brand while the advance is due. It shows the payee name, the UPI ID, the amount, **Pay with UPI app** and a QR code. Scan the QR code, or open the link on a phone with a UPI app: the app must show the creator's name on the account and exactly the advance amount. **You do not need to send the money**: close the app, then record any reference (6 to 40 characters) and confirm as the creator.
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

13. **Disputes and the admin screens.** In the browser, signed in with the Instagram account listed in `ADMIN_INSTAGRAM_USER_IDS` (section 14), `https://staging.valueskins.com` opens on `/admin/deals`, with the "Admin" tag. Check, in order:

    - **Deals:** pick a status, and type the first letters of a deal's short id (any case). Previous and Next page through the list. An unknown id says "No deals start with ...".
    - **A deal:** open one from step 11 or 12. Fee payment shows the Razorpay ids and the tax invoice number; UPI records show every record, masked; Emails lists each email with its address. Press **Resend** on one: a note says "Email sent again", and the email arrives again.
    - **A dispute:** as the brand or the creator of that deal, press **Raise a dispute** on its deal page. As the admin, **Disputes** shows it under Open. Open it, write a resolution, **Mark resolved**: both sides get email 15b, the dispute moves to Resolved, and the deal does not change.
    - **Cancel:** on a deal between Fee paid and Approved, **Cancel deal** asks for a note and an optional refund reference, then both sides get email 11. On any other deal the button is disabled with the reason.
    - **Not an admin:** sign in as a brand or a creator, or sign out, and open `/admin/deals`: the 404 page.

    The same checks with curl, for when the screens are not deployed. Needs a deal from step 12 (any status from `COMMISSION_PAID`), and your admin session: sign in at `https://staging.valueskins.com` with the Instagram account listed in `ADMIN_INSTAGRAM_USER_IDS` (section 14), then copy the value of the `vs_session_staging` cookie from the browser's developer tools (Application > Cookies). Admin accounts are Instagram accounts: an email-only account is never an admin. Every admin route answers 404 to anyone else, so a 404 on the first call means the cookie or the admin id is wrong.

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

Copy your `instagram_user_id`, then Render > service > **Environment**, set `ADMIN_INSTAGRAM_USER_IDS` to it (comma-separated for several), and save. The service redeploys. Sign in again to pick up `is_admin`: you land on `/admin/deals`, with the "Admin" tag.

To check the admin screens without your Instagram account (locally, or on staging where dev login is on), tick **Admin** on `/dev/login` with a new username. It works only when the user is created and never in production (section 6.2 of the SPEC). You can still open your own brand or creator pages by their address, and their user menu links back to Admin.

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

**API (Render).** Service > **Events** (or **Deploys**) > pick the last good deploy > **Rollback**. Database migrations are not undone by a rollback. Write migrations so the previous code still works after them (add columns before using them; remove them in a later change). **Production's API refuses to start when the database has a migration the code does not know** (section 21.4), so a rollback to a deploy older than the last applied migration cannot start: fix forward with a new deploy, or restore the database (`docs/RUNBOOK.md` section 7). If a migration itself is bad: the pre-deploy command fails, the deploy fails, and the old version keeps serving. Fix forward with a new migration. The free staging database has no backups, so there is no restore; staging data is disposable, so recreate and reseed (section 17).

**Web (Vercel).** Project > **Deployments** > open the last good Production deployment > the menu > **Instant Rollback** (or **Promote to Production**).

**Switch features off without code.**

- Email sign-in: Render `AUTH_EMAIL_ENABLED=false` (production must always have it `false`: the API refuses to start otherwise). The web hides "Sign in with email" within five minutes of the next page load (`GET /api/config` is never cached by the browser or a proxy, and the web keeps what it fetched for five minutes); no web redeploy is needed.
- Posting deals: `DEAL_POSTING_MODE=off` (or `admins`), then restart the service. Publishing answers `403 POSTING_NOT_OPEN` and drafts keep working. Deals already published are not touched.
- Fee payments: `PAYMENTS_MODE=off` (or `admins`), then restart. The fee order endpoint answers `503 PAYMENTS_NOT_OPEN`. With `off` the Razorpay webhook also answers 404, so switch to `off` only when no fee order is open; use `admins` to close payments to everyone else while keeping the webhook working.
- Dev login: Render `ENABLE_DEV_LOGIN=false`; Vercel `NEXT_PUBLIC_ENABLE_DEV_LOGIN=false` and redeploy.

**Undo a merge.** Revert the pull request on GitHub; Render and Vercel deploy `main` again.

## 16a. Opening payments and posting

Production starts closed: with `PAYMENTS_MODE` and `DEAL_POSTING_MODE` unset, both are `off`. Nothing needs setting for the first launch. Each takes `off`, `admins` (only users in `ADMIN_INSTAGRAM_USER_IDS`) or `on`, and takes effect when the API restarts. No deploy is needed.

| Environment  | `PAYMENTS_MODE`                       | `DEAL_POSTING_MODE`   |
| ------------ | ------------------------------------- | --------------------- |
| Local and CI | unset, which is `on`                  | unset, which is `on`  |
| Staging      | `on` (`render.yaml`)                  | `on` (`render.yaml`)  |
| Production   | unset, which is `off`, until you open | unset, until you open |

**Step 0, before anything below: move to paid hosting (section 21.9).** Production starts on free hosting, which sleeps and cannot run payments or reminders. The API refuses to start with `PAYMENTS_MODE` or `DEAL_POSTING_MODE` other than `off` unless `HOSTING_TIER=paid`, and `HOSTING_TIER=paid` must only be set after the move is done.

While payments are `off` in production, the Razorpay variables can be left out. To open payments:

1. In the production service set `RAZORPAY_KEY_ID` (a `rzp_live_` key), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `COMPANY_GSTIN`. The API refuses to start in production with `PAYMENTS_MODE` other than `off` if any is missing, or if the key is a test key.
2. Register the live webhook in Razorpay (section 12, with the production URL and the live secret).
3. Set `PAYMENTS_MODE=admins` and restart. Sign in as an admin (an admin added to `ADMIN_INSTAGRAM_USER_IDS` must sign in again) and run one small real deal.
4. Set `PAYMENTS_MODE=on` and restart.

To open posting, set `DEAL_POSTING_MODE=admins`, check with an admin, then `on`, and restart each time. Until it is `on`, brands see a banner and the Publish button says why it is off.

Then tell people. In the Render Shell (available once the service is on a paid instance type), run each command without `--send` first (it prints counts and sends nothing), then with it:

```bash
pnpm --filter @valueskins/api run notify:launch:deploy -- --audience brands
pnpm --filter @valueskins/api run notify:launch:deploy -- --audience brands --send
pnpm --filter @valueskins/api run notify:launch:deploy -- --audience creators
pnpm --filter @valueskins/api run notify:launch:deploy -- --audience creators --send
```

It emails each onboarded account with a verified email once. Every send is recorded in `email_log`, so running it again sends nothing new, and a send that failed is tried again. It prints counts, never addresses. Do this after posting is `on`. There is no email for payments opening: the "We will email you when they do" text on the fee button is not backed by a script yet.

## 17. The free Postgres expires after 30 days

Render's free Postgres expires 30 days after creation, with a 14-day grace period before deletion, and has no backups. Put a reminder in your calendar for day 25.

- To keep the data: Render > `valueskins-staging-db` > upgrade to a paid plan.
- To start fresh: delete the database in the dashboard, then in the Blueprint choose **Manual Sync** so it is recreated. The service gets the new connection string, the pre-deploy command runs the migrations, then reseed (section 14). Everyone signs in again.

Only one free Postgres can be active per Render workspace.

## 18. Reference: environment variables

### Render, API service `valueskins-api-staging`

These are staging's settings. Rows that say `render.yaml` mean the earlier file that created staging: staging is now managed by hand (see the top of this file), so change a value in the Render dashboard.

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
| `ENABLE_DEV_LOGIN`         | `true`                                                           | `render.yaml`; the variable is required, and must be `false` in production (section 21)                                                |
| `COMPANY_LEGAL_NAME`       | `Valueskins Private Limited`                                     | `render.yaml`                                                                                                                          |
| `COMPANY_ADDRESS`          | prompted                                                         | you                                                                                                                                    |
| `COMPANY_STATE`            | prompted                                                         | you                                                                                                                                    |
| `COMPANY_GSTIN`            | prompted                                                         | your GSTIN; required while `GST_RATE_BPS` is above 0, which is the default                                                             |
| `COMMISSION_SAC_CODE`      | prompted                                                         | your CA (SPEC 21)                                                                                                                      |
| `AUTH_EMAIL_ENABLED`       | `true`                                                           | `render.yaml`; staging and tests only, the API refuses `true` when `NODE_ENV=production`                                               |
| `GST_RATE_BPS`             | `1800`                                                           | `render.yaml`; optional, defaults to 1800 (18%). The fee is a flat ₹750 plus this GST                                                  |
| `PAYMENTS_MODE`            | `on`                                                             | `render.yaml`; `off`, `admins` or `on`. Unset means `off` in production and `on` elsewhere (section 16a)                               |
| `DEAL_POSTING_MODE`        | `on`                                                             | `render.yaml`; `off`, `admins` or `on`. Unset means `off` in production and `on` elsewhere (section 16a)                               |
| `HOSTING_TIER`             | unset, which is `free`                                           | Optional. `free` or `paid`. A startup guard uses it only in production (section 21.2); staging ignores it                              |
| `SENTRY_DSN`               | optional, blank turns it off                                     | Sentry project settings (RUNBOOK). Errors only; personal data is removed before sending                                                |
| `LOG_LEVEL`                | optional, default `info`                                         | set `debug` only while debugging                                                                                                       |

**Razorpay keys.** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` may be left out while `PAYMENTS_MODE=off`. When a key id is set it must match the environment (`rzp_test_` outside production, `rzp_live_` in production).

**`SUPPORT_EMAIL` in every environment.** The API refuses to start without it, and no code or example file supplies a value. The value is `founder@valueskins.com` on staging (set by hand in the dashboard) and in production (set in `render.yaml`). Create that mailbox before the deploy: it becomes the reply-to, the footer line of every email and the address in error messages, and `DISPUTE_EMAIL` follows it unless you set one. Local development and CI use a test value of your own in `apps/api/.env`.

### Vercel, project `valueskins-staging-web`

| Variable                       | Staging value                        | Where it comes from                                                                  |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`          | `https://api-staging.valueskins.com` | fixed                                                                                |
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
- **Jobs run inside the API process.** Render keeps one instance, so they run once; a second instance is safe (the lock) but does nothing extra. A job that fails is logged, not emailed (SPEC 14). Reminder emails carry no link to the deal, because the temporary pages are replaced soon.
- **Live updates run in the API process.** Socket.io is attached to the API's HTTP server (SPEC 10), so there is one instance and nothing extra to configure; the web app must connect with credentials to the API origin, and its CSP allows the API origin over `https` and `wss` (see the CSP note below). A second Render instance would need the Redis adapter and sticky sessions first. The web app connects once signed in and onboarded, and re-reads over REST on every event, on reconnect and on window focus.
- **Resume shows deal amounts.** `GET /api/users/:id/resume` returns the budget of each completed deal, as SPEC 11 says. Whether showing amounts publicly is intended is still SPEC open decision 5.
- **Terms, Privacy, Refunds and How it works** are rendered from `apps/web/content/*.md`. The text is adapted from the live site and waits for the final wording; passages about things the app does not do yet are marked (see `apps/web/content/README.md`).
- **Free database** has no backups and expires (section 17).
- **OAuth state cookie** `vs_ig_oauth_state` has the same name in every environment, and staging and production will share the cookie domain `.valueskins.com`. Complete one sign-in at a time when testing both.
- **Meta review** can require Business Verification; check the App Review requirements in the Meta dashboard.
- **Dependency advisories.** CI blocks on `pnpm audit --prod --audit-level critical` and reports the rest. The remaining advisories are in test and build tooling that never runs in production (vitest, vite, esbuild, Tailwind 3's `braces`) and are listed in `docs/RUNBOOK.md`.
- **Content Security Policy.** The web app sends a CSP with a fresh nonce on every page (`apps/web/lib/csp.ts`, SPEC 18). Nothing to set: it reads `NEXT_PUBLIC_API_URL` for the API's `https` and `wss` origins. Its only third parties are Razorpay Checkout and, when `NEXT_PUBLIC_SENTRY_DSN` is set, the one host in that DSN (nothing for Sentry while it is unset), plus Instagram's image CDNs for profile pictures. Razorpay does not publish a CSP list; the Razorpay hosts were found by opening Checkout with the policy in place. Because of the nonce, every page renders on request instead of being cached as a static file.
  - **Check it on staging** (with section 9a, or after a merge): open `https://staging.valueskins.com`, then the browser's developer tools, **Console**. Pages show no "Content Security Policy" errors. Then run the fee step of section 13 step 11 (Razorpay test card): Checkout opens, the payment goes through, and the console still shows no CSP error. If Checkout is blocked, the error names the host and directive: add that host to `RAZORPAY` in `apps/web/lib/csp.ts` in a web fix.
  - **Sentry** is in (section 12a). The policy allows exactly the host of `NEXT_PUBLIC_SENTRY_DSN`. If you change the Sentry project or region, change the DSN and redeploy the web project; the policy follows. A browser console error naming a `sentry.io` host means the DSN and the deployed build disagree.

## 20. Troubleshooting

| Symptom                                                                                    | Likely cause and fix                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram says "Invalid redirect_uri"                                                      | The URI in Meta must equal `INSTAGRAM_REDIRECT_URI` character for character (https, no trailing slash).                                                                                                                       |
| After Instagram you land on `/login?error=state_invalid`                                   | The sign-in took more than 5 minutes, was opened in a different browser, or cookies are blocked. Start again from the home page.                                                                                              |
| `/login?error=account_type_unsupported`                                                    | The Instagram account is not a Business or Creator account (a personal account, or Meta sent no account type). Switch it to a Professional Business or Creator account in Instagram settings.                                 |
| `/login?error=account_type_change_blocked`                                                 | The account's Instagram type changed (Business to Creator or back), but it already has deals or applications in its old role. Write to `SUPPORT_EMAIL`; the account type is not changed automatically once there is activity. |
| `409 PROFILE_LOCKED`                                                                       | The profile is saved once. To correct it, update the row by hand (Render Shell: set the fields and, to let the user save again, `profile_locked_at = null`).                                                                  |
| Render deploy fails with `COMPANY_GSTIN is required when GST_RATE_BPS is above 0`          | GST is charged by default. Set `COMPANY_GSTIN` in Render, or set `GST_RATE_BPS=0` on a test service that should not charge GST.                                                                                               |
| Sign-in works but `/me` says you are signed out                                            | `COOKIE_DOMAIN` must be `.valueskins.com`, and both hosts must be under `valueskins.com`. Check the cookie in the browser developer tools.                                                                                    |
| API returns `403 ORIGIN_MISMATCH`                                                          | `WEB_ORIGIN` must equal the web address exactly, with no trailing slash.                                                                                                                                                      |
| "Sign in with email" button missing                                                        | `AUTH_EMAIL_ENABLED` is not `true` on Render. The web reads it from `GET /api/config`, kept by the web for five minutes.                                                                                                      |
| Email routes return 404                                                                    | `AUTH_EMAIL_ENABLED` is not `true` on Render.                                                                                                                                                                                 |
| Emails do not arrive                                                                       | The Resend domain is not verified, or the key is wrong. Look for FAILED rows in `email_log` (Shell, then `psql`-style query as in section 14).                                                                                |
| Production fails to start with `is required when PAYMENTS_MODE is not "off" in production` | `PAYMENTS_MODE` is `admins` or `on` but a live Razorpay value or `COMPANY_GSTIN` is missing. Set it, or set `PAYMENTS_MODE=off` (section 16a).                                                                                |
| Publish answers `403 POSTING_NOT_OPEN` or the fee answers `503 PAYMENTS_NOT_OPEN`          | `DEAL_POSTING_MODE` or `PAYMENTS_MODE` is closed for that user. In `admins` mode an admin who was added recently must sign in again. Change the variable and restart (section 16a).                                           |
| Render deploy fails with `Invalid environment`                                             | A required variable is missing or wrong; the log names it.                                                                                                                                                                    |
| Render build fails on `--frozen-lockfile`                                                  | `pnpm-lock.yaml` is out of date. Run `pnpm install` locally and commit the lockfile.                                                                                                                                          |
| Vercel build fails mentioning `NEXT_PUBLIC_ENABLE_DEV_LOGIN`                               | The guard stopped a build that has dev login on and the production API URL. Set the flag to false for that project.                                                                                                           |
| Everyone gets `429`                                                                        | See the client IP limitation in section 19.                                                                                                                                                                                   |
| Webhook deliveries show `400`                                                              | `RAZORPAY_WEBHOOK_SECRET` on Render differs from the secret in the Razorpay webhook form.                                                                                                                                     |
| `/dev/login` is a 404                                                                      | `NEXT_PUBLIC_ENABLE_DEV_LOGIN` is not `true` for that build. Set it and redeploy.                                                                                                                                             |
| The console shows "Refused to ... because it violates the Content Security Policy"         | A host the page needs is not in `apps/web/lib/csp.ts`. The message names the host and the directive. For Razorpay, add it to `RAZORPAY`; for the API, check `NEXT_PUBLIC_API_URL` on Vercel.                                  |
| `/admin/deals` is a 404 for your admin account                                             | Your Instagram user id is not in `ADMIN_INSTAGRAM_USER_IDS`, or you have not signed in again since it was set (section 14).                                                                                                   |

## 21. Production

Production is `valueskins.com` (web) and `api.valueskins.com` (API). It goes live **closed and free**:

- `PAYMENTS_MODE=off` and `DEAL_POSTING_MODE=off`, with no Razorpay variable set, because the company bank account and the live Razorpay account are not ready. Brands can set up a profile and billing and save drafts; Publish and the fee show a reason.
- **Free hosting** until payments open: the API on Render's free instance type, and the database on Neon's free plan. Section 21.8 says what that means, and section 21.9 is the move to paid, which must happen before either launch gate leaves `off`.
- No data is imported from the live app.

This section holds every setting and who provides it. The order of the switch, the checks and the rollback are in `docs/CUTOVER.md`. Nothing here is done by code: `render.yaml` describes the Render side, and you click through the dashboards.

### 21.1 What you are building

| Piece           | URL                                  | Where it runs                                                                | Deploys from                                     |
| --------------- | ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Web (Next.js)   | `https://valueskins.com`             | Vercel, a new project (for example `valueskins-web`)                         | `main`, root directory `apps/web`, on each merge |
| API (Express)   | `https://api.valueskins.com`         | Render web service `valueskins-api`, **free instance type**, Singapore       | `main`, **by hand** (Manual Deploy)              |
| Database        | internal to the API                  | **Neon**, a Free plan project: Postgres 16, Singapore, **direct** connection | migrations **by hand** (section 21.4)            |
| Email           | from `notifications@valueskins.com`  | Resend                                                                       | -                                                |
| Payments        | not connected                        | no Razorpay variable is set until payments open (section 16a)                | -                                                |
| Instagram login | everyone with a Professional account | the same Meta app the live app uses, in Live mode                            | -                                                |
| Errors          | -                                    | Sentry, two production projects (Node.js and Next.js)                        | -                                                |

Cookies: the web app and the API are both under `valueskins.com`, so the session cookie (`vs_session`, domain `.valueskins.com`, Secure, SameSite=Lax) is sent between them.

**Who is who.** The names are the roles used in `docs/CUTOVER.md`: **Engineer** (maintains this repo and runs Render and Neon), **Saketh** (maintains the live app and, if it is his, the Meta app), **Founders** (decide, and hold the company records and the support mailbox), **DNS owner** (the Cloudflare account for `valueskins.com`), and **the CA** (the company's chartered accountant, for tax details).

### 21.2 Every value, where it comes from, and who provides it

**Render, API service `valueskins-api`.** A value marked "file" is written in `render.yaml` and is reset to that value by every Blueprint sync, so never change it by hand. A value marked "prompted" is `sync: false`: Render asks for it once, when the Blueprint is applied, and the dashboard owns it afterwards.

| Variable                   | Value                                                            | Where it comes from                                                                                                                                                                          | Who provides it                                    |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `NODE_VERSION`             | `22` (file)                                                      | `render.yaml`                                                                                                                                                                                | Engineer                                           |
| `NODE_ENV`                 | `production` (file)                                              | `render.yaml`. Turns on the production startup guards                                                                                                                                        | Engineer                                           |
| `DATABASE_URL`             | prompted: Neon's **direct** connection string                    | Neon console, **Connect**, with "Connection pooling" **off** (section 21.3). The host has no `-pooler` in it and the string ends in `?sslmode=require`. The API refuses to start otherwise   | Engineer (the Neon account holder)                 |
| `HOSTING_TIER`             | prompted: `free`                                                 | SPEC 19. `free` or `paid`. While it is not `paid`, a startup guard refuses any launch gate other than `off`. Set to `paid` only after section 21.9                                           | Engineer; Founders decide when                     |
| `WEB_ORIGIN`               | prompted: `https://next.valueskins.com`                          | The address people use for the web app, no trailing slash. It is the temporary check address until `docs/CUTOVER.md` step C2, then `https://valueskins.com`                                  | Engineer                                           |
| `COOKIE_DOMAIN`            | `.valueskins.com` (file)                                         | SPEC 19                                                                                                                                                                                      | Engineer                                           |
| `SESSION_COOKIE_NAME`      | `vs_session` (file)                                              | SPEC 19                                                                                                                                                                                      | Engineer                                           |
| `SESSION_SECRET`           | generated                                                        | Render generates it on the first apply                                                                                                                                                       | Render, automatic                                  |
| `TOKEN_ENCRYPTION_KEY`     | generated                                                        | Render generates it. Changing it later makes stored Instagram tokens unreadable, so everyone signs in again                                                                                  | Render, automatic                                  |
| `INSTAGRAM_APP_ID`         | prompted                                                         | Meta app: **Instagram > API setup with Instagram login > Business login settings** (section 5 step 3). This is not the Meta app id                                                           | Meta app owner (Saketh if it is his)               |
| `INSTAGRAM_APP_SECRET`     | prompted                                                         | The same page, **Show**                                                                                                                                                                      | Meta app owner                                     |
| `INSTAGRAM_REDIRECT_URI`   | `https://api.valueskins.com/api/auth/instagram/callback` (file)  | `render.yaml`. It must match the redirect URI added in Meta exactly (21.7)                                                                                                                   | Engineer writes it, Meta app owner adds it in Meta |
| `META_APP_SECRET`          | prompted                                                         | Meta app: **App settings > Basic > App secret**. The API accepts a signed request made with this or the Instagram app secret, so set both                                                    | Meta app owner                                     |
| `RESEND_API_KEY`           | prompted                                                         | Resend: **API Keys > Create API Key**, "Sending access", domain `valueskins.com` (section 7). Shown once                                                                                     | Engineer (the Resend account holder)               |
| `EMAIL_FROM`               | `ValueSkins <notifications@valueskins.com>` (file)               | The Resend sending domain                                                                                                                                                                    | Engineer                                           |
| `EMAIL_TRANSPORT`          | `resend` (file)                                                  | The API refuses `console` in production                                                                                                                                                      | Engineer                                           |
| `ADMIN_INSTAGRAM_USER_IDS` | prompted: `none` at first, then the admins' ids, comma-separated | Each admin's `instagram_user_id`, read from the database after they sign in once (section 14, run from your own machine: section 21.4). An admin signs in again to pick it up                | Engineer reads it, the admin signs in              |
| `SUPPORT_EMAIL`            | `founder@valueskins.com` (file)                                  | The mailbox users write to. It is the reply-to and the footer of every email. `DISPUTE_EMAIL` follows it                                                                                     | Founders (the mailbox must exist and receive mail) |
| `ENABLE_DEV_LOGIN`         | `false` (file)                                                   | The variable is required; the API refuses `true` in production                                                                                                                               | Engineer                                           |
| `AUTH_EMAIL_ENABLED`       | `false` (file)                                                   | The API refuses `true` in production. Sign-in is Instagram only                                                                                                                              | Engineer                                           |
| `SENTRY_DSN`               | prompted                                                         | Sentry: the Node.js project's DSN (section 12a). Blank turns Sentry off                                                                                                                      | Engineer                                           |
| `COMPANY_LEGAL_NAME`       | `Valueskins Private Limited` (file)                              | Printed on the fee invoice                                                                                                                                                                   | Founders                                           |
| `COMPANY_ADDRESS`          | prompted                                                         | The registered address, as it must appear on the invoice                                                                                                                                     | Saketh or the Founders, from the company records   |
| `COMPANY_STATE`            | prompted                                                         | The state of registration, for example `Karnataka`. It decides CGST and SGST or IGST on the invoice (SPEC 7.4)                                                                               | Saketh or the Founders                             |
| `COMPANY_GSTIN`            | prompted                                                         | The GST registration certificate. It is also on the live site's legal pages. **Needed now:** `GST_RATE_BPS` is above 0, and the API refuses to start without it, even while payments are off | Saketh or the Founders                             |
| `COMMISSION_SAC_CODE`      | prompted                                                         | The code the CA confirms for the fee (SPEC 21)                                                                                                                                               | The CA, through a Founder                          |
| `GST_RATE_BPS`             | `1800` (file)                                                    | REPLACEMENT_PLAN 2.2: a flat ₹750.00 plus 18% GST                                                                                                                                            | Engineer                                           |
| `PAYMENTS_MODE`            | prompted: `off`                                                  | SPEC 19. Closes the ValueSkins fee. Changing it needs a restart, not a deploy (section 16a)                                                                                                  | Founders decide, Engineer sets it                  |
| `DEAL_POSTING_MODE`        | prompted: `off`                                                  | SPEC 19. Closes publishing. Same                                                                                                                                                             | Founders decide, Engineer sets it                  |

**Left out on purpose.**

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. They are optional while `PAYMENTS_MODE=off`, and there are no live keys yet. When payments open you add all three in the dashboard (section 16a); the API refuses to start with payments on and any of them missing, or with a test key.
- `DISPUTE_EMAIL`: it follows `SUPPORT_EMAIL`. `TEST_DATABASE_URL`: tests only. `PORT`: Render sets it.
- There is no Render database: the database is on Neon, so `render.yaml` has no `databases:` section.

**Vercel, the production web project.**

| Variable                       | Value                        | Where it comes from                                                                                                                                              | Who provides it |
| ------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `NEXT_PUBLIC_API_URL`          | `https://api.valueskins.com` | The API address. It must be exactly this host: a build with this host is a production build (it hides the "Not in this version" notes) and refuses the dev login | Engineer        |
| `NEXT_PUBLIC_SENTRY_DSN`       | the Next.js project's DSN    | Sentry (section 12a). Blank turns Sentry off. Baked in at build time, so redeploy after changing it                                                              | Engineer        |
| `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | **not set**                  | Never on production. A build with it `true` and the production API address fails on purpose                                                                      | -               |

`apps/web/vercel.json` is shared by the staging and the production projects and holds only the framework and the install and build commands, so it has nothing specific to production. Everything else is project settings (21.6).

### 21.3 Neon: the production database

**Who:** Engineer, with a Founder if the Neon account belongs to the company.

1. Sign in at Neon (neon.com) with the company account and create a **project** on the **Free** plan. Name it `valueskins`.
2. **Postgres version: 16.** **Region: AWS Asia Pacific (Singapore)** (`aws-ap-southeast-1`), next to the Render API in Singapore. Leave the default branch (`main`) and database; if Neon lets you name the database, use `valueskins`.
3. Open the project dashboard and click **Connect** (look for a button with that name). Choose the branch, the database and the role, and **turn "Connection pooling" off**. Copy the connection string. It must have **both** of these:
   - a host **without** `-pooler` in its name (for example `ep-cool-darkness-123456.ap-southeast-1.aws.neon.tech`). A pooled string has `ep-...-pooler...` in the host: do not use it. The pooler runs PgBouncer in transaction mode, where session-level advisory locks do not work, and the scheduled jobs and the migrations depend on them. The API refuses to start with a pooled host.
   - `?sslmode=require` at the end. The API refuses to start in production without it. (This version of the `pg` driver treats `sslmode=require` as `verify-full`, so Neon's certificate is checked, and prints a warning about that when it starts. The warning is harmless. `sslmode=verify-full` also works and silences it.)
4. The string holds the password. Keep it in your password manager and paste it only into the Render prompt for `DATABASE_URL` and into the migration command (21.4). Never put it in a file, a chat, a ticket or the repo.
5. Neon's Free plan, from Neon's pages (checked 21 Oct 2026): 1 GB of storage per project, 100 compute-hours per project per month, the compute **scales to zero after 5 minutes without activity** (it cannot be turned off on Free), and the restore window is **6 hours**.

**Verify:** run the migration command in 21.4. It prints the database host, then what it applies, and fails with a reason if it cannot connect.

### 21.4 Running the migrations by hand

Free Render instances have no pre-deploy command, and the API never migrates on start or in the build. So you run the migrations yourself, from your own machine, **before the first deploy and before every deploy that adds a migration** (a new file in `apps/api/drizzle/`).

From the repo root, on the commit you are about to deploy:

```bash
git checkout main && git pull && pnpm install
read -rs DATABASE_URL && export DATABASE_URL && pnpm --filter @valueskins/api run db:migrate; unset DATABASE_URL
```

`read -rs` waits for you to paste Neon's direct connection string and press Enter. The string is not shown, is not kept in your shell history and is never written to a file. `unset` removes it afterwards. The command prints the database host (never the password), then `to apply: ...` or `no migrations to apply`, then `migrations applied`. It refuses a pooled host, and a remote host without `sslmode`. Never set `NODE_ENV=test` for it, and `pnpm db:seed` refuses production on its own.

**The startup check.** Every time the API starts, before it listens, it connects to the database and compares the migrations the database has applied with the migrations in the code. If they differ **in either direction**, it logs which ones and exits with code 1, so Render shows a failed start with the reason:

- **The code has migrations the database has not applied:** `The code has N migration(s) the database has not applied: 0012_x`. Run the command above, then deploy again.
- **The database has migrations the code does not know:** `The database has N migration(s) this code does not know (hash ..., applied ...)`. The code is older than the database, or a merged migration was edited. Deploy the newer code, or restore the database.
- **It cannot connect:** `Could not connect to the database at <host>. <reason>`. The reason comes from the error code (host not found, refused, timeout, wrong password, TLS). It never prints the connection string.

Two things follow from this:

- **Migrate, then deploy straight away.** Between the two, the old code is running against a newer database. It keeps running, but the free API sleeps, and a cold start is a start: if it wakes in that gap it fails the check and stays down until the new code is deployed.
- **No rollback past a migration** (section 21.10).

**Running queries and checks against production.** A free Render instance has **no Shell** (Render's documentation). For `docs/RUNBOOK.md`'s `q` helper, the admin id lookup of section 14 and the checks in `docs/CUTOVER.md`, run them from your own machine the same way: `read -rs DATABASE_URL && export DATABASE_URL`, define `q` from the RUNBOOK, run your `select`, then `unset DATABASE_URL`. Use `select` statements only.

### 21.5 Creating the Render service

Prerequisites: this `render.yaml` is on `main` (section 3), Neon is set up (21.3), the migrations have been run (21.4), and Resend and Sentry exist (21.7).

1. In Render, **New > Blueprint**, connect GitHub, pick `valueskins/getvalueskins`, branch `main`, and leave the Blueprint path as `render.yaml`. **This creates production only**: the file has no staging. The existing staging services are untouched.
2. Render lists the variables marked `sync: false` and asks for them. Enter:

   | Prompt                                     | Enter                                        |
   | ------------------------------------------ | -------------------------------------------- |
   | `DATABASE_URL`                             | Neon's direct connection string (21.3)       |
   | `HOSTING_TIER`                             | `free`                                       |
   | `WEB_ORIGIN`                               | `https://next.valueskins.com`                |
   | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | from the Meta app (21.2)                     |
   | `META_APP_SECRET`                          | from the Meta app                            |
   | `RESEND_API_KEY`                           | from Resend                                  |
   | `ADMIN_INSTAGRAM_USER_IDS`                 | `none`                                       |
   | `SENTRY_DSN`                               | the Node.js project's DSN, or leave it blank |
   | `COMPANY_ADDRESS`, `COMPANY_STATE`         | the company's address and state              |
   | `COMPANY_GSTIN`                            | the company GSTIN                            |
   | `COMMISSION_SAC_CODE`                      | the code the CA confirmed                    |
   | `PAYMENTS_MODE`                            | `off`                                        |
   | `DEAL_POSTING_MODE`                        | `off`                                        |

3. Apply. If Render rejects the free instance type in Singapore (its documentation does not say which instance types each region has), tell the Engineer: the choices are another Render region, with the Neon project created in the nearest AWS region, or a paid instance.
4. The API has **manual deploys**. If it did not build when you applied, open the service and use **Manual Deploy > Deploy latest commit**. The build installs, builds `packages/shared` and the API, and starts it. A free instance has no pre-deploy step, so nothing migrates here.
5. Open the service page and copy its default address, for example `https://valueskins-api.onrender.com`. `<that address>/api/health` must show `{"ok":true}`. The first request can take about a minute (section 21.8).
6. In the service's **Logs** look for two lines: `"hostingTier":"free"` with the two launch modes `off` and `razorpayMode` `none`, and `database reachable, migrations match the code`. A line starting `Invalid environment configuration` names a missing or wrong variable. `Startup guard failed` is a safety rule stopping the API on purpose (a pooled database host, no `sslmode`, a launch gate opened on the free tier, and so on). `Could not connect to the database` or `migration(s)` are the startup check (21.4).
7. **Settings > Custom Domains** should list `api.valueskins.com`. Click **Verify** once the DNS record exists (section 10 and `docs/CUTOVER.md` step A7).

### 21.6 The Vercel project

In Vercel, **Add New > Project**, import `valueskins/getvalueskins`, and follow section 9 with these differences:

- **Name:** for example `valueskins-web`. This is a new project: do not reuse the staging project or the live app's project.
- **Root Directory:** `apps/web`. Leave "Include source files outside of the Root Directory" enabled. Framework Preset Next.js. Leave the build and install commands alone (`apps/web/vercel.json` sets them). **Node.js Version** `22.x`. **Production Branch** `main`.
- **Environment Variables** (Production): `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SENTRY_DSN` from 21.2. Do not add `NEXT_PUBLIC_ENABLE_DEV_LOGIN`.
- **Domains:** first `next.valueskins.com`, for the checks. `valueskins.com` (primary) and `www.valueskins.com` (a permanent redirect to the apex) are added only at the switch (`docs/CUTOVER.md` step C3).

Unlike the API, the web project deploys on every merge to `main`. A web change that needs a new API endpoint must therefore not be merged before the API has been deployed to production by hand. If a merge breaks the web app, use **Deployments > Instant Rollback** (section 16).

On every first load of a page the web app calls `GET /api/health` once without waiting, so a sleeping API starts waking while the visitor reads, and the "Sign in with Instagram" button shows "Connecting..." while it waits for the answer (section 21.8).

### 21.7 Resend, Meta and Sentry

**Resend** (section 7). Add the domain `valueskins.com` and the records Resend shows, as **DNS only**. They are on their own names (`resend._domainkey` and `send`), so the apex mail (Zoho) is not touched. Create a "Sending access" key for the domain. Resend is called over HTTPS, so Render's block on the SMTP ports does not matter.

**Meta**: the same app the live app uses (`docs/REPLACEMENT_PLAN.md` section 1). The app must be in **Live** mode, or both founders must hold a role on it. These are the production values; the section 5 steps say where each field is.

| Field (Business login settings, or App settings > Basic) | Production value                                                              | When it changes (`docs/CUTOVER.md`)                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| OAuth redirect URIs                                      | add `https://api.valueskins.com/api/auth/instagram/callback`, keep the others | A8, before the checks. The old URI is removed after a week |
| Deauthorize callback URL                                 | `https://api.valueskins.com/api/meta/deauthorize`                             | C1, at the switch. It holds one URL, so note the old one   |
| Data deletion request URL                                | `https://api.valueskins.com/api/meta/data-deletion`                           | C1, at the switch. One URL, note the old one               |
| Privacy policy URL                                       | `https://valueskins.com/privacy`                                              | C4, after the web domain has moved                         |
| Terms of Service URL (if one is set)                     | `https://valueskins.com/terms`                                                | C4                                                         |

The live app's legal pages are at `/legal/privacy`, `/legal/terms` and `/legal/refund`. The new app uses `/privacy`, `/terms` and `/refunds` and has no redirect from the old paths.

**Sentry** (section 12a). Two production projects: Node.js for `SENTRY_DSN` and Next.js for `NEXT_PUBLIC_SENTRY_DSN`. There is no Shell on the free API, so step 4 of section 12a (the API test error) runs from your own machine, with the DSN in the command and `'production'` where it says `'staging'`. That checks the DSN and what is scrubbed, with the same code the API uses, but it is not sent from the running service.

**Razorpay**: nothing is created or changed for production now. The old app's webhook is left until the week after the switch (`docs/CUTOVER.md` section E).

### 21.8 What the free tier means

Until payments open, production runs on free instances. They are fine for a closed launch and not for taking money.

- **The API sleeps.** Render spins a free web service down after 15 minutes without traffic, and it takes about a minute to wake. Render shows browsers a loading page meanwhile. The first request after a quiet spell is slow. The web app softens this: it calls `GET /api/health` on every first page load without waiting, the Instagram button shows "Connecting..." while it waits for the answer, and after 60 seconds without one it says "We could not reach ValueSkins. Try again." with a "Try again" button.
- **Neon sleeps too.** Its compute scales to zero after 5 minutes without activity, and wakes on the next query, which takes a moment. `GET /api/health` runs a query, so one call wakes both.
- **Scheduled jobs run only while the API is awake.** The reminders and the Instagram token refresh are `node-cron` schedules inside the API process, with no catch-up: a job whose time passes while the service sleeps is skipped until its next time. Run one by hand with `docs/RUNBOOK.md` ("Running a job by hand") from a service that has a Shell, which the free instance does not. Nothing in this setup needs a job before deals exist.
- **Live updates drop.** The sockets close when the API sleeps and reconnect when it wakes.
- **Render may restart a free service at any time**, and counts 750 free instance hours per workspace per month across all free services.
- **No Shell** on a free instance (21.4), and **no pre-deploy command**.
- **Neon's restore window is 6 hours**, with no daily backups, and storage is capped at 1 GB. `docs/RUNBOOK.md` section 7 says how to restore. Before a migration, create a Neon branch from `main` in the console (a copy of the data as it is now), so there is something to go back to, and delete it afterwards.
- **A startup guard keeps the gates shut.** In production the API refuses to start with `PAYMENTS_MODE` or `DEAL_POSTING_MODE` other than `off` unless `HOSTING_TIER=paid`.

### 21.9 Moving to paid

Do all of this **before** `PAYMENTS_MODE` or `DEAL_POSTING_MODE` leave `off`, in this order. The guard checks only `HOSTING_TIER`: it does not check that the rest is done, so the Engineer ticks each item.

1. **Render: a paid instance type** for `valueskins-api` (look for **Settings > Instance Type**, for example `0.5c-512mb`, the plan staging uses). The service no longer sleeps, and now has a Shell. Change `plan: free` in `render.yaml` to the same plan in the same pull request as step 2, so the next Blueprint sync does not set it back.
2. **Restore the pre-deploy migration command.** In `render.yaml` add `preDeployCommand: pnpm --filter @valueskins/api run db:migrate:deploy` back under the service, and merge it. From then on Render migrates before each deploy, and the manual command in 21.4 is only a fallback. Update the section 21.4 and `docs/CUTOVER.md` text in the same pull request. (The startup check stays on.)
3. **A database with a longer restore window.** Either a paid Neon plan (look at Neon's pricing page for the plan and its restore window), or a paid Render Postgres database (Render keeps point-in-time recovery for 3 days on the Hobby workspace plan and 7 on Pro and above). If you leave Neon, move the data first (a dump and restore into the new database), run the migration check against it, and change `DATABASE_URL` in the dashboard. Keep the direct connection and TLS rules from 21.3.
4. **Set `HOSTING_TIER` to `paid`** in the dashboard, and restart.
5. **Practise the restore** once (`docs/RUNBOOK.md` section 7), and write down how long it took. SPEC 22 asks for it.
6. **Check that the jobs run:** `pnpm --filter @valueskins/api run job:deploy -- --list` in the new Shell, then one job by hand, then look for `job finished` in the logs.
7. **Then** section 16a: the live Razorpay values, `PAYMENTS_MODE=admins`, and the rest.

### 21.10 Deploying, rollback and backups

- **Deploying the API.** Merge to `main` as usual. Staging deploys by itself. When staging shows the change works: if the change adds a migration, run it first (21.4); then open Render > `valueskins-api` > **Manual Deploy > Deploy latest commit** straight away. Read the **Logs** until you see `database reachable, migrations match the code`.
- **Rolling back the API.** Render > service > **Events** > the last good deploy > **Rollback** (section 16). This works only while the database has no migration the older code does not know. If a migration has been applied since that deploy, the older code refuses to start (21.4): fix forward with a new deploy, or restore the database.
- **Rolling back the web.** Vercel > the project > **Deployments** > **Instant Rollback**.
- **Backups.** See 21.8: on Neon Free the restore window is 6 hours. On a paid plan it is longer (21.9).
- **Changing a value.** A `value:` entry in `render.yaml` changes by editing the file and merging. A prompted value changes in the dashboard under **Environment**, and the service restarts.

### 21.11 Opening payments and posting later

Section 21.9 first, then section 16a. These two gates are prompted variables on purpose, so no merge and no deploy is needed to change them.
