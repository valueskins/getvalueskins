# ValueSkins — Project Context

> Purpose: give a new developer the product and engineering model of this repository without repeating the discovery work.
>
> Snapshot: local `main` at merge commit `865820c` (“Merge pull request #45 from valueskins/feat/landing-final”), 2 Nov 2026. 180 commits, one contributor in the local history. Working tree was clean during this review.
>
> Legend used below:
>
> - **Verified** — read directly in source, schema, tests, or config at this commit.
> - **Documented** — stated in `docs/SPEC.md`, `docs/CUTOVER.md`, `docs/DEPLOYMENT.md`, etc.; not necessarily re-proven in code.
> - **Assumption / Unclear** — could not be established from the repository.
>
> No secret values were read for this document. Only variable names and purposes are listed.

---

## Founders' decisions of 11 November 2026

These override any older statement in this document. The code changes are built in the tasks named; until then the code stands.

- Production stays on free hosting (Render free, Neon free, Netlify free), and `PAYMENTS_MODE` and `DEAL_POSTING_MODE` may be `on`. The hosting tier variable and its guard are removed.
- The minimum deal budget is ₹2,000.
- Email: Resend first, then Brevo as overflow when Resend refuses because of a daily or rate limit or a server error (Task 5).
- Production is awake only from 07:00 to 01:00 India Standard Time on purpose (Render free hours), so scheduled jobs must tolerate sleeping (Task 4).
- The web application in `apps/web` is the real application, and one task may change `apps/api`, `packages/shared` and `apps/web` together. `docs/REPLACEMENT_PLAN.md` is history.
- The Revision 11 payment ledger will not be built.
- Commits and pull requests are authored only by Melove Gupta, with no trailers and no abbreviations (`CLAUDE.md` section 14).

## 0. Inspection checklist

Areas actually inspected (source, not only docs):

- [x] Root workspace, package manifests, TypeScript/ESLint/Vitest config, `.gitignore`.
- [x] `CLAUDE.md`, `README.md`, `docs/SPEC.md` (full, including sections 17–22), `docs/REPLACEMENT_PLAN.md`, `docs/CUTOVER.md`, `docs/DEPLOYMENT.md` (large parts), `docs/RUNBOOK.md` (parts), `docs/WEB_API_GAPS.md`, `docs/WORKFLOW.md`, `docs/V0_LAUNCH.md`.
- [x] API bootstrap, middleware order, env schema and startup guards, error handling, logging, Sentry setup.
- [x] Complete Drizzle schema (`users`, `deals`, `payments`, `admin`, enums), migrations journal, seed scripts.
- [x] Deal domain: draft/publish, state machine, access control, lifecycle, queries, detail view, review, events, turn/next-step logic.
- [x] Applications, direct payments, fee payments, Razorpay orders/verify/webhooks, invoice numbering/snapshots, documents/PDFs, disputes, admin, resume, onboarding, profile, billing, payout UPI.
- [x] Instagram OAuth/upsert, dev login, email-code auth, email verification, Meta deauthorize/data-deletion, sessions/guards.
- [x] Realtime server/emitter/events and rate limiters.
- [x] Jobs: registry, runner, scheduler, lock, individual reminder/cleanup/refresh jobs.
- [x] Web app: root layout/providers/middleware, API client and query keys, access rules, shells, landing, public pages, onboarding, settings, creator screens, brand screens, deal page and panels, admin screens, realtime provider, error/loading states.
- [x] Tests: route table audit, architecture invariants, full API e2e flow, payment capture/webhook matrix, migrations, job reminders, security, web unit tests inventory.
- [x] CI workflows, Render/Netlify/Vercel config, Docker Compose, deployment workflow, git history and branches.

Not fully read line by line: every one of the ~120 files under `apps/api/test`, all 28 email templates, every CSS rule, every line of `docs/DEPLOYMENT.md` and `docs/RUNBOOK.md`, all 180 commit diffs. Conclusions about those areas are based on representative files and tests.

---

## 1. Product overview

**Verified product:** ValueSkins is an Indian marketplace where brands post fixed-price deals for Instagram creators, creators apply, the brand picks one creator, and the deal runs through payment, content review and completion with an auditable record.

What makes it distinctive:

- **No chat, no negotiation.** The brand publishes a fixed budget. Creators either apply or do not.
- **A flat platform fee, not a percentage.** The brand pays ValueSkins ₹750 + 18% GST = **₹885.00** per deal through Razorpay. The creator receives the budget minus that fee.
- **The creator is paid directly by UPI.** The creator’s share is split 30% before work and 70% after approval. The brand pays the creator directly; ValueSkins never holds that money. The creator confirms receipt in the app, and only that confirmation moves the deal forward.
- **Identity comes from Instagram.** A Business account becomes a brand; a Creator account becomes a creator. Users do not pick a role.
- **Public reputation.** Both sides have a virtual resume showing Instagram stats, profile details, completed deals and total value.
- **One shared deal record.** Every deal ends with an immutable PDF record containing terms, fee invoice, UPI payment records, content proof and full history.

**Who it serves:**

- Small and mid-sized Indian brands that want a creator post without agency back-and-forth.
- Instagram creators who want paid deals with clear terms and a public track record.

**Explicit product limits (documented and largely enforced):**

- No in-app messaging; contact is by email.
- No negotiation on price or scope.
- No escrow or payout holding.
- No automatic refunds; fee refunds are manual in Razorpay.
- No partial milestones or hourly work.
- Minimum deal budget is **₹2,000** (decision of 11 November 2026), above the ₹885 fee.

**Stage:** A full rebuild of the earlier live app at `valueskins.com`. The codebase is feature-complete for the documented v1 scope and has extensive tests, but production launch gates (`PAYMENTS_MODE`, `DEAL_POSTING_MODE`) are designed to start `off`, and the production host is the free tier. Whether the DNS cutover has already happened is **Unclear** from the repository alone.

---

## 2. Business model and core workflows

### 2.1 Money model

All money is integer **paise**; no floats anywhere. The shared function `computeBreakdown(budgetPaise, gstRateBps)` in `packages/shared/src/money.ts` is the single source of truth.

For a budget `B`:

- Platform fee base: **₹750.00** (`75_000` paise), flat.
- GST: 18% of the base, rounded half-up → **₹135.00** (`13_500` paise).
- Fee total: **₹885.00** (`88_500` paise).
- Creator amount: `B - fee total`.
- Advance: 30% of creator amount, rounded.
- Final: creator amount minus advance.

Example at ₹10,000 budget (from the API e2e test):

| Item | Amount |
|---|---:|
| Budget | ₹10,000.00 |
| Fee base | ₹750.00 |
| GST | ₹135.00 |
| Fee total | ₹885.00 |
| Creator amount | ₹9,115.00 |
| Advance (30%) | ₹2,734.50 |
| Final (70%) | ₹6,380.50 |

The breakdown is **frozen on publish**: `deals.commissionBasePaise`, `commissionGstPaise`, `commissionTotalPaise`, `creatorAmountPaise`, `advancePaise`, `finalPaise`. Later config changes never alter an existing deal.

GST treatment depends on the brand’s billing state versus the company state: CGST + SGST for intra-state, IGST for inter-state. The invoice snapshot records the split.

### 2.2 Deal lifecycle

Ten statuses (`DEAL_STATUSES` in `packages/shared/src/enums.ts`):

`DRAFT → OPEN → CONFIRMED → COMMISSION_PAID → ADVANCE_PAID → CONTENT_UPLOADED ⇄ REVISION_REQUESTED → APPROVED → COMPLETED`

plus `CANCELLED` from permitted states.

The happy path:

1. **DRAFT** — brand builds the deal; may save incomplete fields.
2. **OPEN** — publish validates required fields, freezes the breakdown, makes the deal visible in the creator feed.
3. **CONFIRMED** — a creator applied; the brand confirms exactly one. Other applicants become `REJECTED` (shown in the UI as “Not selected”).
4. **COMMISSION_PAID** — the brand pays the ₹885 fee through Razorpay; capture may arrive through browser verify, webhook, or both, idempotently.
5. **ADVANCE_PAID** — brand pays 30% directly by UPI, records the reference; creator confirms “I received it”.
6. **CONTENT_UPLOADED** — creator submits a link; `uploadCount` increments; every upload is stored in `content_uploads`.
7. **REVISION_REQUESTED** — brand asks for changes; `revisionCount` increments and `feedback` is stored.
8. Back to **CONTENT_UPLOADED** on re-upload; then **APPROVED**.
9. **COMPLETED** — brand pays the final 70%, records it, creator confirms. `completedAt` set; the deal record PDF and “deal record ready” emails go out.

Cancellation rules:

- Brand may cancel free in **OPEN** and **CONFIRMED**.
- From **COMMISSION_PAID** onward only an admin may cancel, through the admin cancel flow; the fee is kept and no automatic refund exists.
- Creators never cancel.
- A cancelled deal shows where it stopped, based on timestamps.

Only `transitionDeal()` in `apps/api/src/deals/stateMachine.ts` writes `deals.status`. This is enforced by an architecture test that scans source files (`apps/api/test/architecture/dealStatusWriters.test.ts`).

### 2.3 The two payment rails

**Rail 1 — platform fee (Razorpay):**

- `POST /api/deals/:id/payments/commission/order` creates/reuses one open Razorpay Order.
- Browser opens Razorpay Checkout with the returned `keyId` and order id.
- `POST /api/payments/verify` checks the Checkout signature, fetches the payment from Razorpay, validates order, amount, currency and captured status, then marks it captured.
- Razorpay webhooks (`payment.captured`, `payment.failed`, `order.paid`) do the same through `markPaymentCaptured`.
- All three paths are idempotent and race-tested. A second capture is marked `FAILED` and refunded manually.
- If the deal changed while Checkout was open (e.g. cancelled), the money is still captured, the deal does **not** move, the payment stays `CAPTURED`, an event `FEE_CAPTURED_DEAL_CHANGED` is written, the brand is emailed, the admin is alerted, and verify returns `409 FEE_CAPTURED_DEAL_CHANGED` with a refund message.

**Rail 2 — creator share (direct UPI):**

- `GET /api/deals/:id/direct-payment` returns the stage (`ADVANCE` / `FINAL`), amount, payee name and **full** UPI ID, only to the brand of that deal, only while a payment is due, only when the creator has consent.
- The web builds a `upi://pay` link and QR code.
- The brand pays in its UPI app and records the UTR/reference (`6–40` chars from `A-Z a-z 0-9 - /`) plus an optional note.
- Recording does **not** change status. The row snapshots `paid_to_vpa` and amount.
- The confirmed creator sees the masked UPI ID and reference, then chooses **I received it** or **Not received** with a reason.
- “Received” moves `COMMISSION_PAID → ADVANCE_PAID` or `APPROVED → COMPLETED`.
- “Not received” marks the record disputed; the brand may record again. Rows are never edited or deleted.
- Database constraints enforce one live record per deal/stage, confirmed XOR disputed, and `confirmed_by` set exactly when `confirmed_at` is.

### 2.4 Applications

- A creator can apply once per deal (`unique(deal_id, creator_id)`).
- Applying requires a completed profile and a saved UPI ID with consent.
- The brand sees applicants with a `confirm: { enabled, reason }` result explaining why a creator cannot be chosen.
- Confirming one creator sets the deal to `CONFIRMED`; all other `APPLIED` applications become `REJECTED` (shown in the UI as “Not selected”).
- A creator can see their applications and their outcome.

### 2.5 Content review

- Creator submits an external link (Drive etc.); links are rendered as plain external links, never embedded.
- Brand can request changes with 1–5,000 characters of feedback; this is trimmed and stored.
- Every upload and feedback is appended to history; the deal page shows all feedback.
- Approval moves to `APPROVED`; the final payment step follows.

### 2.6 Disputes

- Either party can raise a dispute with subject and description; database allows only one `OPEN` dispute per deal.
- Raising or resolving emits `deal:updated` to the deal room.
- Admin resolves with a resolution (both sides read it) and an optional refund reference.
- A direct-payment “not received” is an alert, not automatically a dispute.
- Refunds are manual in Razorpay; the reference lives on the dispute or cancel event.

### 2.7 Resumes

`GET /api/users/:id/resume` returns, to any signed-in user:

- Instagram handle, picture, followers, engagement rate, account type.
- Profile details (current age computed from `age` + `ageRecordedAt`).
- Verified contact email.
- Completed deals count, total value, member since.
- Last 10 completed deals (counterparty, title, amount, date).
- Never the UPI ID.

---

## 3. User roles and permissions

### Roles

| Role | How assigned | Can do |
|---|---|---|
| **Brand** | Instagram account type `BUSINESS` | Create/edit/publish deals, view applicants, confirm a creator, pay fee, record UPI payments, approve content, raise disputes, manage billing, cancel early. |
| **Creator** | Instagram account type `MEDIA_CREATOR` | Browse feed, apply, upload content, confirm/deny direct payments, manage UPI details, raise disputes, view applications and deals. |
| **Admin** | Instagram user id in `ADMIN_INSTAGRAM_USER_IDS`; `users.is_admin` set at sign-in | Everything an admin screen offers: all deals, all disputes, resend emails, cancel a deal from fee-paid onward, resolve disputes. Admin routes return 404 to everyone else. |
| **Signed-in, not onboarded** | Has a session but incomplete setup | Only `/me`, onboarding/profile/email/billing/payout endpoints; marketplace endpoints reject with `ONBOARDING_INCOMPLETE`. |
| **Public** | No session | Health, config, Instagram OAuth start/callback, logout, Razorpay webhook, Meta callbacks, email-verification token endpoint, and gated dev/email login routes. |

### Authorization mechanics

- Every route mounts an explicit guard (`requireUser`, `requireOnboarded`, `role:BRAND`, `role:CREATOR`, `requireAdmin`) or is on a public allowlist.
- `apps/api/test/security/routeGuards.test.ts` introspects the running Express router and fails if a route is unguarded, if guards/limiters change unexpectedly, if a route skips the global limiter, or if a mutating route accepts a wrong Origin.
- Admin routes deliberately return **404**, not 403, to hide their existence.
- Every mutating request is Origin-checked against `WEB_ORIGIN`; only the Razorpay webhook and Meta callbacks are exempt because they authenticate by signature.
- Resource ownership is checked in services, not only by route guards. A non-party receives **404** for a deal/document/history, not 403, to avoid leaking existence.

### Profile rules

- Role and core profile fields are saved once and locked (`roleLockedAt`, `profileLockedAt`).
- Creator profile: name, city, age 18–99, gender; age stored with the date it was given so it increases automatically.
- Brand profile: name (may contain digits), city, website, optional pitch up to 1,000 chars.
- Email is required and verified.
- Creator UPI ID + account name + explicit consent are required before applying.
- Brand billing details are required before publishing.
- Adult confirmation is stored with a timestamp.

---

## 4. Complete feature inventory

### Implemented and tested (Verified)

**Identity and onboarding**

- Instagram Login OAuth (start, callback, state cookie, error codes).
- Account-type → role mapping; refusal for personal/private accounts; changed-type handling.
- Account linking protection (an Instagram account cannot belong to two ValueSkins users).
- Session creation, hashed session tokens, cookie, logout, session expiry cleanup.
- Email-code sign-in for staging/tests only, behind `AUTH_EMAIL_ENABLED`.
- Dev login for local/staging, impossible in production.
- Email verification with hashed, expiring, single-use tokens; resend; pending-email display.
- Onboarding state machine computed server-side; four screens in the web app.
- Profile create/lock, billing create/update, payout UPI create/update with consent.
- Account deletion that anonymizes the user, removes billing, and preserves legal records.

**Deals**

- Draft create/update/delete; publish validation; frozen money breakdown; short id.
- Creator feed with keyset pagination and applied flag.
- Brand campaign lists grouped by status; creator “my deals” with tabs.
- Applications: apply, list, confirm, not-selected.
- Full state machine with allowed actions and reasons (`allowedActions`).
- Cancellation by brand (early) and admin (later), with reason, emails and events.
- Content upload, revision requests, approval, completion.
- Per-deal activity timeline (`deal_events`), feedback history, content links.
- Deal detail tailored to viewer (brand, creator, admin).

**Payments and documents**

- Razorpay Order creation/reuse; Checkout verify; webhook capture; failure handling; amount/order/currency validation; admin alerts on mismatch.
- Fee-captured-after-deal-changed compensation path.
- Direct UPI record/confirm/not-received; partial unique indexes and race tests.
- GST invoice generation with immutable JSON snapshot and gap-free numbering per financial year and series.
- Payment-record PDFs for advance/final; full deal record PDF at completion.
- Document downloads authorized for brand, creator and admin only.
- Admin email resend, rebuilding attachments from snapshots or current data.

**Communication**

- 28 transactional email templates (plus a shared layout and index), logged in `email_log` with status, body, attachments.
- Resend transport in staging/production, console locally.
- Admin alerts for payment mismatch, webhook handler failure, disputes, etc.
- No in-app chat or notifications; email is the channel.

**Realtime**

- Socket.io with session-cookie authentication.
- Deal rooms (`deal:<id>`, admins may join any), user rooms (`user:<id>`).
- Events: `deal:new`, `deal:closed`, `deal:updated`, `deal:summary`, `application:new`.
- Web re-reads REST data on every event; rejoins rooms after reconnect; own-action echo suppression.

**Admin**

- Deal list with status filter, short-id prefix search, flags, cursor paging, total.
- Deal detail with parties, fee, UPI records, emails/resend, disputes, documents, activity.
- Dispute list/detail, open/resolved tabs, resolution.
- Admin cancel with note + optional refund reference.
- Admin-only 404 behavior.

**Jobs**

- Instagram token refresh.
- Cleanup of expired sessions/tokens/webhook rows.
- Fee reminder after 24h in CONFIRMED.
- Payment-due reminder after 24h.
- Review reminder after 3 days.
- Confirm-payment reminder after 12h.
- Content-overdue reminder at the IST deadline, to both parties.
- In-process cron in `Asia/Kolkata`, one advisory lock per job, no overlap.

**Web app**

- Landing page with interactive deal calculator, example deal animation, rules, FAQ, sign-in.
- Public How it works, Terms, Privacy, Refunds, Contact, sign-in error page, email sign-in (staging).
- Onboarding with live profile preview and “who sees what”.
- Creator Deals, Applications, My deals.
- Brand Campaigns, Post deal, Edit draft.
- Shared deal page for every status, with Razorpay Checkout, UPI link/QR, record/confirm panels, documents, emails, activity, disputes.
- Settings: email, profile (read-only), billing or UPI, Instagram, delete account.
- Admin Deals, Deal detail, Disputes, Dispute detail.
- Resume card/sheet on usernames.
- Light-only design system; CSP with per-response nonce; Sentry errors only.
- Loading skeletons, load errors with retry, toasts, modal/bottom-sheet patterns, accessibility and reduced-motion handling.

**Operations**

- CI: install, production audit (critical), typecheck, lint, test, build, with a Postgres 16 service.
- Production web deploy workflow to Netlify after CI succeeds on `main`, with change detection and secret checks.
- Render blueprint for production API; Vercel config for staging web.
- Startup env validation, startup guards, migration-vs-code check.
- Structured logs with redaction; Sentry scrubbing.
- Runbook, deployment guide, cutover guide, rollback plan.

### Partially implemented / intentionally limited

- **Admin analytics:** specified in `docs/SPEC.md` section 12, no endpoint or screen. `docs/WEB_API_GAPS.md` marks it “Not doing (after cutover)”.
- **Refunds:** manual in Razorpay; no refund entity, no automatic reversal, no reconciliation UI.
- **Admin alert inbox:** alerts are emails only; no table or screen.
- **Email/webhook durability:** no retry queue. Failing emails stay `FAILED` and can be resent by an admin; failing webhook handlers are recorded and alerted but not retried.
- **Realtime scale-out:** single Node process, no Redis adapter; multi-instance deployment would not share rooms.
- **Scheduled jobs on free hosting:** run only while the Render free instance is awake; missed runs are not backfilled.
- **Production launch:** designed to start with payments/posting off; live Razorpay keys, GSTIN/SAC confirmation and Meta live approval are operational prerequisites. Paid hosting is not required (decision of 11 November 2026).
- **Data import from the old app:** not implemented; cutover plan explicitly assumes no data import (only founders’ test accounts).
- **Browser E2E / visual regression:** none in the repo; API has a full e2e test, web has jsdom unit/component tests.
- **OpenAPI:** no generated spec; shared Zod schemas plus contract tests are the API contract.

### Not implemented

- Chat, negotiation, comments, likes, follows, notifications centre.
- Escrow, wallet, payout accounts, Razorpay Route/Transfers (removed by design).
- Bank account/PAN/IFSC payout details (rejected/removed; UPI only).
- Automatic dispute refunds or fee proration.
- Multi-currency or non-India payments.
- Native mobile apps.
- Multi-admin roles/permissions (admin is a boolean).
- Bulk deal import/export.
- Public creator/brand directory or search beyond the feed.
- Saved payment methods, subscriptions, invoices self-service downloads beyond per-deal documents.

---

## 5. Technology stack

| Layer | Technology | Version / notes |
|---|---|---|
| Runtime | Node.js | 22 (`engines`, `.nvmrc`, CI) |
| Package manager | pnpm workspaces | `pnpm@9.15.9`; `pnpm-workspace.yaml` |
| Language | TypeScript | 5.7, strict ESM, `tsconfig.base.json` |
| API framework | Express | 5.x |
| ORM / DB | Drizzle ORM + `pg` | PostgreSQL 16 |
| Validation | Zod | 4.x, shared schemas |
| Auth | Custom sessions + Instagram OAuth | `sessions` table, HttpOnly cookie |
| Realtime | Socket.io | 4.8 server + client |
| Payments | Razorpay | Orders, Checkout, Payments API, webhooks |
| Email | Resend | `EMAIL_TRANSPORT=console` for local |
| PDFs | PDFKit + DejaVu fonts | server-side |
| QR codes | `qrcode` (web) | loaded on the pay step |
| Logging | pino + pino-http | redaction via shared scrubber |
| Errors | Sentry | API `@sentry/node`, web `@sentry/nextjs`, errors only |
| Rate limiting | `rate-limiter-flexible` | PostgreSQL store (`rate_limiter_points`) |
| Jobs | `node-cron` | in-process, IST, advisory locks |
| Web framework | Next.js | 15.5 App Router, React 19 |
| Data fetching | TanStack Query | 5.x |
| Styling | Tailwind CSS 3 + CSS variables | custom design tokens |
| Content | `react-markdown` | legal/How it works markdown |
| Testing | Vitest | API + shared + web (jsdom, Testing Library) |
| API test utilities | Supertest, MSW | real Postgres test DB |
| CI/CD | GitHub Actions | Postgres service; Netlify CLI deploy |
| Hosting | Render (API), Neon (DB), Netlify (prod web), Vercel (staging web) | documented |
| DNS | Cloudflare | operational only |

---

## 6. Repository structure

```
getvalueskins/
├── apps/
│   ├── api/                 Express API, Drizzle schema/migrations, jobs, PDFs, email
│   │   ├── src/
│   │   │   ├── admin/ applications/ auth/ config/ db/ deals/ directPayments/
│   │   │   ├── disputes/ documents/ email/ emailAuth/ env/ errors/ health/
│   │   │   ├── instagram/ invoices/ jobs/ logging/ meta/ observability/
│   │   │   ├── onboarding/ payments/ payout/ profile/ rateLimit/ razorpay/
│   │   │   ├── realtime/ security/ users/ webhooks/ scripts/
│   │   │   ├── app.ts       route mounting + middleware order
│   │   │   └── index.ts     process startup: env, DB check, HTTP, Socket.io, jobs
│   │   ├── drizzle/         12 SQL migrations + journal
│   │   ├── scripts/         seed-demo, explain-queries, explain-seed
│   │   └── test/            ~120 test files, helpers, e2e harness
│   └── web/                 Next.js App Router
│       ├── app/             route groups: (landing), (public), (app), (admin), (setup), dev
│       ├── components/      landing, brand, creator, deal, admin, onboarding, settings, shell, ui
│       ├── lib/             api client/queries, access rules, env, CSP, formatting
│       ├── content/         legal + how-it-works markdown
│       ├── test/            ~31 test files (jsdom)
│       └── netlify.toml, vercel.json, next.config.ts, middleware.ts
├── packages/
│   └── shared/              money, state machine, actions, turn logic, schemas, copy, invoices,
│                            deal steps, realtime event names, scrubber
├── docs/                    SPEC, REPLACEMENT_PLAN, DEPLOYMENT, CUTOVER, RUNBOOK,
│                            WEB_API_GAPS, DESIGN_HANDOFF, WORKFLOW, V0_LAUNCH (retired)
├── .github/workflows/       ci.yml, deploy-web-production.yml
├── docker-compose.yml       local Postgres 16 + test DB init
├── render.yaml              production API blueprint
├── package.json             workspace scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
└── CLAUDE.md                working rules and invariants
```

Counts at this commit (verified by `find`): 184 API source `.ts` files, 161 web `.tsx` files, 175 `*.test.ts*` files across API/web/shared, 12 migrations.

---

## 7. Technical architecture

### 7.1 Runtime topology

```
Browser (Next.js 15, React 19, TanStack Query, Socket.io client)
   │  HTTPS, cookies, JSON
   ▼
Express 5 API (Render, Singapore)
   ├── PostgreSQL 16 (Neon in production; Docker locally)
   ├── Razorpay (Orders, Checkout, Payments, webhooks)
   ├── Instagram/Meta Graph API (OAuth, profile, token refresh)
   ├── Resend (transactional email)
   ├── Sentry (errors only)
   ├── PDFKit (in-process documents)
   └── node-cron jobs (in-process, advisory locks)
```

No Redis, no message broker, no worker service. Simplicity and free-tier cost are deliberate.

### 7.2 API request pipeline (`apps/api/src/app.ts`)

1. `trust proxy = 1` (Render proxy → real client IP for rate limits).
2. `httpLogger` — request id, method, path (no query), status, duration.
3. Helmet security headers.
4. CORS with credentials for `WEB_ORIGIN`.
5. Raw-body capture for `/api/webhooks/razorpay`; URL-encoded capture for Meta callbacks.
6. Global JSON parser.
7. Origin check on mutating requests (exempt only webhook/Meta).
8. Session middleware: parse cookie, hash token, look up session + user, attach `req.user`.
9. Global per-user/per-IP rate limiter mounted at `/api`.
10. Feature routers.
11. 404 handler, then error middleware.

The startup path (`src/index.ts`) is separate: validate env → startup guards → connect DB → compare migration hashes → create HTTP server → attach Socket.io → start scheduler → listen. A failed startup exits non-zero.

### 7.3 API module map

- `deals/` — routes, draft service, lifecycle actions, state machine, access, queries, detail view, review service, events, publish validation, turn/next-step, payout disclosure.
- `applications/` — apply, list, confirm, state guards.
- `payments/` — order creation, capture marking, verify, Razorpay client wrapper.
- `directPayments/` — UPI record/confirm/not-received, masked view.
- `invoices/` — numbering, snapshots, issuance.
- `documents/` — PDF blocks, data loading, rendering, download access, history.
- `disputes/` — raise/list/resolve.
- `admin/` — deal list/detail, cancel, emails/resend, disputes.
- `email/` — templates, layout, send/log.
- `jobs/` — registry, runner, scheduler, lock, each job.
- `realtime/` — Socket.io server, emitter indirection, event helpers.
- `instagram/`, `emailAuth/`, `auth/` — identity.
- `meta/` — signed request verification, deauthorize, data deletion.
- `security/` — CORS, Helmet, origin check, raw body, route guards.
- `env/` — Zod schema, parsing, startup guards.
- `observability/`, `logging/` — Sentry and pino.
- `rateLimit/` — limiter factory and definitions.

### 7.4 Frontend architecture

- App Router with route groups:
  - `(landing)` — `/`, `/how-it-works`; separate bold visual language (`.hm` scope, `home.css`).
  - `(public)` — `/login`, `/signin/email`, `/terms`, `/privacy`, `/refunds`, `/contact`.
  - `(setup)` — `/onboarding`.
  - `(app)` — `/home` redirect, `/deals`, `/deals/[id]`, `/applications`, `/my-deals`, `/campaigns`, `/campaigns/new`, `/campaigns/[id]/edit`, `/settings`.
  - `(admin)` — `/admin` → `/admin/deals`, `/admin/deals/[id]`, `/admin/disputes`, `/admin/disputes/[id]`.
  - `dev/` — `/dev/login`, `/dev/components`, `/dev/error` (non-production builds only).
  - `/verify-email` — public token landing.
- `middleware.ts` builds a per-response CSP nonce; pages therefore render dynamically.
- Root layout sets fonts, providers, light-only color scheme, skip link.
- `Providers` wires TanStack Query, toasts, realtime (when signed in/onboarded), error boundary.
- `Guard` + `lib/access.ts` implement navigation rules. These are UX rules; the API still authorizes every request.
- Data layer: `lib/api/client.ts` (fetch with credentials, JSON, typed errors), `queries.ts` (`/me`), `deals.ts`, `admin.ts`; stable query keys; invalidation after mutations.
- Deal page is one component tree for all statuses/roles; server-provided `allowedActions` drives buttons and disabled reasons.
- Realtime provider refetches REST on socket events rather than trusting event payloads; suppresses the viewer’s own echo for 5 seconds; re-reads everything after reconnect.

### 7.5 Shared package

`packages/shared/src/index.ts` re-exports:

- `money.ts` — paise arithmetic, `computeBreakdown`, GST split, INR formatting, UPI URI.
- `dealStateMachine.ts` — statuses, transitions, `allowedActions`, guards.
- `dealActions.ts` / `dealTurn.ts` — action metadata and whose turn / next step.
- `dealPublish.ts` — field validation with field labels.
- `dealSteps.ts` — 9-step progress mapping for UI.
- `schemas/` — Zod request/response contracts for every API area.
- `copy.ts` — all user-facing reasons and labels (plain language rules).
- `invoices.ts` — invoice kinds, numbering, financial year, titles.
- `realtime.ts` — event names and payload types.
- `scrub.ts` — PII/secret redaction shared by logs and Sentry.
- `config.ts`, `enums.ts`, `accountType.ts`, `age.ts`, `upiPay.ts`, `launch.ts`, `onboarding.ts`, `payoutUpi.ts`.

Both apps build it before typecheck/test/dev. It is the main defense against API/web drift.

### 7.6 Error and state model

- API errors are `AppError(code, status, message)`; one middleware serializes `{ error: { code, message } }`.
- Validation errors are 400/422 with stable codes; permission is 403 except admin/hidden resources which are 404.
- Unexpected 5xx are logged, scrubbed and sent to Sentry; 4xx are not.
- Web distinguishes `ApiError.status` (404 → `notFound()`, 401 → redirect, others → load error), shows plain API messages, and offers retry.
- Every destructive/irreversible choice uses a modal; on phones it becomes a bottom sheet.
- Toasts: success/info 6s; errors persist until dismissed.

---

## 8. Database schema and relationships

PostgreSQL 16, Drizzle ORM, UUIDv7 primary keys generated in app code. All timestamps are `timestamptz`.

### Tables (18 verified)

**`users`**

- Identity: `id`, `instagram_user_id` (unique, nullable for email-only), `username`, `name`.
- Instagram: `ig_account_type`, followers/follows/media, `engagement_rate numeric(5,2)`, `bio`, `profile_picture_url`, encrypted token + expiry, `instagram_synced_at`.
- Role: `role` enum, `role_locked_at`.
- Contact: `email` (unique), `email_verified_at`.
- Admin: `is_admin` boolean.
- Onboarding: `onboarding_completed_at`, `last_active_at`, `deleted_at`.
- Creator payout: `payout_vpa`, `payout_name`, `payout_vpa_consent_at`; DB CHECK on UPI pattern.
- Profile: `city`, `age smallint`, `age_recorded_at`, `gender`, `website`, `pitch`, `profile_locked_at`, `adult_confirmed_at`; CHECK age pair and range, pitch length.
- Indexes: role, deleted_at; partial unique username where Instagram-linked.

**`brand_billing`** — one row per brand (`user_id` PK/FK cascade): `billing_name`, `billing_address`, `billing_state`, `gstin` (15).

**`sessions`** — `id`, `user_id` FK cascade, `token_hash` unique, `expires_at`, `ip`, `user_agent`, `created_at`; indexes on user and expiry.

**`email_verification_tokens`** — `user_id`, `email`, `token_hash` unique, `expires_at`, `used_at`; indexes user/expiry.

**`email_login_codes`** — email, `code_hash`, expiry, `attempts`, `used_at`; no user FK (code may precede account). Used only when `AUTH_EMAIL_ENABLED`.

**`deals`**

- `id`, `short_id` unique (8 chars), `brand_id` FK restrict, `creator_id` FK restrict nullable.
- Content: `title`, `description`, three `date` deadlines.
- Money: budget + six frozen breakdown fields (bigint paise).
- Status + timestamps: published, confirmed, commission paid, advance paid, approved, completed, cancelled.
- Cancellation: `cancelled_by_id` set null, `cancelled_by_role`, `cancellation_reason`.
- Content/review: `content_link`, `content_uploaded_at`, `upload_count`, `feedback`, `revision_count`.
- CHECK: every non-DRAFT row has title, description, deadlines, budget and all money fields.
- Indexes: `(brand_id, id desc)`, `(creator_id, id desc)`, `(status, id desc)`, partial `(published_at desc, id desc) where OPEN`, `short_id varchar_pattern_ops`, deadline columns, cancelled_by.

**`content_uploads`** — `deal_id` cascade, `link`, `uploaded_at`; index deal.

**`applications`** — `deal_id` cascade, `creator_id` cascade, `status` enum (`APPLIED`, `CONFIRMED`, `REJECTED`; the UI calls the last one “Not selected”), unique `(deal_id, creator_id)`, indexes creator/status.

**`deal_events`** — `deal_id` cascade, `from_status`, `to_status`, `actor_id` set null, `actor_type` (`USER`, `SYSTEM`, `ADMIN`), `note`, `metadata jsonb`, `created_at`; indexes deal/actor. Immutable: no update/delete code allowed by architecture test.

**`payments`** — `deal_id` restrict, `type` (`COMMISSION` only; advance/final are stages of `direct_payments`, not Razorpay payments), amount, Razorpay order id unique, payment id unique, status (`CREATED`, `CAPTURED`, `FAILED`), failure reason, captured time, Razorpay fee/tax. Partial unique indexes: one captured per deal/type; one open (`CREATED`/`FAILED`) per deal/type.

**`direct_payments`** — `deal_id` restrict, `stage` (`ADVANCE`, `FINAL`), amount, reference (40), `paid_to_vpa`, note, recorded_by/at, confirmed_by/at, disputed_at, dispute_reason. Partial unique one live per deal/stage (not disputed); CHECKs confirmed XOR disputed, confirmed_by iff confirmed_at, reason iff disputed_at.

**`invoices`** — `deal_id` restrict; either `payment_id` or `direct_payment_id` (exactly one); `kind` (`COMMISSION_TAX_INVOICE`, `ADVANCE_PAYMENT_RECORD`, `FINAL_PAYMENT_RECORD`); `number` unique; `financial_year`; `sequence`; immutable `snapshot jsonb`; `issued_at`. Unique per source; CHECK source/kind consistency.

**`invoice_counters`** — composite PK `(kind, financial_year)`, `last_sequence`, timestamps. Upserted inside the invoice transaction; row lock gives gap-free numbering.

**`email_log`** — optional deal/user (set null), to_email, cc jsonb, template, subject, body_text, attachment_names jsonb, provider_message_id, status (`QUEUED`, `SENT`, `FAILED`), error, created/sent. Indexes deal/user/status/provider id.

**`disputes`** — `deal_id` restrict, `raised_by_id` restrict, subject, description, status (`OPEN`, `RESOLVED`), resolution, refund_reference, resolved_by set null, resolved_at, created. Partial unique one OPEN per deal.

**`webhook_events`** — PK is Razorpay event id (varchar), event_type, redacted `payload jsonb`, received_at, processed_at, error. Indexes type/processed.

**`meta_deletion_requests`** — Instagram user id, unique confirmation code, status, created/completed. Indexes.

**`rate_limiter_points`** — backing store for `rate-limiter-flexible` (key, points, expire). Not a domain table.

### Enums (12)

`user_role`, `user_gender`, `deal_status`, `cancelled_by_role`, `application_status`, `payment_type`, `payment_status`, `direct_payment_stage`, `invoice_kind`, `deal_event_actor_type`, `email_log_status`, `dispute_status`.

### Relationships (high level)

```
users 1─1 brand_billing
users 1─N sessions / email_verification_tokens
users 1─N deals (as brand)  ──N content_uploads
users 1─N deals (as creator)
deals 1─N applications ──N users (creator)
deals 1─N deal_events
deals 1─N payments 1─0..1 invoices (commission)
deals 1─N direct_payments 1─0..1 invoices (payment record)
deals 1─N disputes
deals 1─N email_log (also user)
webhook_events / meta_deletion_requests / rate_limiter_points are standalone
```

Foreign keys deliberately use `restrict` around financial records (deals, payments, direct payments, invoices, disputes) so money history cannot be cascade-deleted. Account deletion anonymizes instead of hard-deleting where records exist.

### Migrations

12 migrations, `0000` through `0011` (`one_open_dispute`, `hot_query_indexes` last). The API never migrates on start or build. Startup compares applied migration hashes with code: code ahead → exit 1; DB ahead → warn and start. Production migrations are run manually.

---

## 9. API architecture and important endpoints

Base: `/api`. JSON except webhooks/Meta. Auth by session cookie. Every route is globally rate-limited; sensitive routes have a second limiter.

### Public / infrastructure

| Method | Path | Responsibility |
|---|---|---|
| GET | `/api/health` | DB ping, Render health check. |
| GET | `/api/config` | Public config: min budget, GST, payments/posting gates, auth-email flag, support email. |
| POST | `/api/webhooks/razorpay` | Raw-body HMAC, dedupe by event id, fast 200, async handler. |
| POST | `/api/meta/deauthorize` | Signed request; revokes/clears Instagram data. |
| POST | `/api/meta/data-deletion` | Signed request; schedules/records deletion, returns confirmation code. |
| GET | `/api/meta/deletion-status/:code` | Status only, unguessable code. |
| GET | `/api/auth/instagram/start` | Sets OAuth state cookie, redirects to Instagram. |
| GET | `/api/auth/instagram/callback` | Verifies state, exchanges code, upserts user/session, redirects to web. |
| POST | `/api/auth/logout` | Ends session, clears cookie. |
| POST | `/api/dev/login` | Non-production only; role/admin selection. |
| POST | `/api/auth/email/start`, `/verify` | Staging/tests only (`AUTH_EMAIL_ENABLED`), IP-limited. |
| POST | `/api/me/email/verify` | Public token endpoint; proves address, never signs in. |

### Current user / onboarding / profile

| Method | Path | Guard |
|---|---|---|
| GET | `/api/me` | `requireUser`; user, profile, onboarding steps, pending email. |
| DELETE | `/api/me` | `requireUser`; account deletion/anonymization. |
| POST | `/api/me/email` | `requireUser`, email limiter; send verification link. |
| POST | `/api/me/email/resend` | `requireUser`, email limiter. |
| PUT | `/api/me/profile` | `requireUser`, profile limiter; locked after first save. |
| GET/PUT | `/api/me/billing` | `role:BRAND`. |
| GET/PUT | `/api/me/payout-upi` | `role:CREATOR`, payout limiter; GET returns masked only. |
| GET | `/api/users/:id/resume` | `requireUser`; public resume data, no UPI. |

### Deals / applications / content

| Method | Path | Guard / notes |
|---|---|---|
| POST | `/api/deals` | `role:BRAND,requireOnboarded`; create draft. |
| GET | `/api/deals/feed` | `role:CREATOR,requireOnboarded`; open deals, keyset cursor. |
| GET | `/api/deals/mine` | `requireOnboarded`; role-specific list, status filter, turn/next step. |
| GET | `/api/deals/:id` | `requireOnboarded`; viewer-specific detail, 404 for non-parties. |
| PATCH | `/api/deals/:id` | `role:BRAND,requireOnboarded`; draft only. |
| DELETE | `/api/deals/:id` | `role:BRAND,requireOnboarded`; draft only. |
| POST | `/api/deals/:id/publish` | `role:BRAND,requireOnboarded`; validation + freeze + gate. |
| POST | `/api/deals/:id/applications` | `role:CREATOR,requireOnboarded`; apply. |
| GET | `/api/deals/:id/applications` | `role:BRAND,requireOnboarded`; applicants + confirm reason. |
| GET | `/api/applications/mine` | `role:CREATOR,requireOnboarded`. |
| POST | `/api/applications/:id/confirm` | `role:BRAND,requireOnboarded`; selects creator. |
| POST | `/api/deals/:id/cancel` | `role:BRAND,requireOnboarded`; early cancel. |
| POST | `/api/deals/:id/content` | `role:CREATOR,requireOnboarded`; content link. |
| POST | `/api/deals/:id/feedback` | `role:BRAND,requireOnboarded`; revision request. |
| POST | `/api/deals/:id/approve` | `role:BRAND,requireOnboarded`. |
| GET | `/api/deals/:id/events` | `requireUser`; parties/admin only. |
| GET | `/api/deals/:id/emails` | `requireUser`; parties/admin only. |

### Payments / documents / disputes

| Method | Path | Guard / notes |
|---|---|---|
| POST | `/api/deals/:id/payments/:type/order` | `role:BRAND,requireOnboarded`; commission order; advance/final return 409. |
| POST | `/api/payments/verify` | `role:BRAND,requireOnboarded`; Checkout signature + Razorpay check. |
| GET | `/api/deals/:id/direct-payment` | `role:BRAND`; full UPI only here. |
| POST | `/api/deals/:id/direct-payment` | `role:BRAND`, direct-payment-record limiter. |
| POST | `/api/direct-payments/:id/confirm` | `role:CREATOR`, decision limiter. |
| POST | `/api/direct-payments/:id/not-received` | `role:CREATOR`, decision limiter. |
| GET | `/api/deals/:id/documents/:kind` | `requireUser`; brand/creator/admin; PDF. |
| POST | `/api/deals/:id/disputes` | `requireUser,requireOnboarded`; one open per deal. |

### Admin

| Method | Path | Guard |
|---|---|---|
| GET | `/api/admin/deals` | `requireAdmin`; status, short-id prefix, cursor, total. |
| GET | `/api/admin/deals/:id` | `requireAdmin`; parties, payments, UPI records, emails, disputes, events, adminActions. |
| POST | `/api/admin/deals/:id/cancel` | `requireAdmin`; note + optional refund reference. |
| GET | `/api/admin/disputes` | `requireAdmin`; status tabs, cursor, total. |
| GET | `/api/admin/disputes/:id` | `requireAdmin`; dispute + deal + other disputes. |
| POST | `/api/admin/disputes/:id/resolve` | `requireAdmin`. |
| POST | `/api/admin/emails/:id/resend` | `requireAdmin`; rebuilds attachments. |

The authoritative route table is asserted in `apps/api/test/security/routeGuards.test.ts`; adding a route requires updating that table.

---

## 10. Authentication and authorization flow

### Instagram sign-in (production)

1. Web links to `GET /api/auth/instagram/start`. API generates a random state, stores it in a short-lived HttpOnly `vs_ig_oauth_state` cookie, redirects to Instagram’s OAuth dialog.
2. Meta redirects to `GET /api/auth/instagram/callback?code=...&state=...`.
3. API checks state against the cookie, exchanges the code for a user access token, fetches the Instagram profile and account type.
4. Account type decides role:
   - `BUSINESS` → `BRAND`.
   - `MEDIA_CREATOR` → `CREATOR`.
   - Anything else → redirect to `/login?error=account_type_unsupported` (or `instagram_account_rejected` for a private/unauthorized account).
5. Upsert by `instagram_user_id`:
   - New account: create user, set role, store token encrypted, set `is_admin` if the id is in `ADMIN_INSTAGRAM_USER_IDS`.
   - Existing account: refresh Instagram stats/token; if the account type changed, follow it only when the user has no deals/applications in the old role, otherwise `account_type_change_blocked`.
   - If the Instagram account is linked to another user: `account_linked_elsewhere`.
6. Create a session: random token, store only its SHA-256 hash with expiry, set `vs_session` cookie (HttpOnly, Secure in production, SameSite=Lax, domain from `COOKIE_DOMAIN`).
7. Redirect to `WEB_ORIGIN/onboarding` for a new/incomplete user; the web `/home` sends completed users to the right home.

Error codes surface on `/login?error=`; onboarding link failures on `/onboarding?error=`; settings link failures on `/settings?error=`.

### Email-code sign-in (staging/tests only)

- `POST /api/auth/email/start` creates a 6-digit code, stores only its hash with expiry and attempt count, emails it.
- `POST /api/auth/email/verify` checks attempts/expiry, marks used, finds or creates an email-only user, creates a session.
- Email-only users cannot finish onboarding until Instagram is connected, because role/profile come from Instagram.
- Disabled in production by `AUTH_EMAIL_ENABLED=false`; startup guard and tests enforce.

### Dev login

- `POST /api/dev/login` only mounted when `NODE_ENV !== 'production'` and `ENABLE_DEV_LOGIN=true`.
- Accepts role and `admin: true`; creates/fetches a fixture user and session.
- Web `/dev/login` form exists only in non-production builds.
- A test proves it is impossible in production.

### Sessions

- Opaque random token in cookie; DB stores hash only.
- Middleware looks up session + user on every request; expired sessions are rejected and cleaned by a job.
- Logout deletes the row and clears the cookie.
- There is no refresh token; a new sign-in creates a new session.
- Admin flag is stored in `users.is_admin`, refreshed at sign-in.

### Authorization layers

1. Route guard (authentication, onboarding, role, admin).
2. Service-level ownership/party checks.
3. State-machine guards (only valid status transitions).
4. Database constraints and partial unique indexes for races.
5. Origin check for all mutating requests.
6. Admin routes return 404 to non-admins.

### Privacy boundaries

- Full UPI ID: only the brand confirmed on the deal, only when a direct payment is due and consent exists. Creator settings show masked; admins see masked; documents store masked.
- Encrypted Instagram token at rest.
- Email bodies stored for audit; account deletion anonymizes identity but retains financial records.
- Logs and Sentry strip emails, UPI IDs, bank/PAN/IFSC patterns, tokens, cookies, headers, bodies and IPs.
- Web CSP allows only self, Razorpay, the API origin (`https`/`wss`), Instagram image CDNs and the exact Sentry DSN host.

---

## 11. Important integrations

### Instagram / Meta

- **Product:** Instagram API with Instagram Login (`instagram_business_basic`), not Facebook Login.
- **Use:** OAuth, profile (username, name, bio, followers, media count, picture), account type, token refresh.
- **Config:** `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`, `META_APP_SECRET`, `TOKEN_ENCRYPTION_KEY`.
- **Token storage:** AES-GCM encrypted; key derived by hashing the env value; never logged.
- **Meta platform obligations:** deauthorize callback, data-deletion callback (signed_request verification), deletion status page, privacy policy URL, terms URL. Docs cover the exact dashboard steps.
- **Refresh job:** refreshes tokens before expiry; failures are logged and alerted, not fatal.
- **Unclear:** whether the Meta app has live approval and whether the production redirect URI is registered; that is dashboard state, not code.

### Razorpay

- **Use:** Orders API, Checkout, Payments API, webhooks.
- **Flow:** server creates order with amount in paise; client opens Checkout with returned `keyId`; verify endpoint validates `razorpay_signature` HMAC and then fetches the payment from Razorpay; webhooks are the asynchronous source of truth.
- **Webhook events handled:** `payment.captured`, `payment.failed`, `order.paid`. Product/Route events are stored and marked processed with no handler (Route is not used).
- **Security:** raw body + `X-Razorpay-Signature` HMAC; dedupe by `X-Razorpay-Event-Id` primary key; fast 200 then async handler; failures recorded and alerted.
- **Modes:** `PAYMENTS_MODE` (`off`, `admins`, `on`) gates fee orders and the webhook route. Live keys are optional while off.
- **Fees:** Razorpay’s own fee/tax are stored on capture and absorbed by ValueSkins; shown in the deal record.

### Resend

- **Use:** all transactional email; 28 templates plus a shared layout.
- **Config:** `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TRANSPORT` (`console` locally, `resend` deployed).
- **Logging:** every send inserts `email_log`; success stores provider id, failure stores error and status `FAILED`.
- **No retry queue:** admin resend is the recovery path.
- **Footer/reply-to:** `SUPPORT_EMAIL`; `DISPUTE_EMAIL` defaults to it.

### Sentry

- Errors only; no tracing, replay, logs or breadcrumbs.
- API initialized in `src/instrument.ts` before app load; web via `@sentry/nextjs`.
- Shared `scrubSentryEvent` strips user/IP, headers, cookies, bodies, query strings, and redacts PII patterns.
- Disabled when DSN is unset.

### Hosting / operations

- **Render:** production API, Singapore, free instance, manual deploys, health check `/api/health`, no pre-deploy command.
- **Neon:** production PostgreSQL 16, free plan, direct (non-pooled) connection required.
- **Netlify:** production web, no Git link; deployed by GitHub Actions with pinned Netlify CLI; 300 credits/month.
- **Vercel:** staging web.
- **Cloudflare:** DNS only (not in code).
- **GitHub Actions:** CI and production web deploy.
- **Docker Compose:** local Postgres 16 + test database.

### Other libraries

- **PDFKit + DejaVu fonts:** invoice/payment-record/deal-record PDFs; deterministic layout; no external PDF service.
- **`qrcode`:** generates the UPI QR in the browser on the payment step only.
- **Socket.io:** same-origin WebSocket with cookie credentials; no Redis adapter.
- **`rate-limiter-flexible` + Postgres:** shared limits across processes; table `rate_limiter_points`.

---

## 12. Development and execution instructions

### Prerequisites (verified)

- Node.js 22.
- pnpm 9.15.9 (`corepack enable`).
- Docker (local PostgreSQL 16).
- Optional: Meta app + Instagram tester account for real OAuth; Razorpay test account for payments; Resend account for real email.

### First run

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- API: `http://localhost:4000`
- Web: `http://localhost:3000`
- Health: `GET http://localhost:4000/api/health` → `{ "ok": true }`

`pnpm dev` builds `packages/shared` first, then runs both apps in parallel.

### Workspace commands

| Command | What it does |
|---|---|
| `pnpm dev` | Build shared, run API + web in watch mode. |
| `pnpm build` | Build shared + both apps. |
| `pnpm typecheck` | Build shared, then `tsc --noEmit` in every package. |
| `pnpm lint` | ESLint over the repo. |
| `pnpm format` / `pnpm format:check` | Prettier write/check. |
| `pnpm test` | Build shared, then Vitest in every package. |
| `pnpm db:generate` | Drizzle generate migration from schema. |
| `pnpm db:migrate` | Apply migrations using `apps/api/src/db/migrate.ts`. |
| `pnpm db:seed` | Seed fixture users/deals (CLI refuses production). |
| `pnpm db:seed-demo` | Richer demo data via `apps/api/scripts/seed-demo.ts`. |
| `pnpm job <name>` | Run one scheduled job manually. |
| `pnpm notify:launch` | Launch announcement emails, dry-run first. |

### Environment variables (names and purposes only)

**API** (validated by Zod at startup; process exits on invalid/missing required values):

- Core: `NODE_ENV`, `PORT`, `DATABASE_URL`, `TEST_DATABASE_URL`.
- Web/session: `WEB_ORIGIN`, `COOKIE_DOMAIN`, `SESSION_COOKIE_NAME`, `SESSION_SECRET`.
- Encryption: `TOKEN_ENCRYPTION_KEY`.
- Instagram/Meta: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`, `META_APP_SECRET`.
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (optional while payments are off).
- Email: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TRANSPORT`.
- People: `ADMIN_INSTAGRAM_USER_IDS`, `SUPPORT_EMAIL`, `DISPUTE_EMAIL` (optional, defaults to support).
- Auth gates: `ENABLE_DEV_LOGIN`, `AUTH_EMAIL_ENABLED`.
- Company/tax: `COMPANY_LEGAL_NAME`, `COMPANY_ADDRESS`, `COMPANY_STATE`, `COMPANY_GSTIN`, `COMMISSION_SAC_CODE`, `GST_RATE_BPS`.
- Launch gates: `PAYMENTS_MODE`, `DEAL_POSTING_MODE` (`off`/`admins`/`on`).
- Observability: `SENTRY_DSN`.

**Web:**

- `NEXT_PUBLIC_API_URL` — API origin.
- `NEXT_PUBLIC_SENTRY_DSN` — optional browser error reporting.
- `NEXT_PUBLIC_ENABLE_DEV_LOGIN` — staging/local only; a production API + true fails the build.

No secret values are in this document. `.env.example` lists names; real values belong in local `.env` or the host’s secret store.

### Database setup

- `docker-compose.yml` starts Postgres 16 with database `valueskins_dev`, user/password `valueskins`, and mounts `docker/init-test-db.sql` to create the test database.
- `DATABASE_URL` points at the dev DB; `TEST_DATABASE_URL` at the test DB.
- Migrations live in `apps/api/drizzle`; Drizzle journal in `drizzle/meta`.
- The app never auto-migrates. Production migration is a manual command with `DATABASE_URL` read from the shell.

### Tests

- API: Vitest + Supertest + MSW; real Postgres test database; helpers create users/deals/sessions; full e2e in `apps/api/test/e2e/liveFlow.test.ts`.
- Shared: property-based money/state-machine tests (`fast-check`), schema tests, copy rules.
- Web: Vitest + jsdom + Testing Library; MSW for API; component tests for landing, onboarding, deal page, admin, settings, shell, errors, CSP.
- CI uses a Postgres 16 service and runs `pnpm test`.
- Tests were **not executed** during this onboarding exercise (read-only discovery). CI is configured to run them on push/PR.

### Local Instagram / payments

- Real Instagram login needs a Meta app and a tester account; use `/dev/login` for most local work.
- Local webhooks need a public tunnel (cloudflared/ngrok) registered in Razorpay test mode.
- `EMAIL_TRANSPORT=console` prints emails, including sign-in codes, to the API terminal.

### Deployment

- **Production API:** `render.yaml` (manual deploy, free instance, Singapore, `api.valueskins.com`, env via dashboard, no secrets in git).
- **Production web:** `.github/workflows/deploy-web-production.yml` → Netlify, only after CI passes on `main`, only for web-related changes, with a pinned CLI and production URL check.
- **Staging web:** `apps/web/vercel.json`.
- **Cutover:** `docs/CUTOVER.md` (prepare → production checks on `next.valueskins.com` → DNS/Meta switch → checks → one-week rollback window).
- **Runbook:** `docs/RUNBOOK.md` (logs, DB queries, deploys/rollbacks, backups, accepted advisories).
- **Go-live checklist:** `docs/SPEC.md` section 22.

---

## 13. Current implementation status

| Area | Status | Evidence |
|---|---|---|
| Monorepo, shared domain, strict TS | Complete | package manifests, `packages/shared` |
| Database schema + 12 migrations | Complete | `apps/api/drizzle`, schema tests |
| Env validation + startup guards | Complete | `apps/api/src/env`, tests |
| Instagram OAuth + role mapping | Complete | `apps/api/src/instagram`, e2e test |
| Email-code auth (staging) | Complete, gated | `emailAuth`, tests |
| Dev login | Complete, gated | `devLogin`, tests |
| Sessions/cookies/logout | Complete | `auth`, tests |
| Onboarding + email verification | Complete | `onboarding`, web onboarding tests |
| Profiles + locking + resume | Complete | `profile`, `users/resume`, tests |
| Deal drafts/publish/feed/lists | Complete | deals routes/services, e2e |
| State machine + allowed actions | Complete, enforced | shared state machine, architecture test |
| Applications + confirmation | Complete | applications service, e2e |
| Razorpay fee flow | Complete | order/capture/verify/webhook tests |
| Direct UPI record/confirm/dispute | Complete | directPayments tests, e2e |
| Invoices + numbering + PDFs | Complete | invoice/document tests, e2e |
| Emails (28 templates) | Complete | templates, e2e email assertions |
| Disputes | Complete | disputes tests |
| Admin deals/disputes/resend/cancel | Complete | admin tests |
| Realtime | Complete for single instance | server/events/provider tests |
| Scheduled jobs | Complete | registry/job tests |
| Rate limiting | Complete | limiter factory tests |
| Sentry + log scrubbing | Complete | sentry/logger tests |
| Landing + public pages | Complete | landing tests |
| Creator screens | Complete | creator screen tests |
| Brand screens | Complete | brand screen tests |
| Deal page | Complete | deal page/payments/realtime tests |
| Settings | Complete | settings tests |
| Admin screens | Complete | admin tests |
| Admin analytics | Not built | `docs/WEB_API_GAPS.md` |
| Refund automation | Not built (manual) | same |
| Admin alert inbox | Not built (email only) | same |
| Data import from old app | Not built (not needed per cutover) | scripts list, CUTOVER |
| Browser E2E / visual regression | Not present | test inventory |
| Production launch | Not open by default | `render.yaml`, gates |
| Staging verification | Unknown | DNS/ops state not in repo |

**Tests at a glance:** 175 `*.test.ts*` files in total, plus API helpers and harnesses; 31 of the test files are web tests. CI typechecks, lints, tests, builds and audits production dependencies. The test suite is unusually strong for a project this size, especially around money, races, route authorization, privacy and copy rules.

---

## 14. Known bugs and technical debt

Prioritized by actual impact. None of these are “the app is broken”; they are the honest weak points.

### High impact / launch-blocking operational risks

1. **Free Render instance sleeps, so scheduled jobs do not run on time.**
   - `render.yaml` (`plan: free`), `apps/api/src/jobs/scheduler.ts`, `docs/CUTOVER.md`.
   - Fee/payment/review/content reminders can be delayed by hours; missed ticks are not backfilled.
   - Accepted by the founders on 11 November 2026; Task 4 makes jobs tolerate sleeping. Current production gates are off.
2. **Split deploy cadence between API and web.**
   - Web deploys automatically on merge (`.github/workflows/deploy-web-production.yml`); API is manual (`autoDeployTrigger: 'off'` in `render.yaml`).
   - A merge that changes API and web together can serve a new web build against an old API.
   - Mitigation: deploy API first, or make API deploy part of the same release process.
3. **Realtime is single-instance.**
   - `apps/api/src/realtime/server.ts` uses in-memory Socket.io rooms; no Redis adapter.
   - Horizontal scaling would split rooms and break live updates. Current free/paid single instance is fine.
4. **No durable retry for emails or webhook handlers.**
   - `apps/api/src/email/send.ts` logs failures but does not retry; `webhooks/processEvent.ts` records handler errors and alerts, no retry.
   - Admin resend exists for email; webhook events require manual investigation.
   - Acceptable for v1 volume, but a real queue/outbox would be the next reliability step.
5. **Production backups are short and restore is untested.**
   - Neon Free restores only the last 6 hours; `docs/CUTOVER.md` defers the restore test; the founders accepted free hosting on 11 November 2026.
   - Financial/legal records make this a serious pre-launch item.

### Medium impact

6. **Admin revocation requires a fresh sign-in.**
   - `users.is_admin` is written at Instagram sign-in from `ADMIN_INSTAGRAM_USER_IDS`; removing an id does not demote an existing session/user until they sign in again.
   - Reference: `apps/api/src/instagram/oauth.routes.ts`, `apps/api/src/db/schema/users.ts`.
7. **Rate limiting writes to Postgres on every request.**
   - `rate_limiter_points` via `rate-limiter-flexible`; simple and shared, but adds write load and a DB dependency to every call. At scale, Redis or an in-memory+DB hybrid is the usual move.
8. **Deal history payloads grow without pagination.**
   - `GET /deals/:id/events` and `/emails` return the full set; admin deal detail returns all emails. A long-lived or disputed deal produces a large response. UI truncates display, not transport.
9. **No browser-level end-to-end tests.**
   - API e2e is excellent; web tests are jsdom. Real Razorpay Checkout, QR rendering, CSP in a browser, cookie behavior across domains and Socket.io handshakes are not automatically verified.
10. **Documentation drift.**
    - `README.md` says a failed Instagram login lands on `/auth/error?error=...`; the actual route is `/login?error=...` (`apps/web/app/(public)/login/page.tsx`).
    - `docs/SPEC.md` section 19 still lists production DB as “Render Postgres (paid, backups)”, while `render.yaml` and `docs/CUTOVER.md` describe Neon Free with a 6-hour restore window.
    - These are docs-only issues, but they mislead operators.
11. **UPI payment verification is honor-system plus creator confirmation.**
    - The brand can enter any reference; the creator is the check. There is no UTR lookup or bank confirmation. This is a deliberate product tradeoff, not a coding bug, but it is the largest fraud/dispute vector.
12. **Fee refunds are fully manual.**
    - No refund table, no idempotent refund API, no reconciliation. References live on events/disputes. A missed manual refund is an operational risk.
13. **No admin alert inbox or analytics.**
    - Alerts are emails; failed webhook rows are the only queue-like view. Analytics was specified but never built.
14. **Account deletion vs. legal retention is subtle.**
    - Users are anonymized; financial rows and stored email bodies remain. This is intentional for audit, but needs to match the published privacy policy and deletion commitments.

### Low impact / code quality

15. **`users.username` uniqueness is only enforced for Instagram-linked users.**
    - Deliberate for future email-only accounts; can produce duplicate display usernames if email-only accounts are ever enabled broadly.
16. **Legacy payment enum values remain.**
    - API paths and identifiers still use `commission` and `payments/:type` even though only the fee uses Razorpay. This is deliberate to keep URLs/enums stable, but it adds naming friction for new developers.
17. **Stored email bodies and `email_log` grow forever.**
    - No retention job beyond cleanup of sessions/tokens/webhooks. Disk growth and PII surface.
18. **Dependency upgrade backlog.**
    - Dependabot branches exist for Next 16, Tailwind 4, Node types 26, ESLint config, etc.; the repo is intentionally pinned to Next 15 / Tailwind 3 / Node 22. Plan a coordinated upgrade, not piecemeal.
19. **Copy/design coupling.**
    - `apps/web/test/copyRules.test.ts` enforces no em dashes/banned words across web, email and shared copy. Legitimate, but easy to trip when writing copy.
20. **Single maintainer history and many unmerged remote branches.**
    - Not a code defect, but a bus-factor and branch-hygiene risk.

### Deliberate non-features (do not “fix” without a product decision)

- No chat/negotiation.
- No escrow/wallet.
- No Route/Transfers.
- No automatic dispute refunds.
- No role picker.
- No dark mode.
- No multi-currency.
- No preview-deployment sign-in.

---

## 15. Outstanding tasks and unfinished features

### Before public launch

1. Paid hosting is no longer required (decision of 11 November 2026; the hosting tier guard is removed). Test a restore once, knowing Neon Free restores only 6 hours.
2. Register live Razorpay keys and webhook (`payment.captured`, `payment.failed`, `order.paid`); run one real minimum-budget deal between founders.
3. Get CA sign-off on invoice format, SAC code, GSTIN, and whether marketplace TDS (194-O) / GST TCS applies. If it applies, payout math and reporting change.
4. Minimum budget: decided and built, ₹2,000.
5. Verify Meta app live approval, redirect URI, deauthorize/data-deletion URLs, privacy/terms URLs.
6. Verify Resend domain (SPF/DKIM) and deliverability to Gmail/Outlook.
7. Confirm production DNS/cutover state, admin ids, Sentry projects, and the support mailbox.
8. Run the full `docs/CUTOVER.md` B/D checklists on the real hosts.

### After launch / next engineering work

9. Admin analytics (`GET /admin/analytics` + screen).
10. Refund/reconciliation workflow if manual refunds become frequent.
11. Durable email/webhook retry (outbox or queue) and an admin alert list.
12. Redis Socket.io adapter and horizontal scaling plan.
13. Browser E2E for sign-in, Checkout, UPI QR, realtime and document downloads.
14. Retention/archival policy for `email_log`, events and deleted accounts.
15. OpenAPI generation from shared Zod schemas if external clients appear.
16. Coordinated dependency upgrades (Next 16, Tailwind 4, Node types).
17. Performance/load testing of feed, admin lists and rate limiter.
18. Auto-cancel or escalation policy for stuck deals (open product decision).

---

## 16. Important architectural decisions

1. **Monorepo with a shared domain package.**
   - Money math, state machine, allowed actions, Zod schemas, copy and event names live once in `packages/shared`.
   - Rationale: API and web cannot drift on the most dangerous logic (paise, transitions, error wording).
2. **Server-authoritative state machine.**
   - Only `transitionDeal()` writes status; architecture tests scan for violations.
   - Rationale: one place for concurrency, events, emails, invoices and permissions.
3. **Integer paise only.**
   - No floats; formatting only at the edges.
   - Rationale: GST/30-70 splits must reconcile to the paisa.
4. **Flat fee + frozen breakdown.**
   - ₹750 + 18% GST, frozen at publish.
   - Rationale: predictable pricing and immutable invoices; later rate changes do not rewrite history.
5. **Direct UPI instead of Razorpay Route.**
   - RBI rules closed Route for this merchant profile; the creator confirms receipt.
   - Rationale: keep the platform out of custody and avoid a payout license/ops burden.
6. **Role from Instagram account type.**
   - No role picker; changed types are constrained by existing activity.
   - Rationale: prevents users choosing the wrong side and keeps identity tied to the social account.
7. **Profiles saved once and locked.**
   - Corrections go through support.
   - Rationale: resume integrity and less moderation surface.
8. **UPI disclosure minimization.**
   - Full VPA only to the confirmed brand while a payment is due; masked everywhere else; architectural tests enforce file-level access.
   - Rationale: payment fraud and privacy.
9. **Admin routes are 404, not 403.**
   - Rationale: do not reveal admin surface to non-admins.
10. **Origin check on every mutating request.**
    - Cookie SameSite=Lax plus explicit Origin validation, with signature-authenticated webhook/Meta exemptions.
    - Rationale: CSRF defense without a token round-trip.
11. **Postgres for rate limits and advisory locks.**
    - No Redis; jobs use `pg_advisory_lock`, counters use row locks, rate limits use a table.
    - Rationale: one dependency, correct across processes, adequate at current scale.
12. **In-process cron and Socket.io.**
    - Simple and free-tier friendly; jobs are idempotent and locked; realtime is single-instance.
    - Rationale: avoid worker/broker infrastructure before traction; documented scale-out path.
13. **Immutable invoice/payment-record snapshots.**
    - PDFs re-render byte-identically from stored JSON; numbering is gap-free per series/year.
    - Rationale: tax/legal reproducibility.
14. **Next.js App Router with nonce CSP and dynamic rendering.**
    - Legal markdown bundled via `outputFileTracingIncludes`.
    - Rationale: strict CSP without unsafe-inline; accept per-request rendering.
15. **Two visual languages, one token system.**
    - Landing is bold (`.hm`, pink/lime); app/public pages are calm; light only.
    - Rationale: marketing distinct from product while sharing tokens and accessibility rules.
16. **Docs as executable process.**
    - `CLAUDE.md` rules, `docs/SPEC.md`, prompt history in `REPLACEMENT_PLAN.md`, cutover/runbook.
    - Rationale: the repo is operated by a very small team; checklists reduce release risk.
17. **No data import from the old app.**
    - Cutover assumes only founders’ test accounts existed.
    - Rationale: avoid schema/importer work for empty data; must be re-checked before switch.

---

## 17. Critical files and responsibilities

### Root / process

- `CLAUDE.md` — working rules, invariants, stack, testing and copy conventions. Read before changing code.
- `README.md` — local setup, testing Instagram, checks. (One stale `/auth/error` reference.)
- `docs/SPEC.md` — product and technical source of truth, including UI/copy, security checklist, go-live.
- `docs/REPLACEMENT_PLAN.md` — why the rebuild exists, parity rules, prompt history.
- `docs/CUTOVER.md` — exact production switch, checks, rollback.
- `docs/DEPLOYMENT.md` — environments, Meta/Razorpay/Resend/Sentry/Neon/Render/Netlify setup.
- `docs/RUNBOOK.md` — operations, logs, DB queries, deploys, backups, accepted advisories.
- `docs/WEB_API_GAPS.md` — closed gaps and deliberate exclusions.

### Shared domain

- `packages/shared/src/money.ts` — `computeBreakdown`, GST, formatting, UPI URI.
- `packages/shared/src/dealStateMachine.ts` — statuses, transitions, guards. **Do not bypass.**
- `packages/shared/src/dealActions.ts` — `allowedActions` and reasons.
- `packages/shared/src/dealTurn.ts` — whose turn / next step.
- `packages/shared/src/dealPublish.ts` — publish validation.
- `packages/shared/src/copy.ts` — all plain-language strings.
- `packages/shared/src/schemas/*` — request/response contracts.
- `packages/shared/src/invoices.ts` — invoice series, numbers, titles.
- `packages/shared/src/scrub.ts` — PII redaction.
- `packages/shared/src/realtime.ts` — event names/payloads.

### API

- `apps/api/src/app.ts` — middleware order and every mounted router.
- `apps/api/src/index.ts` — startup: env, DB/migrations, HTTP, Socket.io, scheduler.
- `apps/api/src/env/schema.ts`, `startupGuards.ts` — config validation and launch guards.
- `apps/api/src/deals/stateMachine.ts` — the only status writer.
- `apps/api/src/deals/lifecycle.service.ts` — publish/cancel/content/approve/feedback actions.
- `apps/api/src/deals/drafts.service.ts` — draft CRUD (never status).
- `apps/api/src/deals/access.ts` — party/admin access decisions.
- `apps/api/src/deals/queries.service.ts`, `dealDetail.ts`, `dealView.ts` — lists/detail shapes.
- `apps/api/src/deals/payoutDetails.ts` — the only full-UPI disclosure gate.
- `apps/api/src/applications/applications.service.ts` — apply/confirm/not-selected.
- `apps/api/src/payments/order.service.ts`, `markPaymentCaptured.ts`, `payments.routes.ts` — fee rail.
- `apps/api/src/directPayments/directPayments.service.ts`, `view.ts` — UPI rail.
- `apps/api/src/webhooks/razorpay.routes.ts`, `processEvent.ts`, `handlers/index.ts` — webhook security/dedupe/handlers.
- `apps/api/src/invoices/numbering.ts`, `issueInvoice.ts`, `snapshot.ts` — tax documents.
- `apps/api/src/documents/*` — PDF rendering and access.
- `apps/api/src/disputes/disputes.service.ts` — one-open-dispute and resolution.
- `apps/api/src/admin/*` — admin list/detail/cancel/resend.
- `apps/api/src/email/send.ts`, `templates/*` — all outbound mail.
- `apps/api/src/realtime/server.ts`, `emitter.ts`, `events.ts` — socket auth/rooms/events.
- `apps/api/src/jobs/*` — registry, scheduler, lock, each job.
- `apps/api/src/security/originCheck.ts`, `cors.ts`, `helmet.ts`, `rawBody.ts` — request security.
- `apps/api/src/auth/guards.ts`, `sessionMiddleware.ts` — auth.
- `apps/api/src/instagram/oauth.routes.ts`, `upsertUser.ts`, `resolveRole.ts`, `client.ts` — identity.
- `apps/api/src/meta/*` — platform deletion/deauthorize obligations.
- `apps/api/src/db/schema/*` — the data model.
- `apps/api/test/security/routeGuards.test.ts` — route/guard contract.
- `apps/api/test/architecture/*` — invariants that must not regress.
- `apps/api/test/e2e/liveFlow.test.ts` — the canonical end-to-end story.

### Web

- `apps/web/app/layout.tsx`, `middleware.ts`, `providers.tsx` — frame, CSP, query/toast/realtime.
- `apps/web/lib/api/client.ts` — fetch, credentials, typed errors.
- `apps/web/lib/api/deals.ts`, `queries.ts`, `admin.ts` — data hooks/keys.
- `apps/web/lib/access.ts` — route access rules.
- `apps/web/components/shell/*` — AppShell, Guard, navigation, sign-out.
- `apps/web/components/landing/*`, `app/home.css` — landing page.
- `apps/web/components/onboarding/OnboardingFlow.tsx` — setup screens.
- `apps/web/components/brand/DealForm.tsx` — create/edit deal, local draft, calculator.
- `apps/web/components/deal/DealPage.tsx`, `DealSteps.tsx`, `NextStep.tsx`, `panels/*` — shared deal UI.
- `apps/web/components/deal/panels/UpiPayPanel.tsx` — UPI link/QR/record.
- `apps/web/components/admin/*` — admin screens.
- `apps/web/components/realtime/RealtimeProvider.tsx` — socket lifecycle and invalidation.
- `apps/web/components/ui/*` — design primitives, toasts, skeletons, load errors.
- `apps/web/test/copyRules.test.ts` — copy gate.

### Config / ops

- `render.yaml` — production API.
- `.github/workflows/ci.yml` — checks.
- `.github/workflows/deploy-web-production.yml` — production web deploy.
- `apps/web/netlify.toml`, `vercel.json` — hosting builds.
- `docker-compose.yml`, `docker/init-test-db.sql` — local DB.
- `apps/api/drizzle/*` — migrations.
- `apps/api/scripts/seed-demo.ts` — demo data (no live import).

---

## 18. Potential risks and areas requiring further investigation

| Risk | Why it matters | Current mitigation | What to verify |
|---|---|---|---|
| Free-tier API sleep | Jobs late; first request slow; deploys restart | Accepted by the founders on 11 November 2026; Task 4 makes jobs tolerate sleeping | Jobs catch up after waking |
| Short backup window | Financial/legal data loss | Neon 6h restore | Restore test; paid plan |
| Split API/web deploys | Version skew | Manual API deploy discipline | Release order / automation |
| Single-instance realtime | Live updates break on scale-out | Single instance | Redis adapter before scaling |
| No email/webhook retry | Lost notifications, stuck processing | Admin resend; event log/alert | Queue/outbox |
| Honor-system UPI | Fake/incorrect references | Creator confirmation; immutable records | UTR verification or dispute policy |
| Manual refunds | Missed refunds, reconciliation errors | Event/dispute reference | Refund process owner |
| Admin flag staleness | Removed admin retains access | Sign-in refresh | Force re-evaluation or short session |
| Postgres rate limiting | DB load/latency at scale | Shared limits, small pool | Load test; Redis option |
| Long deal histories | Large payloads | UI truncation | Pagination/archival |
| Docs drift | Wrong operator actions | Source-of-truth docs | Reconcile README/SPEC vs code |
| Meta/Razorpay dashboard state | Sign-in/payments can fail despite code | Cutover checklist | Confirm live approval/keys |
| TDS/TCS uncertainty | Payout math/reporting may change | Open decision | CA sign-off |
| Account deletion vs. retention | Legal/privacy mismatch | Anonymization + snapshots | Counsel/privacy review |
| No browser E2E | Checkout/CSP/realtime regressions | API e2e + component tests | Add Playwright smoke |
| Bus factor | One maintainer, many branches | Docs/checklists | Review/ownership plan |

### Questions the repository cannot answer

1. Has the production cutover actually happened? Is `valueskins.com` on Netlify and `api.valueskins.com` on Render now, or still on the old app?
2. Is staging (`staging.valueskins.com`, `api-staging.valueskins.com`) live, and is its DNS configured? `docs/CUTOVER.md` says to check because records were missing when written.
3. Is the Meta app approved/live for `instagram_business_basic`, and are the production redirect/deauthorize/deletion URLs registered?
4. Are live Razorpay keys and the live webhook configured, or is production still fully closed?
5. Has the CA approved the invoice format, SAC code, GSTIN, and confirmed whether marketplace TDS/TCS applies?
6. Minimum budget: decided and built, ₹2,000.
7. What is the production data state: only founders’ test accounts, or real users/deals/payments?
8. Who owns operational accounts (Cloudflare, Render, Netlify, Neon, Meta, Razorpay, Resend, Sentry), and is there a second maintainer?
9. Is there a support/refund SLA or written dispute policy beyond the in-app flow?
10. Are email bodies and deal records intended to be retained indefinitely for legal reasons? The privacy policy wording should match.
11. Is horizontal scaling planned soon? If yes, Socket.io/rate limiting/jobs need a shared backend.
12. Are preview deployments required for design review with authentication? Current architecture cannot sign in from `*.vercel.app`.

---

## Appendix A — Deal status and action map (practical summary)

| Status | Who acts next (normal path) | Main action |
|---|---|---|
| `DRAFT` | Brand | Edit, publish, delete |
| `OPEN` | Creator | Apply; brand may cancel |
| `CONFIRMED` | Brand | Pay ₹885 fee; brand may cancel |
| `COMMISSION_PAID` | Brand | Pay 30% by UPI and record it |
| `ADVANCE_PAID` | Creator | Upload content |
| `CONTENT_UPLOADED` | Brand | Request changes or approve |
| `REVISION_REQUESTED` | Creator | Upload revised content |
| `APPROVED` | Brand | Pay 70% by UPI and record it |
| `COMPLETED` | — | Deal record available; resume updated |
| `CANCELLED` | — | Read-only history; fee may have been kept |

Admin may cancel from `COMMISSION_PAID` through `APPROVED` (per the admin action rules), with a note and optional refund reference.

---

## Appendix B — Copy and UI rules that affect code review

From `CLAUDE.md` and `docs/SPEC.md` section 18, enforced in part by tests:

- Users see “ValueSkins fee”, never “commission”; “Deal record”, never “Deal Report”.
- Error messages never name a raw status or provider detail; use plain words and a next step.
- Every disabled action shows the API’s reason verbatim.
- No emojis, em dashes or en dashes in user-facing copy; `apps/web/test/copyRules.test.ts` fails the build.
- Amounts: `₹10,000.00`, Indian grouping, paise lighter in large amounts.
- Dates `30 Sep 2026`, times `9:12 am`, always IST.
- Light mode only; AA contrast; 44px targets; reduced motion respected.
- One accent (saffron) in the app; landing uses pink and lime with lime reserved for creator money.
- Modals only for irreversible choices; toasts: 6s success/info, persistent errors.

---

## Appendix C — How to start a development task here

1. Read `CLAUDE.md`, then the relevant `docs/SPEC.md` section, then `docs/WEB_API_GAPS.md` for known decisions.
2. Find the shared schema/state first (`packages/shared`), then the API service, then the web screen.
3. Preserve invariants:
   - Money in paise via `computeBreakdown`.
   - Status only via `transitionDeal`.
   - Fee only via Razorpay; creator share only direct UPI with creator confirmation.
   - Full UPI only through `deals/payoutDetails.ts`.
   - Every mutating route Origin-checked; every route guarded or allowlisted.
   - Admin routes 404 to non-admins.
   - After-commit side effects (email, realtime, documents) must not change the deal in the same transaction.
4. Add/adjust tests:
   - API behavior and authorization.
   - Shared schema/money/state tests.
   - Web component/access/copy tests.
   - Update the route table in `routeGuards.test.ts` if adding a route.
5. Run `pnpm typecheck && pnpm lint && pnpm test` (and `pnpm build` for release-affecting changes).
6. If a migration is added: generate, review SQL, run locally, then production manually before deploy.
7. If a new user-facing string is added: update `copy.ts` or the template, run the copy check.
