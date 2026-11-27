import { type Database, memberships, tenants, users } from "@mep/db";
import { createTestDb } from "@mep/db/testing";
import sharp from "sharp";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mailer";
import { memoryStorage } from "../src/storage";

/**
 * Tenant-isolatie: een eigenaar van zaak A mag met id's van zaak B niets lezen, wijzigen of
 * verwijderen. We vallen elk id-gebonden endpoint aan en vergelijken daarna de volledige export van B.
 */
let db: Database;
let mailer: ReturnType<typeof memoryMailer>;
let app: ReturnType<typeof createApp>;
const ZERO = "00000000-0000-4000-8000-000000000000";

const call = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json", cookie },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

async function ownerOf(slug: string) {
  const [t] = await db.insert(tenants).values({ slug, name: slug }).returning();
  const email = `owner-${slug}@example.nl`;
  const [u] = await db.insert(users).values({ email }).returning();
  await db
    .insert(memberships)
    .values({ tenantId: t?.id as string, userId: u?.id as string, role: "owner" });
  await app.request("/auth/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const token = /token=([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1];
  const res = await app.request("/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return {
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] as string,
    userId: u?.id as string,
    tenantId: t?.id as string,
  };
}

beforeEach(async () => {
  db = await createTestDb();
  mailer = memoryMailer();
  app = createApp({ db, mailer, config: loadConfig({}), storage: memoryStorage() });
});

describe("tenant-isolatie", () => {
  test("zaak A kan niets van zaak B lezen, wijzigen of verwijderen", async () => {
    const A = await ownerOf("zaak-a");
    const B = await ownerOf("zaak-b");

    // Alles aanmaken in B
    const j = async (r: Response) => r.json();
    const { menu } = await j(await call(B.cookie, "POST", "/t/zaak-b/menus", { name: "Diner" }));
    const { section } = await j(
      await call(B.cookie, "POST", `/t/zaak-b/menus/${menu.id}/sections`, { name: "Voor" }),
    );
    const { item } = await j(
      await call(B.cookie, "POST", `/t/zaak-b/sections/${section.id}/items`, {
        name: "Soep",
        priceCents: 800,
      }),
    );
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(png)], "x.png", { type: "image/png" }));
    const { media } = await j(
      await app.request("/t/zaak-b/media", {
        method: "POST",
        headers: { cookie: B.cookie },
        body: form,
      }),
    );
    const { key: pageKey } = await j(
      await call(B.cookie, "POST", "/t/zaak-b/pages", { title: "Geheime pagina" }),
    );
    await call(B.cookie, "PUT", `/t/zaak-b/pages/${pageKey}`, {
      title: "Geheime pagina",
      content: { body: "alleen voor B" },
    });
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    const { event } = await j(
      await call(B.cookie, "POST", "/t/zaak-b/events", {
        title: "Feest",
        date: today,
        startTime: "20:00",
      }),
    );
    const { announcement } = await j(
      await call(B.cookie, "POST", "/t/zaak-b/announcements", { text: "Melding B" }),
    );
    const { special } = await j(
      await call(B.cookie, "POST", "/t/zaak-b/specials", {
        name: "Special B",
        startsOn: today,
        endsOn: today,
      }),
    );
    await app.request("/public/zaak-b/forms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Gast", email: "g@x.nl", message: "bericht voor B" }),
    });
    const sub = (await j(await call(B.cookie, "GET", "/t/zaak-b/submissions"))).submissions[0];
    await call(B.cookie, "POST", "/t/zaak-b/team", { email: "kok-b@example.nl", role: "kitchen" });
    const kok = (await j(await call(B.cookie, "GET", "/t/zaak-b/team"))).team.find(
      (m: { email: string }) => m.email === "kok-b@example.nl",
    );

    const snapshot = async () => {
      const x = await j(await call(B.cookie, "GET", "/t/zaak-b/export"));
      x.exportedAt = undefined;
      return JSON.stringify(x);
    };
    const before = await snapshot();

    // A probeert met B's id's. Verwacht: 404/400/403 of een stille no-op, nooit een succes met effect.
    const attacks: [string, string, unknown?][] = [
      ["GET", `/t/zaak-b/today`], // verkeerde zaak: A is geen lid
      ["GET", `/t/zaak-b/export`],
      ["GET", `/t/zaak-a/items/${item.id}`],
      ["PATCH", `/t/zaak-a/items/${item.id}`, { name: "Gehackt", priceCents: 1 }],
      ["DELETE", `/t/zaak-a/items/${item.id}`],
      ["POST", `/t/zaak-a/items/${item.id}/soldout`, { soldOut: true }],
      ["PATCH", `/t/zaak-a/sections/${section.id}`, { name: "Gehackt" }],
      ["DELETE", `/t/zaak-a/sections/${section.id}`],
      ["PUT", `/t/zaak-a/sections/${section.id}/order`, { ids: [item.id] }],
      ["POST", `/t/zaak-a/sections/${section.id}/items`, { name: "Indringer", priceCents: 1 }],
      ["POST", `/t/zaak-a/menus/${menu.id}/sections`, { name: "Indringer" }],
      ["PATCH", `/t/zaak-a/media/${media.id}`, { alt: "Gehackt" }],
      ["DELETE", `/t/zaak-a/media/${media.id}`],
      ["GET", `/t/zaak-a/pages/${pageKey}`],
      ["PUT", `/t/zaak-a/pages/${pageKey}`, { content: { body: "Gehackt" } }],
      ["DELETE", `/t/zaak-a/pages/${pageKey}`],
      ["GET", `/t/zaak-a/events/${event.id}`],
      [
        "PUT",
        `/t/zaak-a/events/${event.id}`,
        { title: "Gehackt", date: today, startTime: "20:00" },
      ],
      ["DELETE", `/t/zaak-a/events/${event.id}`],
      ["DELETE", `/t/zaak-a/announcements/${announcement.id}`],
      ["DELETE", `/t/zaak-a/specials/${special.id}`],
      ["PATCH", `/t/zaak-a/submissions/${sub.id}`, { status: "done", note: "Gehackt" }],
      ["PATCH", `/t/zaak-a/team/${kok.userId}`, { role: "owner" }],
      ["DELETE", `/t/zaak-a/team/${kok.userId}`],
    ];
    for (const [method, path, body] of attacks) {
      const res = await call(A.cookie, method, path, body);
      expect([200, 400, 403, 404], `${method} ${path} gaf ${res.status}`).toContain(res.status);
      expect(await snapshot(), `${method} ${path} wijzigde gegevens van zaak B`).toBe(before);
    }

    // Eigen gerecht van A naar een categorie van B verplaatsen mag niet
    const a = await j(await call(A.cookie, "POST", "/t/zaak-a/menus", { name: "Eigen" }));
    const aSec = (
      await j(
        await call(A.cookie, "POST", `/t/zaak-a/menus/${a.menu.id}/sections`, { name: "Eigen" }),
      )
    ).section;
    const aItem = (
      await j(
        await call(A.cookie, "POST", `/t/zaak-a/sections/${aSec.id}/items`, {
          name: "Eigen gerecht",
          priceCents: 100,
        }),
      )
    ).item;
    const move = await call(A.cookie, "PATCH", `/t/zaak-a/items/${aItem.id}`, {
      name: "Eigen gerecht",
      priceCents: 100,
      sectionId: section.id,
    });
    expect([400, 404], `verplaatsen naar categorie van B gaf ${move.status}`).toContain(
      move.status,
    );
    expect(await snapshot()).toBe(before);

    // Onbekende id's blijven netjes 404
    expect((await call(A.cookie, "GET", `/t/zaak-a/items/${ZERO}`)).status).toBe(404);

    // Publieke API van A toont niets van B
    for (const path of ["menus", "pages/" + pageKey, "events", "announcements", "specials"]) {
      const pub = await (await app.request(`/public/zaak-a/${path}`)).text();
      expect(pub, `publiek ${path} van A lekt B`).not.toMatch(
        /Soep|alleen voor B|Feest|Melding B|Special B/,
      );
    }
  });
});

