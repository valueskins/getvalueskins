# ValueSkins

A creator-brand deal marketplace. The product and technical spec lives at
[docs/SPEC.md](docs/SPEC.md) — it is the source of truth for anything you build here.
Working conventions for Claude Code are in [CLAUDE.md](CLAUDE.md).

## Prerequisites

- Node.js 22 (see `.nvmrc`; `nvm use` will pick it up)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker, for local Postgres

## Repo layout

- `apps/api` — Express 5 + Socket.io backend, deployed on Render
- `apps/web` — Next.js App Router frontend, deployed on Vercel
- `packages/shared` — money math, deal state machine, Zod schemas, copy constants, imported by both apps
- `docs/` — spec and process notes

## Running locally

```bash
# start Postgres
docker compose up -d

# copy env templates and fill in local values
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# install workspace dependencies
pnpm install

# apply database migrations, then load fixture data (refuses to run in production)
pnpm db:migrate
pnpm db:seed

# run api (http://localhost:4000) and web (http://localhost:3000) together
pnpm dev
```

`GET http://localhost:4000/api/health` should return `{ "ok": true }`.

## Testing Instagram login locally

Instagram login (SPEC 6.1) needs a real Meta app and a real Instagram tester account — there is no sandbox that fakes it. Use `POST /api/dev/login` (SPEC 6.2) for everyday local work instead; only set this up when you specifically need to exercise the real OAuth flow.

1. Create a Meta app at [developers.facebook.com](https://developers.facebook.com) and add the **Instagram API with Instagram Login** product to it.
2. Under the app's Instagram product settings, add your own Instagram account as an **Instagram Tester**, then accept the invite from inside the Instagram app (Settings → Apps and websites → Tester invites) — Instagram testers must accept before they can log in, and only Professional (Business or Creator) accounts can complete the flow.
3. Fill `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, and `META_APP_SECRET` in `apps/api/.env` from that app's dashboard.
4. Set `INSTAGRAM_REDIRECT_URI` to `http://localhost:4000/api/auth/instagram/callback` and register that exact URL in the app's Valid OAuth Redirect URIs list. `TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET` can be any local string — the encryption key is derived by hashing, not required to already be 32 bytes.
5. Start the API (`pnpm dev`) and open `http://localhost:4000/api/auth/instagram/start` directly in a browser signed into the tester's Instagram account (there is no "Continue with Instagram" button in the web app yet).
6. A successful login redirects to `http://localhost:3000/onboarding` with a session cookie set. A misconfiguration redirects to `http://localhost:3000/login?error=<code>` — check the API's terminal output for the underlying Meta error.
7. `EMAIL_TRANSPORT=console` (the local default) needs no real Resend account — it prints every email, including email-code login's sign-in codes, straight to the API's terminal output.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

All three must pass before opening a PR (also enforced in CI).
