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

Pagina's: vaste pagina's (Home, Over ons, Contact) met vaste velden plus eigen tekstpagina's; platte tekst, een lege regel is een nieuwe alinea.

Evenementen zijn eenmalig of wekelijks (bv. "elke dinsdag pubquiz", met optionele einddatum); aanmelden en tickets lopen via een ticketlink of het contactformulier.

Nog te doen: nieuws, aanmeldingen voor evenementen, vertaalde SDK-labels, meertaligheid, de eerste echte Vercel-deploy en Row Level Security (nu wordt tenant-scheiding in de API afgedwongen en getest).

Afwijkingen van de wireframes: gerechten worden direct live opgeslagen (geen concept/voorbeeld); sorteren gaat met pijltjes in plaats van slepen.

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

## Klantwebsites koppelen (`@mep/sdk`)

Een klantsite haalt zijn gegevens uit de publieke, alleen-lezen API (`/api/public/<slug>/info|hours|menus|announcements|specials|pages|events`, met `?lang=en` voor vertalingen; 60 s CDN-cache, browsers controleren altijd)
via `@mep/sdk`:

```ts
import { createClient, weekRowsGrouped } from "@mep/sdk";
const mep = createClient({
  baseUrl: "https://beheer.jouwdomein.nl/api",
  tenant: "bistro-de-haven",
});
const [hours, menus] = await Promise.all([mep.hours(), mep.menus()]);
mep.openStatus(hours).label; // "Nu open · tot 22:00", rekent zelf door op een gecachte pagina
mep.photoSrcSet(photoId); // srcset voor <img>
await mep.submit({ name, email, message }); // komt in de inbox
```

Allergenen zijn `null` zolang de ondernemer ze niet gecontroleerd heeft: toon dan niets in plaats van "geen allergenen".
`apps/site-demo` is een werkend voorbeeld (`pnpm dev:local`, daarna `pnpm --filter @mep/site-demo dev`, poort 5174).

## Foto's

Foto's worden bij het uploaden in de browser verkleind (max. 2000 px, onder 4 MB) en op de server omgezet naar
WebP in drie breedtes (400/800/1600 px), gedraaid volgens EXIF en ontdaan van metadata zoals GPS. Elke foto heeft een
beschrijving (alt-tekst) en een focuspunt voor het bijsnijden. Publieke URL: `/api/media/<id>/<400|800|1600>.webp`.

## Deployen op Vercel

Het hele platform draait in één Vercel-project: de beheer-app als statische site en de API als één Node-functie op
`/api` (zelfde origin, dus cookies werken). `vercel.json` + `scripts/build-vercel.mjs` bouwen dit als Vercel Build Output.

1. Importeer de repo in Vercel (root: de repo zelf, framework: Other). Install/build staan in `vercel.json`.
2. Voeg een **Postgres**-database toe (bv. Neon via de Marketplace) en zet `DATABASE_URL` (gepoolde URL).
3. Maak een **Blob store** aan; `BLOB_READ_WRITE_TOKEN` wordt automatisch gezet.
4. Maak een **Resend**-account, verifieer je afzenderdomein en zet `RESEND_API_KEY` en `MAIL_FROM`.
5. Zet `CRON_SECRET` (willekeurige lange tekst): Vercel Cron roept dagelijks `/api/cron/cleanup` aan en ruimt verlopen inlogtokens en sessies op, en afgehandelde berichten ouder dan 12 maanden (AVG).
6. Zet `ADMIN_URL` op de publieke URL van het project (komt in de inloglinks).
7. Eerste keer: `DATABASE_URL=… pnpm db:migrate` en `DATABASE_URL=… pnpm mep:new-tenant --superadmin jij@example.nl`.
   Bij elke productiedeploy draaien de migraties automatisch tijdens de build.

Let op: Vercel-functies accepteren maximaal 4,5 MB per request; daarom is de uploadlimiet 4 MB en verkleint de app
foto's vooraf. De functie is lokaal als bundel getest (routing en sharp), maar nog niet op een echt Vercel-project.

## Meertaligheid

De eigenaar zet talen aan (Engels, Duits, Frans; Nederlands is de brontaal) en vult vertalingen in onder Meer →
Vertalingen: kaart, categorieën, gerechten, pagina's, evenementen, specials en meldingen, met voortgang en een filter op
wat nog ontbreekt. De publieke API en SDK (`lang`) leveren de vertaalde tekst en vallen per tekst terug op Nederlands.
Vaste paginatitels (Home, Over ons, Contact) hebben ingebouwde vertalingen. Nog Nederlands, ook als `lang` is gezet:
labels die de SDK zelf maakt ("Nu open · tot 22:00", weekdagen) en de koppen van je eigen site; die vertaal je in het
sitesjabloon. Een automatische vertaalsuggestie (AI) staat er niet in.

## Team, veiligheid en AVG

- **Team:** de eigenaar nodigt collega's uit (Meer → Team en rollen) als eigenaar, manager, keuken of medewerker; ze krijgen een inloglink per mail. Er blijft altijd minstens één eigenaar over.
- **Export:** de eigenaar kan alle gegevens van de zaak als JSON downloaden (geen lock-in, AVG-inzage).
- **Tenant-isolatie:** elke zaak ziet alleen zijn eigen gegevens. `apps/api/test/isolation.test.ts` valt elk id-gebonden endpoint aan met id's van een andere zaak en vergelijkt daarna de volledige export; een bewaker laat de test falen zodra een nieuwe route niet is opgenomen. Row Level Security in de database is nog niet toegevoegd (bewust uitgesteld: zie hieronder).
- **Spambeveiliging formulieren:** verborgen controleveld, max. 3 berichten per afzender per 10 minuten en 60 per zaak per uur (tellers in de database, dus geschikt voor serverless).
- **Headers:** de API stuurt beveiligingsheaders (`nosniff`, `X-Frame-Options`, enz.); foto's blijven cross-origin laadbaar.
- **Bewaartermijn:** afgehandelde berichten worden na 12 maanden automatisch verwijderd.

### Row Level Security (nog niet gedaan)

RLS zou de tenant-scheiding ook in de database afdwingen. Het vraagt een niet-eigenaar-rol (`SET LOCAL ROLE`), een
tenant-instelling per transactie en aanpassing van alle publieke routes en de cron, en gedraagt zich anders per
Postgres-aanbieder (Neon, gepoolde verbindingen). Doe dit op het echte platform, met de isolatietest als vangnet.

## Scripts

| Commando                    | Doel                                                                   |
| --------------------------- | ---------------------------------------------------------------------- |
| `pnpm test`                 | Alle tests (DB-tests draaien op in-memory PGlite, geen Postgres nodig) |
| `pnpm typecheck`            | TypeScript-controle                                                    |
| `pnpm lint` / `pnpm format` | Biome                                                                  |
| `pnpm db:generate`          | Migratie genereren na een schemawijziging                              |
