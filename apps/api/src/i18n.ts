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
  translations,
} from "@mep/db";
import {
  DEFAULT_LOCALE,
  FIXED_PAGE_KEYS,
  isActiveOn,
  PAGE_TEMPLATES,
  TRANSLATABLE_FIELDS,
  type TranslatableEntity,
  templateFor,
} from "@mep/schemas";
import { and, eq } from "drizzle-orm";

export interface TranslatableField {
  key: string;
  label: string;
  source: string;
  multiline: boolean;
}
export interface TranslatableEntry {
  entity: TranslatableEntity;
  entityId: string;
  group: "Menukaart" | "Pagina's" | "Evenementen" | "Specials" | "Meldingen";
  title: string;
  context?: string;
  fields: TranslatableField[];
}

const mk = (defs: { key: string; label: string; multiline?: boolean }[], values: object) =>
  defs
    .map((d) => ({
      key: d.key,
      label: d.label,
      source: String((values as Record<string, unknown>)[d.key] ?? "").trim(),
      multiline: !!d.multiline,
    }))
    .filter((f) => f.source !== "");

/** Alle teksten van een zaak die vertaald kunnen worden, met brontekst (Nederlands). */
export async function listTranslatable(
  db: Database,
  tenantId: string,
  today: string,
): Promise<TranslatableEntry[]> {
  const [ms, secs, items, pageRows, evs, sps, anns] = await Promise.all([
    db.select().from(menus).where(eq(menus.tenantId, tenantId)),
    db.select().from(menuSections).where(eq(menuSections.tenantId, tenantId)),
    db.select().from(menuItems).where(eq(menuItems.tenantId, tenantId)),
    db.select().from(pages).where(eq(pages.tenantId, tenantId)),
    db.select().from(events).where(eq(events.tenantId, tenantId)),
    db.select().from(specials).where(eq(specials.tenantId, tenantId)),
    db.select().from(announcements).where(eq(announcements.tenantId, tenantId)),
  ]);
  const out: TranslatableEntry[] = [];
  const push = (e: Omit<TranslatableEntry, "fields"> & { fields: TranslatableField[] }) =>
    e.fields.length > 0 && out.push(e);

  for (const m of ms.sort((a, b) => a.position - b.position)) {
    push({
      entity: "menu",
      entityId: m.id,
      group: "Menukaart",
      title: m.name,
      context: "Kaart",
      fields: mk(TRANSLATABLE_FIELDS.menu, m),
    });
    for (const s of secs.filter((x) => x.menuId === m.id).sort((a, b) => a.position - b.position)) {
      push({
        entity: "section",
        entityId: s.id,
        group: "Menukaart",
        title: s.name,
        context: `${m.name} · categorie`,
        fields: mk(TRANSLATABLE_FIELDS.section, s),
      });
      for (const i of items
        .filter((x) => x.sectionId === s.id)
        .sort((a, b) => a.position - b.position)) {
        push({
          entity: "item",
          entityId: i.id,
          group: "Menukaart",
          title: i.name,
          context: `${m.name} · ${s.name}`,
          fields: mk(TRANSLATABLE_FIELDS.item, i),
        });
      }
    }
  }

  const textFields = (key: string) =>
    templateFor(key).fields.filter((f) => f.type === "text" || f.type === "textarea");
  for (const key of FIXED_PAGE_KEYS) {
    const row = pageRows.find((p) => p.key === key);
    const defs = textFields(key).map((f) => ({
      key: f.key,
      label: f.label,
      multiline: f.type === "textarea",
    }));
    push({
      entity: "page",
      entityId: key,
      group: "Pagina's",
      title: PAGE_TEMPLATES[key].title,
      fields: mk(defs, row?.content ?? {}),
    });
  }
  for (const p of pageRows.filter((x) => x.isCustom)) {
    const defs = [
      { key: "title", label: "Titel" },
      ...textFields("custom").map((f) => ({
        key: f.key,
        label: f.label,
        multiline: f.type === "textarea",
      })),
    ];
    push({
      entity: "page",
      entityId: p.key,
      group: "Pagina's",
      title: p.title,
      fields: mk(defs, { title: p.title, ...p.content }),
    });
  }

  for (const e of evs.filter((x) =>
    x.repeat === "weekly" ? !x.repeatUntil || x.repeatUntil >= today : x.date >= today,
  )) {
    push({
      entity: "event",
      entityId: e.id,
      group: "Evenementen",
      title: e.title,
      fields: mk(TRANSLATABLE_FIELDS.event, e),
    });
  }
  for (const s of sps.filter((x) => x.endsOn >= today)) {
    push({
      entity: "special",
      entityId: s.id,
      group: "Specials",
      title: s.name,
      fields: mk(TRANSLATABLE_FIELDS.special, s),
    });
  }
  for (const a of anns.filter((x) => !x.endsOn || x.endsOn >= today)) {
    push({
      entity: "announcement",
      entityId: a.id,
      group: "Meldingen",
      title: a.text.slice(0, 60),
      fields: mk(TRANSLATABLE_FIELDS.announcement, a),
    });
  }
  return out;
}

