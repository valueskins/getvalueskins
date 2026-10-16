# CLAUDE.md - getvalueskins

Read this whole file at the start of every session. It applies to every task in this repo.

## 1. What this repo is

- ValueSkins (Valueskins Private Limited) is a marketplace where brands hire Instagram creators for fixed-price content deals in India. One brand and one creator per deal. No chat, no negotiation.
- This repo, `valueskins/getvalueskins`, is a rebuild. It will replace the live app in `valueskins/valueskins` (valueskins.com), which is maintained separately. Never change, push to, or depend on that repo. Its data is reached only through the import in `docs/REPLACEMENT_PLAN.md` (Prompt 18), using a read-only copy.
- The API is built through Prompt 11. The web app in `apps/web` is temporary and will be rebuilt from a design handoff (section 15).

## 2. Sources of truth

Read the sections a task names before writing code.

1. **`docs/REPLACEMENT_PLAN.md` section 2** defines the target rules until cutover. Where it differs from the spec, it wins.
   - Implement a target rule only in the prompt that asks for it. Until then the existing code and spec stand.
   - When you implement one, update `docs/SPEC.md` in the same change.
2. **`docs/SPEC.md`** is the product and technical spec, and must always describe what the code does.
3. **`docs/DEPLOYMENT.md`** covers environments and manual setup. Update it whenever env vars, URLs, webhooks or manual steps change.
4. `docs/V0_LAUNCH.md` is retired. Do not follow it. Where it still disagrees with the spec, the spec wins.

If a prompt, the plan, the spec and the code disagree, or something seems wrong, **stop and ask**. Never resolve a contradiction by guessing.

## 3. How to work on a task

- Work only on the current prompt. Do not build ahead, and do not add features, fields, endpoints, tables, env vars or dependencies the prompt and spec do not call for.
- One task per branch, named `feat/...`, `fix/...` or `chore/...`. Small commits.
- For any external API detail (Instagram, Meta, Razorpay, Resend), check the current official docs. Do not rely on memory. Say in your summary what you verified, and where.
- Never create, change or delete resources in any external account (Render, Vercel, Razorpay, Meta, Resend, DNS). Write the config and the steps, and the human does it.
- Ask before deleting anything you are not sure is unused.
- End every task with:
  - what you built or changed
  - how to run and verify it, locally and on staging
  - the tests you added
  - the docs you updated
  - anything open or needing a human (keys, dashboard settings, decisions)

**Definition of done:** `pnpm typecheck && pnpm lint && pnpm test` pass, the new behaviour has tests, `docs/SPEC.md` and `docs/DEPLOYMENT.md` match the code, and nothing in section 13 is violated.

## 4. Stack, layout and commands

- Node 22, pnpm 9 workspaces, TypeScript `strict` everywhere, ESM.
- `apps/api`: Express 5, Drizzle ORM on PostgreSQL 16 (node-postgres), Zod, pino, rate-limiter-flexible, PDFKit, Resend. Socket.io from Prompt 16. Deployed on Render, Singapore.
- `packages/shared`: money math, the deal state machine and allowed actions, enums, Zod request and response schemas, and text constants. Both apps import it, so rules and numbers can never disagree. Any rule needed by both apps lives here.
- `apps/web`: Next.js on Vercel. Being rebuilt (section 15).
- `docs/`: spec, replacement plan, deployment, runbook.

Commands (from the repo root):
- `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format`
- `pnpm db:generate` (new migration from the schema), `pnpm db:migrate`, `pnpm db:seed`
- Local Postgres comes from `docker-compose.yml`. API tests use `TEST_DATABASE_URL`.

## 5. Environments and configuration

- Environments: `development`, `test`, `staging`, `production`.
  - Staging: `staging.valueskins.com` and `api-staging.valueskins.com`, Razorpay test mode.
  - Production: `valueskins.com` and `api.valueskins.com`, live mode.
