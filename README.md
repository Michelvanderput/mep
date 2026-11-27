# Mis en place (MEP)

Een eenvoudig, horeca-specifiek CMS. Zie [docs/PLAN.md](docs/PLAN.md) voor het volledige projectplan.

## Status: fase 0 (fundament)

Aanwezig:

- Monorepo (pnpm + Turborepo), Biome (lint/format), Vitest, GitHub Actions CI
- `packages/schemas` — gedeelde Zod-schema's (modules, rollen, tenant-invoer)
- `packages/db` — Drizzle-schema + migraties: tenants, users, memberships, login-tokens, sessies, audit-log
- `apps/api` — Hono-API met magic-link-login, `/me` en superadmin-routes voor zaken
- CLI om een superadmin en nieuwe klanten aan te maken

Nog te doen in fase 0: beheer-UI (wireframes eerst), deploy-pijplijn, Row Level Security zodra er
tenant-content-tabellen zijn.

## Aan de slag

```bash
pnpm install
cp .env.example .env            # vul DATABASE_URL in (PostgreSQL)
pnpm db:migrate
pnpm mep:new-tenant --superadmin jij@example.nl
pnpm dev                        # API op http://localhost:8787
```

Een inloglink aanvragen en de link in de terminal zien (MAIL_DRIVER=console):

```bash
curl -X POST localhost:8787/auth/request -H 'content-type: application/json' -d '{"email":"jij@example.nl"}'
```

Nieuwe klant aanmaken:

```bash
pnpm mep:new-tenant --name "Bistro De Haven" --owner sanne@example.nl
```

## Scripts

| Commando | Doel |
|---|---|
| `pnpm test` | Alle tests (DB-tests draaien op in-memory PGlite, geen Postgres nodig) |
| `pnpm typecheck` | TypeScript-controle |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm db:generate` | Migratie genereren na een schemawijziging |
