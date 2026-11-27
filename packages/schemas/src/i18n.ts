import { z } from "zod";

export const LOCALE_INFO = {
  nl: { name: "Nederlands" },
  en: { name: "English" },
  de: { name: "Deutsch" },
  fr: { name: "Français" },
} as const;
export type LocaleId = keyof typeof LOCALE_INFO;
export const DEFAULT_LOCALE: LocaleId = "nl";

export const TRANSLATABLE_ENTITIES = [
  "menu",
  "section",
  "item",
  "page",
  "event",
  "special",
  "announcement",
] as const;
export type TranslatableEntity = (typeof TRANSLATABLE_ENTITIES)[number];

/** Velden per soort inhoud die vertaald kunnen worden (pagina's: zie templates + "title" voor eigen pagina's). */
export const TRANSLATABLE_FIELDS: Record<
  Exclude<TranslatableEntity, "page">,
  { key: string; label: string; multiline?: boolean }[]
> = {
  menu: [{ key: "name", label: "Naam" }],
  section: [{ key: "name", label: "Naam" }],
  item: [
    { key: "name", label: "Naam" },
    { key: "description", label: "Omschrijving", multiline: true },
  ],
  event: [
    { key: "title", label: "Titel" },
    { key: "description", label: "Omschrijving", multiline: true },
  ],
  special: [
    { key: "name", label: "Naam" },
    { key: "description", label: "Omschrijving", multiline: true },
  ],
  announcement: [{ key: "text", label: "Tekst", multiline: true }],
};

/** Vaste paginatitels per taal (de ondernemer kan ze niet hernoemen). */
export const FIXED_PAGE_TITLES: Record<LocaleId, Record<"home" | "about" | "contact", string>> = {
  nl: { home: "Home", about: "Over ons", contact: "Contact en route" },
  en: { home: "Home", about: "About us", contact: "Contact & directions" },
  de: { home: "Startseite", about: "Über uns", contact: "Kontakt & Anfahrt" },
  fr: { home: "Accueil", about: "À propos", contact: "Contact et accès" },
};

export const localeSchema = z.enum(["nl", "en", "de", "fr"]);

export const setLocalesSchema = z
  .object({ locales: z.array(localeSchema).min(1).max(4) })
  .refine((v) => v.locales.includes(DEFAULT_LOCALE), "Nederlands blijft altijd aan")
  .transform((v) => ({ locales: [...new Set(v.locales)] }));

export const saveTranslationSchema = z.object({
  locale: localeSchema,
  entity: z.enum(TRANSLATABLE_ENTITIES),
  entityId: z.string().min(1).max(100),
  fields: z.record(z.string().max(40), z.string().max(3000)),
});