- All configuration comes from env vars, validated with Zod at startup in `apps/api/src/env/`. The process exits with a clear message if anything is missing or invalid. A new env var needs four things: the schema, `.env.example` (name and one-line comment, no value), CI, and `docs/DEPLOYMENT.md`.
- Startup guards (`apps/api/src/env/startupGuards.ts`) refuse to start when:
  - production has `ENABLE_DEV_LOGIN=true`
  - the Razorpay key mode does not match the environment (`rzp_live_` only in production, `rzp_test_` everywhere else), checked whenever a key is set
  - production has `PAYMENTS_MODE` other than `off` without a live key id, key secret, `RAZORPAY_WEBHOOK_SECRET` and `COMPANY_GSTIN`
  - `GST_RATE_BPS > 0` while `COMPANY_GSTIN` is empty
  - production has `EMAIL_TRANSPORT=console`
  - from Prompt 14: production has `AUTH_EMAIL_ENABLED=true`
  Never weaken a guard. Add new guards for any new dangerous combination.
- Boolean env vars are the literal strings `true` or `false`. Never use `z.coerce.boolean()`.
- `PAYMENTS_MODE` and `DEAL_POSTING_MODE` (`off`, `admins`, `on`) close the ValueSkins fee and publishing. Unset, they are `off` in production and `on` elsewhere. They change with a restart, not a deploy.
- **Dev login** exists only when `NODE_ENV !== 'production'` and `ENABLE_DEV_LOGIN=true`. **Email-code sign-in** is for staging and tests only, never production.

## 6. Product rules the code must always enforce

Details are in the spec. These are the invariants.

### 6.1 Users and roles

- A user is a **brand** or a **creator**. From Prompt 14, the role comes from the Instagram account type at sign-in: `BUSINESS` = brand, `MEDIA_CREATOR` = creator. Users never choose it, and it never comes from the request.
- A brand never applies. A creator never posts, confirms or pays. Admins are listed in `ADMIN_INSTAGRAM_USER_IDS`. Email-only accounts are never admins.
- An email address, verified, is required to use the marketplace.

### 6.2 Deal lifecycle

- Statuses: `DRAFT, OPEN, CONFIRMED, COMMISSION_PAID, ADVANCE_PAID, CONTENT_UPLOADED, REVISION_REQUESTED, APPROVED, COMPLETED, CANCELLED`.
- **The only allowed transitions are the table in `packages/shared/src/dealStateMachine.ts`.** It is covered by exhaustive tests. Change it only when a prompt says so, and update the tests and SPEC 5.2 with it.
- **Every status change goes through `transitionDeal()`** (`apps/api/src/deals/stateMachine.ts`):
  - a conditional `UPDATE ... WHERE id = :id AND status = :from` inside a transaction
  - a `deal_events` row in the same transaction
  - zero rows updated means `409 INVALID_TRANSITION`
  - emails and socket events only in after-commit tasks
  An architecture test checks that nothing else writes `deals.status`. Keep it passing.
- A published deal is immutable. Its money breakdown is frozen at publish.
- Deadlines are calendar dates meaning 23:59:59 Asia/Kolkata on that day. "Applications open" and "content overdue" are derived from dates, never stored as statuses.
- **Cancelling:** creators never cancel. Brands follow the transition table. Only an admin can cancel later stages, with a note.
- The API tells each user which actions they can take now (`allowedActions`), and gives **a plain reason for every action that is not allowed**. Clients never work out permissions themselves.

### 6.3 Money

- **All money is integer paise:** `BIGINT` in Postgres, safe integers in TypeScript, never floats. Budgets are entered in whole rupees and converted on the server.
- **All amounts come from `packages/shared/src/money.ts`** (`computeBreakdown`) and the deal's frozen breakdown. Never accept an amount from a client. Never compute money anywhere else.
- Invariant, tested: fee total + advance + final = budget, all positive. The advance is 30% of the creator's share. The final is the rest.
- Format money only at the edge, for text and PDFs: `₹10,000.00`, `en-IN` grouping.

### 6.4 Payments

