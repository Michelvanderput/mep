import { zValidator } from "@hono/zod-validator";
import { type Database, tenants, translations } from "@mep/db";
import { DEFAULT_LOCALE, localParts, saveTranslationSchema, setLocalesSchema } from "@mep/schemas";
import { and, eq } from "drizzle-orm";
import type { Hono, MiddlewareHandler } from "hono";
import { allowedFields, listTranslatable } from "../i18n";
import type { Env } from "../types";

/** Registreert de vertaal-routes op de tenant-router (die al zaak en rol laadt). */
export function registerTranslationRoutes(
  r: Hono<Env>,
  db: Database,
  need: (area: "pages" | "settings") => MiddlewareHandler<Env>,
) {
  // Talen aan/uit: alleen de eigenaar
  r.put("/locales", need("settings"), zValidator("json", setLocalesSchema), async (c) => {
    const { locales } = c.req.valid("json");
    await db
      .update(tenants)
      .set({ locales })
      .where(eq(tenants.id, c.get("tenant").id));
    return c.json({ ok: true, locales });
  });

  r.get("/translations", need("pages"), async (c) => {
    const tenant = c.get("tenant");
    const locale = c.req.query("locale") ?? "";
    if (locale === DEFAULT_LOCALE || !tenant.locales.includes(locale))
      return c.json({ error: "Deze taal staat niet aan" }, 400);
    const { date: today } = localParts(new Date(), tenant.timezone);
    const [entries, rows] = await Promise.all([
      listTranslatable(db, tenant.id, today),
      db
        .select()
        .from(translations)
        .where(and(eq(translations.tenantId, tenant.id), eq(translations.locale, locale))),
    ]);
    const values = new Map(rows.map((x) => [`${x.entity}:${x.entityId}`, x.fields]));
    let total = 0;
    let missing = 0;
    const out = entries.map((e) => ({
      ...e,
      fields: e.fields.map((f) => {
        const value = values.get(`${e.entity}:${e.entityId}`)?.[f.key] ?? "";
        total++;
        if (!value.trim()) missing++;
        return { ...f, value };
      }),
    }));
    return c.json({
      locale,
      locales: tenant.locales,
      defaultLocale: DEFAULT_LOCALE,
      entries: out,
      total,
      missing,
    });
  });

  r.put("/translations", need("pages"), zValidator("json", saveTranslationSchema), async (c) => {
    const tenant = c.get("tenant");
    const b = c.req.valid("json");
    if (b.locale === DEFAULT_LOCALE || !tenant.locales.includes(b.locale))
      return c.json({ error: "Deze taal staat niet aan" }, 400);
    const allowed = await allowedFields(db, tenant.id, b.entity, b.entityId);
    if (!allowed) return c.json({ error: "Niet gevonden" }, 404);
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.fields)) {
      if (!allowed.includes(k))
        return c.json({ error: `Veld "${k}" kan niet vertaald worden` }, 400);
      if (v.trim()) clean[k] = v.trim();
    }
    const where = and(
      eq(translations.tenantId, tenant.id),
      eq(translations.entity, b.entity),
      eq(translations.entityId, b.entityId),
      eq(translations.locale, b.locale),
    );
    if (Object.keys(clean).length === 0) {
      await db.delete(translations).where(where);
    } else {
      await db
        .insert(translations)
        .values({
          tenantId: tenant.id,
          entity: b.entity,
          entityId: b.entityId,
          locale: b.locale,
          fields: clean,
        })
        .onConflictDoUpdate({
          target: [
            translations.tenantId,
            translations.entity,
            translations.entityId,
            translations.locale,
          ],
          set: { fields: clean },
        });
    }
    return c.json({ ok: true });
  });
}
