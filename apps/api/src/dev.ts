/**
 * Lokale ontwikkelserver zonder Postgres: in-memory database (PGlite) met voorbeelddata.
 * Start met `pnpm dev:local`. Data verdwijnt bij herstarten.
 */
import { serve } from "@hono/node-server";
import {
  events,
  loginTokens,
  mediaAssets,
  memberships,
  menuItems,
  menuSections,
  menus,
  openingHours,
  pages,
  submissions,
  tenants,
  translations,
  users,
} from "@mep/db";
import { createTestDb } from "@mep/db/testing";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import sharp from "sharp";
import { createApp } from "./app";
import { hashToken, newToken, verifyLogin } from "./auth";
import { loadConfig } from "./config";
import { processImage } from "./images";
import { consoleMailer } from "./mailer";
import { diskStorage, memoryStorage } from "./storage";

const db = await createTestDb();
const config = loadConfig({ ADMIN_URL: process.env.ADMIN_URL ?? "http://localhost:5173" });

const [tenant] = await db
  .insert(tenants)
  .values({
    slug: "bistro-de-haven",
    name: "Bistro De Haven",
    modules: ["menu", "opening_hours", "forms"],
    locales: ["nl", "en"],
  })
  .returning();
const [owner] = await db
  .insert(users)
  .values({ email: "sanne@dehaven.test", name: "Sanne" })
  .returning();
const [cook] = await db
  .insert(users)
  .values({ email: "lotte@dehaven.test", name: "Lotte" })
  .returning();
await db.insert(users).values({ email: "dev@mep.test", name: "Dev", isSuperadmin: true });
if (!tenant || !owner || !cook) throw new Error("seed mislukt");
await db.insert(memberships).values([
  { tenantId: tenant.id, userId: owner.id, role: "owner" },
  { tenantId: tenant.id, userId: cook.id, role: "kitchen" },
]);

const lunchDinner = [
  { open: "12:00", close: "14:30" },
  { open: "17:00", close: "22:00" },
];
const evening = [{ open: "17:00", close: "22:00" }];
await db.insert(openingHours).values([
  {
    tenantId: tenant.id,
    kind: "venue",
    schedule: [[], evening, evening, evening, lunchDinner, lunchDinner, lunchDinner],
  },
  {
    tenantId: tenant.id,
    kind: "kitchen",
    schedule: [
      [],
      [{ open: "17:00", close: "21:00" }],
      [{ open: "17:00", close: "21:00" }],
      [{ open: "17:00", close: "21:00" }],
      [
        { open: "12:00", close: "14:00" },
        { open: "17:00", close: "21:30" },
      ],
      [
        { open: "12:00", close: "14:00" },
        { open: "17:00", close: "21:30" },
      ],
      [
        { open: "12:00", close: "14:00" },
        { open: "17:00", close: "21:30" },
      ],
    ],
  },
]);

const [diner] = await db
  .insert(menus)
  .values({ tenantId: tenant.id, name: "Diner", position: 0 })
  .returning();
await db.insert(menus).values([
  { tenantId: tenant.id, name: "Lunch", position: 1 },
  { tenantId: tenant.id, name: "Dranken", position: 2 },
]);
const sec = async (name: string, position: number) => {
  const [s] = await db
    .insert(menuSections)
    .values({ tenantId: tenant.id, menuId: diner?.id as string, name, position })
    .returning();
  return s?.id as string;
};
const [voor, hoofd, na] = [
  await sec("Voorgerechten", 0),
  await sec("Hoofdgerechten", 1),
  await sec("Nagerechten", 2),
];
const item = (
  sectionId: string,
  position: number,
  name: string,
  description: string,
  priceCents: number,
  extra: Partial<typeof menuItems.$inferInsert> = {},
) => ({
  tenantId: tenant.id,
  sectionId,
  position,
  name,
  description,
  priceCents,
  allergensChecked: true,
  ...extra,
});
await db.insert(menuItems).values([
  item(voor, 0, "Gerookte paling", "Mierikswortelcrème, rode biet, zuurdesembrood", 1450, {
    allergens: ["fish", "gluten", "milk"],
  }),
  item(voor, 1, "Tartaar van zalm", "Venkel, dille, gepofte rijst", 1350, {
    allergens: ["fish", "soy"],
    soldOut: true,
    soldOutUntil: new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", {
      timeZone: "Europe/Amsterdam",
    }),
  }),
  item(voor, 2, "Pompoensoep", "Geroosterde pompoen, kokos, pepitas", 850, {
    diets: ["vegan", "glutenfree"],
    allergens: ["celery"],
  }),
  item(voor, 3, "Burrata", "Tomaat, basilicum, olijfolie", 1250, {
    allergensChecked: false,
    diets: ["vegetarian"],
  }),
  item(hoofd, 0, "Kabeljauw", "Beurre blanc, prei, krielaardappel", 2650, {
    allergens: ["fish", "milk"],
  }),
  item(hoofd, 1, "Ribeye 250 g", "Friet, bearnaise, groene salade", 3250, {
    allergens: ["eggs", "mustard"],
  }),
  item(hoofd, 2, "Risotto met paddenstoelen", "Bospaddenstoelen, parmezaan, truffel", 2250, {
    diets: ["vegetarian"],
    allergens: ["milk", "celery"],
  }),
  item(na, 0, "Crème brûlée", "Tonkaboon, vanille", 950, {
    allergens: ["milk", "eggs"],
    diets: ["vegetarian"],
  }),
  item(na, 1, "Chocoladetaart", "Hazelnoot, zeezout", 1050, {
    allergens: ["nuts", "eggs", "gluten", "milk"],
  }),
]);

