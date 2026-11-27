import {
  allergenLabelFor,
  computeOpenStatus,
  dictFor,
  dietLabelFor,
  formatDateLong,
  formatOpenStatus,
  formatPrice,
  type HoursException,
  MEDIA_WIDTHS,
  mediaPath,
  type OpenStatus,
  type Slot,
  type WeekSchedule,
} from "@mep/schemas";

export { formatPrice };

export interface MepClientOptions {
  /** Root van de MEP-API, bv. "https://beheer.jouwdomein.nl/api". */
  baseUrl: string;
  /** Korte naam (slug) van de zaak. */
  tenant: string;
  fetch?: typeof fetch;
  /** Taal van de teksten ("en", "de", "fr"). Niet vertaalde teksten komen in het Nederlands terug. */
  lang?: string;
}

export interface TenantInfo {
  name: string;
  type: string;
  locales: string[];
  timezone: string;
  modules: string[];
}
export interface Hours {
  timezone: string;
  venue: WeekSchedule;
  kitchen: WeekSchedule;
  exceptions: HoursException[];
  generatedAt: string;
}
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  /** null = nog niet gecontroleerd door de ondernemer: toon dan geen allergeneninformatie. */
  allergens: string[] | null;
  diets: string[];
  available: boolean;
  photo: { id: string; path: string } | null;
}
export interface MenuSection {
  id: string;
  name: string;
  items: MenuItem[];
}
export interface Menu {
  id: string;
  name: string;
  sections: MenuSection[];
}

export interface Announcement {
  id: string;
  text: string;
  endsOn: string | null;
}
export interface Special {
  id: string;
  name: string;
  description: string;
  priceCents: number | null;
  startsOn: string;
  endsOn: string;
  photo: { id: string; path: string } | null;
}

export interface PageSummary {
  key: string;
  title: string;
  custom: boolean;
  filled: boolean;
}
/** Foto-velden zijn { id, path } of null; alle andere velden zijn tekst ("" als leeg). */
export interface Page {
  key: string;
  title: string;
  custom: boolean;
  content: Record<string, string | { id: string; path: string } | null>;
}
export interface ContactPage {
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  route: string;
  accessibility: string;
  instagram: string;
  facebook: string;
}

/** Eén keer dat een evenement plaatsvindt; wekelijkse evenementen zijn al uitgeklapt. */
export interface EventOccurrence {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  description: string;
  priceCents: number | null;
  ticketUrl: string | null;
  recurring: boolean;
  photo: { id: string; path: string } | null;
}

export interface FormInput {
  type?: "contact" | "group" | "job";
  name: string;
  email: string;
  phone?: string;
  message: string;
  data?: Record<string, string | number | boolean>;
}

