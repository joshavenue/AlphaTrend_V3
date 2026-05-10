# AlphaTrend V3

AlphaTrend V3 is a deterministic thematic research engine. It is not a trading
bot, broker execution layer, social sentiment engine, or LLM stock picker.

This repository currently contains the Phase 0 implementation frame:

- Next.js App Router web/API shell.
- TypeScript module boundaries for config, database, providers, domain types,
  and jobs.
- Prisma migration frame with no product tables yet.
- Environment validation and presence-only secret checks.
- Redaction and structured logging helpers.
- Health route and CLI health command.
- Vitest test harness and GitHub Actions skeleton.

## Runtime Rule

Development commands run on Hetzner inside `/srv/alphatrend`.

The macbook may keep a source mirror at `/Users/jojo/Desktop/V3/AlphaTrend_V3`.
Do not put provider secrets in that mirror. Runtime commands still run on
Hetzner unless the runtime model is explicitly changed.

```bash
ssh root@100.79.23.21
cd /srv/alphatrend
npm install
npm run dev
```

Open the dev app at:

```text
http://100.79.23.21:420
```

Health check:

```text
http://100.79.23.21:420/api/health
```

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run format
npm run typecheck
npm run test
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:rollback
npm run db:health
npm run health
npm run smoke:providers
npm run job:security-master
npm run job:theme-scan -- --theme T001
npm run job:snapshots
npm run job:alerts
npm run verify:docs
```

`smoke:providers` and job commands are Phase 0 placeholders. They intentionally
make no provider calls until Phase 2 and do not implement product logic.

## Environment

Copy `.env.example` to `.env` on Hetzner and fill values there. Never commit
`.env` files.

```bash
cp .env.example .env
```

Health checks report only whether sensitive values are present. They never print
database URLs, auth secrets, provider API keys, or session cookies.

The Phase 0 Hetzner box currently runs the AlphaTrend dev Postgres cluster on
`127.0.0.1:5433` because another local process already occupies `5432`.
`/srv/alphatrend/.env` is configured for the actual local port.

## Documentation Source

The planning archive remains the implementation source of truth until a contract
is explicitly superseded by code:

```text
/Users/jojo/Desktop/V3/Markdowns/
```

See `docs/README.md` for the required reading order.
