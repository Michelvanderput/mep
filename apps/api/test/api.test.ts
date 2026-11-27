import { type Database, tenants, users } from "@mep/db";
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

const json = (body: unknown, cookie?: string) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...(cookie && { cookie }) },
  body: JSON.stringify(body),
});

const tokenFromMail = () => {
  const text = mailer.sent.at(-1)?.text ?? "";
  return /token=([\w-]+)/.exec(text)?.[1] ?? "";
};

async function login(email: string) {
  await app.request("/auth/request", json({ email }));
  const res = await app.request("/auth/verify", json({ token: tokenFromMail() }));
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
}

beforeEach(async () => {
  db = await createTestDb();
  mailer = memoryMailer();
  app = createApp({ db, mailer, config: loadConfig({}), storage: memoryStorage() });
  await db.insert(users).values({ email: "admin@mep.nl", isSuperadmin: true });
});

describe("auth", () => {
  test("onbekend e-mailadres: zelfde antwoord, geen mail", async () => {
    const res = await app.request("/auth/request", json({ email: "niemand@example.nl" }));
    expect(res.status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
  });

  test("magic link werkt één keer", async () => {
    await app.request("/auth/request", json({ email: "admin@mep.nl" }));
    const token = tokenFromMail();
    expect((await app.request("/auth/verify", json({ token }))).status).toBe(200);
    expect((await app.request("/auth/verify", json({ token }))).status).toBe(400);
  });

  test("/me vereist sessie en toont gebruiker", async () => {
    expect((await app.request("/me")).status).toBe(401);
    const cookie = await login("admin@mep.nl");
    const res = await app.request("/me", { headers: { cookie } });
    const body = (await res.json()) as { user: { email: string; isSuperadmin: boolean } };
    expect(body.user).toMatchObject({ email: "admin@mep.nl", isSuperadmin: true });
  });

  test("uitloggen beëindigt de sessie", async () => {
    const cookie = await login("admin@mep.nl");
    await app.request("/auth/logout", json({}, cookie));
    expect((await app.request("/me", { headers: { cookie } })).status).toBe(401);
  });
});

describe("tenants (superadmin)", () => {
  const input = {
    name: "Bistro De Haven",
    slug: "bistro-de-haven",
    ownerEmail: "Sanne@Example.nl",
  };

  test("alleen superadmin mag zaken aanmaken", async () => {
    expect((await app.request("/admin/tenants", json(input))).status).toBe(401);

    await db.insert(users).values({ email: "sanne@example.nl" });
    const cookie = await login("sanne@example.nl");
    expect((await app.request("/admin/tenants", json(input, cookie))).status).toBe(403);
  });

  test("maakt zaak, eigenaar en welkomstmail; eigenaar kan inloggen", async () => {
    const adminCookie = await login("admin@mep.nl");
    const res = await app.request("/admin/tenants", json(input, adminCookie));
    expect(res.status).toBe(201);

    expect(mailer.sent.at(-1)?.to).toBe("sanne@example.nl");
    const ownerCookie = await login("sanne@example.nl");
    const me = (await (await app.request("/me", { headers: { cookie: ownerCookie } })).json()) as {
      tenants: { slug: string; role: string }[];
    };
    expect(me.tenants).toEqual([
      expect.objectContaining({ slug: "bistro-de-haven", role: "owner" }),
    ]);

    const [t] = await db.select().from(tenants).where(eq(tenants.slug, "bistro-de-haven"));
    expect(t?.modules).toContain("menu");
  });

  test("dubbele slug geeft 409, ongeldige slug 400", async () => {
    const cookie = await login("admin@mep.nl");
    expect((await app.request("/admin/tenants", json(input, cookie))).status).toBe(201);
    expect((await app.request("/admin/tenants", json(input, cookie))).status).toBe(409);
    expect(
      (await app.request("/admin/tenants", json({ ...input, slug: "A b" }, cookie))).status,
    ).toBe(400);
  });

  test("eigenaar ziet geen superadmin-routes", async () => {
    const adminCookie = await login("admin@mep.nl");
    await app.request("/admin/tenants", json(input, adminCookie));
    const ownerCookie = await login("sanne@example.nl");
    expect((await app.request("/admin/tenants", { headers: { cookie: ownerCookie } })).status).toBe(
      403,
    );
  });
});
