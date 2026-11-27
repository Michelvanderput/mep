import { type Database, memberships, tenants, users } from "@mep/db";
import { createTestDb } from "@mep/db/testing";
import sharp from "sharp";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mailer";
import { memoryStorage } from "../src/storage";

let db: Database;
let mailer: ReturnType<typeof memoryMailer>;
let storage: ReturnType<typeof memoryStorage>;
let app: ReturnType<typeof createApp>;
let tenantId: string;

const json = (method: string, path: string, body?: unknown, cookie?: string) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json", ...(cookie && { cookie }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

async function member(email: string, slug: string, role: "owner" | "kitchen", tId: string) {
  const [u] = await db.insert(users).values({ email }).returning();
  await db.insert(memberships).values({ tenantId: tId, userId: u?.id as string, role });
  await json("POST", "/auth/request", { email });
  const token = /token=([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1];
  const res = await json("POST", "/auth/verify", { token });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
}

async function upload(
  cookie: string,
  bytes: Uint8Array | Buffer,
  name = "foto.png",
  type = "image/png",
  alt?: string,
  slug = "haven",
) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  if (alt !== undefined) form.set("alt", alt);
  return app.request(`/t/${slug}/media`, { method: "POST", headers: { cookie }, body: form });
}

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c00" } })
    .png()
    .toBuffer();

beforeEach(async () => {
  db = await createTestDb();
  mailer = memoryMailer();
  storage = memoryStorage();
  app = createApp({ db, mailer, config: loadConfig({}), storage });
  const [t] = await db.insert(tenants).values({ slug: "haven", name: "De Haven" }).returning();
  tenantId = t?.id as string;
});

describe("media", () => {
  test("upload maakt drie WebP-varianten en is publiek leesbaar", async () => {
    const cookie = await member("sanne@example.nl", "haven", "owner", tenantId);
    const res = await upload(cookie, await png(2400, 1200), "x.png", "image/png", "Een rode foto");
    expect(res.status).toBe(201);
    const { media } = await res.json();
    expect(media).toMatchObject({ width: 1600, height: 800, alt: "Een rode foto" });
    expect(storage.keys().sort()).toEqual(
      [400, 800, 1600].map((w) => `${tenantId}/${media.id}/${w}.webp`).sort(),
    );

    const img = await app.request(`/media/${media.id}/400.webp`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/webp");
    expect(img.headers.get("cache-control")).toContain("immutable");
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 400 });

    expect((await app.request(`/media/${media.id}/123.webp`)).status).toBe(404);
    expect((await app.request("/media/00000000-0000-0000-0000-000000000000/400.webp")).status).toBe(
      404,
    );
  });

  test("geen kleine foto's opblazen en EXIF-rotatie wordt toegepast", async () => {
    const cookie = await member("sanne@example.nl", "haven", "owner", tenantId);
    const rotated = await sharp({
      create: { width: 300, height: 100, channels: 3, background: "#00c" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const { media } = await (await upload(cookie, rotated, "r.jpg", "image/jpeg")).json();
    expect(media).toMatchObject({ width: 100, height: 300 });
  });

  test("geen afbeelding of te groot wordt geweigerd", async () => {
    const cookie = await member("sanne@example.nl", "haven", "owner", tenantId);
    expect((await upload(cookie, Buffer.from("dit is geen foto"), "a.png")).status).toBe(415);
    expect((await upload(cookie, Buffer.alloc(4 * 1024 * 1024 + 1), "big.png")).status).toBe(413);
    const noFile = await app.request("/t/haven/media", {
      method: "POST",
      headers: { cookie },
      body: new FormData(),
    });
    expect(noFile.status).toBe(400);
  });

  test("alt-tekst en focuspunt bewerken, lijst met gebruik, verwijderen ruimt op", async () => {
    const cookie = await member("sanne@example.nl", "haven", "owner", tenantId);
    const { media } = await (await upload(cookie, await png(100, 100))).json();
    await json(
      "PATCH",
      `/t/haven/media/${media.id}`,
      { alt: "Rode vlak", focusX: 0.2, focusY: 0.8 },
      cookie,
    );
    expect((await json("PATCH", `/t/haven/media/${media.id}`, { focusX: 2 }, cookie)).status).toBe(
      400,
    );

    const { menu } = await (await json("POST", "/t/haven/menus", { name: "Diner" }, cookie)).json();
    const { section } = await (
      await json("POST", `/t/haven/menus/${menu.id}/sections`, { name: "A" }, cookie)
    ).json();
    const { item } = await (
      await json(
        "POST",
        `/t/haven/sections/${section.id}/items`,
        { name: "Soep", priceCents: 800, mediaId: media.id },
        cookie,
      )
    ).json();
    expect(item.mediaId).toBe(media.id);

    const list = await (await json("GET", "/t/haven/media", undefined, cookie)).json();
    expect(list.media[0]).toMatchObject({ alt: "Rode vlak", focusX: 0.2, focusY: 0.8, usedBy: 1 });

    await json("DELETE", `/t/haven/media/${media.id}`, undefined, cookie);
    expect(storage.keys()).toHaveLength(0);
    const after = await (await json("GET", `/t/haven/items/${item.id}`, undefined, cookie)).json();
    expect(after.item.mediaId).toBeNull();
  });

  test("foto van een andere zaak kan niet aan een gerecht gehangen worden", async () => {
    const cookie = await member("sanne@example.nl", "haven", "owner", tenantId);
    const [other] = await db.insert(tenants).values({ slug: "ander", name: "Ander" }).returning();
    const otherCookie = await member("piet@example.nl", "ander", "owner", other?.id as string);
    const { media } = await (
      await upload(otherCookie, await png(50, 50), "x.png", "image/png", "", "ander")
    ).json();

    const { menu } = await (await json("POST", "/t/haven/menus", { name: "Diner" }, cookie)).json();
    const { section } = await (
      await json("POST", `/t/haven/menus/${menu.id}/sections`, { name: "A" }, cookie)
    ).json();
    const { item } = await (
      await json(
        "POST",
        `/t/haven/sections/${section.id}/items`,
        { name: "Soep", priceCents: 800, mediaId: media.id },
        cookie,
      )
    ).json();
    expect(item.mediaId).toBeNull();

    // en verwijderen via de andere zaak raakt de foto niet
    await json("DELETE", `/t/haven/media/${media.id}`, undefined, cookie);
    const otherList = await (await json("GET", "/t/ander/media", undefined, otherCookie)).json();
    expect(otherList.media).toHaveLength(1);
  });

  test("keuken mag foto's uploaden", async () => {
    const cookie = await member("lotte@example.nl", "haven", "kitchen", tenantId);
    expect((await upload(cookie, await png(50, 50))).status).toBe(201);
  });
});
