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

# run api (http://localhost:4000) and web (http://localhost:3000) together
pnpm dev
```

`GET http://localhost:4000/api/health` should return `{ "ok": true }`.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

All three must pass before opening a PR (also enforced in CI).