await db.insert(pages).values([
  {
    tenantId: tenant.id,
    key: "home",
    title: "Home",
    content: {
      heroTitle: "Seizoensgebonden koken aan het water",
      heroText:
        "Bij Bistro De Haven eet je wat de maand te bieden heeft, van vis uit de buurt tot groenten van de markt.",
    },
  },
  {
    tenantId: tenant.id,
    key: "about",
    title: "Over ons",
    content: {
      heading: "Ons verhaal",
      story:
        "In 2019 namen Sanne en haar team de oude havenmeesterij over.\n\nWe koken met wat het seizoen biedt en werken zoveel mogelijk met leveranciers uit de regio.",
    },
  },
  {
    tenantId: tenant.id,
    key: "contact",
    title: "Contact en route",
    content: {
      street: "Havenkade 12",
      postalCode: "1011 AB",
      city: "Amsterdam",
      phone: "020 123 45 67",
      email: "info@dehaven.test",
      route: "Tram 14 stopt op 2 minuten lopen. Parkeren kan in garage De Kade.",
      accessibility: "Drempelvrije ingang en invalidentoilet.",
      instagram: "https://instagram.com/dehaven",
      facebook: "",
    },
  },
  {
    tenantId: tenant.id,
    key: "zaalverhuur",
    title: "Zaalverhuur",
    isCustom: true,
    content: {
      body: "Onze bovenzaal biedt plaats aan 40 gasten.\n\nNeem contact op voor de mogelijkheden.",
    },
  },
]);

const allItems = await db.select().from(menuItems).where(eq(menuItems.tenantId, tenant.id));
const en: Record<string, Record<string, string>> = {
  "Gerookte paling": { name: "Smoked eel", description: "Horseradish cream, red beet, sourdough" },
  Pompoensoep: { name: "Pumpkin soup", description: "Roasted pumpkin, coconut, pumpkin seeds" },
  Kabeljauw: { name: "Cod", description: "Beurre blanc, leek, baby potatoes" },
};
for (const i of allItems) {
  const t = en[i.name];
  if (t)
    await db
      .insert(translations)
      .values({ tenantId: tenant.id, entity: "item", entityId: i.id, locale: "en", fields: t });
}
await db.insert(translations).values([
  {
    tenantId: tenant.id,
    entity: "menu",
    entityId: diner?.id as string,
    locale: "en",
    fields: { name: "Dinner" },
  },
  {
    tenantId: tenant.id,
    entity: "section",
    entityId: voor,
    locale: "en",
    fields: { name: "Starters" },
  },
]);

const dayOffset = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Amsterdam",
  });
await db.insert(events).values([
  {
    tenantId: tenant.id,
    title: "Pubquiz",
    description: "Teams van maximaal zes. De winnaars krijgen een dinerbon.",
    date: dayOffset(-21),
    startTime: "20:00",
    endTime: "23:00",
    repeat: "weekly",
    priceCents: 500,
  },
  {
    tenantId: tenant.id,
    title: "Live jazz",
    description: "Het Havenkwartet speelt klassiekers.",
    date: dayOffset(4),
    startTime: "21:00",
    ticketUrl: "https://tickets.example/jazz",
  },
  { tenantId: tenant.id, title: "Wijnproeverij", date: dayOffset(-10), startTime: "19:00" },
]);

