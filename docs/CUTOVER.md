# Cutover: from the live app to getvalueskins

The steps to switch `valueskins.com` from the live app (`valueskins/valueskins`) to this one, who does each step, and how to check it. It also covers the rollback. Nothing here is done by code: you click through the dashboards and run the commands shown.

What this cutover assumes:

- **No data is imported.** The live app's database holds only the two founders' test accounts: no deals, payments or invoices. Everyone signs in fresh with Instagram. Step C0 checks this again just before the switch.
- **Fee invoice numbering starts at `VS/2026-27/000001`** for the current financial year (April to March). The counter row is created by the first invoice, so there is nothing to seed. No fee is taken during the cutover, so this stays untouched until payments open.
- **Production starts with `PAYMENTS_MODE=off` and `DEAL_POSTING_MODE=off`.** Brands can set up their profile and billing and save drafts. Publishing and the fee are closed, with a reason on screen. Opening them later needs an env change and a restart, not a deploy (`docs/DEPLOYMENT.md` section 16a).
- **Staging has been run through `docs/DEPLOYMENT.md` section 13.** When this was written, `staging.valueskins.com` and `api-staging.valueskins.com` had no DNS records, so check this first. If staging was never set up, do sections 5 to 13 there before you start, because production would otherwise be the first real run of this code.

The production services are in `render.yaml` and every production setting is in `docs/DEPLOYMENT.md` section 21. This file is the order of the switch, the checks and the rollback.

The order: **A** prepare, **B** check production on a temporary hostname, **C** switch, **D** check again on the real hostname, **E** keep the old app for a week, **F** roll back if needed, **G** open payments later.

## 1. How things look today, and after

Checked from public DNS and HTTP on 16 Oct 2026. Check them again in step A1, because Cloudflare hides what sits behind a proxied record.

| Hostname                 | Today                                                                                | After the cutover                                                |
| ------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `valueskins.com`         | Cloudflare proxy in front of Vercel. Answers `308` to `https://www.valueskins.com/`. | The new web app. No redirect.                                    |
| `www.valueskins.com`     | DNS-only CNAME to `cname.vercel-dns.com`. This is where the live app is served.      | Redirects (`308`) to `https://valueskins.com/`.                  |
| `api.valueskins.com`     | No DNS record.                                                                       | The new API on Render. DNS only (grey cloud).                    |
| `next.valueskins.com`    | No DNS record.                                                                       | Used only for the checks before DNS moves. Removed after a week. |
| `old.valueskins.com`     | No DNS record.                                                                       | The old Vercel project, kept for a week as the rollback.         |
| Mail on `valueskins.com` | Zoho (MX and SPF). There are no Resend records (`resend._domainkey`, `send`).        | Unchanged, plus the Resend records on their own names.           |

The direction of the redirect flips: the live app sits on `www` and the apex redirects to it, and the new app sits on the apex and `www` redirects to it. The new API uses `WEB_ORIGIN=https://valueskins.com`.

**Why `next.valueskins.com`.** The live app still owns `valueskins.com` until the switch, so the production checks run on `next.valueskins.com`. The API sends the browser back to `WEB_ORIGIN` after Instagram sign-in and only accepts requests from that origin, so `WEB_ORIGIN` is `https://next.valueskins.com` for the checks and `https://valueskins.com` from step C2. The session cookie is set for `.valueskins.com`, so it works on both. The Instagram redirect URI is on the API host and never changes.

**Legal pages move.** The live app serves them at `/legal/privacy`, `/legal/terms` and `/legal/refund` (checked 16 Oct 2026; `/privacy` is a 404 there). The new app serves `/privacy`, `/terms` and `/refunds`, and has no redirect from the old paths. Anything that links to the old paths breaks at the switch: above all Meta's privacy policy URL, which step C4 updates. In step A1 also write down where else the old paths are used (the Razorpay dashboard, the Instagram profile, emails, other sites).

**What users see.** Everyone signs in again with Instagram. A Business account becomes a brand and a Creator account becomes a creator (`docs/REPLACEMENT_PLAN.md` 2.3). Until posting opens, brands see "Posting deals opens soon. You can set up your profile and billing, and save drafts." and creators see "Deals will appear here once brands start posting. Finish your profile and UPI ID so you can apply."

