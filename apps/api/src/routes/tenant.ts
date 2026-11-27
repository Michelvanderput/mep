import { zValidator } from "@hono/zod-validator";
import {
  auditLog,
  type Database,
  memberships,
  menuItems,
  menuSections,
  menus,
  openingExceptions,
  openingHours,
  submissions,
  tenants,
} from "@mep/db";
import {
  computeOpenStatus,
  exceptionInputSchema,
  itemInputSchema,
  localParts,
  nameSchema,
  orderSchema,
  overrideTodaySchema,
  type Role,
  slotSchema,
  soldOutSchema,
  submissionPatchSchema,
  type WeekSchedule,
  weekScheduleSchema,
} from "@mep/schemas";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { type Area, can, type Env } from "../types";

const EMPTY_WEEK: WeekSchedule = [[], [], [], [], [], [], []];

export function tenantRoutes(db: Database) {
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

  const loadHours = async (tenantId: string) => {
    const rows = await db.select().from(openingHours).where(eq(openingHours.tenantId, tenantId));
    const exceptions = await db
      .select()
      .from(openingExceptions)
      .where(eq(openingExceptions.tenantId, tenantId))
      .orderBy(asc(openingExceptions.date));
    const schedule = (kind: string) =>
      (rows.find((x) => x.kind === kind)?.schedule ?? EMPTY_WEEK) as WeekSchedule;
    return {
      timezone:
        (
          await db
            .select({ tz: tenants.timezone })
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1)
        )[0]?.tz ?? "Europe/Amsterdam",
      venue: schedule("venue"),
      kitchen: schedule("kitchen"),
      exceptions: exceptions.map((e) => ({
        date: e.date,
        closed: e.closed,
        slots: e.slots,
        reason: e.reason,
      })),
    };
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
    const upcoming = hours.exceptions.filter((e) => e.date >= date);
    return c.json({
      tenant: { name: tenant.name, slug: tenant.slug, modules: tenant.modules },
      role,
      status,
      kitchenToday: kitchen.todaySlots,
      inbox,
      checklist: {
        missingAllergens,
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
