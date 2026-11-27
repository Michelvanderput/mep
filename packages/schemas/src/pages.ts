import { z } from "zod";

export type FieldType = "text" | "textarea" | "photo" | "url" | "email" | "phone";

export interface PageField {
  key: string;
  label: string;
  type: FieldType;
  max?: number;
  hint?: string;
  placeholder?: string;
}

export interface PageTemplate {
  title: string;
  description: string;
  fields: PageField[];
}

export const FIXED_PAGE_KEYS = ["home", "about", "contact"] as const;
export type FixedPageKey = (typeof FIXED_PAGE_KEYS)[number];

/**
 * Vaste pagina's met vaste velden. De ondernemer vult in, het ontwerp van de site blijft heel.
 * Teksten zijn platte tekst; een lege regel begint een nieuwe alinea.
 */
export const PAGE_TEMPLATES: Record<FixedPageKey | "custom", PageTemplate> = {
  home: {
    title: "Home",
    description: "De kop en korte tekst bovenaan je homepage.",
    fields: [
      {
        key: "heroTitle",
        label: "Kop",
        type: "text",
        max: 80,
        placeholder: "Bijvoorbeeld: Seizoensgebonden koken aan het water",
      },
      {
        key: "heroText",
        label: "Korte tekst",
        type: "textarea",
        max: 400,
        hint: "Twee of drie zinnen die gasten welkom heten.",
      },
      { key: "photo", label: "Hoofdfoto", type: "photo" },
    ],
  },
  about: {
    title: "Over ons",
    description: "Het verhaal van je zaak.",
    fields: [
      { key: "heading", label: "Kop", type: "text", max: 80, placeholder: "Ons verhaal" },
      {
        key: "story",
        label: "Tekst",
        type: "textarea",
        max: 3000,
        hint: "Laat een lege regel vrij voor een nieuwe alinea.",
      },
      { key: "photo", label: "Foto", type: "photo" },
    ],
  },
  contact: {
    title: "Contact en route",
    description: "Adres, bereikbaarheid en sociale media. Wordt ook gebruikt voor Google.",
    fields: [
      { key: "street", label: "Straat en nummer", type: "text", max: 100 },
      { key: "postalCode", label: "Postcode", type: "text", max: 10 },
      { key: "city", label: "Plaats", type: "text", max: 60 },
      { key: "phone", label: "Telefoon", type: "phone", placeholder: "020 123 45 67" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "route", label: "Route en parkeren", type: "textarea", max: 600 },
      {
        key: "accessibility",
        label: "Toegankelijkheid",
        type: "textarea",
        max: 400,
        hint: "Bijvoorbeeld: drempelvrij, invalidentoilet aanwezig.",
      },
      {
        key: "instagram",
        label: "Instagram",
        type: "url",
        placeholder: "https://instagram.com/jouwzaak",
      },
      {
        key: "facebook",
        label: "Facebook",
        type: "url",
        placeholder: "https://facebook.com/jouwzaak",
      },
    ],
  },
  custom: {
    title: "Eigen pagina",
    description: "Een losse pagina met tekst en een foto.",
    fields: [
      {
        key: "body",
        label: "Tekst",
        type: "textarea",
        max: 5000,
        hint: "Laat een lege regel vrij voor een nieuwe alinea.",
      },
      { key: "photo", label: "Foto", type: "photo" },
    ],
  },
};

export const templateFor = (key: string): PageTemplate =>
  (PAGE_TEMPLATES as Record<string, PageTemplate>)[key] ?? PAGE_TEMPLATES.custom;

const fieldSchema = (f: PageField): z.ZodType<string> => {
  const text = z.string().trim();
  switch (f.type) {
    case "photo":
      return z.union([z.literal(""), z.string().uuid()]);
    case "url":
      return z.union([z.literal(""), text.max(300).regex(/^https:\/\/\S+$/, "Begin met https://")]);
    case "email":
      return z.union([
        z.literal(""),
        text.toLowerCase().max(254).pipe(z.email("Geen geldig e-mailadres")),
      ]);
    case "phone":
      return z.union([
        z.literal(""),
        text.regex(/^[+\d][\d\s().-]{5,19}$/, "Geen geldig telefoonnummer"),
      ]);
    default:
      return text.max(f.max ?? 200);
  }
};

/** Zod-schema voor de inhoud van een pagina; onbekende velden worden weggegooid, lege velden blijven "". */
export function pageContentSchema(template: PageTemplate) {
  return z.object(
    Object.fromEntries(template.fields.map((f) => [f.key, fieldSchema(f).optional().default("")])),
  ) as z.ZodType<Record<string, string>>;
}

export const pageSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "Gebruik letters, cijfers en streepjes")
  .refine((s) => !(FIXED_PAGE_KEYS as readonly string[]).includes(s), "Deze naam is al in gebruik");

export const createPageSchema = z.object({
  title: z.string().trim().min(2, "Geef de pagina een titel").max(80),
});
export const savePageSchema = z.object({
  title: z.string().trim().min(2).max(80).optional(),
  content: z.record(z.string(), z.unknown()),
});

/** Splitst platte tekst in alinea's (lege regel = nieuwe alinea). */
export const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