## 2. Who does what

| Role          | Who                                                     | Does                                                                                                                   |
| ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Engineer**  | Maintains `valueskins/getvalueskins`                    | Render, the production env, running the commands, reading logs, Sentry. Leads the cutover.                             |
| **Saketh**    | Maintains the live app (`valueskins/valueskins`)        | The old Vercel project, the old app's settings and database, the freeze, the Meta app settings if the Meta app is his. |
| **Founder A** | Owns an Instagram **Business** account                  | Signs in as a brand and runs the brand checks.                                                                         |
| **Founder B** | Owns an Instagram **Creator** account                   | Signs in as a creator and runs the creator checks.                                                                     |
| **DNS owner** | Whoever has the Cloudflare account for `valueskins.com` | Adds and changes DNS records. Changes nothing else.                                                                    |

Write the names next to the accounts they hold. A step names a role, so the person has to have the access.

| Account                  | Held by |
| ------------------------ | ------- |
| Cloudflare (DNS)         |         |
| Render (production)      |         |
| Vercel (new project)     |         |
| Vercel (old project)     |         |
| Meta developer (the app) |         |
| Resend                   |         |
| Sentry                   |         |
| Razorpay                 |         |
| `founder@valueskins.com` |         |

## A. Prepare (days before)

### A1. Write down the starting point

**Who:** Engineer with Saketh and the DNS owner.

**Do:** Fill in the rollback sheet at the end of this file. Take a screenshot of each place as well.

- Cloudflare: the records for `valueskins.com` and `www`, with their type, target, TTL and whether the proxy (orange cloud) is on.
- The old Vercel project: its name, the team it belongs to, and its domains, with which is primary and which redirects.
- The Meta app: the OAuth redirect URIs, the deauthorize callback URL, the data deletion request URL, the privacy policy URL and the terms URL if one is set.
- Every place that links to the old legal paths (`/legal/privacy`, `/legal/terms`, `/legal/refund`): the Razorpay dashboard, the Instagram profile, emails, other sites.
- The old app's Razorpay webhook URL.
- The names of the cookies the old app sets. The new app uses `vs_session` and `vs_ig_oauth_state` on `.valueskins.com`. If the old app uses either name, tell the Engineer before going on.

**Verify:** Every row of the sheet has a value. Nothing has been changed yet.

### A2. Lower the TTL

**Who:** DNS owner.

**Do:** A day before step C, set the TTL of every DNS-only record you may have to change to 5 minutes (`www`, and any record Vercel later asks you to change). Proxied records have no TTL to set.

**Verify:** The Cloudflare record list shows the new TTL.

### A3. Resend

**Who:** Engineer (Resend), DNS owner (records).

**Do:** Follow `docs/DEPLOYMENT.md` section 7 for `valueskins.com`: add the domain, add the records Resend shows exactly as shown, click **Verify**, and create a "Sending access" API key for this domain. Add the records as **DNS only**. **Do not change** the apex `MX` records (Zoho), the apex `SPF` record or the verification `TXT` records: Resend uses `resend._domainkey` and the `send` name.

**Verify:** Resend shows the domain as verified. `dig +short MX valueskins.com` still returns the three Zoho servers.

### A4. The support mailbox

**Who:** Founder A or B.

**Do:** Send a message to `founder@valueskins.com` from another address.

**Verify:** It arrives. This address is `SUPPORT_EMAIL`: the reply-to and the footer of every email.

### A5. Sentry

**Who:** Engineer.

**Do:** `docs/DEPLOYMENT.md` section 12a steps 1 to 3 with two new production projects, one Node.js and one Next.js. Keep both DSNs.

**Verify:** Both projects exist.

### A6. Render: the production database and API

**Who:** Engineer.

**Before you start:** the production services are defined in `render.yaml` (database `valueskins-db`, API `valueskins-api`), so the pull request that added them must be merged to `main`. Every value, where it comes from and who provides it is in `docs/DEPLOYMENT.md` section 21.2: have the Meta credentials (Meta app owner), the company address, state and GSTIN (Saketh or a Founder) and the SAC code (the CA) ready.