const ago = (min: number) => new Date(Date.now() - min * 60_000);
await db.insert(submissions).values([
  {
    tenantId: tenant.id,
    type: "group",
    name: "Jan de Vries",
    email: "jan@example.nl",
    phone: "06 12345678",
    message: "Graag een vegetarisch en een glutenvrij menu.",
    data: { guests: 14, date: "2026-12-12", occasion: "Verjaardag", budget: "€ 45 p.p." },
    createdAt: ago(10),
  },
  {
    tenantId: tenant.id,
    type: "contact",
    name: "Lisa Bakker",
    email: "lisa@example.nl",
    message: "Hebben jullie ook glutenvrije desserts?",
    createdAt: ago(120),
  },
  {
    tenantId: tenant.id,
    type: "contact",
    name: "Pieter Smit",
    email: "pieter@example.nl",
    message: "Is er parkeergelegenheid vlakbij?",
    createdAt: ago(60 * 26),
  },
  {
    tenantId: tenant.id,
    type: "job",
    name: "Sam Jansen",
    email: "sam@example.nl",
    message: "Ik solliciteer graag voor bediening in het weekend.",
    status: "in_progress",
    createdAt: ago(60 * 50),
  },
  {
    tenantId: tenant.id,
    type: "contact",
    name: "Eva Mulder",
    email: "eva@example.nl",
    message: "Bedankt voor de fijne avond!",
    status: "done",
    createdAt: ago(60 * 90),
  },
]);

const storage = process.env.MEDIA_DIR ? diskStorage(process.env.MEDIA_DIR) : memoryStorage();

// Voorbeeldfoto's (gegenereerde kleurvlakken) zodat de UI er echt uitziet.
const palette: [string, string, string][] = [
  ["Gerookte paling", "#2f4b44", "#9bb8a4"],
  ["Pompoensoep", "#c2761f", "#f1c27d"],
  ["Kabeljauw", "#3d5a80", "#c9d9ea"],
  ["Crème brûlée", "#8a5a2b", "#f0d9a8"],
];
for (const [i, [label, c1, c2]] of palette.entries()) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><circle cx="600" cy="450" r="260" fill="#ffffff22"/><circle cx="600" cy="450" r="170" fill="#ffffff33"/></svg>`;
  const p = await processImage(await sharp(Buffer.from(svg)).png().toBuffer());
  const id = crypto.randomUUID();
  const prefix = `${tenant.id}/${id}`;
  await Promise.all(
    p.variants.map((v) => storage.put(`${prefix}/${v.width}.webp`, v.data, "image/webp")),
  );
  await db.insert(mediaAssets).values({
    id,
    tenantId: tenant.id,
    storagePrefix: prefix,
    width: p.width,
    height: p.height,
    bytes: 1,
    alt: i === 3 ? "" : `Bord met ${label.toLowerCase()}`,
  });
  await db
    .update(menuItems)
    .set({ mediaId: id })
    .where(and(eq(menuItems.tenantId, tenant.id), eq(menuItems.name, label)));
}

const api = createApp({ db, mailer: consoleMailer, config, storage });
const root = new Hono();

// Handig voor lokaal testen: /dev/login?email=sanne@dehaven.test zet direct een sessie.
root.get("/dev/login", async (c) => {
  const email = c.req.query("email") ?? "";
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) return c.text("onbekend", 404);
  const token = newToken();
  await db.insert(loginTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const session = await verifyLogin(db, config, token);
  if (!session) return c.text("mislukt", 500);
  setCookie(c, "mep_session", session.sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    expires: session.expiresAt,
  });
  return c.redirect(c.req.query("next") ?? "/");
});
root.route("/", api);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: root.fetch, port }, () => {
  console.log(`MEP dev-API (in-memory) op http://localhost:${port}`);
  console.log("Inloggen als eigenaar:   /dev/login?email=sanne@dehaven.test");
  console.log("Inloggen als keuken:     /dev/login?email=lotte@dehaven.test");
  console.log("Inloggen als superadmin: /dev/login?email=dev@mep.test");
});