describe("dekking", () => {
  // Elke tenant-route met een id-parameter moet hierboven aangevallen worden. Voeg je een nieuwe
  // route toe, dan faalt deze test tot je hem hier opneemt (en in de aanvallen hierboven).
  const COVERED = new Set([
    "GET /t/:slug/items/:id",
    "PATCH /t/:slug/items/:id",
    "DELETE /t/:slug/items/:id",
    "POST /t/:slug/items/:id/soldout",
    "PATCH /t/:slug/sections/:id",
    "DELETE /t/:slug/sections/:id",
    "PUT /t/:slug/sections/:id/order",
    "POST /t/:slug/sections/:id/items",
    "POST /t/:slug/menus/:id/sections",
    "PATCH /t/:slug/media/:id",
    "DELETE /t/:slug/media/:id",
    "GET /t/:slug/pages/:key",
    "PUT /t/:slug/pages/:key",
    "DELETE /t/:slug/pages/:key",
    "GET /t/:slug/events/:id",
    "PUT /t/:slug/events/:id",
    "DELETE /t/:slug/events/:id",
    "DELETE /t/:slug/announcements/:id",
    "DELETE /t/:slug/specials/:id",
    "PATCH /t/:slug/submissions/:id",
    "PATCH /t/:slug/team/:userId",
    "DELETE /t/:slug/team/:userId",
    // Dag-uitzonderingen zijn op datum per zaak (geen id van een andere zaak mogelijk)
    "PUT /t/:slug/hours/:kind",
    "DELETE /t/:slug/hours/exceptions/:date",
  ]);

  test("alle id-gebonden tenant-routes zijn gedekt", async () => {
    const found = app.routes
      .filter(
        (r) => r.path.startsWith("/t/:slug/") && /:(?!slug)/.test(r.path) && r.method !== "ALL",
      )
      .map((r) => `${r.method} ${r.path}`);
    expect(found.length).toBeGreaterThan(20); // de bewaker ziet de routes echt
    const uncovered = found.filter((r) => !COVERED.has(r));
    expect(
      uncovered,
      `Nieuwe id-gebonden route(s) zonder isolatietest: ${uncovered.join(", ")}`,
    ).toEqual([]);
  });
});
