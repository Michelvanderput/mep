import { z } from "zod";
import { dateSchema, timeSchema } from "./hours";

export const REPEATS = ["none", "weekly"] as const;
export type Repeat = (typeof REPEATS)[number];

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(2, "Geef het evenement een titel").max(120),
    description: z.string().trim().max(1000).default(""),
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema.nullable().default(null),
    repeat: z.enum(REPEATS).default("none"),
    /** Laatste datum van een wekelijks evenement; leeg = blijft doorlopen. */
    repeatUntil: dateSchema.nullable().default(null),
    priceCents: z.number().int().min(0).max(1_000_000).nullable().default(null),
    ticketUrl: z
      .union([
        z.literal(""),
        z
          .string()
          .trim()
          .max(300)
          .regex(/^https:\/\/\S+$/, "Begin met https://"),
      ])
      .nullable()
      .default(null),
    mediaId: z.string().uuid().nullable().default(null),
  })
  .refine((e) => !e.endTime || e.endTime > e.startTime, {
    message: "Het einde moet na het begin liggen",
    path: ["endTime"],
  })
  .refine((e) => !e.repeatUntil || e.repeatUntil >= e.date, {
    message: "De einddatum van de herhaling ligt voor de startdatum",
    path: ["repeatUntil"],
  });
export type EventInput = z.infer<typeof eventInputSchema>;

export interface EventLike {
  id: string;
  date: string;
  startTime: string;
  repeat: string;
  repeatUntil: string | null;
}

export interface Occurrence<E extends EventLike> {
  event: E;
  /** JJJJ-MM-DD van deze keer. */
  date: string;
}

/** Datum + n dagen, zonder tijdzone- of zomertijdproblemen (rekent op UTC-middag). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Alle komende keren (vanaf `today`, inclusief) van eenmalige en wekelijkse evenementen,
 * gesorteerd op datum en begintijd. Wekelijkse evenementen lopen maximaal `horizonDays` vooruit.
 */
export function expandOccurrences<E extends EventLike>(
  events: E[],
  today: string,
  opts: { limit?: number; horizonDays?: number } = {},
): Occurrence<E>[] {
  const { limit = 20, horizonDays = 120 } = opts;
  const horizon = addDays(today, horizonDays);
  const out: Occurrence<E>[] = [];
  for (const event of events) {
    if (event.repeat !== "weekly") {
      if (event.date >= today) out.push({ event, date: event.date });
      continue;
    }
    const last = event.repeatUntil && event.repeatUntil < horizon ? event.repeatUntil : horizon;
    // Begin bij de eerste keer op of na vandaag, in stappen van 7 dagen vanaf de startdatum.
    let d = event.date;
    if (d < today) {
      const diffDays = Math.round(
        (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86_400_000,
      );
      d = addDays(d, Math.ceil(diffDays / 7) * 7);
    }
    for (; d <= last; d = addDays(d, 7)) out.push({ event, date: d });
  }
  out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.event.startTime.localeCompare(b.event.startTime),
  );
  return out.slice(0, limit);
}

/** Is dit evenement afgelopen (geen komende keren meer)? */
export const isPastEvent = (e: EventLike, today: string) =>
  e.repeat === "weekly" ? !!e.repeatUntil && e.repeatUntil < today : e.date < today;
