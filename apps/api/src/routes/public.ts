import {
  announcements,
  type Database,
  events,
  menuItems,
  menuSections,
  menus,
  pages,
  specials,
  tenants,
} from "@mep/db";
import {
  computeOpenStatus,
  DEFAULT_LOCALE,
  expandOccurrences,
  FIXED_PAGE_KEYS,
  FIXED_PAGE_TITLES,
  isActiveOn,
  type LocaleId,
  localParts,
  mediaPath,
  PAGE_TEMPLATES,
  templateFor,
} from "@mep/schemas";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { loadHours } from "../hours";
import { loadOverlay } from "../i18n";
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

  /** Vertaalfunctie voor ?lang=xx (valt per tekst terug op de brontaal). */
  const tr = (c: {
    get: (k: "tenant") => Tenant;
    req: { query: (k: string) => string | undefined };
  }) => loadOverlay(db, c.get("tenant"), c.req.query("lang"));
  const langOf = (c: {
    get: (k: "tenant") => Tenant;
    req: { query: (k: string) => string | undefined };
  }) => {
    const l = c.req.query("lang");
    return l && c.get("tenant").locales.includes(l) ? l : DEFAULT_LOCALE;
  };

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
    const t_ = await tr(c);
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
        name: t_("menu", m.id, "name", m.name),
        sections: sections
          .filter((s) => s.menuId === m.id)
          .map((s) => ({
            id: s.id,
            name: t_("section", s.id, "name", s.name),
            items: items
              .filter((i) => i.sectionId === s.id)
              .map((i) => ({
                id: i.id,
                name: t_("item", i.id, "name", i.name),
                description: t_("item", i.id, "description", i.description),
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

  const fixedKeys = FIXED_PAGE_KEYS as readonly string[];

  /** Overzicht: welke pagina's bestaan en hebben inhoud (vaste pagina's staan er altijd bij). */
  r.get("/pages", async (c) => {
    const t = c.get("tenant");
    const t_ = await tr(c);
    const lang = langOf(c);
    const rows = await db
      .select()
      .from(pages)
      .where(eq(pages.tenantId, t.id))
      .orderBy(asc(pages.createdAt));
    const filled = (content: Record<string, string>) =>
      Object.values(content).some((v) => v.trim() !== "");
    return c.json({
      pages: [
        ...FIXED_PAGE_KEYS.map((key) => ({
          key,
          title: FIXED_PAGE_TITLES[lang as LocaleId]?.[key] ?? PAGE_TEMPLATES[key].title,
          custom: false,
          filled: filled(rows.find((p) => p.key === key)?.content ?? {}),
        })),
        ...rows
          .filter((p) => p.isCustom)
          .map((p) => ({
            key: p.key,
            title: t_("page", p.key, "title", p.title),
            custom: true,
            filled: filled(p.content),
          })),
      ],
    });
  });

  /** Eén pagina; foto-velden zijn uitgewerkt tot { id, path }. Lege velden ontbreken niet (altijd ""). */
  r.get("/pages/:key", async (c) => {
    const t = c.get("tenant");
    const t_ = await tr(c);
    const lang = langOf(c);
    const key = c.req.param("key");
    const [row] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.tenantId, t.id), eq(pages.key, key)))
      .limit(1);
    if (!row && !fixedKeys.includes(key)) return c.json({ error: "Pagina niet gevonden" }, 404);
    const template = templateFor(key);
    const content: Record<string, unknown> = {};
    for (const f of template.fields) {
      const v = row?.content[f.key] ?? "";
      content[f.key] =
        f.type === "photo"
          ? v
            ? { id: v, path: mediaPath(v, 1600) }
            : null
          : f.type === "text" || f.type === "textarea"
            ? t_("page", key, f.key, v)
            : v;
    }
    return c.json({
      key,
      title: fixedKeys.includes(key)
        ? (FIXED_PAGE_TITLES[lang as LocaleId]?.[key as "home"] ??
          PAGE_TEMPLATES[key as keyof typeof PAGE_TEMPLATES].title)
        : t_("page", key, "title", row?.title ?? key),
      custom: !fixedKeys.includes(key),
      content,
    });
  });

  /** Komende keren van evenementen (wekelijkse zijn al uitgeklapt), op datum gesorteerd. */
  r.get("/events", async (c) => {
    const t = c.get("tenant");
    const t_ = await tr(c);
    const { date: today } = localParts(new Date(), t.timezone);
    const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 20));
    const rows = await db.select().from(events).where(eq(events.tenantId, t.id));
    return c.json({
      events: expandOccurrences(rows, today, { limit }).map(({ event: e, date }) => ({
        id: e.id,
        date,
        startTime: e.startTime,
        endTime: e.endTime,
        title: t_("event", e.id, "title", e.title),
        description: t_("event", e.id, "description", e.description),
        priceCents: e.priceCents,
        ticketUrl: e.ticketUrl,
        recurring: e.repeat === "weekly",
        photo: e.mediaId ? { id: e.mediaId, path: mediaPath(e.mediaId, 800) } : null,
      })),
    });
  });

  // Alleen wat vandaag geldt; de site hoeft niet zelf te filteren op datum.
  r.get("/announcements", async (c) => {
    const t = c.get("tenant");
    const t_ = await tr(c);
    const { date } = localParts(new Date(), t.timezone);
    const rows = await db.select().from(announcements).where(eq(announcements.tenantId, t.id));
    return c.json({
      announcements: rows
        .filter((a) => isActiveOn(date, a.startsOn, a.endsOn))
        .map((a) => ({
          id: a.id,
          text: t_("announcement", a.id, "text", a.text),
          endsOn: a.endsOn,
        })),
    });
  });

  r.get("/specials", async (c) => {
    const t = c.get("tenant");
    const t_ = await tr(c);
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
          name: t_("special", x.id, "name", x.name),
          description: t_("special", x.id, "description", x.description),
          priceCents: x.priceCents,
          startsOn: x.startsOn,
          endsOn: x.endsOn,
          photo: x.mediaId ? { id: x.mediaId, path: mediaPath(x.mediaId, 800) } : null,
        })),
    });
  });

  return r;
}