/** Welke velden mogen voor dit stuk inhoud vertaald worden? null = bestaat niet (of niet van deze zaak). */
export async function allowedFields(
  db: Database,
  tenantId: string,
  entity: TranslatableEntity,
  entityId: string,
): Promise<string[] | null> {
  const one = async <T extends { tenantId: unknown }>(q: Promise<T[]>) => (await q)[0];
  const isUuid = /^[0-9a-f-]{36}$/i.test(entityId);
  if (entity !== "page" && !isUuid) return null;
  const keys = (e: Exclude<TranslatableEntity, "page">) => TRANSLATABLE_FIELDS[e].map((f) => f.key);
  switch (entity) {
    case "menu":
      return (await one(
        db
          .select()
          .from(menus)
          .where(and(eq(menus.id, entityId), eq(menus.tenantId, tenantId))),
      ))
        ? keys("menu")
        : null;
    case "section":
      return (await one(
        db
          .select()
          .from(menuSections)
          .where(and(eq(menuSections.id, entityId), eq(menuSections.tenantId, tenantId))),
      ))
        ? keys("section")
        : null;
    case "item":
      return (await one(
        db
          .select()
          .from(menuItems)
          .where(and(eq(menuItems.id, entityId), eq(menuItems.tenantId, tenantId))),
      ))
        ? keys("item")
        : null;
    case "event":
      return (await one(
        db
          .select()
          .from(events)
          .where(and(eq(events.id, entityId), eq(events.tenantId, tenantId))),
      ))
        ? keys("event")
        : null;
    case "special":
      return (await one(
        db
          .select()
          .from(specials)
          .where(and(eq(specials.id, entityId), eq(specials.tenantId, tenantId))),
      ))
        ? keys("special")
        : null;
    case "announcement":
      return (await one(
        db
          .select()
          .from(announcements)
          .where(and(eq(announcements.id, entityId), eq(announcements.tenantId, tenantId))),
      ))
        ? keys("announcement")
        : null;
    case "page": {
      const fixed = (FIXED_PAGE_KEYS as readonly string[]).includes(entityId);
      if (fixed) return textFields(entityId);
      const [row] = await db
        .select()
        .from(pages)
        .where(and(eq(pages.tenantId, tenantId), eq(pages.key, entityId), eq(pages.isCustom, true)))
        .limit(1);
      return row ? ["title", ...textFields("custom")] : null;
    }
  }
  function textFields(key: string) {
    return templateFor(key)
      .fields.filter((f) => f.type === "text" || f.type === "textarea")
      .map((f) => f.key);
  }
}

export type Overlay = (
  entity: TranslatableEntity,
  entityId: string,
  field: string,
  source: string,
) => string;

/** Vertaalfunctie voor een taal; zonder (geldige) taal of bij de brontaal wordt de brontekst teruggegeven. */
export async function loadOverlay(
  db: Database,
  tenant: typeof tenants.$inferSelect,
  lang: string | undefined,
): Promise<Overlay> {
  if (!lang || lang === DEFAULT_LOCALE || !tenant.locales.includes(lang))
    return (_e, _i, _f, source) => source;
  const rows = await db
    .select()
    .from(translations)
    .where(and(eq(translations.tenantId, tenant.id), eq(translations.locale, lang)));
  const map = new Map(rows.map((r) => [`${r.entity}:${r.entityId}`, r.fields]));
  return (entity, id, field, source) => map.get(`${entity}:${id}`)?.[field]?.trim() || source;
}

export { isActiveOn };
