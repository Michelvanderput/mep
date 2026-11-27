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

// ---------------------------------------------------------------------------
// Vertaalde weergave van openingstijden (voor websites)
// ---------------------------------------------------------------------------

type Dict = {
  open: (t: string) => string;
  opensLater: (t: string) => string;
  closed: string;
  closedToday: string;
  closedDay: string;
  and: string;
  daysLong: string[];
  daysShort: string[];
};

const DICT: Record<LocaleId, Dict> = {
  nl: {
    open: (t) => `Nu open · tot ${t}`,
    opensLater: (t) => `Nu gesloten · opent ${t}`,
    closed: "Nu gesloten",
    closedToday: "Vandaag gesloten",
    closedDay: "Gesloten",
    and: "en",
    daysLong: ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"],
    daysShort: ["ma", "di", "wo", "do", "vr", "za", "zo"],
  },
  en: {
    open: (t) => `Open now · until ${t}`,
    opensLater: (t) => `Closed now · opens ${t}`,
    closed: "Closed now",
    closedToday: "Closed today",
    closedDay: "Closed",
    and: "and",
    daysLong: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    daysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  de: {
    open: (t) => `Jetzt geöffnet · bis ${t}`,
    opensLater: (t) => `Jetzt geschlossen · öffnet ${t}`,
    closed: "Jetzt geschlossen",
    closedToday: "Heute geschlossen",
    closedDay: "Geschlossen",
    and: "und",
    daysLong: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
    daysShort: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
  },
  fr: {
    open: (t) => `Ouvert · jusqu'à ${t}`,
    opensLater: (t) => `Fermé · ouvre à ${t}`,
    closed: "Fermé",
    closedToday: "Fermé aujourd'hui",
    closedDay: "Fermé",
    and: "et",
    daysLong: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
    daysShort: ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"],
  },
};

/** Onbekende taal valt terug op Nederlands. */
export const dictFor = (lang?: string): Dict =>
  DICT[(lang && lang in DICT ? lang : DEFAULT_LOCALE) as LocaleId];

export function formatOpenStatus(
  status: { state: "open" | "opens_later" | "closed" | "closed_today"; time?: string },
  lang?: string,
): string {
  const d = dictFor(lang);
  switch (status.state) {
    case "open":
      return d.open(status.time ?? "");
    case "opens_later":
      return d.opensLater(status.time ?? "");
    case "closed_today":
      return d.closedToday;
    default:
      return d.closed;
  }
}

// Allergenen en dieetlabels per taal (voor websites); Nederlands staat in ./menu.
const ALLERGEN_LABELS: Record<Exclude<LocaleId, "nl">, Record<string, string>> = {
  en: {
    gluten: "Gluten",
    crustaceans: "Crustaceans",
    eggs: "Eggs",
    fish: "Fish",
    peanuts: "Peanuts",
    soy: "Soy",
    milk: "Milk",
    nuts: "Tree nuts",
    celery: "Celery",
    mustard: "Mustard",
    sesame: "Sesame",
    sulphites: "Sulphites",
    lupin: "Lupin",
    molluscs: "Molluscs",
  },
  de: {
    gluten: "Gluten",
    crustaceans: "Krebstiere",
    eggs: "Eier",
    fish: "Fisch",
    peanuts: "Erdnüsse",
    soy: "Soja",
    milk: "Milch",
    nuts: "Schalenfrüchte",
    celery: "Sellerie",
    mustard: "Senf",
    sesame: "Sesam",
    sulphites: "Sulfite",
    lupin: "Lupinen",
    molluscs: "Weichtiere",
  },
  fr: {
    gluten: "Gluten",
    crustaceans: "Crustacés",
    eggs: "Œufs",
    fish: "Poisson",
    peanuts: "Arachides",
    soy: "Soja",
    milk: "Lait",
    nuts: "Fruits à coque",
    celery: "Céleri",
    mustard: "Moutarde",
    sesame: "Sésame",
    sulphites: "Sulfites",
    lupin: "Lupin",
    molluscs: "Mollusques",
  },
};
const DIET_LABELS: Record<Exclude<LocaleId, "nl">, Record<string, string>> = {
  en: {
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    glutenfree: "Gluten-free",
    lactosefree: "Lactose-free",
    halal: "Halal",
    spicy: "Spicy",
  },
  de: {
    vegetarian: "Vegetarisch",
    vegan: "Vegan",
    glutenfree: "Glutenfrei",
    lactosefree: "Laktosefrei",
    halal: "Halal",
    spicy: "Scharf",
  },
  fr: {
    vegetarian: "Végétarien",
    vegan: "Végan",
    glutenfree: "Sans gluten",
    lactosefree: "Sans lactose",
    halal: "Halal",
    spicy: "Épicé",
  },
};
const NL_ALLERGENS: Record<string, string> = {
  gluten: "Gluten",
  crustaceans: "Schaaldieren",
  eggs: "Ei",
  fish: "Vis",
  peanuts: "Pinda's",
  soy: "Soja",
  milk: "Melk",
  nuts: "Noten",
  celery: "Selderij",
  mustard: "Mosterd",
  sesame: "Sesam",
  sulphites: "Sulfiet",
  lupin: "Lupine",
  molluscs: "Weekdieren",
};
const NL_DIETS: Record<string, string> = {
  vegetarian: "Vegetarisch",
  vegan: "Veganistisch",
  glutenfree: "Glutenvrij",
  lactosefree: "Lactosevrij",
  halal: "Halal",
  spicy: "Pittig",
};

const pick = (
  table: Record<string, Record<string, string>>,
  nl: Record<string, string>,
  id: string,
  lang?: string,
) => (lang && lang !== DEFAULT_LOCALE ? table[lang]?.[id] : undefined) ?? nl[id] ?? id;
export const allergenLabelFor = (id: string, lang?: string) =>
  pick(ALLERGEN_LABELS, NL_ALLERGENS, id, lang);
export const dietLabelFor = (id: string, lang?: string) => pick(DIET_LABELS, NL_DIETS, id, lang);

/** Datum als "vrijdag 27 november" in de taal van de site (zonder tijdzoneproblemen). */
export const formatDateLong = (isoDate: string, lang?: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(
    lang && lang in LOCALE_INFO ? lang : DEFAULT_LOCALE,
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    },
  );
