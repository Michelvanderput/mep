import { type Database, openingExceptions, openingHours, tenants } from "@mep/db";
import type { WeekSchedule } from "@mep/schemas";
import { asc, eq } from "drizzle-orm";

const EMPTY_WEEK: WeekSchedule = [[], [], [], [], [], [], []];

/** Alle openingstijden van een zaak (zaal, keuken, uitzonderingen). Gedeeld door beheer en publieke API. */
export async function loadHours(db: Database, tenantId: string) {
  const [rows, exceptions, tenant] = await Promise.all([
    db.select().from(openingHours).where(eq(openingHours.tenantId, tenantId)),
    db
      .select()
      .from(openingExceptions)
      .where(eq(openingExceptions.tenantId, tenantId))
      .orderBy(asc(openingExceptions.date)),
    db.select({ tz: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
  ]);
  const schedule = (kind: string) =>
    (rows.find((x) => x.kind === kind)?.schedule ?? EMPTY_WEEK) as WeekSchedule;
  return {
    timezone: tenant[0]?.tz ?? "Europe/Amsterdam",
    venue: schedule("venue"),
    kitchen: schedule("kitchen"),
    exceptions: exceptions.map((e) => ({
      date: e.date,
      closed: e.closed,
      slots: e.slots,
      reason: e.reason,
    })),
  };
}