export class MepError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function createClient(opts: MepClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const root = `${base}/public/${encodeURIComponent(opts.tenant)}`;

  async function get<T>(path: string): Promise<T> {
    const url = opts.lang
      ? `${root}${path}${path.includes("?") ? "&" : "?"}lang=${encodeURIComponent(opts.lang)}`
      : `${root}${path}`;
    const res = await f(url);
    if (!res.ok) throw new MepError(`MEP: ${path} gaf ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  return {
    info: () => get<TenantInfo>("/info"),
    hours: () => get<Hours>("/hours"),
    menus: async () => (await get<{ menus: Menu[] }>("/menus")).menus,

    /**
     * Rekent open/dicht zelf uit de uren, zodat een gecachte of statisch gebouwde pagina
     * toch de actuele status toont. Gebruik in de browser met `setInterval` voor een live badge.
     */
    /** Meldingen die vandaag gelden (bv. voor een balk bovenaan de site). */
    announcements: async () =>
      (await get<{ announcements: Announcement[] }>("/announcements")).announcements,
    /** Dagspecials die vandaag gelden. */
    specials: async () => (await get<{ specials: Special[] }>("/specials")).specials,

    /** Welke pagina's bestaan (vaste pagina's staan er altijd bij, ook als ze nog leeg zijn). */
    pages: async () => (await get<{ pages: PageSummary[] }>("/pages")).pages,
    /** Eén pagina op sleutel: "home", "about", "contact" of de sleutel van een eigen pagina. */
    page: (key: string) => get<Page>(`/pages/${encodeURIComponent(key)}`),

    /** Komende evenementen op datum gesorteerd (standaard 20). */
    events: async (limit = 20) =>
      (await get<{ events: EventOccurrence[] }>(`/events?limit=${limit}`)).events,

    /** Open/dicht op dit moment; `label` staat in de taal van de client. */
    openStatus(hours: Hours, now: Date = new Date()): OpenStatus {
      const status = computeOpenStatus({
        schedule: hours.venue,
        exceptions: hours.exceptions,
        now,
        timeZone: hours.timezone,
      });
      return { ...status, label: formatOpenStatus(status, opts.lang) };
    },
    kitchenStatus(hours: Hours, now: Date = new Date()): OpenStatus {
      const status = computeOpenStatus({
        schedule: hours.kitchen,
        exceptions: [],
        now,
        timeZone: hours.timezone,
      });
      return { ...status, label: formatOpenStatus(status, opts.lang) };
    },

    /** Openingstijden per dag(groep) in de taal van de client. */
    week: (schedule: WeekSchedule) => weekRowsGrouped(schedule, opts.lang),
    allergenLabel: (id: string) => allergenLabelFor(id, opts.lang),
    dietLabel: (id: string) => dietLabelFor(id, opts.lang),
    /** "vrijdag 27 november" / "Friday, November 27". */
    formatDate: (isoDate: string) => formatDateLong(isoDate, opts.lang),

    photoUrl: (id: string, width: (typeof MEDIA_WIDTHS)[number] = 800) =>
      `${base}${mediaPath(id, width)}`,
    /** Waarde voor het `srcset`-attribuut van een <img>. */
    photoSrcSet: (id: string) =>
      MEDIA_WIDTHS.map((w) => `${base}${mediaPath(id, w)} ${w}w`).join(", "),

    /** Verstuurt een formulier naar de inbox van de ondernemer. */
    async submit(input: FormInput, opts2?: { website?: string }) {
      const res = await f(`${root}/forms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, website: opts2?.website ?? "" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new MepError(
          typeof body.error === "string" ? body.error : "Versturen mislukt",
          res.status,
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Hulpfuncties voor weergave
// ---------------------------------------------------------------------------

export const formatSlots = (slots: Slot[], lang?: string) => {
  const d = dictFor(lang);
  return slots.length === 0
    ? d.closedDay
    : slots.map((s) => `${s.open}–${s.close}`).join(` ${d.and} `);
};

/** Eén regel per dag: [{ day: "Maandag", text: "Gesloten" }, ...] */
export function weekRows(schedule: WeekSchedule, lang?: string) {
  const d = dictFor(lang);
  return schedule.map((slots, i) => ({
    day: d.daysLong[i] as string,
    text: formatSlots(slots, lang),
  }));
}

/** Samengevoegd: dagen met gelijke tijden achter elkaar worden één regel ("di–do: 17:00–22:00"). */
export function weekRowsGrouped(schedule: WeekSchedule, lang?: string) {
  const d = dictFor(lang);
  const rows: { days: string; text: string }[] = [];
  let start = 0;
  for (let i = 1; i <= 7; i++) {
    if (i < 7 && formatSlots(schedule[i] ?? [], lang) === formatSlots(schedule[start] ?? [], lang))
      continue;
    const days =
      i - 1 === start
        ? (d.daysShort[start] as string)
        : `${d.daysShort[start]}–${d.daysShort[i - 1]}`;
    rows.push({ days, text: formatSlots(schedule[start] ?? [], lang) });
    start = i;
  }
  return rows;
}

export const allergenLabel = (id: string, lang?: string) => allergenLabelFor(id, lang);
export const dietLabel = (id: string, lang?: string) => dietLabelFor(id, lang);

/** Plat te tonen tekst als alinea's (lege regel = nieuwe alinea). */
export { paragraphs } from "@mep/schemas";

/** Alle contactgegevens als tekstvelden; handig voor een voettekst of contactblok. */
export const contactFields = (page: Page): ContactPage => {
  const text = (k: string) =>
    typeof page.content[k] === "string" ? (page.content[k] as string) : "";
  return {
    street: text("street"),
    postalCode: text("postalCode"),
    city: text("city"),
    phone: text("phone"),
    email: text("email"),
    route: text("route"),
    accessibility: text("accessibility"),
    instagram: text("instagram"),
    facebook: text("facebook"),
  };
};