**Do:** Follow `docs/DEPLOYMENT.md` section 21.3. In short: create the Blueprint (or sync the existing one), type the prompted values (`WEB_ORIGIN` is `https://next.valueskins.com` for now, both modes are `off`, `ADMIN_INSTAGRAM_USER_IDS` is `none`), and deploy the API by hand, since it does not deploy by itself. Applying the Blueprint creates every resource in the file, staging included, if it does not exist yet.

Leave the three `RAZORPAY_*` variables out: they are optional while payments are off, and there are no live keys. Add `ENABLE_DEV_LOGIN=false` as written in the file: the variable has to exist, and the API refuses `true` in production.

The Render address of the service (for example `https://valueskins-api.onrender.com`) goes into one DNS record in step A7.

**Verify:**

- The first deploy finishes. In **Logs** there is no `Invalid environment configuration` or `Startup guard failed`, and one line says `"razorpayMode":"none","paymentsMode":"off","dealPostingMode":"off"`.
- `curl -s https://<the Render address>/api/health` prints `{"ok":true}`.
- The migrations ran: the pre-deploy step succeeded.

### A7. DNS for the API and the temporary web host

**Who:** DNS owner (records), Engineer (Render and Vercel).

**Do:**

- In Cloudflare add `api` as a CNAME to the Render address, **DNS only** (grey cloud). In Render, **Settings > Custom Domains**, click **Verify** for `api.valueskins.com`. Render issues the certificate by itself.
- In Vercel create the production web project (for example `valueskins-web`, root directory `apps/web`, Node 22, production branch `main`), following `docs/DEPLOYMENT.md` section 9. Variables: `NEXT_PUBLIC_API_URL` = `https://api.valueskins.com` and `NEXT_PUBLIC_SENTRY_DSN` = the Next.js DSN from A5. Do not add `NEXT_PUBLIC_ENABLE_DEV_LOGIN`: a build that has it `true` and the production API address fails on purpose. Deploy.
- In that project add the domain `next.valueskins.com`. In Cloudflare add the record Vercel shows (normally a CNAME to `cname.vercel-dns.com`), **DNS only**.

**Verify:**

```bash
dig +short CNAME api.valueskins.com
dig +short CNAME next.valueskins.com
curl -s https://api.valueskins.com/api/health
curl -sI https://next.valueskins.com/privacy | head -1
```

The third prints `{"ok":true}` and the fourth `HTTP/2 200`. Check also that `https://valueskins.com/` and `https://www.valueskins.com/` still show the live app, unchanged.

### A8. Meta: add the redirect URI

**Who:** Whoever holds the Meta app (see section 2). Saketh if the app is his.

**Do:** In the Meta app (the same one the live app uses), open **Instagram > API setup with Instagram login > Business login settings** (`docs/DEPLOYMENT.md` section 5 step 4). **Add** `https://api.valueskins.com/api/auth/instagram/callback` to the **OAuth redirect URIs**. Add it next to the existing ones: do not remove or replace anything. Save. Check that the app is in **Live** mode, or that both founders hold a role on it.

Do **not** change the deauthorize callback, the data deletion URL or the privacy policy URL yet. Each of those fields holds one URL, so changing them now would point the live app's callbacks at the new API early, or break the privacy link while the live app is still serving. The callbacks change in step C1 and the privacy policy URL in step C4.

**Verify:** The list shows the old URIs and the new one.

### A9. Park the old app on another hostname

**Who:** Saketh (old Vercel project), DNS owner (record).

**Do:** In the old Vercel project add the domain `old.valueskins.com` and, in Cloudflare, the record Vercel shows, **DNS only**. Leave `valueskins.com` and `www` on the old project for now.

**Verify:** `https://old.valueskins.com/` loads the old app. Sign-in will not work there, because the old app's settings name `valueskins.com`. That is fine: the hostname keeps the project reachable and shows that its last deployment is healthy.

## B. The production checks

These are the checks that tell you production works. They run **twice**: before DNS moves, on the temporary host, and again after it, on the real one (section D). In each check, `WEB` is `https://next.valueskins.com` before the switch and `https://valueskins.com` after it. `API` is `https://api.valueskins.com` both times.

