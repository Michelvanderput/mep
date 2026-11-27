import { type Database, menuItems, menuSections, menus, openingHours, tenants } from "@mep/db";
import { createTestDb } from "@mep/db/testing";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mailer";
import { memoryStorage } from "../src/storage";

let db: Database;
let app: ReturnType<typeof createApp>;
let tenantId: string;

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, mailer: memoryMailer(), config: loadConfig({}), storage: memoryStorage() });
  const [t] = await db
    .insert(tenants)
    .values({ slug: "haven", name: "De Haven", modules: ["menu"] })
    .returning();
  tenantId = t?.id as string;
});

describe("publieke API", () => {
  test("info, uren en menu zonder login, met cache-header en CORS", async () => {
    const day = [{ open: "00:00", close: "23:59" }];
    await db
      .insert(openingHours)
      .values({ tenantId, kind: "venue", schedule: [day, day, day, day, day, day, day] });
    const [m] = await db.insert(menus).values({ tenantId, name: "Diner" }).returning();
    const [s] = await db
      .insert(menuSections)
      .values({ tenantId, menuId: m?.id as string, name: "Voor" })
      .returning();
    await db.insert(menuItems).values([
      {
        tenantId,
        sectionId: s?.id as string,
        name: "Paling",
        priceCents: 1450,
        allergens: ["fish"],
        allergensChecked: true,
        position: 0,
      },
      {
        tenantId,
        sectionId: s?.id as string,
        name: "Burrata",
        priceCents: 1250,
        allergens: [],
        allergensChecked: false,
        position: 1,
      },
      {
        tenantId,
        sectionId: s?.id as string,
        name: "Zalm",
        priceCents: 1350,
        soldOut: true,
        allergensChecked: true,
        position: 2,
      },
    ]);

    const info = await app.request("/public/haven/info", {
      headers: { origin: "https://site.nl" },
    });
    expect(info.status).toBe(200);
    expect(info.headers.get("access-control-allow-origin")).toBe("*");
    expect(info.headers.get("vercel-cdn-cache-control")).toContain("s-maxage");
    expect(info.headers.get("cache-control")).toContain("max-age=0");
    expect(await info.json()).toMatchObject({ name: "De Haven", timezone: "Europe/Amsterdam" });

    const hours = await (await app.request("/public/haven/hours")).json();
    expect(hours.status.open).toBe(true);

    const body = await (await app.request("/public/haven/menus")).json();
    const items = body.menus[0].sections[0].items;
    expect(items.map((i: { name: string }) => i.name)).toEqual(["Paling", "Burrata", "Zalm"]);
    expect(items[0]).toMatchObject({ allergens: ["fish"], available: true });
    expect(items[1].allergens).toBeNull(); // niet gecontroleerd => onbekend, niet "geen"
    expect(items[2].available).toBe(false);
    expect(JSON.stringify(body)).not.toContain("tenantId");
  });

  test("onbekende of geschorste zaak geeft 404", async () => {
    expect((await app.request("/public/nope/menus")).status).toBe(404);
    await db.update(tenants).set({ status: "suspended" });
    expect((await app.request("/public/haven/info")).status).toBe(404);
  });
});

describe("meldingen en specials", () => {
  test("alleen wat vandaag geldt komt op de site", async () => {
    const { announcements, specials } = await import("@mep/db");
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    const day = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", {
        timeZone: "Europe/Amsterdam",
      });
    await db.insert(announcements).values([
      { tenantId, text: "Vandaag gesloten", startsOn: today, endsOn: today },
      { tenantId, text: "Zonder einddatum" },
      { tenantId, text: "Verlopen", endsOn: day(-1) },
      { tenantId, text: "Toekomst", startsOn: day(2) },
    ]);
    await db.insert(specials).values([
      { tenantId, name: "Dagsoep", priceCents: 750, startsOn: today, endsOn: today },
      { tenantId, name: "Gisteren", startsOn: day(-1), endsOn: day(-1) },
    ]);
    const a = await (await app.request("/public/haven/announcements")).json();
    expect(a.announcements.map((x: { text: string }) => x.text).sort()).toEqual([
      "Vandaag gesloten",
      "Zonder einddatum",
    ]);
    const s = await (await app.request("/public/haven/specials")).json();
    expect(s.specials.map((x: { name: string }) => x.name)).toEqual(["Dagsoep"]);
  });
});
