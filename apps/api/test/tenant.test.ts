import { type Database, memberships, tenants, users } from "@mep/db";
import { createTestDb } from "@mep/db/testing";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mailer";
import { memoryStorage } from "../src/storage";

let db: Database;
let mailer: ReturnType<typeof memoryMailer>;
let app: ReturnType<typeof createApp>;
let tenantId: string;

const send = (method: string, path: string, body?: unknown, cookie?: string) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json", ...(cookie && { cookie }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

async function login(email: string) {
  await send("POST", "/auth/request", { email });
  const token = /token=([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1] ?? "";
  const res = await send("POST", "/auth/verify", { token });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
}

async function addMember(
  email: string,
  role: "owner" | "manager" | "kitchen" | "staff",
  tId = tenantId,
) {
  const [u] = await db.insert(users).values({ email }).onConflictDoNothing().returning();
  const [user] = u ? [u] : await db.select().from(users).where(eq(users.email, email));
  await db.insert(memberships).values({ tenantId: tId, userId: user?.id as string, role });
  return login(email);
}

const week = [[], [{ open: "12:00", close: "22:00" }], [], [], [], [], []];

beforeEach(async () => {
  db = await createTestDb();
  mailer = memoryMailer();
  app = createApp({ db, mailer, config: loadConfig({}), storage: memoryStorage() });
  const [t] = await db.insert(tenants).values({ slug: "haven", name: "De Haven" }).returning();
  tenantId = t?.id as string;
});

describe("toegang", () => {
  test("zonder login 401, vreemde zaak 404", async () => {
    expect((await send("GET", "/t/haven/today")).status).toBe(401);
    const [other] = await db.insert(tenants).values({ slug: "ander", name: "Ander" }).returning();
    const cookie = await addMember("sanne@example.nl", "owner", other?.id);
    expect((await send("GET", "/t/haven/today", undefined, cookie)).status).toBe(404);
  });

  test("rollen: keuken mag kaart maar niet tijden of inbox", async () => {
    const cookie = await addMember("lotte@example.nl", "kitchen");
    expect((await send("GET", "/t/haven/menus", undefined, cookie)).status).toBe(200);
    expect((await send("GET", "/t/haven/hours", undefined, cookie)).status).toBe(403);
    expect((await send("GET", "/t/haven/submissions", undefined, cookie)).status).toBe(403);
    const today = await (await send("GET", "/t/haven/today", undefined, cookie)).json();
    expect(today.inbox).toBeNull();
  });
});

describe("openingstijden", () => {
  test("weekschema opslaan, valideren en uitzondering voor vandaag", async () => {
    const cookie = await addMember("sanne@example.nl", "owner");
    expect((await send("PUT", "/t/haven/hours/venue", { schedule: week }, cookie)).status).toBe(
      200,
    );
    const bad = [[{ open: "20:00", close: "10:00" }], [], [], [], [], [], []];
    expect((await send("PUT", "/t/haven/hours/venue", { schedule: bad }, cookie)).status).toBe(400);

    const got = await (await send("GET", "/t/haven/hours", undefined, cookie)).json();
    expect(got.venue[1]).toEqual([{ open: "12:00", close: "22:00" }]);

    await send("POST", "/t/haven/today/override", { mode: "closed", reason: "Ziekte" }, cookie);
    const today = await (await send("GET", "/t/haven/today", undefined, cookie)).json();
    expect(today.status.open).toBe(false);
    expect(today.status.exception.reason).toBe("Ziekte");

    await send("POST", "/t/haven/today/override", { mode: "reset" }, cookie);
    const again = await (await send("GET", "/t/haven/today", undefined, cookie)).json();
    expect(again.status.exception).toBeNull();
  });
});

describe("menukaart", () => {
  test("kaart, categorie, gerecht, op = op en verwijderen", async () => {
    const cookie = await addMember("sanne@example.nl", "owner");
    const { menu } = await (await send("POST", "/t/haven/menus", { name: "Diner" }, cookie)).json();
    const { section } = await (
      await send("POST", `/t/haven/menus/${menu.id}/sections`, { name: "Voorgerechten" }, cookie)
    ).json();
    const created = await send(
      "POST",
      `/t/haven/sections/${section.id}/items`,
      { name: "Gerookte paling", priceCents: 1450, allergens: ["fish", "gluten"] },
      cookie,
    );
    expect(created.status).toBe(201);
    const { item } = await created.json();

    await send("POST", `/t/haven/items/${item.id}/soldout`, { soldOut: true, until: null }, cookie);
    const list = await (await send("GET", "/t/haven/menus", undefined, cookie)).json();
    const listed = list.menus[0].sections[0].items[0];
    expect(listed).toMatchObject({
      name: "Gerookte paling",
      unavailable: true,
      allergensChecked: true,
    });

    // Uitverkocht tot een datum in het verleden telt niet meer
    await send(
      "POST",
      `/t/haven/items/${item.id}/soldout`,
      { soldOut: true, until: "2000-01-01" },
      cookie,
    );
    const past = await (await send("GET", `/t/haven/items/${item.id}`, undefined, cookie)).json();
    expect(past.item.unavailable).toBe(false);

    expect((await send("DELETE", `/t/haven/items/${item.id}`, undefined, cookie)).status).toBe(200);
    expect((await send("GET", `/t/haven/items/${item.id}`, undefined, cookie)).status).toBe(404);
  });

  test("ongeldig allergeen en lege naam worden geweigerd", async () => {
    const cookie = await addMember("sanne@example.nl", "owner");
    const { menu } = await (await send("POST", "/t/haven/menus", { name: "Diner" }, cookie)).json();
    const { section } = await (
      await send("POST", `/t/haven/menus/${menu.id}/sections`, { name: "A" }, cookie)
    ).json();
    const post = (b: unknown) => send("POST", `/t/haven/sections/${section.id}/items`, b, cookie);
    expect((await post({ name: "X", priceCents: 100, allergens: ["kaas"] })).status).toBe(400);
    expect((await post({ name: " ", priceCents: 100 })).status).toBe(400);
  });

  test("een andere zaak kan mijn gerecht niet wijzigen", async () => {
    const cookie = await addMember("sanne@example.nl", "owner");
    const { menu } = await (await send("POST", "/t/haven/menus", { name: "Diner" }, cookie)).json();
    const { section } = await (
      await send("POST", `/t/haven/menus/${menu.id}/sections`, { name: "A" }, cookie)
    ).json();
    const { item } = await (
      await send(
        "POST",
        `/t/haven/sections/${section.id}/items`,
        { name: "X", priceCents: 1 },
        cookie,
      )
    ).json();

    const [other] = await db.insert(tenants).values({ slug: "ander", name: "Ander" }).returning();
    const otherCookie = await addMember("piet@example.nl", "owner", other?.id);
    const res = await send("DELETE", `/t/ander/items/${item.id}`, undefined, otherCookie);
    expect(res.status).toBe(200); // geen fout, maar...
    expect((await send("GET", `/t/haven/items/${item.id}`, undefined, cookie)).status).toBe(200); // ...niets verwijderd
  });
});

describe("inbox", () => {
  test("publiek formulier komt binnen, status aanpassen", async () => {
    const res = await send("POST", "/public/haven/forms", {
      type: "group",
      name: "Jan",
      email: "Jan@Example.nl",
      message: "14 personen op 12 mei",
      data: { guests: 14 },
    });
    expect(res.status).toBe(201);
    expect(
      (
        await send("POST", "/public/haven/forms", {
          name: "Bot",
          email: "b@x.nl",
          message: "hi",
          website: "spam",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("POST", "/public/nietbestaand/forms", {
          name: "A",
          email: "a@x.nl",
          message: "hi",
        })
      ).status,
    ).toBe(404);

    const cookie = await addMember("sanne@example.nl", "owner");
    const today = await (await send("GET", "/t/haven/today", undefined, cookie)).json();
    expect(today.inbox.newCount).toBe(1);

    const list = await (
      await send("GET", "/t/haven/submissions?status=new", undefined, cookie)
    ).json();
    const id = list.submissions[0].id;
    expect(list.submissions[0].email).toBe("jan@example.nl");
    await send(
      "PATCH",
      `/t/haven/submissions/${id}`,
      { status: "in_progress", note: "Teruggebeld" },
      cookie,
    );
    const after = await (await send("GET", "/t/haven/submissions", undefined, cookie)).json();
    expect(after.counts).toEqual({ in_progress: 1 });
  });
});

describe("meldingen en specials (beheer)", () => {
  test("aanmaken, in /today zien, verwijderen; rechten per rol", async () => {
    const owner = await addMember("sanne@example.nl", "owner");
    const kitchen = await addMember("lotte@example.nl", "kitchen");
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

    expect(
      (
        await send(
          "POST",
          "/t/haven/announcements",
          { text: "Gesloten wegens ziekte", endsOn: today },
          owner,
        )
      ).status,
    ).toBe(201);
    expect((await send("POST", "/t/haven/announcements", { text: "x" }, kitchen)).status).toBe(403); // keuken: geen meldingen
    expect((await send("POST", "/t/haven/announcements", { text: "" }, owner)).status).toBe(400);

    const sp = await send(
      "POST",
      "/t/haven/specials",
      { name: "Dagsoep", priceCents: 750, startsOn: today, endsOn: today },
      kitchen,
    );
    expect(sp.status).toBe(201); // keuken mag specials
    expect(
      (
        await send(
          "POST",
          "/t/haven/specials",
          { name: "Fout", startsOn: today, endsOn: "2000-01-01" },
          owner,
        )
      ).status,
    ).toBe(400);

    const t = await (await send("GET", "/t/haven/today", undefined, owner)).json();
    expect(t.live.announcements).toHaveLength(1);
    expect(t.live.specials).toHaveLength(1);

    await send("DELETE", `/t/haven/specials/${t.live.specials[0].id}`, undefined, owner);
    await send("DELETE", `/t/haven/announcements/${t.live.announcements[0].id}`, undefined, owner);
    const after = await (await send("GET", "/t/haven/today", undefined, owner)).json();
    expect(after.live).toEqual({ announcements: [], specials: [] });
  });
});