Use a clean browser profile for each founder, or one normal and one private window, so the two are signed in at the same time. Use `docs/RUNBOOK.md` ("Looking at the system") for the `q` helper in the Render Shell.

**Why these checks use `api.valueskins.com` and `next.valueskins.com`, not the Render address or a hosts-file entry.**

- The session cookie is set for `.valueskins.com`, so a browser cannot keep a session on `onrender.com`, and the Instagram redirect URI is registered for the API host.
- Render issues the certificate for `api.valueskins.com` only after its DNS record exists, so a hosts-file entry for the API still needs that record. It is a new name, so it does not touch the live app.
- Vercel serves whichever project owns a hostname, so a hosts-file entry for `valueskins.com` would still show the old app. The new web app has to be on its own name until the switch.
- The Render address is still useful for one thing: `curl -s https://<the Render address>/api/health` before the DNS record exists.

The founders do the sign-in checks and the Engineer watches the Render **Logs** while they do.

**B1. The API is up.** Engineer. `curl -s API/api/health` prints `{"ok":true}`. `curl -s API/api/config` shows `"paymentsOpen":false` and `"postingOpen":false`.

**B2. The web home.** Founder A. Open `WEB`. It shows **Sign in with Instagram** and no email sign-in. `WEB/dev/login` shows the 404 page. `/how-it-works`, `/terms`, `/privacy`, `/refunds` and `/contact` load with no yellow "Not in this version" boxes (a build that talks to `api.valueskins.com` leaves them out).

**B3. Brand sign-in.** Founder A, with the Business account. Sign in with Instagram. "Is this you?" shows the right username and details. Click **This is me**. There is no account type question.

**B4. Brand onboarding.** Founder A. Add an email, press **Send link**. The email arrives from `notifications@valueskins.com` (this proves Resend works in production). Open the link in the same browser. Save the profile (name, city, website). Save billing details. You land on **Campaigns**, with **Post a deal** in the top bar and the brand banner: "Posting deals opens soon. You can set up your profile and billing, and save drafts."

**B5. Creator sign-in and onboarding.** Founder B, with the Creator account. Sign in. "Is this you?", **This is me**. Add an email and confirm it. Save the profile (name, city, age, gender). Save a UPI ID, the name on the account and consent. **Settings** shows the UPI ID masked, like `yo•••@okaxis`, and never in full. You land on **Deals** with the creator banner: "Deals will appear here once brands start posting. Finish your profile and UPI ID so you can apply."

**B6. A draft.** Founder A. **Post a deal**, fill in a title, **Insert template**, a budget and the three dates. **Save draft**. Reload the page and open the draft from **Campaigns**: everything is still there.

**B7. Publish is blocked, with its reason.** Founder A, on the draft.

- The **Publish** button is disabled, and the reason beside it reads: "Posting deals opens soon. We will email you when it does."
- In the browser developer tools **Console**, run the line below with the draft's id from the address bar. It must print an error with the code `POSTING_NOT_OPEN`, and the deal must stay a draft.

```js
fetch('https://api.valueskins.com/api/deals/PASTE-THE-DRAFT-ID/publish', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
})
  .then((r) => r.json())
  .then(console.log);
```

- Engineer: `curl -s -o /dev/null -w "%{http_code}\n" -X POST API/api/webhooks/razorpay` prints `404`. Payments are off, so the Razorpay webhook does not exist yet.

**B8. Delete the draft.** Founder A. Delete it from the draft page, so production starts without test deals. `q "select count(*) from deals"` prints `0`.

**B9. The admin pages.** Engineer with the founder who will be the admin.

1. After that founder has signed in once, find the id in the Render Shell: `q "select username, instagram_user_id from users order by created_at desc limit 5"`.
2. In Render set `ADMIN_INSTAGRAM_USER_IDS` to the id (several ids are comma-separated). Save; the service redeploys.
3. The admin signs out, then in again (the flag is set at sign-in). They land on `/admin/deals` and see the "Admin" tag. `/admin/disputes` loads.
4. The other founder (not an admin) opens `WEB/admin/deals`: the 404 page.

**B10. The session cookie.** Any founder, in the developer tools under **Application > Cookies**. `vs_session` shows Domain `.valueskins.com`, HttpOnly, Secure and SameSite `Lax`. After **Sign out** it is gone.

