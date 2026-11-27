import {
  type Database,
  loginTokens,
  memberships,
  sessions,
  submissions,
  tenants,
  users,
} from "@mep/db";
import { createTestDb } from "@mep/db/testing";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { runCleanup } from "../src/cleanup";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mailer";
import { memoryStorage } from "../src/storage";

let db: Database;
let mailer: ReturnType<typeof memoryMailer>;
let app: ReturnType<typeof createApp>;
let tenantId: string;

const send = (
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json", ...(cookie && { cookie }), ...headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

async function login(email: string) {
  await send("POST", "/auth/request", { email });
  const token = /token=([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1];
  return ((await send("POST", "/auth/verify", { token })).headers.get("set-cookie") ?? "").split(
    ";",
  )[0] as string;
}
async function member(email: string, role: "owner" | "manager" | "kitchen" | "staff") {
  const [u] = await db.insert(users).values({ email }).onConflictDoNothing().returning();
  await db.insert(memberships).values({ tenantId, userId: u?.id as string, role });
  return login(email);
}

beforeEach(async () => {
  db = await createTestDb();
  mailer = memoryMailer();
  app = createApp({
    db,
    mailer,
    config: loadConfig({ CRON_SECRET: "geheim" }),
    storage: memoryStorage(),
  });
  const [t] = await db.insert(tenants).values({ slug: "haven", name: "De Haven" }).returning();
  tenantId = t?.id as string;
});

describe("team", () => {
  test("eigenaar nodigt uit, nieuw lid kan inloggen met beperkte rechten", async () => {
    const owner = await member("sanne@example.nl", "owner");
    mailer.sent.length = 0;
    const res = await send(
      "POST",
      "/t/haven/team",
      { email: "Lotte@Example.nl", name: "Lotte", role: "kitchen" },
      owner,
    );
    expect(res.status).toBe(201);
    expect(mailer.sent.at(-1)).toMatchObject({ to: "lotte@example.nl" });
    expect(mailer.sent.at(-1)?.subject).toContain("De Haven");

    expect(
      (await send("POST", "/t/haven/team", { email: "lotte@example.nl", role: "staff" }, owner))
        .status,
    ).toBe(409);
    expect(
      (await send("POST", "/t/haven/team", { email: "x@y.nl", role: "baas" }, owner)).status,
    ).toBe(400);

    const kitchen = await login("lotte@example.nl");
    expect((await send("GET", "/t/haven/menus", undefined, kitchen)).status).toBe(200);
    expect((await send("GET", "/t/haven/team", undefined, kitchen)).status).toBe(403);
    expect((await send("GET", "/t/haven/export", undefined, kitchen)).status).toBe(403);

    const team = await (await send("GET", "/t/haven/team", undefined, owner)).json();
    expect(
      team.team.map((m: { email: string; role: string; isYou: boolean }) => [
        m.email,
        m.role,
        m.isYou,
      ]),
    ).toEqual([
      ["sanne@example.nl", "owner", true],
      ["lotte@example.nl", "kitchen", false],
    ]);
  });

  test("manager mag het team niet beheren", async () => {
    const manager = await member("mo@example.nl", "manager");
    expect(
      (await send("POST", "/t/haven/team", { email: "a@b.nl", role: "staff" }, manager)).status,
    ).toBe(403);
  });

  test("rol wijzigen, verwijderen en de laatste eigenaar beschermen", async () => {
    const owner = await member("sanne@example.nl", "owner");
    await send("POST", "/t/haven/team", { email: "lotte@example.nl", role: "kitchen" }, owner);
    const { team } = await (await send("GET", "/t/haven/team", undefined, owner)).json();
    const sanne = team.find((m: { email: string }) => m.email === "sanne@example.nl");
    const lotte = team.find((m: { email: string }) => m.email === "lotte@example.nl");

    expect(
      (await send("PATCH", `/t/haven/team/${sanne.userId}`, { role: "manager" }, owner)).status,
    ).toBe(409);
    expect((await send("DELETE", `/t/haven/team/${sanne.userId}`, undefined, owner)).status).toBe(
      409,
    );

    expect(
      (await send("PATCH", `/t/haven/team/${lotte.userId}`, { role: "owner" }, owner)).status,
    ).toBe(200);
    // nu zijn er twee eigenaren: Sanne mag zichzelf degraderen
    expect(
      (await send("PATCH", `/t/haven/team/${sanne.userId}`, { role: "manager" }, owner)).status,
    ).toBe(200);
    expect((await send("DELETE", `/t/haven/team/${lotte.userId}`, undefined, owner)).status).toBe(
      403,
    ); // Sanne is nu manager

    const lotteCookie = await login("lotte@example.nl");
    expect(
      (await send("DELETE", `/t/haven/team/${sanne.userId}`, undefined, lotteCookie)).status,
    ).toBe(200);
    expect(
      (
        await send(
          "PATCH",
          "/t/haven/team/00000000-0000-4000-8000-000000000000",
          { role: "staff" },
          lotteCookie,
        )
      ).status,
    ).toBe(404);
  });

  test("export bevat de gegevens van de zaak, niet van anderen", async () => {
    const owner = await member("sanne@example.nl", "owner");
    await send("POST", "/t/haven/menus", { name: "Diner" }, owner);
    const [other] = await db.insert(tenants).values({ slug: "ander", name: "Ander" }).returning();
    await db
      .insert(submissions)
      .values({ tenantId: other?.id as string, name: "X", email: "x@x.nl", message: "geheim" });

    const res = await send("GET", "/t/haven/export", undefined, owner);
    expect(res.headers.get("content-disposition")).toContain("mep-haven-export.json");
    const body = await res.json();
    expect(body.tenant.slug).toBe("haven");
    expect(body.menus).toHaveLength(1);
    expect(body.team).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("geheim");
  });
});

describe("beveiliging en opruimen", () => {
  test("beveiligingsheaders, ook cross-origin foto's toegestaan", async () => {
    const res = await send("GET", "/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });

  test("formulier: per afzender max. 3 per 10 minuten, per zaak max. 60 per uur", async () => {
    const post = (email: string) =>
      send("POST", "/public/haven/forms", { name: "A", email, message: "hoi" });
    for (let i = 0; i < 3; i++) expect((await post("gast@example.nl")).status).toBe(201);
    expect((await post("gast@example.nl")).status).toBe(429);
    expect((await post("ander@example.nl")).status).toBe(201);

    await db.delete(submissions);
    await db
      .insert(submissions)
      .values(
        Array.from({ length: 60 }, (_, i) => ({
          tenantId,
          name: "B",
          email: `b${i}@x.nl`,
          message: "x",
        })),
      );
    expect((await post("nieuw@example.nl")).status).toBe(429);
  });

  test("cron: alleen met geheim, ruimt verlopen gegevens en oude afgehandelde berichten op", async () => {
    expect((await send("GET", "/cron/cleanup")).status).toBe(401);
    expect(
      (await send("GET", "/cron/cleanup", undefined, undefined, { authorization: "Bearer fout" }))
        .status,
    ).toBe(401);

    const [u] = await db.insert(users).values({ email: "a@b.nl" }).returning();
    const long = new Date(Date.now() - 400 * 86_400_000);
    await db.insert(loginTokens).values([
      {
        userId: u?.id as string,
        tokenHash: "old",
        expiresAt: new Date(Date.now() - 3 * 86_400_000),
      },
      { userId: u?.id as string, tokenHash: "fresh", expiresAt: new Date(Date.now() + 60_000) },
    ]);
    await db.insert(sessions).values([
      { id: "dead", userId: u?.id as string, expiresAt: new Date(Date.now() - 1000) },
      { id: "alive", userId: u?.id as string, expiresAt: new Date(Date.now() + 86_400_000) },
    ]);
    const rows = [
      {
        tenantId,
        name: "oud-klaar",
        email: "1@x.nl",
        message: "x",
        status: "done",
        updatedAt: long,
      },
      {
        tenantId,
        name: "oud-nieuw",
        email: "2@x.nl",
        message: "x",
        status: "new",
        updatedAt: long,
      },
      { tenantId, name: "recent-klaar", email: "3@x.nl", message: "x", status: "done" },
    ];
    await db.insert(submissions).values(rows);
    // $onUpdate overschrijft updatedAt niet bij insert; zet de oude datum expliciet
    await db.update(submissions).set({ updatedAt: long }).where(eq(submissions.name, "oud-klaar"));
    await db.update(submissions).set({ updatedAt: long }).where(eq(submissions.name, "oud-nieuw"));

    const res = await send("GET", "/cron/cleanup", undefined, undefined, {
      authorization: "Bearer geheim",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).removed).toEqual({ loginTokens: 1, sessions: 1, submissions: 1 });
    const left = (await db.select().from(submissions)).map((s) => s.name).sort();
    expect(left).toEqual(["oud-nieuw", "recent-klaar"]);
    expect(await runCleanup(db)).toEqual({ loginTokens: 0, sessions: 0, submissions: 0 });
  });

  test("cron staat uit zonder CRON_SECRET", async () => {
    const bare = createApp({ db, mailer, config: loadConfig({}), storage: memoryStorage() });
    expect(
      (await bare.request("/cron/cleanup", { headers: { authorization: "Bearer " } })).status,
    ).toBe(404);
  });
});
