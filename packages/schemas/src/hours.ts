import { z } from "zod";

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Gebruik HH:MM");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gebruik JJJJ-MM-DD");

export const slotSchema = z
  .object({ open: timeSchema, close: timeSchema })
  .refine((s) => s.close > s.open, "Sluitingstijd moet na de openingstijd liggen");
export type Slot = z.infer<typeof slotSchema>;

/** Index 0 = maandag … 6 = zondag. Elke dag heeft 0 (gesloten) tot 3 tijdvakken. */
export const weekScheduleSchema = z.array(z.array(slotSchema).max(3)).length(7);
export type WeekSchedule = z.infer<typeof weekScheduleSchema>;

export const HOURS_KINDS = ["venue", "kitchen"] as const;
export type HoursKind = (typeof HOURS_KINDS)[number];

export const exceptionInputSchema = z.object({
  date: dateSchema,
  closed: z.boolean(),
  slots: z.array(slotSchema).max(3).default([]),
  reason: z.string().trim().max(120).optional(),
});
export type ExceptionInput = z.infer<typeof exceptionInputSchema>;

export interface HoursException {
  date: string;
  closed: boolean;
  slots: Slot[];
  reason?: string | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Lokale datum, weekdag (0 = maandag) en minuten sinds middernacht in een tijdzone. */
export function localParts(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday ?? "Mon"),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export interface OpenStatus {
  open: boolean;
  /** Korte Nederlandse tekst voor de ondernemer, bv. "Nu open · tot 22:00". Websites gebruiken `formatOpenStatus`. */
  label: string;
  /** Machineleesbare toestand, voor vertaalde weergave. */
  state: "open" | "opens_later" | "closed" | "closed_today";
  /** Sluitingstijd (bij `open`) of openingstijd (bij `opens_later`), HH:MM. */
  time?: string;
  todaySlots: Slot[];
  exception: HoursException | null;
}

/** Bepaalt of een zaak nu open is. Uitzonderingen gaan voor het weekschema. */
export function computeOpenStatus(input: {
  schedule: WeekSchedule;
  exceptions: HoursException[];
  now: Date;
  timeZone: string;
}): OpenStatus {
  const { date, weekday, minutes } = localParts(input.now, input.timeZone);
  const exception = input.exceptions.find((e) => e.date === date) ?? null;
  const todaySlots = exception
    ? exception.closed
      ? []
      : exception.slots
    : (input.schedule[weekday] ?? []);

  const current = todaySlots.find(
    (s) => toMinutes(s.open) <= minutes && minutes < toMinutes(s.close),
  );
  if (current)
    return {
      open: true,
      state: "open",
      time: current.close,
      label: `Nu open · tot ${current.close}`,
      todaySlots,
      exception,
    };

  const next = todaySlots.find((s) => toMinutes(s.open) > minutes);
  if (next)
    return {
      open: false,
      state: "opens_later",
      time: next.open,
      label: `Nu gesloten · opent ${next.open}`,
      todaySlots,
      exception,
    };
  return {
    open: false,
    state: todaySlots.length === 0 ? "closed_today" : "closed",
    label: todaySlots.length === 0 ? "Vandaag gesloten" : "Nu gesloten",
    todaySlots,
    exception,
  };
}
