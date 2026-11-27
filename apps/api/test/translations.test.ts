import { type Database, memberships, tenants, users } from "@mep/db";
import { createTestDb } from "@mep/db/testing";
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

async function member(email: string, role: "owner" | "manager" | "kitchen", tId = tenantId) {
  const [u] = await db.insert(users).values({ email }).returning();
  await db.insert(memberships).values({ tenantId: tId, userId: u?.id as string, role });
  await send("POST", "/auth/request", { email });
  const token = /token=([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1];
  return ((await send("POST", "/auth/verify", { token })).headers.get("set-cookie") ?? "").split(
    ";",
  )[0] as string;
}

beforeEach(async () => {
  db = await createTestDb();
  mailer = memoryMailer();
  app = createApp({ db, mailer, config: loadConfig({}), storage: memoryStorage() });
  const [t] = await db.insert(tenants).values({ slug: "haven", name: "De Haven" }).returning();
  tenantId = t?.id as string;
});

async function seed(owner: string) {
  const { menu } = await (await send("POST", "/t/haven/menus", { name: "Diner" }, owner)).json();
  const { section } = await (
    await send("POST", `/t/haven/menus/${menu.id}/sections`, { name: "Voorgerechten" }, owner)
  ).json();
  const { item } = await (
    await send(
      "POST",
      `/t/haven/sections/${section.id}/items`,
      { name: "Gerookte paling", description: "Met mierikswortel", priceCents: 1450 },
      owner,
    )
  ).json();
  await send(
    "PUT",
    "/t/haven/pages/about",
    { content: { heading: "Ons verhaal", story: "Wij koken seizoensgebonden." } },
    owner,
  );
  return { menu, section, item };
}

describe("meertaligheid", () => {
  test("talen aan zetten: alleen eigenaar, Nederlands blijft verplicht", async () => {
    const owner = await member("sanne@example.nl", "owner");
    const manager = await member("mo@example.nl", "manager");
    expect((await send("PUT", "/t/haven/locales", { locales: ["nl", "en"] }, manager)).status).toBe(
      403,
    );
    expect((await send("PUT", "/t/haven/locales", { locales: ["en"] }, owner)).status).toBe(400);
    expect((await send("PUT", "/t/haven/locales", { locales: ["nl", "xx"] }, owner)).status).toBe(
      400,
    );
    expect(
      (await send("PUT", "/t/haven/locales", { locales: ["nl", "en", "en"] }, owner)).status,
    ).toBe(200);
    expect((await (await app.request("/public/haven/info")).json()).locales).toEqual(["nl", "en"]);
  });

  test("vertalen, ontbrekend tellen, publieke API met terugval op Nederlands", async () => {
    const owner = await member("sanne@example.nl", "owner");
    const { item, menu, section } = await seed(owner);

    // taal staat nog niet aan
    expect((await send("GET", "/t/haven/translations?locale=en", undefined, owner)).status).toBe(
      400,
    );
    await send("PUT", "/t/haven/locales", { locales: ["nl", "en"] }, owner);

    const list = await (
      await send("GET", "/t/haven/translations?locale=en", undefined, owner)
    ).json();
    expect(list.entries.map((e: { entity: string }) => e.entity)).toEqual(
      expect.arrayContaining(["menu", "section", "item", "page"]),
    );
    const missingBefore = list.missing;
    expect(missingBefore).toBe(list.total);

    // Alleen de naam van het gerecht vertalen; de omschrijving valt terug op Nederlands
    expect(
      (
        await send(
          "PUT",
          "/t/haven/translations",
          { locale: "en", entity: "item", entityId: item.id, fields: { name: "Smoked eel" } },
          owner,
        )
      ).status,
    ).toBe(200);
    await send(
      "PUT",
      "/t/haven/translations",
      { locale: "en", entity: "page", entityId: "about", fields: { heading: "Our story" } },
      owner,
    );
    await send(
      "PUT",
      "/t/haven/translations",
      { locale: "en", entity: "menu", entityId: menu.id, fields: { name: "Dinner" } },
      owner,
    );
    await send(
      "PUT",
      "/t/haven/translations",
      { locale: "en", entity: "section", entityId: section.id, fields: { name: "Starters" } },
      owner,
    );

    const after = await (
      await send("GET", "/t/haven/translations?locale=en", undefined, owner)
    ).json();
    expect(after.missing).toBe(missingBefore - 4);

    const en = await (await app.request("/public/haven/menus?lang=en")).json();
    expect(en.menus[0].name).toBe("Dinner");
    expect(en.menus[0].sections[0].name).toBe("Starters");
    expect(en.menus[0].sections[0].items[0]).toMatchObject({
      name: "Smoked eel",
      description: "Met mierikswortel",
    });

    const nl = await (await app.request("/public/haven/menus")).json();
    expect(nl.menus[0].sections[0].items[0].name).toBe("Gerookte paling");
    // onbekende of niet-ingeschakelde taal: gewoon Nederlands
    expect((await (await app.request("/public/haven/menus?lang=fr")).json()).menus[0].name).toBe(
      "Diner",
    );

    const about = await (await app.request("/public/haven/pages/about?lang=en")).json();
    expect(about.title).toBe("About us");
    expect(about.content).toMatchObject({
      heading: "Our story",
      story: "Wij koken seizoensgebonden.",
    });

    // leeg maken haalt de vertaling weg
    await send(
      "PUT",
      "/t/haven/translations",
      { locale: "en", entity: "item", entityId: item.id, fields: { name: "  " } },
      owner,
    );
    expect(
      (await (await app.request("/public/haven/menus?lang=en")).json()).menus[0].sections[0]
        .items[0].name,
    ).toBe("Gerookte paling");
  });

  test("validatie en rechten", async () => {
    const owner = await member("sanne@example.nl", "owner");
    const kitchen = await member("lotte@example.nl", "kitchen");
    const { item } = await seed(owner);
    await send("PUT", "/t/haven/locales", { locales: ["nl", "en"] }, owner);
    const put = (b: unknown, c = owner) => send("PUT", "/t/haven/translations", b, c);

    expect(
      (await put({ locale: "en", entity: "item", entityId: item.id, fields: { priceCents: "5" } }))
        .status,
    ).toBe(400); // onvertaalbaar veld
    expect(
      (await put({ locale: "nl", entity: "item", entityId: item.id, fields: { name: "x" } }))
        .status,
    ).toBe(400); // brontaal
    expect(
      (await put({ locale: "de", entity: "item", entityId: item.id, fields: { name: "x" } }))
        .status,
    ).toBe(400); // taal staat niet aan
    expect(
      (
        await put({
          locale: "en",
          entity: "item",
          entityId: "00000000-0000-4000-8000-000000000000",
          fields: { name: "x" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await put({
          locale: "en",
          entity: "page",
          entityId: "bestaat-niet",
          fields: { title: "x" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await put({ locale: "en", entity: "page", entityId: "contact", fields: { phone: "123" } }))
        .status,
    ).toBe(400); // telefoon is geen tekst
    expect(
      (
        await put(
          { locale: "en", entity: "item", entityId: item.id, fields: { name: "x" } },
          kitchen,
        )
      ).status,
    ).toBe(403); // keuken mag niet
  });
});
