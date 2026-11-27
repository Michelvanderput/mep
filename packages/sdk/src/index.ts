import {
  ALLERGENS,
  computeOpenStatus,
  DIETS,
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
    const res = await f(`${root}${path}`);
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

    openStatus(hours: Hours, now: Date = new Date()): OpenStatus {
      return computeOpenStatus({
        schedule: hours.venue,
        exceptions: hours.exceptions,
        now,
        timeZone: hours.timezone,
      });
    },
    kitchenStatus(hours: Hours, now: Date = new Date()): OpenStatus {
      return computeOpenStatus({
        schedule: hours.kitchen,
        exceptions: [],
        now,
        timeZone: hours.timezone,
      });
    },

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

const DAY_LONG = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const DAY_SHORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];

export const formatSlots = (slots: Slot[]) =>
  slots.length === 0 ? "Gesloten" : slots.map((s) => `${s.open}–${s.close}`).join(" en ");

/** Eén regel per dag: [{ day: "Maandag", text: "Gesloten" }, ...] */
export function weekRows(schedule: WeekSchedule) {
  return schedule.map((slots, i) => ({ day: DAY_LONG[i] as string, text: formatSlots(slots) }));
}

/** Samengevoegd: dagen met gelijke tijden achter elkaar worden één regel ("di–do: 17:00–22:00"). */
export function weekRowsGrouped(schedule: WeekSchedule) {
  const rows: { days: string; text: string }[] = [];
  let start = 0;
  for (let i = 1; i <= 7; i++) {
    if (i < 7 && formatSlots(schedule[i] ?? []) === formatSlots(schedule[start] ?? [])) continue;
    const days =
      i - 1 === start ? (DAY_SHORT[start] as string) : `${DAY_SHORT[start]}–${DAY_SHORT[i - 1]}`;
    rows.push({ days, text: formatSlots(schedule[start] ?? []) });
    start = i;
  }
  return rows;
}

export const allergenLabel = (id: string) => ALLERGENS.find((a) => a.id === id)?.label ?? id;
export const dietLabel = (id: string) => DIETS.find((d) => d.id === id)?.label ?? id;
