export interface Holiday {
  date: string;
  name: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Eerste paasdag (Gregoriaans, algoritme van Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Nederlandse feestdagen waarop horeca vaak afwijkende tijden heeft. */
export function dutchHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: `${year}-01-01`, name: "Nieuwjaarsdag" },
    { date: iso(addDays(easter, 0)), name: "Eerste paasdag" },
    { date: iso(addDays(easter, 1)), name: "Tweede paasdag" },
    { date: `${year}-04-27`, name: "Koningsdag" },
    { date: iso(addDays(easter, 39)), name: "Hemelvaartsdag" },
    { date: iso(addDays(easter, 49)), name: "Eerste pinksterdag" },
    { date: iso(addDays(easter, 50)), name: "Tweede pinksterdag" },
    { date: `${year}-12-24`, name: "Kerstavond" },
    { date: `${year}-12-25`, name: "Eerste kerstdag" },
    { date: `${year}-12-26`, name: "Tweede kerstdag" },
    { date: `${year}-12-31`, name: "Oudejaarsavond" },
  ];
  return list.sort((x, y) => x.date.localeCompare(y.date));
}

/** Komende feestdagen vanaf `fromDate` (JJJJ-MM-DD), over de jaarwisseling heen. */
export function upcomingHolidays(fromDate: string, limit = 6): Holiday[] {
  const year = Number(fromDate.slice(0, 4));
  return [...dutchHolidays(year), ...dutchHolidays(year + 1)]
    .filter((h) => h.date >= fromDate)
    .slice(0, limit);
}
