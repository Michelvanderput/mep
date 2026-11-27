import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Let op: drizzle-kit kan geen workspace-TS-packages laden, daarom staan deze lijsten hier
// zelf; test/enums.test.ts bewaakt dat ze gelijk blijven aan @mep/schemas.
export const TENANT_TYPES = [
  "restaurant",
  "cafe",
  "lunchroom",
  "bar",
  "beach_club",
  "hotel",
  "other",
] as const;
export const ROLES = ["owner", "manager", "kitchen", "staff"] as const;

export const tenantTypeEnum = pgEnum("tenant_type", TENANT_TYPES);
export const roleEnum = pgEnum("role", ROLES);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "suspended"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Een horecazaak = een tenant. Alle klantdata verwijst hiernaar met tenant_id. */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    type: tenantTypeEnum("type").notNull().default("restaurant"),
    status: tenantStatusEnum("status").notNull().default("active"),
    modules: text("modules").array().notNull().default(sql`'{}'::text[]`),
    locales: text("locales").array().notNull().default(sql`'{nl}'::text[]`),
    timezone: text("timezone").notNull().default("Europe/Amsterdam"),
    domains: text("domains").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [uniqueIndex("tenants_slug_uq").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Altijd lowercase opgeslagen. */
    email: text("email").notNull(),
    name: text("name"),
    isSuperadmin: boolean("is_superadmin").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_uq").on(t.tenantId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/** Eenmalige inlogtokens (magic link). Alleen de hash wordt bewaard. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("login_tokens_hash_uq").on(t.tokenHash)],
);

/** Sessies. `id` is de SHA-256 van het cookie-token. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Wie heeft wat wanneer gewijzigd. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_idx").on(t.tenantId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Openingstijden
// ---------------------------------------------------------------------------

/** Weekschema per soort ("venue" = zaal, "kitchen" = keuken): 7 dagen met tijdvakken. */
export const openingHours = pgTable(
  "opening_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    schedule: jsonb("schedule").$type<{ open: string; close: string }[][]>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("opening_hours_tenant_kind_uq").on(t.tenantId, t.kind)],
);

export const openingExceptions = pgTable(
  "opening_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** JJJJ-MM-DD in de tijdzone van de zaak. */
    date: text("date").notNull(),
    closed: boolean("closed").notNull().default(true),
    slots: jsonb("slots")
      .$type<{ open: string; close: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    reason: text("reason"),
    ...timestamps,
  },
  (t) => [uniqueIndex("opening_exceptions_tenant_date_uq").on(t.tenantId, t.date)],
);

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Opslagmap, bv. "<tenantId>/<id>". Varianten staan als "<w>.webp" daarin. */
    storagePrefix: text("storage_prefix").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Totale grootte van alle varianten. */
    bytes: integer("bytes").notNull(),
    alt: text("alt").notNull().default(""),
    focusX: real("focus_x").notNull().default(0.5),
    focusY: real("focus_y").notNull().default(0.5),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_tenant_idx").on(t.tenantId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Menukaart
// ---------------------------------------------------------------------------

export const menus = pgTable(
  "menus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("menus_tenant_idx").on(t.tenantId)],
);

export const menuSections = pgTable(
  "menu_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("menu_sections_menu_idx").on(t.menuId)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => menuSections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Prijs in centen. */
    priceCents: integer("price_cents").notNull().default(0),
    allergens: text("allergens").array().notNull().default(sql`'{}'::text[]`),
    /** Pas true als een mens de allergenen heeft gecontroleerd (ook als het er geen zijn). */
    allergensChecked: boolean("allergens_checked").notNull().default(false),
    diets: text("diets").array().notNull().default(sql`'{}'::text[]`),
    soldOut: boolean("sold_out").notNull().default(false),
    /** Vanaf deze datum (JJJJ-MM-DD) is het gerecht weer beschikbaar; null = tot handmatig terug. */
    soldOutUntil: text("sold_out_until"),
    mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("menu_items_section_idx").on(t.sectionId),
    index("menu_items_tenant_idx").on(t.tenantId),
  ],
);

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("contact"),
    status: text("status").notNull().default("new"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, string | number | boolean>>(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("submissions_tenant_status_idx").on(t.tenantId, t.status, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Meldingen en dagspecials
// ---------------------------------------------------------------------------

/** Mededelingenbalk op de site ("Vandaag gesloten wegens ziekte"). Datums in de tijdzone van de zaak. */
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_tenant_idx").on(t.tenantId)],
);

/** Tijdelijke gerechten (dagspecial, weekmenu) buiten de vaste kaart. */
export const specials = pgTable(
  "specials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents"),
    mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("specials_tenant_idx").on(t.tenantId)],
);