**B11. Sentry.** Engineer. Follow `docs/DEPLOYMENT.md` section 12a steps 4 to 6, with `'production'` where the staging command says `'staging'`, and `WEB` for the address. The API error and the web error appear in their projects. Open one: it shows no email, UPI ID, cookie, user or IP.

**B12. The invoice counter is empty.** Engineer. `q "select count(*) from invoice_counters"` prints a count of `0`. No fee has been taken, so the first one will be `VS/2026-27/000001`.

**B13. The go-live items that apply with payments off.** Engineer. From `docs/SPEC.md` section 22:

| Item                                                                      | Needed now?                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Meta app approved for `instagram_business_basic`, app in Live mode        | Yes (A8)                                                     |
| Resend domain verified, test emails land in the inbox (Gmail and Outlook) | Yes. B4 is one inbox: try a Gmail and an Outlook address too |
| Domains live with HTTPS                                                   | Yes (checked again in section D)                             |
| Render Postgres backups on, restore tested once                           | Yes. Steps are in `docs/RUNBOOK.md` section 7                |
| `ENABLE_DEV_LOGIN` is `false` in production, startup guard verified       | Yes. B2 shows the dev login page is a 404                    |
| Privacy policy and terms published and reviewed                           | Yes                                                          |
| Admin Instagram ids set, admin pages reachable only by admins             | Yes (B9)                                                     |
| Error alerts reach the admin email, and Sentry receives a test error      | Yes (B11)                                                    |
| Razorpay live account, live webhook, one small real deal                  | **No.** Only when payments open (section G)                  |
| Fee invoice format approved by the CA                                     | **No.** Only when payments open                              |

**Before DNS moves, B1 to B13 must all pass.** If one fails, fix it and run that check again. Do not go on to section C.

## C. The switch

Pick a time when nobody is expected to use the live app. Everyone involved is online.

### C0. Go or no-go

**Who:** Saketh and the Engineer.

**Do:**

- Saketh stops deploying to the old app from now until the week is over.
- Saketh counts the rows on the old app's database: its users, deals and payments. Users must be the two founders' test accounts, and deals and payments must be zero.

**Verify:** Saketh reports the three numbers. The Engineer has B1 to B13 passed. **If the old database holds anything else, stop.** The "no import" assumption is wrong, and the plan has to change before anything moves.

### C1. Meta: point the two callbacks at the new API

**Who:** Whoever holds the Meta app.

**Do:** In **Business login settings** (`docs/DEPLOYMENT.md` section 5 step 4): copy the current **Deauthorize callback URL** and **Data deletion request URL** into the rollback sheet if you have not yet, then set:

- **Deauthorize callback URL:** `https://api.valueskins.com/api/meta/deauthorize`
- **Data deletion request URL:** `https://api.valueskins.com/api/meta/data-deletion`

Leave the OAuth redirect URIs as they are (old and new). Leave the privacy policy URL for now: `https://valueskins.com/privacy` does not exist until the web domain moves in C3, and the old URL still works until then. It changes in C4.

**Verify (Engineer).** Run the signed request check from `docs/DEPLOYMENT.md` section 11, with `https://api.valueskins.com` in place of the staging address and the Instagram app secret or the Meta app secret. It must print `{"ok":true}`.

### C2. Point the API at the real web address

**Who:** Engineer.

**Do:** In Render, set `WEB_ORIGIN` to `https://valueskins.com` and save. The service redeploys.

**Verify:** The deploy finishes and `curl -s https://api.valueskins.com/api/health` prints `{"ok":true}`. From this moment sign-in on `next.valueskins.com` stops working. That is expected.

### C3. Move the web domains in Vercel

**Who:** Saketh (the old project), Engineer (the new project), DNS owner (only if Vercel asks for a record).

**Do:**

1. Old project: **Settings > Domains**. Remove `valueskins.com` and `www.valueskins.com`. A domain can belong to one project at a time. Check that `old.valueskins.com` is still listed.
2. New project: **Settings > Domains**. Add `valueskins.com` as the main domain. Add `www.valueskins.com` and set it to **redirect** to `valueskins.com` with a permanent redirect (`308`).
3. Look at the records Vercel says it needs. If the records in Cloudflare already match, change nothing: Vercel decides which project answers, and both projects use the same Vercel address. If Vercel shows different values or asks for a verification `TXT` record, the DNS owner adds or changes exactly that record. Do not turn the proxy on or off in the same step.
4. Wait until both domains show as valid, with HTTPS.

