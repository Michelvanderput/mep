import { zValidator } from "@hono/zod-validator";
import {
  announcements,
  auditLog,
  type Database,
  mediaAssets,
  memberships,
  menuItems,
  menuSections,
  menus,
  openingExceptions,
  openingHours,
  pages,
  specials,
  submissions,
  tenants,
} from "@mep/db";
import {
  announcementInputSchema,
  computeOpenStatus,
  createPageSchema,
  exceptionInputSchema,
  FIXED_PAGE_KEYS,
  isActiveOn,
  itemInputSchema,
  localParts,
  MAX_UPLOAD_BYTES,
  mediaPatchSchema,
  nameSchema,
  orderSchema,
  overrideTodaySchema,
  PAGE_TEMPLATES,
  pageContentSchema,
  type Role,
  savePageSchema,
  slotSchema,
  slugify,
  soldOutSchema,
  specialInputSchema,
  submissionPatchSchema,
  templateFor,
  type WeekSchedule,
  weekScheduleSchema,
} from "@mep/schemas";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { loadHours as loadHoursFor } from "../hours";
import { InvalidImageError, processImage } from "../images";
import type { Storage } from "../storage";
import { type Area, can, type Env } from "../types";

export function tenantRoutes(db: Database, storage: Storage) {
  const r = new Hono<Env>();

  // Laad de zaak en controleer lidmaatschap (superadmin telt als eigenaar).
  r.use(
    createMiddleware<Env>(async (c, next) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Niet ingelogd" }, 401);
      const slug = c.req.param("slug") ?? "";
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (!tenant) return c.json({ error: "Zaak niet gevonden" }, 404);

      let role: Role | undefined = user.isSuperadmin ? "owner" : undefined;
      if (!role) {
        const [m] = await db
          .select({ role: memberships.role })
          .from(memberships)
          .where(and(eq(memberships.tenantId, tenant.id), eq(memberships.userId, user.id)))
          .limit(1);
        role = m?.role;
      }
      // Zelfde antwoord voor "bestaat niet" en "geen lid" om zaken niet te verklappen.
      if (!role) return c.json({ error: "Zaak niet gevonden" }, 404);
      c.set("tenant", tenant);
      c.set("role", role);
      await next();
    }),
  );

  const need = (area: Area) =>
    createMiddleware<Env>(async (c, next) => {
      if (!can(c.get("role"), area)) return c.json({ error: "Geen toegang" }, 403);
      await next();
    });

  const audit = (
    c: { get: (k: "tenant" | "user") => unknown },
    action: string,
    entityId?: string,
  ) =>
    db.insert(auditLog).values({
      tenantId: (c.get("tenant") as { id: string }).id,
      userId: (c.get("user") as { id: string } | null)?.id ?? null,
      action,
      entityId,
    });

  const loadHours = (tenantId: string) => loadHoursFor(db, tenantId);

  /** Foto moet van dezelfde zaak zijn; anders wordt hij genegeerd (geen lek tussen zaken). */
  const ownedMediaId = async (tenantId: string, id: string | null | undefined) => {
    if (!id) return null;
    const [m] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.tenantId, tenantId)))
      .limit(1);
    return m?.id ?? null;
  };

  // --------------------------- Vandaag ---------------------------
  r.get("/today", need("today"), async (c) => {
    const tenant = c.get("tenant");
    const role = c.get("role");
    const hours = await loadHours(tenant.id);
    const now = new Date();
    const status = computeOpenStatus({
      schedule: hours.venue,
      exceptions: hours.exceptions,
      now,
      timeZone: tenant.timezone,
    });
    const kitchen = computeOpenStatus({
      schedule: hours.kitchen,
      exceptions: [],
      now,
      timeZone: tenant.timezone,
    });

    const [{ missingAllergens } = { missingAllergens: 0 }] = await db
      .select({ missingAllergens: count() })
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenant.id), eq(menuItems.allergensChecked, false)));

    const [{ missingAlt } = { missingAlt: 0 }] = await db
      .select({ missingAlt: count() })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.tenantId, tenant.id), eq(mediaAssets.alt, "")));

    const [contactPage] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.tenantId, tenant.id), eq(pages.key, "contact")))
      .limit(1);

    let inbox: { newCount: number; recent: unknown[] } | null = null;
    if (can(role, "inbox")) {
      const [{ n } = { n: 0 }] = await db
        .select({ n: count() })
        .from(submissions)
        .where(and(eq(submissions.tenantId, tenant.id), eq(submissions.status, "new")));
      const recent = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.tenantId, tenant.id), eq(submissions.status, "new")))
        .orderBy(desc(submissions.createdAt))
        .limit(3);
      inbox = { newCount: n, recent };
    }

    const { date } = localParts(now, tenant.timezone);
    const [allAnn, allSpecials] = await Promise.all([
      db
        .select()
        .from(announcements)
        .where(eq(announcements.tenantId, tenant.id))
        .orderBy(desc(announcements.createdAt)),
      db
        .select()
        .from(specials)
        .where(eq(specials.tenantId, tenant.id))
        .orderBy(asc(specials.startsOn)),
    ]);
    const upcoming = hours.exceptions.filter((e) => e.date >= date);
    return c.json({
      tenant: { name: tenant.name, slug: tenant.slug, modules: tenant.modules },
      role,
      status,
      kitchenToday: kitchen.todaySlots,
      live: {
        announcements: allAnn.filter((a) => isActiveOn(date, a.startsOn, a.endsOn)),
        specials: allSpecials.filter((x) => isActiveOn(date, x.startsOn, x.endsOn)),
      },
      inbox,
      checklist: {
        missingAllergens,
        missingAlt,
        noContactYet: !contactPage || !isFilled(contactPage.content),
        noHoursYet: hours.venue.every((d) => d.length === 0),
        upcomingExceptions: upcoming.length,
      },
    });
  });

  // Vandaag dicht / andere tijden / terugzetten
  r.post("/today/override", need("hours"), zValidator("json", overrideTodaySchema), async (c) => {
    const tenant = c.get("tenant");
    const body = c.req.valid("json");
    const { date } = localParts(new Date(), tenant.timezone);
    if (body.mode === "reset") {
      await db
        .delete(openingExceptions)
        .where(and(eq(openingExceptions.tenantId, tenant.id), eq(openingExceptions.date, date)));
    } else {
      const slots =
        body.mode === "hours"
          ? z
              .array(slotSchema)
              .max(3)
              .parse(body.slots ?? [])
          : [];
      const values = {
        tenantId: tenant.id,
        date,
        closed: body.mode === "closed",
        slots,
        reason: body.reason ?? null,
      };
      await db
        .insert(openingExceptions)
        .values(values)
        .onConflictDoUpdate({
          target: [openingExceptions.tenantId, openingExceptions.date],
          set: { closed: values.closed, slots, reason: values.reason },
        });
    }
    await audit(c, `hours.override.${body.mode}`, date);
    return c.json({ ok: true });
  });

  // --------------------------- Openingstijden ---------------------------
  r.get("/hours", need("hours"), async (c) => c.json(await loadHours(c.get("tenant").id)));

  r.put(
    "/hours/:kind",
    need("hours"),
    zValidator("json", z.object({ schedule: weekScheduleSchema })),
    async (c) => {
      const kind = c.req.param("kind");
      if (kind !== "venue" && kind !== "kitchen") return c.json({ error: "Onbekend type" }, 400);
      const tenant = c.get("tenant");
      const { schedule } = c.req.valid("json");
      await db
        .insert(openingHours)
        .values({ tenantId: tenant.id, kind, schedule })
        .onConflictDoUpdate({
          target: [openingHours.tenantId, openingHours.kind],
          set: { schedule },
        });
      await audit(c, `hours.update.${kind}`);
      return c.json({ ok: true });
    },
  );

  r.put(
    "/hours/exceptions/day",
    need("hours"),
    zValidator("json", exceptionInputSchema),
    async (c) => {
      const tenant = c.get("tenant");
      const e = c.req.valid("json");
      const slots = e.closed ? [] : e.slots;
      await db
        .insert(openingExceptions)
        .values({
          tenantId: tenant.id,
          date: e.date,
          closed: e.closed,
          slots,
          reason: e.reason ?? null,
        })
        .onConflictDoUpdate({
          target: [openingExceptions.tenantId, openingExceptions.date],
          set: { closed: e.closed, slots, reason: e.reason ?? null },
        });
      await audit(c, "hours.exception.set", e.date);
      return c.json({ ok: true });
    },
  );

  r.delete("/hours/exceptions/:date", need("hours"), async (c) => {
    const tenant = c.get("tenant");
    await db
      .delete(openingExceptions)
      .where(
        and(
          eq(openingExceptions.tenantId, tenant.id),
          eq(openingExceptions.date, c.req.param("date")),
        ),
      );
    return c.json({ ok: true });
  });

  // --------------------------- Menukaart ---------------------------
  const presentItem = (i: typeof menuItems.$inferSelect, today: string) => ({
    ...i,
    unavailable: i.soldOut && (!i.soldOutUntil || today < i.soldOutUntil),
  });

  r.get("/menus", need("menu"), async (c) => {
    const tenant = c.get("tenant");
    const { date: today } = localParts(new Date(), tenant.timezone);
    const [ms, sections, items] = await Promise.all([
      db
        .select()
        .from(menus)
        .where(eq(menus.tenantId, tenant.id))
        .orderBy(asc(menus.position), asc(menus.createdAt)),
      db
        .select()
        .from(menuSections)
        .where(eq(menuSections.tenantId, tenant.id))
        .orderBy(asc(menuSections.position)),
      db
        .select()
        .from(menuItems)
        .where(eq(menuItems.tenantId, tenant.id))
        .orderBy(asc(menuItems.position), asc(menuItems.createdAt)),
    ]);
    return c.json({
      menus: ms.map((m) => ({
        id: m.id,
        name: m.name,
        sections: sections
          .filter((s) => s.menuId === m.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            items: items.filter((i) => i.sectionId === s.id).map((i) => presentItem(i, today)),
          })),
      })),
    });
  });

  r.post("/menus", need("menu"), zValidator("json", nameSchema), async (c) => {
    const tenant = c.get("tenant");
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(menus)
      .where(eq(menus.tenantId, tenant.id));
    const [menu] = await db
      .insert(menus)
      .values({ tenantId: tenant.id, name: c.req.valid("json").name, position: n })
      .returning();
    return c.json({ menu }, 201);
  });

  r.post("/menus/:id/sections", need("menu"), zValidator("json", nameSchema), async (c) => {
    const tenant = c.get("tenant");
    const menuId = c.req.param("id");
    const [menu] = await db
      .select()
      .from(menus)
      .where(and(eq(menus.id, menuId), eq(menus.tenantId, tenant.id)))
      .limit(1);
    if (!menu) return c.json({ error: "Kaart niet gevonden" }, 404);
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(menuSections)
      .where(eq(menuSections.menuId, menuId));
    const [section] = await db
      .insert(menuSections)
      .values({ tenantId: tenant.id, menuId, name: c.req.valid("json").name, position: n })
      .returning();
    return c.json({ section }, 201);
  });

  r.patch("/sections/:id", need("menu"), zValidator("json", nameSchema), async (c) => {
    const tenant = c.get("tenant");
    await db
      .update(menuSections)
      .set({ name: c.req.valid("json").name })
      .where(and(eq(menuSections.id, c.req.param("id")), eq(menuSections.tenantId, tenant.id)));
    return c.json({ ok: true });
  });

  r.delete("/sections/:id", need("menu"), async (c) => {
    const tenant = c.get("tenant");
    await db
      .delete(menuSections)
      .where(and(eq(menuSections.id, c.req.param("id")), eq(menuSections.tenantId, tenant.id)));
    await audit(c, "menu.section.delete", c.req.param("id"));
    return c.json({ ok: true });
  });

  /** Nieuwe volgorde van gerechten in een categorie. */
  r.put("/sections/:id/order", need("menu"), zValidator("json", orderSchema), async (c) => {
    const tenant = c.get("tenant");
    const { ids } = c.req.valid("json");
    await db.transaction(async (tx) => {
      for (const [position, id] of ids.entries()) {
        await tx
          .update(menuItems)
          .set({ position })
          .where(
            and(
              eq(menuItems.id, id),
              eq(menuItems.tenantId, tenant.id),
              eq(menuItems.sectionId, c.req.param("id")),
            ),
          );
      }
    });
    return c.json({ ok: true });
  });

  r.post("/sections/:id/items", need("menu"), zValidator("json", itemInputSchema), async (c) => {
    const tenant = c.get("tenant");
    const sectionId = c.req.param("id");
    const [section] = await db
      .select()
      .from(menuSections)
      .where(and(eq(menuSections.id, sectionId), eq(menuSections.tenantId, tenant.id)))
      .limit(1);
    if (!section) return c.json({ error: "Categorie niet gevonden" }, 404);
    const body = c.req.valid("json");
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(menuItems)
      .where(eq(menuItems.sectionId, sectionId));
    const [item] = await db
      .insert(menuItems)
      .values({
        tenantId: tenant.id,
        sectionId,
        name: body.name,
        description: body.description,
        priceCents: body.priceCents,
        allergens: body.allergens,
        allergensChecked: true,
        diets: body.diets,
        mediaId: await ownedMediaId(tenant.id, body.mediaId),
        position: n,
      })
      .returning();
    await audit(c, "menu.item.create", item?.id);
    return c.json({ item }, 201);
  });

  r.get("/items/:id", need("menu"), async (c) => {
    const tenant = c.get("tenant");
    const { date: today } = localParts(new Date(), tenant.timezone);
    const [item] = await db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.id, c.req.param("id")), eq(menuItems.tenantId, tenant.id)))
      .limit(1);
    if (!item) return c.json({ error: "Gerecht niet gevonden" }, 404);
    const sections = await db
      .select({ id: menuSections.id, name: menuSections.name, menuName: menus.name })
      .from(menuSections)
      .innerJoin(menus, eq(menus.id, menuSections.menuId))
      .where(eq(menuSections.tenantId, tenant.id))
      .orderBy(asc(menus.position), asc(menuSections.position));
    return c.json({ item: presentItem(item, today), sections });
  });

  r.patch("/items/:id", need("menu"), zValidator("json", itemInputSchema), async (c) => {
    const tenant = c.get("tenant");
    const body = c.req.valid("json");
    const [item] = await db
      .update(menuItems)
      .set({
        name: body.name,
        description: body.description,
        priceCents: body.priceCents,
        allergens: body.allergens,
        allergensChecked: true,
        diets: body.diets,
        ...(body.sectionId && { sectionId: body.sectionId }),
        ...(body.mediaId !== undefined && { mediaId: await ownedMediaId(tenant.id, body.mediaId) }),
      })
      .where(and(eq(menuItems.id, c.req.param("id")), eq(menuItems.tenantId, tenant.id)))
      .returning();
    if (!item) return c.json({ error: "Gerecht niet gevonden" }, 404);
    await audit(c, "menu.item.update", item.id);
    return c.json({ item });
  });

  r.delete("/items/:id", need("menu"), async (c) => {
    const tenant = c.get("tenant");
    await db
      .delete(menuItems)
      .where(and(eq(menuItems.id, c.req.param("id")), eq(menuItems.tenantId, tenant.id)));
    await audit(c, "menu.item.delete", c.req.param("id"));
    return c.json({ ok: true });
  });

  /** "Op = op": gerecht (tijdelijk) uitverkocht markeren. */
  r.post("/items/:id/soldout", need("menu"), zValidator("json", soldOutSchema), async (c) => {
    const tenant = c.get("tenant");
    const { soldOut, until } = c.req.valid("json");
    const [item] = await db
      .update(menuItems)
      .set({ soldOut, soldOutUntil: soldOut ? until : null })
      .where(and(eq(menuItems.id, c.req.param("id")), eq(menuItems.tenantId, tenant.id)))
      .returning();
    if (!item) return c.json({ error: "Gerecht niet gevonden" }, 404);
    await audit(c, soldOut ? "menu.item.soldout" : "menu.item.available", item.id);
    return c.json({ ok: true });
  });

  // --------------------------- Pagina's en teksten ---------------------------
  const isFilled = (content: Record<string, string>) =>
    Object.values(content).some((v) => v.trim() !== "");

  r.get("/pages", need("pages"), async (c) => {
    const tenant = c.get("tenant");
    const rows = await db
      .select()
      .from(pages)
      .where(eq(pages.tenantId, tenant.id))
      .orderBy(asc(pages.createdAt));
    const byKey = new Map(rows.map((p) => [p.key, p]));
    const fixed = FIXED_PAGE_KEYS.map((key) => ({
      key,
      title: PAGE_TEMPLATES[key].title,
      description: PAGE_TEMPLATES[key].description,
      custom: false,
      filled: isFilled(byKey.get(key)?.content ?? {}),
    }));
    const custom = rows
      .filter((p) => p.isCustom)
      .map((p) => ({
        key: p.key,
        title: p.title,
        description: "",
        custom: true,
        filled: isFilled(p.content),
      }));
    return c.json({ pages: [...fixed, ...custom] });
  });

  r.post("/pages", need("pages"), zValidator("json", createPageSchema), async (c) => {
    const tenant = c.get("tenant");
    const { title } = c.req.valid("json");
    let base = slugify(title) || "pagina";
    if ((FIXED_PAGE_KEYS as readonly string[]).includes(base)) base = `${base}-pagina`;
    let key = base;
    for (let n = 2; n < 50; n++) {
      const [taken] = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.tenantId, tenant.id), eq(pages.key, key)))
        .limit(1);
      if (!taken) break;
      key = `${base}-${n}`;
    }
    await db.insert(pages).values({ tenantId: tenant.id, key, title, isCustom: true });
    await audit(c, "page.create", key);
    return c.json({ key }, 201);
  });

  r.get("/pages/:key", need("pages"), async (c) => {
    const tenant = c.get("tenant");
    const key = c.req.param("key");
    const [row] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.tenantId, tenant.id), eq(pages.key, key)))
      .limit(1);
    const fixed = (FIXED_PAGE_KEYS as readonly string[]).includes(key);
    if (!row && !fixed) return c.json({ error: "Pagina niet gevonden" }, 404);
    return c.json({
      key,
      custom: !fixed,
      title: row?.title ?? PAGE_TEMPLATES[key as keyof typeof PAGE_TEMPLATES].title,
      content: row?.content ?? {},
    });
  });

  r.put("/pages/:key", need("pages"), zValidator("json", savePageSchema), async (c) => {
    const tenant = c.get("tenant");
    const key = c.req.param("key");
    const fixed = (FIXED_PAGE_KEYS as readonly string[]).includes(key);
    const [existing] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.tenantId, tenant.id), eq(pages.key, key)))
      .limit(1);
    if (!existing && !fixed) return c.json({ error: "Pagina niet gevonden" }, 404);

    const template = templateFor(key);
    const parsed = pageContentSchema(template).safeParse(c.req.valid("json").content);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Controleer de ingevulde velden" },
        400,
      );
    }
    const content = parsed.data;
    // Foto's moeten van deze zaak zijn.
    for (const f of template.fields.filter((x) => x.type === "photo")) {
      content[f.key] = (await ownedMediaId(tenant.id, content[f.key] || null)) ?? "";
    }
    const title = fixed
      ? PAGE_TEMPLATES[key as keyof typeof PAGE_TEMPLATES].title
      : (c.req.valid("json").title ?? existing?.title ?? key);
    await db
      .insert(pages)
      .values({ tenantId: tenant.id, key, isCustom: !fixed, title, content })
      .onConflictDoUpdate({ target: [pages.tenantId, pages.key], set: { title, content } });
    await audit(c, "page.update", key);
    return c.json({ ok: true });
  });

  r.delete("/pages/:key", need("pages"), async (c) => {
    const tenant = c.get("tenant");
    await db
      .delete(pages)
      .where(
        and(
          eq(pages.tenantId, tenant.id),
          eq(pages.key, c.req.param("key")),
          eq(pages.isCustom, true),
        ),
      );
    await audit(c, "page.delete", c.req.param("key"));
    return c.json({ ok: true });
  });

  // --------------------------- Meldingen ---------------------------
  r.post(
    "/announcements",
    need("hours"),
    zValidator("json", announcementInputSchema),
    async (c) => {
      const tenant = c.get("tenant");
      const b = c.req.valid("json");
      const [row] = await db
        .insert(announcements)
        .values({ tenantId: tenant.id, ...b })
        .returning();
      await audit(c, "announcement.create", row?.id);
      return c.json({ announcement: row }, 201);
    },
  );

  r.delete("/announcements/:id", need("hours"), async (c) => {
    const tenant = c.get("tenant");
    await db
      .delete(announcements)
      .where(and(eq(announcements.id, c.req.param("id")), eq(announcements.tenantId, tenant.id)));
    return c.json({ ok: true });
  });

  // --------------------------- Dagspecials ---------------------------
  r.post("/specials", need("menu"), zValidator("json", specialInputSchema), async (c) => {
    const tenant = c.get("tenant");
    const b = c.req.valid("json");
    const [row] = await db
      .insert(specials)
      .values({ tenantId: tenant.id, ...b, mediaId: await ownedMediaId(tenant.id, b.mediaId) })
      .returning();
    await audit(c, "special.create", row?.id);
    return c.json({ special: row }, 201);
  });

  r.delete("/specials/:id", need("menu"), async (c) => {
    const tenant = c.get("tenant");
    await db
      .delete(specials)
      .where(and(eq(specials.id, c.req.param("id")), eq(specials.tenantId, tenant.id)));
    return c.json({ ok: true });
  });

  // --------------------------- Media ---------------------------
  const presentMedia = (m: typeof mediaAssets.$inferSelect, usedBy = 0) => ({
    id: m.id,
    width: m.width,
    height: m.height,
    bytes: m.bytes,
    alt: m.alt,
    focusX: m.focusX,
    focusY: m.focusY,
    createdAt: m.createdAt,
    usedBy,
  });

  r.get("/media", need("media"), async (c) => {
    const tenant = c.get("tenant");
    const rows = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.tenantId, tenant.id))
      .orderBy(desc(mediaAssets.createdAt));
    const uses = await db
      .select({ mediaId: menuItems.mediaId, n: count() })
      .from(menuItems)
      .where(eq(menuItems.tenantId, tenant.id))
      .groupBy(menuItems.mediaId);
    const usage = new Map(uses.map((u) => [u.mediaId, u.n]));
    return c.json({ media: rows.map((m) => presentMedia(m, usage.get(m.id) ?? 0)) });
  });

  r.post("/media", need("media"), async (c) => {
    const tenant = c.get("tenant");
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.file;
    if (!(file instanceof File)) return c.json({ error: "Geen foto ontvangen" }, 400);
    if (file.size > MAX_UPLOAD_BYTES)
      return c.json({ error: "Deze foto is te groot (maximaal 4 MB)" }, 413);
    const alt = typeof form?.alt === "string" ? form.alt.trim().slice(0, 200) : "";

    let processed: Awaited<ReturnType<typeof processImage>>;
    try {
      processed = await processImage(Buffer.from(await file.arrayBuffer()));
    } catch (e) {
      if (e instanceof InvalidImageError)
        return c.json(
          { error: "Dit bestand is geen geldige foto (gebruik JPG, PNG of WebP)" },
          415,
        );
      throw e;
    }

    const id = crypto.randomUUID();
    const prefix = `${tenant.id}/${id}`;
    await Promise.all(
      processed.variants.map((v) => storage.put(`${prefix}/${v.width}.webp`, v.data, "image/webp")),
    );
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        id,
        tenantId: tenant.id,
        storagePrefix: prefix,
        width: processed.width,
        height: processed.height,
        bytes: processed.variants.reduce((n, v) => n + v.data.length, 0),
        alt,
      })
      .returning();
    if (!asset) throw new Error("Foto opslaan mislukt");
    await audit(c, "media.upload", id);
    return c.json({ media: presentMedia(asset) }, 201);
  });

  r.patch("/media/:id", need("media"), zValidator("json", mediaPatchSchema), async (c) => {
    const tenant = c.get("tenant");
    const b = c.req.valid("json");
    const [row] = await db
      .update(mediaAssets)
      .set({
        ...(b.alt !== undefined && { alt: b.alt }),
        ...(b.focusX !== undefined && { focusX: b.focusX }),
        ...(b.focusY !== undefined && { focusY: b.focusY }),
      })
      .where(and(eq(mediaAssets.id, c.req.param("id")), eq(mediaAssets.tenantId, tenant.id)))
      .returning();
    if (!row) return c.json({ error: "Foto niet gevonden" }, 404);
    return c.json({ media: presentMedia(row) });
  });

  r.delete("/media/:id", need("media"), async (c) => {
    const tenant = c.get("tenant");
    const [row] = await db
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.id, c.req.param("id")), eq(mediaAssets.tenantId, tenant.id)))
      .returning();
    if (row) {
      await storage.deletePrefix(row.storagePrefix);
      await audit(c, "media.delete", row.id);
    }
    return c.json({ ok: true });
  });

  // --------------------------- Inbox ---------------------------
  r.get("/submissions", need("inbox"), async (c) => {
    const tenant = c.get("tenant");
    const status = c.req.query("status");
    const rows = await db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.tenantId, tenant.id),
          status ? eq(submissions.status, status) : undefined,
        ),
      )
      .orderBy(desc(submissions.createdAt))
      .limit(200);
    const counts = await db
      .select({ status: submissions.status, n: count() })
      .from(submissions)
      .where(eq(submissions.tenantId, tenant.id))
      .groupBy(submissions.status);
    return c.json({
      submissions: rows,
      counts: Object.fromEntries(counts.map((x) => [x.status, x.n])),
    });
  });

  r.patch(
    "/submissions/:id",
    need("inbox"),
    zValidator("json", submissionPatchSchema),
    async (c) => {
      const tenant = c.get("tenant");
      const body = c.req.valid("json");
      const [row] = await db
        .update(submissions)
        .set({
          ...(body.status && { status: body.status }),
          ...(body.note !== undefined && { note: body.note }),
        })
        .where(and(eq(submissions.id, c.req.param("id")), eq(submissions.tenantId, tenant.id)))
        .returning();
      if (!row) return c.json({ error: "Bericht niet gevonden" }, 404);
      return c.json({ submission: row });
    },
  );

  return r;
}