- **The ValueSkins fee** (payment 1) goes through Razorpay: Order, then Checkout, then `POST /api/payments/verify`, plus the `payment.captured` / `order.paid` webhook.
  - Both paths call the same idempotent `markPaymentCaptured()`. Whichever arrives first does the work. The second does nothing.
  - The tax invoice is issued in the same transaction.
- **The creator's share** (advance and final) is paid by the brand directly to the creator's UPI ID. It never passes through ValueSkins. Prompts 12 and 13 replace the old Razorpay Route code with this. Never add to or extend Route, linked-account or transfer code.
  - A brand recording a payment **never changes the deal status**. Only the confirmed creator's "received" moves the deal.
  - A direct-payment record is never edited or deleted once it is confirmed or disputed. A correction is a new record.
- **UPI IDs:**
  - Valid format only, enforced in Zod and with a database CHECK.
  - Shown in full only to the brand confirmed on that deal, only after the creator consented, and only while a payment is due. Masked everywhere else, including the creator's own responses.
  - Never logged.
- Razorpay webhooks: verify the signature on the raw body, dedupe on `x-razorpay-event-id` in `webhook_events`, return 200 fast, record processing errors on the event row and alert the admin, and never retry in a loop.

### 6.5 Documents and invoices

- The fee's GST tax invoice has a gapless, unique number per financial year (April to March), issued with a row lock on `invoice_counters` inside the capture transaction.
- Every document stores a JSON snapshot when issued. Re-rendering must always produce the same document.
- Advance and final documents are payment records, not tax invoices or receipts. ValueSkins never received that money, and the wording must say so.
- PDFs are rendered on demand and never stored. Access: the deal's brand, its confirmed creator, and admins only.

### 6.6 Emails

- One `send()` in `apps/api/src/email/`. Every send writes `email_log`, and every deal email is visible to both parties in the deal's history.
- Sends happen after commit. A failed send never fails the request.

## 7. API conventions

