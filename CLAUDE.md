ValueSkins - instructions for Claude Code
ValueSkins is a creator-brand deal marketplace (Valueskins Private Limited). The full product and technical spec is `docs/SPEC.md`. It is the source of truth. Read the sections a task references before writing code.
How we work

* Work only on the task in the current prompt. Do not build ahead, and do not add features, screens, fields or dependencies the spec does not call for.
* If the spec is unclear, contradicts itself, or seems wrong, stop and ask. Do not guess. If a decision changes the spec, update `docs/SPEC.md` in the same change.
* When a task needs an external API detail (Instagram, Razorpay, Resend), check the current official docs rather than relying on memory, and note in your summary what you verified.
* End every task with: what you built, how to run and verify it, tests added, anything left open or needing a human (keys, dashboard settings).

Repo layout

* `apps/api`: Express 5 + Socket.io + Drizzle, deployed on Render
* `apps/web`: Next.js App Router + Tailwind + TanStack Query, deployed on Vercel
* `packages/shared`: money math, deal state machine, Zod schemas, enums, copy constants. Imported by both apps.
* `docs/`: spec and decisions

Rules that must never be broken

1. Money is integer paise. `BIGINT` in Postgres, safe integers in TS. No floats anywhere in money code. All amounts come from `packages/shared/src/money.ts`. Format for display only at the UI edge (`₹10,000.00`, `en-IN`).
2. Deal status changes only through `transitionDeal()` (SPEC 5.3): conditional `UPDATE ... WHERE status = :from`, `deal_events` row in the same transaction, side effects (sockets, emails) only after commit.
3. Payments are idempotent. The verify endpoint and the webhook both call `markPaymentCaptured()`. Webhooks are deduplicated by event id and verified on the raw body.
4. Test mode only outside production. Never put live Razorpay keys in any file or non-production env.
5. Never store PAN, full bank account numbers, or plain Instagram tokens. Never log secrets, tokens, PII, or full webhook payloads.
6. Every endpoint checks authorization (owner brand, confirmed creator, admin). Admin routes return 404 to others.
7. Every input is validated with Zod schemas from `packages/shared`.
8. Dev login exists only when `NODE_ENV !== 'production'` and `ENABLE_DEV_LOGIN=true`.

UI and copy rules

* Black background, white text, single red accent `#FF0000`. No gradients, no shadows.
* No emojis. No em dashes (use a hyphen). No marketing words (unlock, seamless, powered by, effortless, supercharge). Plain, direct English.
* Every disabled button says why.
* Put user-facing strings in `packages/shared/src/copy.ts` where they are reused.

Code standards

* TypeScript `strict`. No `any` without a comment explaining why.
* Small modules by feature (`apps/api/src/deals/`, `.../payments/`, ...), each with routes, service, and tests.
* Errors: throw typed `AppError(code, httpStatus, message)`. One error middleware formats `{ error: { code, message } }`.
* Dates: store `timestamptz` in UTC. Deadlines are `date` interpreted as end of day in `Asia/Kolkata`.
* Tests with Vitest. Required for: money math, state machine, payment and webhook handling, authorization on every route, and each bug fix. API integration tests run against real Postgres, never mocks of the DB.
* Before finishing any task: `pnpm typecheck && pnpm lint && pnpm test` must pass.

Git

* Author all commits as Melove Gupta <melovegupta0406@gmail.com>.
* Small commits with clear messages (`feat(deals): publish endpoint with frozen breakdown`). One task per branch, merged by PR.
* Never commit `.env` files or secrets.
