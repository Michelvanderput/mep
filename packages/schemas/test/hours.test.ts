import { describe, expect, test } from "vitest";
import { computeOpenStatus, parsePriceToCents, type WeekSchedule } from "../src";

const day = [{ open: "12:00", close: "22:00" }];
const schedule: WeekSchedule = [[], day, day, day, day, day, day]; // maandag dicht
const tz = "Europe/Amsterdam";
// 2026-05-12 is een dinsdag; 10:00 UTC = 12:00 Amsterdam (zomertijd)
const at = (iso: string) => new Date(iso);

describe("computeOpenStatus", () => {
  test("open binnen tijdvak", () => {
    const s = computeOpenStatus({
      schedule,
      exceptions: [],
      now: at("2026-05-12T10:00:00Z"),
      timeZone: tz,
    });
    expect(s).toMatchObject({ open: true, label: "Nu open · tot 22:00" });
  });
  test("voor opening: opent om", () => {
    const s = computeOpenStatus({
      schedule,
      exceptions: [],
      now: at("2026-05-12T07:00:00Z"),
      timeZone: tz,
    });
    expect(s).toMatchObject({ open: false, label: "Nu gesloten · opent 12:00" });
  });
  test("na sluiting", () => {
    const s = computeOpenStatus({
      schedule,
      exceptions: [],
      now: at("2026-05-12T21:00:00Z"),
      timeZone: tz,
    });
    expect(s).toMatchObject({ open: false, label: "Nu gesloten" });
  });
  test("maandag is gesloten", () => {
    const s = computeOpenStatus({
      schedule,
      exceptions: [],
      now: at("2026-05-11T10:00:00Z"),
      timeZone: tz,
    });
    expect(s).toMatchObject({ open: false, label: "Vandaag gesloten" });
  });
  test("uitzondering gaat voor weekschema", () => {
    const exceptions = [{ date: "2026-05-12", closed: true, slots: [] }];
    const s = computeOpenStatus({
      schedule,
      exceptions,
      now: at("2026-05-12T10:00:00Z"),
      timeZone: tz,
    });
    expect(s.open).toBe(false);
    expect(s.exception?.closed).toBe(true);
  });
  test("tijdzone: 23:30 UTC op 11 mei is al 12 mei in Amsterdam", () => {
    const s = computeOpenStatus({
      schedule,
      exceptions: [],
      now: at("2026-05-11T23:30:00Z"),
      timeZone: tz,
    });
    expect(s.todaySlots).toEqual(day);
  });
});

describe("parsePriceToCents", () => {
  test.each([
    ["14,50", 1450],
    ["14.5", 1450],
    ["14", 1400],
    ["€ 8,05", 805],
  ])("%s", (i, c) => {
    expect(parsePriceToCents(i as string)).toBe(c);
  });
  test("ongeldig", () => expect(parsePriceToCents("abc")).toBeNull());
});

import { dutchHolidays, upcomingHolidays } from "../src";

describe("feestdagen", () => {
  test("Pasen en afgeleide dagen 2026", () => {
    const h = Object.fromEntries(dutchHolidays(2026).map((x) => [x.name, x.date]));
    expect(h["Eerste paasdag"]).toBe("2026-04-05");
    expect(h["Tweede paasdag"]).toBe("2026-04-06");
    expect(h.Hemelvaartsdag).toBe("2026-05-14");
    expect(h["Tweede pinksterdag"]).toBe("2026-05-25");
  });
  test("komende feestdagen lopen door in het nieuwe jaar", () => {
    const next = upcomingHolidays("2026-12-27", 2);
    expect(next.map((x) => x.date)).toEqual(["2026-12-31", "2027-01-01"]);
  });
});

import { addDays, expandOccurrences, isPastEvent } from "../src";

describe("evenementen", () => {
  const ev = (
    o: Partial<{
      id: string;
      date: string;
      startTime: string;
      repeat: string;
      repeatUntil: string | null;
    }>,
  ) => ({
    id: "e",
    date: "2026-05-05",
    startTime: "20:00",
    repeat: "none",
    repeatUntil: null,
    ...o,
  });

  test("addDays over maand- en zomertijdgrens", () => {
    expect(addDays("2026-03-28", 7)).toBe("2026-04-04");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  test("wekelijks evenement begint bij de eerste keer vanaf vandaag", () => {
    // elke dinsdag vanaf 5 mei; vandaag is woensdag 13 mei
    const out = expandOccurrences([ev({ repeat: "weekly" })], "2026-05-13", { limit: 3 });
    expect(out.map((o) => o.date)).toEqual(["2026-05-19", "2026-05-26", "2026-06-02"]);
  });

  test("vandaag zelf telt mee, einddatum begrenst", () => {
    const out = expandOccurrences(
      [ev({ repeat: "weekly", repeatUntil: "2026-05-26" })],
      "2026-05-12",
    );
    expect(out.map((o) => o.date)).toEqual(["2026-05-12", "2026-05-19", "2026-05-26"]);
  });

  test("eenmalig verleden valt weg; sorteert op datum en tijd; limiet en horizon", () => {
    const list = [
      ev({ id: "a", date: "2026-05-01" }),
      ev({ id: "b", date: "2026-05-20", startTime: "21:00" }),
      ev({ id: "c", date: "2026-05-20", startTime: "19:00" }),
    ];
    expect(expandOccurrences(list, "2026-05-12").map((o) => o.event.id)).toEqual(["c", "b"]);
    expect(
      expandOccurrences([ev({ repeat: "weekly" })], "2026-05-12", { limit: 100, horizonDays: 14 }),
    ).toHaveLength(3);
  });

  test("isPastEvent", () => {
    expect(isPastEvent(ev({ date: "2026-05-01" }), "2026-05-12")).toBe(true);
    expect(isPastEvent(ev({ repeat: "weekly" }), "2026-05-12")).toBe(false);
    expect(isPastEvent(ev({ repeat: "weekly", repeatUntil: "2026-05-01" }), "2026-05-12")).toBe(
      true,
    );
  });
});