- Every route is under `/api`. Every request body, query and param is validated with a Zod schema from `packages/shared`. Unknown fields are rejected.
- Errors: throw `AppError(code, httpStatus, message)`. One error middleware returns `{ error: { code, message } }`. Never put `err.message`, stack traces, SQL or provider responses in a response.
- Authorization on **every** route, in the route itself: session guards (`requireUser`, `requireRole`, `requireOnboarded`, `requireAdmin`), then ownership (the deal's brand, its confirmed creator, or an admin).
  - Admin routes return **404** to everyone else.
  - Public routes go on an explicit allowlist: health, sign-in, Meta and Razorpay callbacks with signature checks, public config.
  - Never trust a role, id or amount sent by the client.
- CSRF: mutating requests must carry `Origin` equal to `WEB_ORIGIN`. Webhook and Meta routes are exempt and verify signatures instead.
- Sessions:
  - A random token in an httpOnly, Secure, `SameSite=Lax` cookie, with only its SHA-256 hash stored.
  - Sliding 30-day expiry.
  - `COOKIE_DOMAIN` and `SESSION_COOKIE_NAME` come from env.
- Rate limits use the factory in `apps/api/src/rateLimit/`, and return `429` with `Retry-After`. Every new mutating endpoint gets a limit.
- Lists use cursor pagination, at most 50 per page.
- Any operation that can be retried (payments, confirmations, imports) must be idempotent.

## 8. Database conventions

- Schema in `apps/api/src/db/schema/`. Migrations are generated with `pnpm db:generate` into `apps/api/drizzle/`.
  - **Never edit a migration that has been merged.** Write a new one.
  - Migrations run by script or in the deploy step, never on app start.
- UUID v7 primary keys. `timestamptz` in UTC. Money columns are `*_paise BIGINT`. Enums are Postgres enums, with values from `packages/shared`.
- Foreign keys everywhere, and an index on every foreign key and every filtered column.
- Rules that must never break are also enforced in the database (CHECK, partial unique indexes), not only in code.
- Multi-step writes use one transaction. Use conditional updates for anything two requests could race on.
- Deleting a user means soft delete plus anonymization. Deals, payments and invoices are kept as legal records.
- Update the seed whenever the schema changes. The seed refuses to run in production.

## 9. External services

- **Razorpay:** test keys outside production, always. Retry server calls up to 3 times with backoff, only on network errors and 5xx. Always verify signatures. Never log full payloads.
- **Instagram (Business Login for Instagram):**
  - Long-lived tokens are stored encrypted (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) and refreshed before expiry.
  - Only Professional accounts can sign in.
  - Meta `signed_request` callbacks (deauthorize, data deletion) are always verified.
- **Resend:** sending from `EMAIL_FROM`. `EMAIL_TRANSPORT=console` in development and tests.
- In tests, every external HTTP call is mocked at the HTTP layer with msw. Never call a real provider from tests.

## 10. Logging, privacy and secrets

- pino with request ids. Redaction covers cookies, authorization headers, tokens, secrets, codes, email addresses, UPI IDs, PAN, and bank details.
- Never log: secrets, tokens, sign-in codes, full webhook payloads, email bodies, UPI IDs, or personal data.
- **Never store:** PAN, bank account numbers, IFSC, or plain Instagram tokens.
- Never commit `.env` files, keys or real personal data. Test fixtures use obviously fake values.

## 11. Testing

- Vitest. API integration tests run against real Postgres (`TEST_DATABASE_URL`). Never mock the database.
- Tests are required for:
  - money math
  - the state machine and every allowed and denied transition
  - payment, direct-payment and webhook handling, including duplicates and out-of-order delivery
  - authorization on every route
  - each privacy rule (no UPI ID, PAN or token leaks)
  - each bug fix (a test that fails before the fix)
- Concurrency rules (one confirm wins, one transition wins, gapless numbering) get tests with parallel requests.
- Time-dependent code takes a clock or `now` parameter, so tests never depend on the real date.
- Keep the existing architecture tests passing. Add one when a new rule says "only X may do Y".

## 12. Text the backend produces

This covers emails, PDFs and API error messages.

- Plain, direct English in short sentences.
- No emojis. No em dashes (use a hyphen). None of these words: unlock, seamless, seamlessly, powered by, effortless, supercharge, elevate.
- Reused strings live in `packages/shared/src/copy.ts`.
- Escape every user-supplied value in HTML emails.
- Money looks like `₹10,000.00`. Dates look like `30 Sep 2026`. Times are in IST.

## 13. Never do these

- Write `deals.status` anywhere except `transitionDeal()`.
- Accept money amounts, roles or user ids from the client.
- Use floats for money, or compute money outside `money.ts`.
- Advance a deal on a brand's payment claim.
- Return a full UPI ID to anyone except the confirmed, consented brand, or log one.
- Store PAN, bank account numbers, IFSC or plain tokens.
- Put live Razorpay keys anywhere except production env vars.
- Skip signature verification on a webhook or Meta callback.
- Add a route without a guard, or without an allowlist entry if it is public.
- Edit a merged migration, or run migrations on app start.
- Weaken a startup guard, a test or a database constraint to make something pass.
- Touch external accounts, or the `valueskins/valueskins` repo.
- Change `apps/web` in an API prompt (section 15).

## 14. Git

- Author all commits as **Melove Gupta <melovegupta0406@gmail.com>**. Commits are under this name only.
- **Never add Co-Authored-By or any other trailer, and never mention an AI tool or assistant** in commit messages, PR titles or bodies, code comments or docs.
- Conventional messages, for example `feat(payments): record direct UPI payments`. One task per branch, merged by PR after CI passes.
- Never commit `.env` files or secrets. Never force-push `main`.

## 15. The web app

- `apps/web` is temporary and will be rebuilt from a Claude Design handoff in the W1 to W3 prompts. Until then there are no UI rules in this file. The design handoff and the web prompts define the UI.
- In API prompts, only change `apps/web` when the prompt says so, and only the temporary pages in `apps/web/app/(temporary)` and `apps/web/lib/temporary`.
- In web prompts, never change `apps/api` or `packages/shared`. Write missing API needs into `docs/WEB_API_GAPS.md` instead.
