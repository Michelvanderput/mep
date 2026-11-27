# Mis en place (MEP) — Projectplan

> Een eenvoudig, horeca-specifiek CMS waarmee een ondernemer zijn website en online aanwezigheid zelf regelt: menukaart, openingstijden, reserveringen, evenementen, foto's en meer — zonder de complexiteit van een generiek CMS.

Versie 0.1 · november 2026

---

## Inhoud

1. [Visie en uitgangspunten](#1-visie-en-uitgangspunten)
2. [Doelgroep en persona's](#2-doelgroep-en-personas)
3. [Waarom geen bestaand CMS?](#3-waarom-geen-bestaand-cms)
4. [Functionaliteiten (modules)](#4-functionaliteiten-modules)
5. [Prioritering (MoSCoW)](#5-prioritering-moscow)
6. [UX-principes voor het beheer](#6-ux-principes-voor-het-beheer)
7. [Technische architectuur](#7-technische-architectuur)
8. [Datamodel (eerste opzet)](#8-datamodel-eerste-opzet)
9. [Hoe je MEP inzet voor klanten](#9-hoe-je-mep-inzet-voor-klanten)
10. [Verdienmodel en pakketten](#10-verdienmodel-en-pakketten)
11. [Juridisch, privacy en toegankelijkheid](#11-juridisch-privacy-en-toegankelijkheid)
12. [Beveiliging, beheer en kwaliteit](#12-beveiliging-beheer-en-kwaliteit)
13. [Roadmap](#13-roadmap)
14. [Risico's en hoe je ze afvangt](#14-risicos-en-hoe-je-ze-afvangt)
15. [Open vragen](#15-open-vragen)
16. [Eerstvolgende stappen](#16-eerstvolgende-stappen)

---

## 1. Visie en uitgangspunten

**Mis en place** betekent "alles op zijn plek" — precies wat het CMS moet doen voor de ondernemer: alles wat de gast online ziet, staat klaar en klopt.

### Kernbelofte

> "In twee minuten je kaart, je openingstijden of je dagspecial aangepast — vanaf je telefoon, tussen twee services door."

### Uitgangspunten

| Principe | Wat het betekent |
|---|---|
| **Horeca-first, niet pagina-first** | De ondernemer beheert *gerechten, tijden, evenementen* — niet "pagina's met blokken". De website bouwt zichzelf op uit die gegevens. |
| **Mobiel eerst** | Het beheer moet perfect werken op een telefoon. Een ondernemer staat zelden achter een bureau. |
| **Eén bron van waarheid** | Openingstijden worden één keer ingevuld en verschijnen overal: website, footer, Google, schema.org, QR-menu. |
| **Weinig, maar goed** | Liever 10 modules die perfect werken dan 50 halve. Alles wat niet nodig is, staat uit. |
| **Ontwerp blijft heel** | De ondernemer kan de inhoud wijzigen, niet de vormgeving breken. Geen vrije kleurkiezers of lettertypes. |
| **Jij beheert, zij gebruiken** | Jij (de bouwer) hebt een superadmin-omgeving voor alle klanten; de klant ziet alleen zijn eigen zaak. |

---

## 2. Doelgroep en persona's

### Type zaken

- Restaurants (à la carte, fine dining, bistro)
- Cafés en eetcafés
- Lunchrooms, koffiebars, bakkerijen met zitplekken
- Strandpaviljoens en seizoensgebonden zaken
- Cocktailbars, wijnbars
- Hotels met restaurant (later)
- Kleine ketens met meerdere vestigingen (later)

### Persona's

**Sanne — eigenaar van een bistro (42)**
Werkt 60 uur per week, beperkte tijd achter de computer. Wil de seizoenskaart aanpassen, de wekelijkse specials zetten en weten hoeveel reserveringen er zijn. Frustratie: "Ik moet altijd de webbouwer mailen voor een prijswijziging."

**Mehmet — bedrijfsleider van een café (29)**
Doet de social media en evenementen (pubquiz, live muziek). Wil snel een evenement plaatsen met foto en dat het ook op Instagram kan. Frustratie: "WordPress is zo onoverzichtelijk."

**Lotte — chef-kok (35)**
Wil zelf gerechten en allergenen beheren, maar mag niet aan de openingstijden of instellingen zitten. Frustratie: "Als een gerecht op is, staat het nog dagen online."

**Jij — de bouwer/beheerder**
Wil snel nieuwe klanten opzetten, één codebase onderhouden, inloggen als klant om te helpen, en terugkerende inkomsten.

---

## 3. Waarom geen bestaand CMS?

| CMS | Probleem voor deze doelgroep |
|---|---|
| WordPress | Te veel opties, plugins, updates, beveiligingsrisico's. Ondernemers breken het ontwerp. |
| Wix / Squarespace | Geen controle voor jou als bouwer, generieke look, lock-in. |
| Headless (Sanity, Strapi, Payload, Contentful) | Krachtig maar generiek: de ondernemer ziet "documenten" en "schema's", geen horeca-taal. Kosten per gebruiker. |

**Wat MEP anders doet:** het datamodel *is* de horeca. Begrippen als "kaart", "gerecht", "allergeen", "op = op", "feestdag gesloten" en "groepsaanvraag" zijn eersteklas onderdelen, geen zelfgebouwde velden.

> **Eerlijke kanttekening:** een eigen CMS bouwen is een flinke investering. Het loont pas als je het voor meerdere klanten inzet (vanaf ±5 klanten). Overweeg voor het allereerste project eventueel een headless CMS (bv. Payload) als tussenstap, maar ontwerp de frontend dan al zo dat je later naar MEP kunt overstappen (zie §7: SDK-laag).

---

## 4. Functionaliteiten (modules)

Elke module is per klant aan/uit te zetten. Zo blijft het beheer leeg en overzichtelijk voor een simpel café en uitgebreid voor een restaurant.

### 4.1 Dashboard ("Vandaag")

Het startscherm na inloggen, gericht op *vandaag*:

- Vandaag open/dicht + tijden (met snelle knop "vandaag uitzonderlijk dicht")
- Aantal reserveringen vandaag / deze week (bij reserveringsmodule)
- Nieuwe groepsaanvragen / contactberichten
- Lopende acties en evenementen
- Snelle acties: *Gerecht op*, *Dagspecial plaatsen*, *Melding tonen*
- Checklist bij onvolledige gegevens ("3 gerechten hebben nog geen allergenen")

### 4.2 Menukaart(en) — het hart van MEP

- **Meerdere kaarten:** lunch, diner, dranken, wijnen, kinderkaart, borrel, seizoenskaart, groepsmenu's
- **Structuur:** kaart → categorie (voorgerechten, hoofdgerechten…) → gerecht
- **Gerecht:** naam, omschrijving, prijs (of meerdere prijzen: glas/fles, klein/groot), foto, labels
- **Allergenen:** de 14 wettelijke EU-allergenen als vaste aanvinklijst (gluten, schaaldieren, ei, vis, pinda, soja, melk, noten, selderij, mosterd, sesam, sulfiet, lupine, weekdieren)
- **Dieetlabels:** vegetarisch, veganistisch, glutenvrij, lactosevrij, halal, pittig
- **"Op = op" (86-knop):** gerecht met één tik tijdelijk als uitverkocht markeren of verbergen, met automatische reset (bv. "morgen weer beschikbaar")
- **Beschikbaarheid:** gerecht/kaart alleen tonen op bepaalde dagen/tijden of in een periode (seizoenskaart, lunch tot 16:00)
- **Dagspecials / suggesties:** snel tijdelijke gerechten toevoegen met einddatum
- **Wijnkaart-extra's:** druif, regio, jaargang, prijs per glas/fles
- **Sorteren met slepen**
- **PDF-export** van de kaart (voor printen en voor de site)
- **QR-menu:** mobiele kaartpagina per tafel/zaak met QR-code generator
- **Bulk prijswijziging:** "alle prijzen in categorie X +5%" of "+ € 0,50"
- **Meertalig:** vertaling per gerecht (NL/EN/DE/FR), optioneel met AI-voorstel

### 4.3 Openingstijden

- Vaste weekschema's (ook gebroken tijden: 12:00–14:30 en 17:00–22:00)
- Aparte tijden voor keuken vs. zaak ("keuken sluit om 21:30")
- **Uitzonderingen:** feestdagen, vakantie, besloten feest, seizoenssluiting
- Nederlandse feestdagen vooringevuld (Koningsdag, Kerst, Pasen…) met één klik "dicht/afwijkend"
- Seizoensschema's (zomer/winter) — belangrijk voor strandpaviljoens
- Automatische "Nu open / Nu gesloten / Opent om 17:00"-badge op de site
- Doorzetten naar Google Bedrijfsprofiel (fase 3, via Google Business Profile API)

### 4.4 Reserveringen

Twee routes, per klant te kiezen:

1. **Koppeling met bestaand systeem** (aanbevolen in begin): Formitable, Zenchef, TheFork, Resengo, OpenTable, SevenRooms. MEP slaat alleen de widget-/linkconfiguratie op.
2. **Eigen eenvoudige reserveringsmodule** (later): aanvraagformulier of echte beschikbaarheid op basis van capaciteit per tijdslot, bevestigingsmail, herinnering, annuleerlink, overzicht per dag, no-show markering.

> Advies: bouw géén volwaardig reserveringssysteem in de eerste versies. Bestaande systemen zijn goed en ondernemers gebruiken ze vaak al. Een *aanvraagformulier* + integraties dekken 90% af.

### 4.5 Groepen, events en besloten feesten

- Aanvraagformulier: datum, aantal personen, type gelegenheid, budget, wensen
- Overzicht van aanvragen met status (nieuw → in behandeling → offerte → bevestigd → afgewezen)
- Arrangementen/groepsmenu's tonen op de site (gekoppeld aan de menukaart-module)
- Zaal/ruimte-informatie (capaciteit, foto's, faciliteiten)

### 4.6 Evenementen en agenda

- Evenement: titel, datum/tijd, herhaling (elke dinsdag pubquiz), afbeelding, omschrijving, prijs/tickets-link, max. aanmeldingen
- Eenvoudige aanmelding (naam, e-mail, aantal personen) met wachtlijst
- Automatisch verbergen na afloop
- schema.org `Event`-data voor Google
- Afbeelding exporteren in Instagram-formaat (fase 3)

### 4.7 Nieuws, acties en meldingen

- Nieuwsberichten / blog (kort, met foto)
- **Mededelingsbalk** bovenaan de site ("Wegens ziekte vandaag gesloten", "Vanaf 1 maart nieuwe lentekaart") met start/einddatum
- **Acties:** happy hour, lunchdeal, met geldigheid

### 4.8 Media en foto's

- Uploaden vanaf telefoon (camera direct)
- Automatisch verkleinen, croppen naar vaste verhoudingen, WebP/AVIF
- Verplicht alt-tekst veld (met AI-suggestie)
- Albums: interieur, gerechten, team, terras
- Focuspunt kiezen zodat bijsnijden goed gaat

### 4.9 Pagina's en vaste content

Geen vrije pagina-bouwer, maar **vaste pagina's met vaste secties** die het ontwerp respecteren:

- Home (hero-tekst, highlights, kiezen welke modules zichtbaar zijn)
- Over ons / het verhaal / het team (teamleden met foto en rol)
- Contact & route (adres, kaart, parkeren, OV, bereikbaarheid voor rolstoelgebruikers)
- Arrangementen / zaalverhuur
- Vacatures
- Algemene voorwaarden / privacy / cookies
- Optioneel: extra eenvoudige tekstpagina's (titel, tekst, foto)

Voor jou als bouwer: per klant bepaal je welke secties en "blokken" er bestaan; de klant vult alleen in.

### 4.10 Vacatures

- Functie, uren, omschrijving, contactpersoon, sluitingsdatum
- Sollicitatieformulier met cv-upload (let op AVG: bewaartermijn, automatisch verwijderen)
- schema.org `JobPosting` voor Google for Jobs

### 4.11 Cadeaubonnen (fase 3)

- Online cadeaubon kopen (Mollie/Stripe), PDF met unieke code
- Overzicht verkochte bonnen, saldo, inwisselen via code in beheer
- Of: koppeling met bestaande aanbieder (bv. via kassa)

### 4.12 Online bestellen / afhalen (later, optioneel)

- Afhaal-/bezorgbestellingen met tijdslots, betaling via Mollie
- Hergebruikt de menukaart-module
- Alternatief: linken naar Thuisbezorgd / eigen kassa-webshop. Pas zelf bouwen als meerdere klanten erom vragen.

### 4.13 Formulieren en inbox

- Contact-, groeps-, sollicitatie- en evenementformulieren komen in één **inbox** in MEP
- E-mailnotificatie naar ondernemer, automatische ontvangstbevestiging naar gast
- Spambeveiliging (Cloudflare Turnstile / honeypot)
- Status, notitie en "beantwoord"-markering

### 4.14 Reviews en social

- Google-reviews tonen (via Places API, met caching) of handmatig uitgelichte reviews
- Links naar Instagram, Facebook, TikTok
- Instagram-feed tonen (optioneel, API is wisselvallig — zie risico's)

### 4.15 Nieuwsbrief (fase 3)

- Inschrijfformulier met dubbele opt-in
- Koppeling met Mailchimp / Brevo / Laposta in plaats van zelf mailen

### 4.16 SEO en vindbaarheid (grotendeels automatisch)

- schema.org `Restaurant` / `CafeOrCoffeeShop` / `BarOrPub` met openingstijden, adres, prijsklasse, keuken, `hasMenu`
- `Menu` / `MenuSection` / `MenuItem` structured data uit de kaart
- Per pagina titel en omschrijving (met slimme standaardwaarden)
- Automatische sitemap, robots.txt, canonicals, hreflang bij meertaligheid
- Open Graph-afbeeldingen (automatisch gegenereerd met logo + titel)
- Redirects beheren (bij overstap van oude site)

### 4.17 Meertaligheid

- Talen per klant aan/uit (NL standaard; EN/DE populair bij toerisme)
- Per veld vertaalbaar, met overzicht "wat is nog niet vertaald"
- Optioneel AI-vertaalvoorstel dat de ondernemer controleert

### 4.18 Statistieken

- Privacyvriendelijke bezoekersstatistieken (Plausible/Umami of eigen eenvoudige telling, geen cookiebanner nodig)
- Horeca-relevante cijfers: kaartweergaven, klikken op "Reserveer", "Bel", "Route"; QR-scans; formulierinzendingen
- Maandelijkse samenvattingsmail aan de ondernemer ("Je site had 2.340 bezoekers, 312 klikten op Reserveren")

### 4.19 Gebruikers en rollen

| Rol | Mag |
|---|---|
| **Eigenaar** | Alles binnen de eigen zaak, gebruikers beheren, facturen zien |
| **Manager** | Alle content, geen gebruikers/abonnement |
| **Keuken** | Alleen menukaart, specials en "op = op" |
| **Bediening/marketing** | Evenementen, nieuws, foto's, inbox |
| **Superadmin (jij)** | Alle zaken, modules aan/uit, "inloggen als", technische instellingen |

- Inloggen met magic link (e-mail) of wachtwoord + 2FA; geen gedoe met vergeten wachtwoorden
- Activiteitenlog: wie heeft wat wanneer gewijzigd

### 4.20 Algemeen voor alle modules

- **Concept → publiceren**, met voorbeeldweergave ("zo ziet het eruit op de site")
- **Inplannen:** wijziging live op datum/tijd (nieuwe kaart per 1 maart)
- **Versiegeschiedenis** en herstellen
- **Prullenbak** (30 dagen) in plaats van direct verwijderen
- **Zoeken** door alle content
- **Hulpteksten** in gewone taal bij elk veld, plus korte video-uitleg

### 4.21 Meerdere vestigingen (fase 4)

- Eén organisatie, meerdere locaties met eigen tijden, kaarten (of gedeelde kaart met afwijkende prijzen), contactgegevens
- Vestigingskiezer op de site

---

## 5. Prioritering (MoSCoW)

| Module | MVP (Must) | Should | Could | Later |
|---|:-:|:-:|:-:|:-:|
| Dashboard "Vandaag" | ● | | | |
| Menukaarten + allergenen | ● | | | |
| "Op = op" / dagspecials | ● | | | |
| Openingstijden + uitzonderingen | ● | | | |
| Media (upload, resize) | ● | | | |
| Vaste pagina's & secties | ● | | | |
| Formulieren + inbox | ● | | | |
| Reservering via koppeling/widget | ● | | | |
| SEO + structured data | ● | | | |
| Gebruikers (eigenaar + superadmin) | ● | | | |
| Mededelingsbalk | ● | | | |
| Evenementen | | ● | | |
| Rollen (keuken, manager) | | ● | | |
| Groepsaanvragen | | ● | | |
| Meertaligheid | | ● | | |
| QR-menu + PDF-kaart | | ● | | |
| Concept/inplannen/versies | | ● | | |
| Statistieken | | ● | | |
| Vacatures | | | ● | |
| Google-reviews | | | ● | |
| Nieuwsbrief-koppeling | | | ● | |
| Google Business Profile sync | | | ● | |
| Cadeaubonnen | | | | ● |
| Eigen reserveringssysteem | | | | ● |
| Online bestellen | | | | ● |
| Meerdere vestigingen | | | | ● |
| Kassa-koppelingen (Lightspeed, Untill) | | | | ● |

---

## 6. UX-principes voor het beheer

1. **Horeca-taal, geen CMS-taal.** "Kaart", "gerecht", "gesloten op…", niet "entries", "collections", "publish".
2. **Grote tikvlakken, weinig typen.** Schakelaars, kiezers, slepen. Bedienbaar met vette vingers in de keuken.
3. **Maximaal 3 tikken** naar de meest gebruikte acties (gerecht op, dagspecial, vandaag dicht).
4. **Direct resultaat zien.** Na opslaan: "Staat live" + link naar de pagina.
5. **Lege staten die helpen.** "Nog geen evenementen. Plaats je eerste pubquiz →"
6. **Fouten voorkomen in plaats van melden.** Prijsveld accepteert "12,50" én "12.50"; waarschuwing bij gerecht zonder allergenen.
7. **Installeerbaar als app (PWA)** op het beginscherm van de telefoon, met pushmeldingen voor nieuwe aanvragen.
8. **Donkere modus** (handig 's avonds achter de bar).
9. **Toegankelijk** (WCAG 2.2 AA) — ook het beheer zelf.

---

## 7. Technische architectuur

### 7.1 Hoofdkeuze: één platform, meerdere klanten (multi-tenant)

```
                     ┌──────────────────────────────┐
                     │   MEP Admin (beheeromgeving) │  ← ondernemer + jij
                     │   app.mep.nl  (PWA)          │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │         MEP API              │
                     │  auth · tenants · content    │
                     │  media · formulieren · jobs  │
                     └───┬──────────┬───────────┬───┘
                         │          │           │
                ┌────────▼──┐  ┌────▼─────┐ ┌───▼────────────┐
                │ PostgreSQL│  │ Object-  │ │ E-mail, queue, │
                │ (per rij  │  │ opslag   │ │ cron (planning)│
                │ tenant_id)│  │ (media)  │ └────────────────┘
                └───────────┘  └──────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
 ┌────────▼────────┐      ┌─────────▼────────┐      ┌─────────▼────────┐
 │ Site klant A    │      │ Site klant B     │      │ Site klant C     │
 │ (maatwerk)      │      │ (thema "Bistro") │      │ (thema "Café")   │
 └─────────────────┘      └──────────────────┘      └──────────────────┘
       Alle sites lezen via de MEP SDK (+ webhooks voor rebuild/cache)
```

**Waarom multi-tenant (één installatie voor iedereen)?**
- Eén keer updaten = alle klanten bijgewerkt
- Goedkope hosting per klant
- Nieuwe klant opzetten in minuten
- Jij hebt één overzicht

**Waarom headless (admin los van de website)?**
- Elke klant kan een eigen, uniek ontwerp krijgen
- Websites zijn statisch/edge-gecached → razendsnel en veilig
- Je kunt ook thema's/templates aanbieden voor goedkopere pakketten

### 7.2 Aanbevolen stack

Eén TypeScript-monorepo, zodat types gedeeld worden tussen API, beheer en websites.

| Onderdeel | Keuze | Reden |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Gedeelde packages, snelle builds |
| Admin-app | Next.js (App Router) of SvelteKit + Tailwind + shadcn/ui-achtige componenten | Snel bouwen, goede formulieren, PWA mogelijk |
| API | Hono (draait overal: Node, Cloudflare Workers) | Licht, snel, type-veilig met Zod |
| Database | PostgreSQL (Neon of Supabase) met Drizzle ORM | Relationeel past bij menu's/tijden; row-level tenant-scheiding |
| Validatie | Zod (gedeelde schema's) | Eén definitie voor API, formulieren en SDK |
| Auth | Better Auth of Lucia-achtig zelf; magic links + 2FA | Geen dure per-user SaaS |
| Media | Cloudflare R2 / S3 + Cloudflare Images of imgproxy | Goedkoop, automatisch resizen |
| E-mail | Postmark / Resend / Cloudflare Email | Betrouwbare transactionele mail |
| Achtergrondtaken | Queue + cron (bv. Cloudflare Queues/Cron of pg-boss) | Ingeplande publicaties, "op = op"-reset, rebuilds |
| Websites | Astro (statisch + islands) of Next.js | Snel, SEO-vriendelijk, makkelijk thema's maken |
| Hosting | Cloudflare (Workers/Pages) of Vercel + Neon | Lage kosten, edge, eenvoudige domeinen per klant |
| Betalingen (later) | Mollie | iDEAL, Nederlandse markt |
| Monitoring | Sentry + uptime-monitor | Fouten zien vóór de klant belt |
| Tests | Vitest (unit), Playwright (e2e) | |

> Alternatief met minder eigen code: **Payload CMS** als basis gebruiken en daar een horeca-specifieke beheerlaag overheen bouwen. Sneller live, maar minder controle over de UX. Advies: start met de eigen stack, maar houd de scope van de MVP strak.

### 7.3 Repository-structuur

```
mep/
├── apps/
│   ├── admin/            # Beheeromgeving (PWA) voor ondernemers + superadmin
│   ├── api/              # REST/JSON API (Hono)
│   └── site-starter/     # Basis-website (Astro) als vertrekpunt per klant
├── packages/
│   ├── db/               # Drizzle schema, migraties, seeds
│   ├── schemas/          # Zod-schema's (gedeeld)
│   ├── sdk/              # @mep/sdk: typed client voor websites
│   ├── ui/               # Gedeelde UI-componenten admin
│   ├── site-components/  # Herbruikbare site-componenten (menukaart, openingstijden, "nu open"-badge)
│   └── seo/              # schema.org generators, sitemap, meta
├── themes/               # Kant-en-klare thema's (bistro, café, strand…)
├── docs/                 # Dit plan, ADR's, handleidingen
└── tooling/              # eslint, tsconfig, scripts (nieuwe klant aanmaken)
```

### 7.4 Hoe een klantwebsite MEP gebruikt

```ts
import { createClient } from "@mep/sdk";

const mep = createClient({ tenant: "bistro-de-haven", apiKey: import.meta.env.MEP_PUBLIC_KEY });

const hours = await mep.openingHours.get();          // incl. uitzonderingen
const menu  = await mep.menus.get("diner", { locale: "nl" });
const isOpen = mep.openingHours.isOpenAt(new Date());
```

- **Publieke, alleen-lezen API-sleutel** per site; schrijven alleen via admin
- **Webhook bij publicatie** → site wordt opnieuw gebouwd of cache wordt geleegd (statische sites blijven actueel)
- **Herbruikbare componenten** (`<Menu />`, `<OpeningHours />`, `<OpenNowBadge />`, `<EventList />`) zodat elke nieuwe site 70% sneller klaar is
- Formulieren posten naar de MEP API (één endpoint), zodat de inbox overal werkt

### 7.5 Tenant-scheiding

- Elke tabel met klantdata heeft `tenant_id`
- Scheiding afdwingen in de database (Postgres Row Level Security) én in de API-laag
- Media per tenant in eigen map/prefix
- Automatische tests die controleren dat klant A nooit data van klant B kan lezen

---

## 8. Datamodel (eerste opzet)

```
Tenant (zaak)
 ├── id, slug, naam, type (restaurant/café/…), domein(en), talen, modules_aan[], thema, abonnement
 ├── BusinessInfo: adres, telefoon, e-mail, KvK, btw, social links, prijsklasse, keuken(s), geo
 ├── User ↔ Membership (rol per tenant)
 ├── OpeningSchedule (naam, geldig_van/tot)  → OpeningSlot (dag, open, dicht, type: zaak/keuken)
 ├── OpeningException (datum/periode, gesloten | afwijkende tijden, reden, zichtbaar_bericht)
 ├── Menu (naam, type, beschikbaarheid, volgorde, publicatiestatus)
 │    └── MenuSection (naam, omschrijving, volgorde)
 │         └── MenuItem (naam, omschrijving, prijzen[], foto, allergenen[], dieetlabels[],
 │                       beschikbaar, uitverkocht_tot, zichtbaar_van/tot, volgorde)
 ├── Event (titel, start, eind, herhaalregel, foto, prijs, ticketlink, capaciteit) → EventSignup
 ├── Post (nieuws/actie), Announcement (mededelingsbalk, van/tot)
 ├── Page (vaste sleutel: home/over-ons/contact…) → Sections (JSON volgens thema-schema)
 ├── TeamMember, Vacancy, Review (uitgelicht)
 ├── MediaAsset (bestand, alt, focuspunt, albums)
 ├── FormSubmission (type, data JSON, status, notities, bewaar_tot)
 ├── Integration (type: formitable/zenchef/…, config)
 ├── Translation (entiteit, veld, taal, waarde)  ← of JSON-kolommen per taal
 ├── Redirect, SeoMeta
 └── AuditLog (wie, wat, wanneer, oude/nieuwe waarde)
```

Prijzen opslaan in **centen (integer)**, tijden met **tijdzone Europe/Amsterdam**, en alle content met `status` (concept/gepubliceerd/ingepland) en `published_at`.

---

## 9. Hoe je MEP inzet voor klanten

### 9.1 Klantreis

1. **Kennismaking** — gesprek, huidige site bekijken, wensen ophalen
2. **Voorstel** — pakketkeuze (thema of maatwerk), planning, prijs
3. **Inventarisatie** — onboarding-formulier: logo, foto's, huidige kaart (PDF/foto), openingstijden, teksten, reserveringssysteem
4. **Opzet** — tenant aanmaken met script (`pnpm mep:new-tenant`), modules aanzetten, thema kiezen of maatwerk-site starten vanuit `site-starter`
5. **Content importeren** — jij of de klant vult in; menukaart importeren uit Excel/CSV (later: AI-import uit foto/PDF van de kaart)
6. **Training** — 30–45 minuten, liefst op de eigen telefoon van de ondernemer + korte video's in MEP
7. **Livegang** — domein koppelen, redirects van oude site, Google Bedrijfsprofiel controleren, Search Console
8. **Nazorg** — check na 2 weken, daarna maandrapport per mail

### 9.2 Twee leveringsvormen

| | **MEP Thema** | **MEP Maatwerk** |
|---|---|---|
| Website | Kant-en-klaar thema, eigen kleuren/logo/foto's | Volledig eigen ontwerp |
| Doorlooptijd | 1–2 weken | 4–8 weken |
| Prijs | Laag instap, maandabonnement | Projectprijs + maandabonnement |
| Voor wie | Café, lunchroom, kleine zaak | Restaurant met merkidentiteit |

Beide draaien op hetzelfde MEP-beheer. Een klant kan later van thema naar maatwerk zonder iets opnieuw in te voeren.

### 9.3 Jouw superadmin-omgeving

- Overzicht van alle klanten, status, abonnement, laatste activiteit
- Modules per klant aan/uit
- "Inloggen als klant" (gelogd) voor support
- Nieuwe klant wizard
- Health: welke sites zijn onvolledig (geen allergenen, verlopen events, oude kaart)
- Facturatie-overzicht (koppeling met Moneybird/Mollie-abonnementen)

### 9.4 Support

- In-app hulpknop (chat of formulier) dat direct bij jou binnenkomt met context (welke klant, welke pagina)
- Kennisbank met korte artikelen en video's
- Duidelijke afspraken: reactietijd, wat valt binnen het abonnement en wat is meerwerk

---

## 10. Verdienmodel en pakketten

Indicatief, af te stemmen op je markt:

| Pakket | Inhoud | Indicatie |
|---|---|---|
| **Basis** | Thema-site, kaart, tijden, pagina's, formulieren, hosting, SSL, updates | € 29–49 p/m + eenmalige opzet € 500–1.000 |
| **Plus** | + evenementen, meertalig, QR-menu, statistieken, rollen | € 59–89 p/m |
| **Pro** | + maatwerk-ontwerp, groepsaanvragen, vacatures, prioriteitssupport | Projectprijs € 3.000–8.000 + € 99–149 p/m |
| **Add-ons** | Cadeaubonnen, online bestellen, extra vestiging, fotoshoot, contentbeheer door jou | Per stuk |

**Waarom een abonnement:** hosting, beveiliging, back-ups, updates en nieuwe features zitten erin. Dit geeft jou terugkerende inkomsten (MRR) en de klant ontzorging.

**Kostenkant per klant** (bij multi-tenant): hosting + database + mail + media is bij tientallen klanten slechts enkele euro's per klant per maand.

---

## 11. Juridisch, privacy en toegankelijkheid

- **Allergeneninformatie** (EU-verordening 1169/2011): de ondernemer blijft verantwoordelijk, maar MEP maakt het makkelijk én laat een disclaimer zien ("Vraag bij allergieën altijd de bediening"). Waarschuw bij gerechten zonder ingevulde allergenen.
- **Prijzen** inclusief btw tonen (consumentenregels).
- **AVG:**
  - Verwerkersovereenkomst tussen jou en elke klant (jij verwerkt gastgegevens namens hen)
  - Data opslaan binnen de EU
  - Bewaartermijnen per formuliertype (bv. sollicitaties 4 weken, contact 12 maanden) met automatisch verwijderen
  - Export/verwijderverzoek van een gast kunnen afhandelen
- **Cookies:** standaard cookieloos (privacyvriendelijke statistieken, geen trackers) → geen banner nodig. Pas bij Google Maps-embed, YouTube of marketingpixels toestemming vragen (gebruik klik-om-te-laden).
- **Toegankelijkheid:** bouw sites en beheer volgens WCAG 2.2 AA. De European Accessibility Act (sinds juni 2025) raakt o.a. online bestellen/betalen; micro-ondernemingen zijn deels uitgezonderd, maar toegankelijk bouwen is sowieso goed voor vindbaarheid en gasten.
- **Algemene voorwaarden** voor jouw dienst: beschikbaarheid, aansprakelijkheid, opzegtermijn, eigendom van content (blijft van de klant), exportmogelijkheid bij vertrek.

---

## 12. Beveiliging, beheer en kwaliteit

- HTTPS overal, veilige headers (CSP, HSTS)
- 2FA voor eigenaren en superadmin verplicht
- Rate limiting en spamfilter op formulieren
- Rechtencontrole op elke API-call + tenant-isolatietests
- **Back-ups:** dagelijks, point-in-time recovery, maandelijks een terugzettest
- **Monitoring:** Sentry, uptime-checks per klantdomein, alert bij mislukte rebuilds
- **Updates:** afhankelijkheden automatisch bijhouden (Renovate/Dependabot)
- **CI/CD:** lint, typecheck, tests en previewomgeving per pull request
- **Feature flags** per tenant om nieuwe functies eerst bij één klant te testen
- **Data-export** van een complete zaak (JSON + media) — vertrouwen en geen lock-in

---

## 13. Roadmap

### Fase 0 — Fundament (2–3 weken)
- Monorepo, CI, linting, deploy-pijplijn
- Database + migraties, tenant-model, auth (magic link)
- Superadmin: tenant aanmaken
- Ontwerp van de admin-UI (wireframes van dashboard, kaart, tijden op mobiel)

### Fase 1 — MVP (6–8 weken) → eerste klant live
- Bedrijfsgegevens, openingstijden + uitzonderingen
- Menukaarten met allergenen, "op = op", dagspecials
- Media-upload met resizing
- Vaste pagina's met secties
- Formulieren + inbox + e-mailnotificaties
- Reserveringskoppeling (widget/link)
- Mededelingsbalk
- SDK + site-starter (Astro) + site-componenten
- SEO-basis + structured data
- **Mijlpaal:** de website waar je nu aan werkt draait volledig op MEP

### Fase 2 — Uitbreiden (6–8 weken)
- Evenementen + aanmeldingen
- Rollen (keuken, manager, marketing)
- Meertaligheid
- QR-menu en PDF-kaart
- Concept/inplannen/versiegeschiedenis
- Statistieken + maandmail
- Groepsaanvragen
- Eerste kant-en-klare thema's (2–3)
- **Mijlpaal:** 3–5 klanten, onboarding in minder dan een dag

### Fase 3 — Groei (doorlopend)
- Vacatures, Google-reviews, nieuwsbriefkoppeling
- Google Business Profile-synchronisatie (openingstijden)
- AI-hulp: kaart importeren uit foto/PDF, vertalingen, alt-teksten, menu-omschrijvingen
- Cadeaubonnen met Mollie
- Facturatie/abonnementen geautomatiseerd
- Kennisbank en in-app support

### Fase 4 — Schaal
- Meerdere vestigingen
- Eigen reserveringsmodule (als er vraag is)
- Online bestellen/afhalen
- Kassakoppelingen (Lightspeed, Untill) voor automatische prijzen/uitverkocht
- Eventueel: zelfstandige aanmelding (self-service SaaS)

---

## 14. Risico's en hoe je ze afvangt

| Risico | Gevolg | Maatregel |
|---|---|---|
| Scope creep: "kan het ook…" | MVP komt nooit af | Strikte MoSCoW, wensenlijst bijhouden, pas bouwen bij ≥2 klanten met dezelfde vraag |
| Eén persoon draagt alles (bus factor) | Klanten afhankelijk van jou | Documentatie, ADR's, back-ups, eventueel samenwerkingspartner |
| Beveiligingslek tussen tenants | Reputatieschade | RLS + tests + code review op tenant-scheiding |
| Externe API's veranderen (Instagram, Google) | Functies breken | Optioneel maken, cachen, geen kernfunctie van afhankelijk |
| Ondernemer gebruikt het niet | Verouderde site, ontevreden klant | Mobiel-eerst UX, herinneringen ("je kaart is 6 maanden niet gewijzigd"), training |
| Eigen CMS is onderhoudsintensief | Minder tijd voor nieuwe klanten | Multi-tenant, automatische updates, beperkt aantal modules |
| Concurrentie (Wix, horeca-SaaS) | Prijsdruk | Onderscheid op persoonlijk contact, maatwerk-look, horeca-specifiek gemak |

---

## 15. Open vragen

Beslissingen die het plan verder aanscherpen:

1. Bouw je MEP alleen voor je eigen klanten, of op termijn ook als self-service SaaS voor andere bouwers/ondernemers?
2. Welke reserveringssystemen gebruiken je eerste klanten nu al?
3. Wil je per klant maatwerk-ontwerp, of vooral thema's?
4. Welke hosting heeft je voorkeur (Cloudflare, Vercel, eigen VPS)?
5. Hoeveel klanten verwacht je in het eerste jaar? (bepaalt hoe ver je automatiseert)
6. Moet de huidige website (waar je nu aan werkt) al op MEP live, of eerst los en later migreren?
7. Welke talen zijn relevant voor je klanten?

---

## 16. Eerstvolgende stappen

1. **Open vragen beantwoorden** (§15) en de stack definitief kiezen
2. **Wireframes** maken van de 5 belangrijkste schermen op mobiel: Vandaag, Kaart, Gerecht bewerken, Openingstijden, Inbox
3. **Valideren** met 2–3 ondernemers (laat ze de wireframes "gebruiken": "zet de zalm op uitverkocht")
4. **Fase 0** starten: monorepo, database, auth, tenant-model
5. **Huidige klantwebsite** gebruiken als eerste echte testcase voor de SDK en site-componenten