**Verify:** From your computer (allow the TTL from A2 plus a few minutes for caches):

```bash
curl -sI https://valueskins.com/ | head -3
curl -sI https://www.valueskins.com/ | head -5
curl -sI https://old.valueskins.com/ | head -1
```

The first answers `HTTP/2 200` with no `location` header (it was `308` to `www` before). The second answers `308` with `location: https://valueskins.com/`. The third still answers.

### C4. Meta: the privacy policy and terms URLs

**Who:** Whoever holds the Meta app.

**Do:** Once C3 has passed its checks, open **App settings > Basic** and set **Privacy policy URL** to `https://valueskins.com/privacy`. If a **Terms of Service URL** is set, change it to `https://valueskins.com/terms`. Save. The old values are in the rollback sheet. Update the other places you wrote down in A1 that link to the old legal paths.

**Verify:** Open each new URL in the browser: it shows the new page. `https://valueskins.com/legal/privacy` is now a 404, which is expected: the new app has no redirect from the old paths.

### C5. DNS summary

The records that change, and the ones that must not:

| Name                                 | Type            | Target                                          | Proxy    | When  | To undo                               |
| ------------------------------------ | --------------- | ----------------------------------------------- | -------- | ----- | ------------------------------------- |
| `api`                                | CNAME           | the Render address from A6                      | DNS only | A7    | Delete it                             |
| `next`                               | CNAME           | the value Vercel shows (`cname.vercel-dns.com`) | DNS only | A7    | Delete it (E)                         |
| `old`                                | CNAME           | the value Vercel shows                          | DNS only | A9    | Delete it (E)                         |
| `resend._domainkey`, `send`          | as Resend shows | as Resend shows                                 | DNS only | A3    | Delete them only if Resend is dropped |
| `valueskins.com` (apex)              | as today        | as today, unless Vercel shows different values  | as today | C3    | The value in the rollback sheet       |
| `www`                                | CNAME           | as today, unless Vercel shows different values  | as today | C3    | The value in the rollback sheet       |
| apex `MX`, `SPF`, verification `TXT` | -               | **Do not change**                               | -        | never | -                                     |

## D. After DNS: the same checks

**Who:** the same people as in section B.

**Do:**

1. Run the checks again with `WEB` = `https://valueskins.com`. The database is the same, so the founders' accounts and the admin flag are still there and onboarding is not repeated:
   - **B1, B2, B10, B11, B12** as written.
   - **B3 and B5:** each founder signs out, then signs in with Instagram. They land on **Campaigns** (Founder A) and **Deals** (Founder B), not on onboarding, and see the same banners as in B4 and B5.
   - **B6 to B8:** Founder A saves a draft, checks that Publish is blocked with its reason (button and console line), then deletes the draft.
   - **B9:** the admin signs in and sees `/admin/deals`. The other founder gets the 404 page on `/admin/deals`.
2. Also check, because they only matter after the switch:
   - The redirect direction from C3 holds (`https://www.valueskins.com/` answers `308` to `https://valueskins.com/`).
   - Meta's **privacy policy URL** (changed in C4) opens the new `/privacy` page, from the link shown in the Meta app.
   - The signed request check from C1 still prints `{"ok":true}`.
   - In Render **Logs**, a founder's sign-in shows no errors, and `GET /api/me` answers `200` after sign-in.
   - `https://old.valueskins.com/` still loads (the rollback is ready).

**Verify:** Every check passes. Tell the founders the cutover is done. If any of B1 to B7 fails and cannot be fixed quickly, decide on the rollback (section F).

## E. The week after

**Who:** Engineer, Saketh.

