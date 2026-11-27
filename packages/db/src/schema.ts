import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
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
