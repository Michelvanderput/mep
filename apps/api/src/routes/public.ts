import {
  announcements,
  type Database,
  menuItems,
  menuSections,
  menus,
  specials,
  tenants,
} from "@mep/db";
import { computeOpenStatus, isActiveOn, localParts, mediaPath } from "@mep/schemas";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { loadHours } from "../hours";
import type { Tenant } from "../types";

type PublicEnv = { Variables: { tenant: Tenant } };

/**
 * Publieke, alleen-lezen API voor klantwebsites. Geen login nodig; geeft alleen
 * gegevens die op een website horen te staan. Kort gecachet op de CDN.
 */
export function publicRoutes(db: Database) {
  const r = new Hono<PublicEnv>();

  r.use(
    createMiddleware<PublicEnv>(async (c, next) => {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, c.req.param("slug") ?? ""))
        .limit(1);
      if (!tenant || tenant.status !== "active")
        return c.json({ error: "Zaak niet gevonden" }, 404);
      c.set("tenant", tenant);
      await next();
      if (c.req.method === "GET" && c.res.ok) {
        // De CDN mag 60 s cachen (en daarna kort verouderd serveren); bezoekersbrowsers controleren altijd,
        // anders blijft een weggehaalde melding nog minuten zichtbaar.
        c.header("vercel-cdn-cache-control", "s-maxage=60, stale-while-revalidate=300");
        c.header("cache-control", "public, max-age=0, must-revalidate");
      }
    }),
  );

  r.get("/info", (c) => {
    const t = c.get("tenant");
    return c.json({
      name: t.name,
      type: t.type,
      locales: t.locales,
      timezone: t.timezone,
      modules: t.modules,
    });
  });

  r.get("/hours", async (c) => {
    const t = c.get("tenant");
    const hours = await loadHours(db, t.id);
    const { date } = localParts(new Date(), hours.timezone);
    const exceptions = hours.exceptions.filter((e) => e.date >= date);
    const status = computeOpenStatus({
      schedule: hours.venue,
      exceptions: hours.exceptions,
      now: new Date(),
      timeZone: hours.timezone,
    });
    return c.json({
      timezone: hours.timezone,
      venue: hours.venue,
      kitchen: hours.kitchen,
      exceptions,
      // Momentopname; de SDK rekent zelf verder zodat een gecachte pagina niet "oud" open/dicht toont.
      generatedAt: new Date().toISOString(),
      status: { open: status.open, label: status.label },
    });
  });

  r.get("/menus", async (c) => {
    const t = c.get("tenant");
    const { date: today } = localParts(new Date(), t.timezone);
    const [ms, sections, items] = await Promise.all([
      db
        .select()
        .from(menus)
        .where(eq(menus.tenantId, t.id))
        .orderBy(asc(menus.position), asc(menus.createdAt)),
      db
        .select()
        .from(menuSections)
        .where(eq(menuSections.tenantId, t.id))
        .orderBy(asc(menuSections.position)),
      db
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.tenantId, t.id)))
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
            items: items
              .filter((i) => i.sectionId === s.id)
              .map((i) => ({
                id: i.id,
                name: i.name,
                description: i.description,
                priceCents: i.priceCents,
                // Alleen tonen als een mens ze gecontroleerd heeft; anders weten we het niet.
                allergens: i.allergensChecked ? i.allergens : null,
                diets: i.diets,
                available: !(i.soldOut && (!i.soldOutUntil || today < i.soldOutUntil)),
                photo: i.mediaId ? { id: i.mediaId, path: mediaPath(i.mediaId, 800) } : null,
              })),
          })),
      })),
    });
  });

  // Alleen wat vandaag geldt; de site hoeft niet zelf te filteren op datum.
  r.get("/announcements", async (c) => {
    const t = c.get("tenant");
    const { date } = localParts(new Date(), t.timezone);
    const rows = await db.select().from(announcements).where(eq(announcements.tenantId, t.id));
    return c.json({
      announcements: rows
        .filter((a) => isActiveOn(date, a.startsOn, a.endsOn))
        .map((a) => ({ id: a.id, text: a.text, endsOn: a.endsOn })),
    });
  });

  r.get("/specials", async (c) => {
    const t = c.get("tenant");
    const { date } = localParts(new Date(), t.timezone);
    const rows = await db
      .select()
      .from(specials)
      .where(eq(specials.tenantId, t.id))
      .orderBy(asc(specials.startsOn));
    return c.json({
      specials: rows
        .filter((x) => isActiveOn(date, x.startsOn, x.endsOn))
        .map((x) => ({
          id: x.id,
          name: x.name,
          description: x.description,
          priceCents: x.priceCents,
          startsOn: x.startsOn,
          endsOn: x.endsOn,
          photo: x.mediaId ? { id: x.mediaId, path: mediaPath(x.mediaId, 800) } : null,
        })),
    });
  });

  return r;
}