- Each day, look at Sentry and the Render **Logs** for errors, and check `q "select count(*) from users"` against what you expect.
- Keep the old project and `old.valueskins.com` for **7 days**. Saketh does not deploy to the old project.
- On day 7, if nothing has gone wrong:
  - DNS owner: delete the `next` record. Engineer: remove `next.valueskins.com` from the new Vercel project.
  - Meta: remove the old OAuth redirect URI of the live app.
  - Razorpay: remove the old app's webhook (the new one is registered only when payments open, section G).
  - Saketh decides when to retire the old Vercel project and its database, and removes `old.valueskins.com` then.
- Until day 7 leave the old Razorpay webhook alone. Nobody can pay a fee on either app in that week, so nothing is sent to it.

## F. Rollback

**When.** Decide before the switch, and do not wait long. A reasonable rule: if sign-in or the API fails after DNS and is not fixed in 30 minutes, roll back. The rollback is safe because the new database holds only the founders' onboarding data: no deals, payments or invoices, so there is nothing to carry back.

**Who:** Saketh, Engineer, DNS owner.

1. **Vercel.** New project: remove `valueskins.com` and `www.valueskins.com`. Old project: add them back, and set them as in the rollback sheet (`valueskins.com` redirecting to `www.valueskins.com`, `www` as the main domain). If you changed any Cloudflare record in C3, put it back to the value in the rollback sheet.
2. **Meta.** Set the **Deauthorize callback URL**, **Data deletion request URL**, **Privacy policy URL** and **Terms of Service URL** back to the values in the rollback sheet. The old OAuth redirect URI was never removed, so sign-in on the old app works again.
3. **Render.** Leave the new API running. If you will try again later, set `WEB_ORIGIN` back to `https://next.valueskins.com` so the checks can run again.
4. **Verify:**
   - `curl -sI https://valueskins.com/ | head -3` answers `308` to `https://www.valueskins.com/` again.
   - Saketh signs in to the live app with a test account and opens a page.
   - `https://api.valueskins.com/api/health` still answers (nothing depends on it now).
5. **Say what happened** to the founders, in plain words. Write down the cause before trying again.

If the problem is only with the new web app, rolling the Vercel deployment back is faster (`docs/RUNBOOK.md` section 6). If it is the API, roll back the Render deploy (same section). Use this rollback when the new app as a whole is not ready.

## G. Opening payments

Production is closed at the end of this cutover. When the company bank account and the Razorpay live account are ready:

1. Follow `docs/DEPLOYMENT.md` section 16a, "Opening payments and posting": set the live Razorpay values and `COMPANY_GSTIN` in Render, register the live webhook (`payment.captured`, `payment.failed` and `order.paid` only), set `PAYMENTS_MODE=admins`, restart, and run one real deal as an admin. Then `on`.
2. Do the remaining items in `docs/SPEC.md` section 22 that B13 left out: the Razorpay live account and webhook, the fee invoice format approved by the CA, and one real ₹5,000 deal between the two founders with a real ₹885.00 fee.
3. The first fee issues invoice `VS/2026-27/000001`. Before the first payment, `q "select count(*) from invoice_counters"` must still print `0`. After it, `q "select kind, financial_year, last_sequence from invoice_counters"` shows `COMMISSION_TAX_INVOICE`, `2026-27`, `1`. A new financial year (from 1 April 2027) starts again at `000001` by itself.
4. Set `DEAL_POSTING_MODE` the same way (`admins`, then `on`). Then tell people with `pnpm notify:launch` as in section 16a.

## Rollback sheet

Fill this in at step A1. Keep it somewhere private, not in the repo.

| What                                                                        | Value |
| --------------------------------------------------------------------------- | ----- |
| Cloudflare: apex record (type, target, TTL, proxy)                          |       |
| Cloudflare: `www` record (type, target, TTL, proxy)                         |       |
| Old Vercel project (name, team)                                             |       |
| Old Vercel project: primary domain and redirects                            |       |
| Meta: OAuth redirect URIs (the full list)                                   |       |
| Meta: Deauthorize callback URL                                              |       |
| Meta: Data deletion request URL                                             |       |
| Meta: Privacy policy URL                                                    |       |
| Meta: Terms of Service URL (if set)                                         |       |
| Other places that link to `/legal/privacy`, `/legal/terms`, `/legal/refund` |       |
| Old app's Razorpay webhook URL                                              |       |
| Cookie names the old app sets                                               |       |
| Old app's database: users, deals, payments counts (C0)                      |       |
