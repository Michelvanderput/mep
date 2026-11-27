import { z } from "zod";

/** Alle modules die per klant aan/uit gezet kunnen worden (zie docs/PLAN.md §4). */
export const MODULES = [
  "menu",
  "opening_hours",
  "reservations",
  "events",
  "groups",
  "news",
  "media",
  "pages",
  "vacancies",
  "forms",
  "reviews",
  "newsletter",
  "analytics",
  "gift_cards",
  "ordering",
] as const;
export type Module = (typeof MODULES)[number];

/** Modules die altijd aan staan in de MVP. */
export const DEFAULT_MODULES: Module[] = [
  "menu",
  "opening_hours",
  "media",
  "pages",
  "forms",
  "reservations",
];

export const TENANT_TYPES = [
  "restaurant",
  "cafe",
  "lunchroom",
  "bar",
  "beach_club",
  "hotel",
  "other",
] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

export const ROLES = ["owner", "manager", "kitchen", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ["nl", "en", "de", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Slug voor subdomein/URL: kleine letters, cijfers en streepjes. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/,
    "Gebruik 3-40 tekens: letters, cijfers, streepjes",
  );

export const requestLoginSchema = z.object({ email: emailSchema });
export const verifyLoginSchema = z.object({ token: z.string().min(20).max(200) });

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema,
  type: z.enum(TENANT_TYPES).default("restaurant"),
  ownerEmail: emailSchema,
  ownerName: z.string().trim().max(100).optional(),
  modules: z.array(z.enum(MODULES)).default(DEFAULT_MODULES),
  locales: z.array(z.enum(LOCALES)).min(1).default(["nl"]),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export * from "./events";
export * from "./holidays";
export * from "./hours";
export * from "./i18n";
export * from "./media";
export * from "./menu";
export * from "./pages";
