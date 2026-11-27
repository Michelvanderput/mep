import { z } from "zod";

/** De 14 wettelijke allergenen (EU 1169/2011). `id` is stabiel, `label` is voor de gebruiker. */
export const ALLERGENS = [
  { id: "gluten", label: "Gluten" },
  { id: "crustaceans", label: "Schaaldieren" },
  { id: "eggs", label: "Ei" },
  { id: "fish", label: "Vis" },
  { id: "peanuts", label: "Pinda's" },
  { id: "soy", label: "Soja" },
  { id: "milk", label: "Melk" },
  { id: "nuts", label: "Noten" },
  { id: "celery", label: "Selderij" },
  { id: "mustard", label: "Mosterd" },
  { id: "sesame", label: "Sesam" },
  { id: "sulphites", label: "Sulfiet" },
  { id: "lupin", label: "Lupine" },
  { id: "molluscs", label: "Weekdieren" },
] as const;
export type AllergenId = (typeof ALLERGENS)[number]["id"];
export const ALLERGEN_IDS = ALLERGENS.map((a) => a.id) as [AllergenId, ...AllergenId[]];

export const DIETS = [
  { id: "vegetarian", label: "Vegetarisch" },
  { id: "vegan", label: "Vegan" },
  { id: "glutenfree", label: "Glutenvrij" },
  { id: "lactosefree", label: "Lactosevrij" },
  { id: "halal", label: "Halal" },
  { id: "spicy", label: "Pittig" },
] as const;
export type DietId = (typeof DIETS)[number]["id"];
export const DIET_IDS = DIETS.map((d) => d.id) as [DietId, ...DietId[]];

/** Prijs in centen. Accepteert "14,50", "14.50" of "14". */
export function parsePriceToCents(input: string): number | null {
  const m = /^\s*€?\s*(\d{1,4})(?:[.,](\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

export function formatPrice(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export const itemInputSchema = z.object({
  name: z.string().trim().min(1, "Geef het gerecht een naam").max(120),
  description: z.string().trim().max(500).default(""),
  priceCents: z.number().int().min(0).max(1_000_000),
  allergens: z.array(z.enum(ALLERGEN_IDS)).default([]),
  diets: z.array(z.enum(DIET_IDS)).default([]),
  sectionId: z.string().uuid().optional(),
  /** Foto uit de mediabibliotheek; null = geen foto. */
  mediaId: z.string().uuid().nullable().optional(),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

export const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const orderSchema = z.object({ ids: z.array(z.string().uuid()).max(500) });
export const soldOutSchema = z.object({
  soldOut: z.boolean(),
  /** Datum waarop het gerecht weer beschikbaar is (JJJJ-MM-DD); leeg = tot handmatig terug. */
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

export const SUBMISSION_TYPES = ["contact", "group", "job"] as const;
export const SUBMISSION_STATUSES = ["new", "in_progress", "done"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const publicSubmissionSchema = z.object({
  type: z.enum(SUBMISSION_TYPES).default("contact"),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  phone: z.string().trim().max(30).optional(),
  message: z.string().trim().min(1).max(3000),
  data: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean()])).optional(),
  /** Honeypot: echte bezoekers laten dit leeg. */
  website: z.string().max(0).optional(),
});
export const submissionPatchSchema = z.object({
  status: z.enum(SUBMISSION_STATUSES).optional(),
  note: z.string().max(2000).optional(),
});

export const overrideTodaySchema = z.object({
  mode: z.enum(["closed", "hours", "reset"]),
  slots: z
    .array(z.object({ open: z.string(), close: z.string() }))
    .max(3)
    .optional(),
  reason: z.string().trim().max(120).optional(),
});
