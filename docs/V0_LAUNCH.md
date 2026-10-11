# V0 Launch

Working notes for the pre-launch build.

## 1. Status

Prompts are given one by one and executed via the workflow in docs/WORKFLOW.md.

## 2. Prompts

Per CLAUDE.md, this section overrides docs/SPEC.md wherever they differ, until launch. Prompts are appended here as they are given; when a prompt implements something from this section, docs/SPEC.md is updated in the same change so it stays the source of truth.

### 2.1 Email-only accounts

Instagram app review can take weeks, and building cannot wait. V0 allows accounts to exist without a linked Instagram account. `users.instagram_user_id` is nullable; `users.username`'s uniqueness is a partial unique index scoped to `instagram_user_id IS NOT NULL` (so email-only usernames, not yet derived from anything, don't collide with the real-handle uniqueness rule). A new `email_login_codes` table backs a future email-code login endpoint, gated by `AUTH_EMAIL_ENABLED` (not yet built — this prompt only adds the flag and the table).

### 2.2 Onboarding for email-only accounts

An email-only account (V0_LAUNCH 2.1) has no fetched Instagram profile, so onboarding differs from SPEC 6.4 in these ways:

- It types its Instagram username (`POST /api/me/instagram-username`): 1 to 30 letters, digits, dots or underscores, a leading `@` stripped, lowercased. The handle is unverified, stored in `users.username`, not unique, editable until Instagram is connected, and replaced by the real handle when it connects. `users.instagram_username_set_at` marks the step done.
- Its email is already verified by the sign-in code, so the email step is done and `POST /api/me/email` is for Instagram accounts only.
- Step order: `instagram_username`, `role`, `email`, then `billing` (brands) or `payout` (creators, not required to complete onboarding).
- `onboarding_completed_at` is set once, never unset, when role and verified email are done, plus billing for brands, plus the Instagram username for email-only accounts. Connecting Instagram later removes the username step.
- **Payout gating.** *Replaced by REPLACEMENT_PLAN 2.1: a creator applies only with a saved UPI ID, name and consent (`403 PAYOUT_NOT_SET`, "Add your UPI ID to apply"), and a brand can confirm an applicant only while they still have them (`409 CREATOR_PAYOUT_NOT_SET`). The Route linked-account text that stood here is retired. Payout details stay optional for finishing onboarding.*
- **Resume.** `GET /api/users/:id/resume` takes the user id, because email-only usernames are not unique. For an account without a linked Instagram profile it returns `instagramVerified: false`, the typed username, and null Instagram fields.

### 2.6 Configurable GST

ValueSkins isn't GST-registered yet, so GST isn't charged at launch. `computeBreakdown` takes an optional GST-rate-in-basis-points parameter, defaulting to `packages/shared`'s config constant. The API's `GST_RATE_BPS` env var controls the live rate (currently `0`), and a startup guard prevents enabling GST (`GST_RATE_BPS > 0`) without `COMPANY_GSTIN` set.

### 2.7 Staging deployment

Staging runs at `https://staging.valueskins.com` (web, Vercel) and `https://api-staging.valueskins.com` (API, Render), both tracking `main`. The setup is in `render.yaml`, `apps/web/vercel.json` and `docs/DEPLOYMENT.md`; no resource is created from code.

- API: paid, always-on Render web service (a free service sleeps, which breaks OAuth and Meta callbacks), Singapore region, health check `/api/health`, migrations in the pre-deploy command. Postgres is on Render's free plan for staging (expires after 30 days, no backups); production uses a paid plan with backups (SPEC 2).
- Staging env: `NODE_ENV=staging`, `SESSION_COOKIE_NAME=vs_session_staging`, `COOKIE_DOMAIN=.valueskins.com`, Razorpay test keys, `ENABLE_DEV_LOGIN=true`, `AUTH_EMAIL_ENABLED=true`, `EMAIL_TRANSPORT=resend`.
- `TEST_DATABASE_URL`, `COMPANY_GSTIN` and `ADMIN_INSTAGRAM_USER_IDS` default to empty so the Blueprint does not need empty variables.
- Meta signs the deauthorize and data-deletion callbacks with an app secret; the docs do not say which of the two, so the API accepts a `signed_request` signed with either `META_APP_SECRET` or `INSTAGRAM_APP_SECRET`.
- Temporary web pages (home, email code screens, `/privacy`, `/terms`, `/auth/error`, `/me`, `/dev/login`) live in `apps/web/app/(temporary)` and `apps/web/lib/temporary`, so they can be deleted as one unit when the design handoff arrives. `next.config.ts` maps the paths the API redirects to (`/onboarding`, `/home`, `/login`, `/settings`) onto them. `/privacy` and `/terms` render placeholder markdown marked DRAFT from `apps/web/content`.
- `GET /api/me` also returns the fetched Instagram profile (`profile`, null for an email-only account), so Meta's screencast can show the data being used.
