# Mis en place (MEP)

Een eenvoudig, horeca-specifiek CMS. Zie [docs/PLAN.md](docs/PLAN.md) voor het volledige projectplan.

## Status: fase 0 afgerond, beheer-UI v1

Aanwezig:

- Monorepo (pnpm + Turborepo), Biome (lint/format), Vitest, GitHub Actions CI
- `packages/schemas` — gedeelde Zod-schema's (modules, rollen, tenant-invoer)
- `packages/db` — Drizzle-schema + migraties: tenants, users, memberships, login-tokens, sessies, audit-log
- `apps/api` — Hono-API met magic-link-login, `/me` en superadmin-routes voor zaken
- CLI om een superadmin en nieuwe klanten aan te maken
- `apps/admin` — mobiele beheer-app (React + Vite) met Vandaag, Kaart, Gerecht bewerken, Openingstijden, Inbox en Meer
- Tenant-API (`/t/:slug/...`) met rechten per rol (eigenaar, manager, keuken, medewerker) en een publiek formulier-endpoint (`POST /public/:slug/forms`)

Nog te doen: foto's/media, dagspecials en meldingen op de site (staan als "Binnenkort" in de UI),
evenementen, e-mailprovider, deploy-pijplijn en Row Level Security (nu wordt tenant-scheiding in de API afgedwongen en getest).

Afwijkingen van de wireframes: gerechten hebben nog geen foto (media-module volgt) en worden direct live
opgeslagen (geen concept/voorbeeld); sorteren gaat met pijltjes in plaats van slepen.

## Snel proberen (zonder database)

```bash
pnpm install
pnpm dev:local     # API met in-memory database + voorbeeldzaak, en de beheer-app
```

Open daarna `http://localhost:5173/api/dev/login?email=sanne@dehaven.test` (eigenaar),
`lotte@dehaven.test` (keuken) of `dev@mep.test` (superadmin) om direct in te loggen.

## Aan de slag met een echte database

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

| Commando                    | Doel                                                                   |
| --------------------------- | ---------------------------------------------------------------------- |
| `pnpm test`                 | Alle tests (DB-tests draaien op in-memory PGlite, geen Postgres nodig) |
| `pnpm typecheck`            | TypeScript-controle                                                    |
| `pnpm lint` / `pnpm format` | Biome                                                                  |
| `pnpm db:generate`          | Migratie genereren na een schemawijziging                              |
