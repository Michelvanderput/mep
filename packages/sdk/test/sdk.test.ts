import { describe, expect, test } from "vitest";
import { createClient, type Hours, MepError, weekRowsGrouped } from "../src";

const day = [{ open: "17:00", close: "22:00" }];
const hours: Hours = {
  timezone: "Europe/Amsterdam",
  venue: [
    [],
    day,
    day,
    day,
    [{ open: "12:00", close: "23:00" }],
    [{ open: "12:00", close: "23:00" }],
    [],
  ],
  kitchen: [[], [], [], [], [], [], []],
  exceptions: [],
  generatedAt: "2026-05-12T10:00:00Z",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("sdk", () => {
  test("weekRowsGrouped voegt gelijke opeenvolgende dagen samen", () => {
    expect(weekRowsGrouped(hours.venue)).toEqual([
      { days: "ma", text: "Gesloten" },
      { days: "di–do", text: "17:00–22:00" },
      { days: "vr–za", text: "12:00–23:00" },
      { days: "zo", text: "Gesloten" },
    ]);
  });

  test("openStatus rekent zelf, ook met oude gecachte uren", () => {
    const c = createClient({
      baseUrl: "https://x/api",
      tenant: "haven",
      fetch: (async () => jsonResponse({})) as typeof fetch,
    });
    // dinsdag 12 mei 2026, 19:00 Amsterdam = 17:00 UTC
    expect(c.openStatus(hours, new Date("2026-05-12T17:00:00Z"))).toMatchObject({
      open: true,
      label: "Nu open · tot 22:00",
    });
    expect(c.openStatus(hours, new Date("2026-05-11T17:00:00Z")).open).toBe(false); // maandag
  });

  test("foto-URL's en srcset", () => {
    const c = createClient({ baseUrl: "https://x/api/", tenant: "haven" });
    expect(c.photoUrl("abc", 400)).toBe("https://x/api/media/abc/400.webp");
    expect(c.photoSrcSet("abc")).toBe(
      "https://x/api/media/abc/400.webp 400w, https://x/api/media/abc/800.webp 800w, https://x/api/media/abc/1600.webp 1600w",
    );
  });

  test("menus en fouten", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      return url.endsWith("/menus")
        ? jsonResponse({ menus: [{ id: "1", name: "Diner", sections: [] }] })
        : jsonResponse({ error: "x" }, 404);
    }) as unknown as typeof fetch;
    const c = createClient({ baseUrl: "https://x/api", tenant: "de haven", fetch: f });
    expect(await c.menus()).toHaveLength(1);
    expect(calls[0]).toBe("https://x/api/public/de%20haven/menus");
    await expect(c.hours()).rejects.toBeInstanceOf(MepError);
  });

  test("lang wordt aan elk verzoek toegevoegd", async () => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      return jsonResponse({ menus: [], events: [] });
    }) as unknown as typeof fetch;
    const c = createClient({ baseUrl: "https://x/api", tenant: "haven", fetch: f, lang: "en" });
    await c.menus();
    await c.events(5);
    expect(urls).toEqual([
      "https://x/api/public/haven/menus?lang=en",
      "https://x/api/public/haven/events?limit=5&lang=en",
    ]);
  });

  test("submit geeft de foutmelding van de server door", async () => {
    const f = (async () =>
      jsonResponse({ error: "Zaak niet gevonden" }, 404)) as unknown as typeof fetch;
    const c = createClient({ baseUrl: "https://x/api", tenant: "nope", fetch: f });
    await expect(c.submit({ name: "A", email: "a@b.nl", message: "hoi" })).rejects.toThrow(
      "Zaak niet gevonden",
    );
  });
});

describe("sdk in andere talen", () => {
  const f = (async () => jsonResponse({})) as unknown as typeof fetch;
  test("status, weekrijen en labels in de taal van de client", () => {
    const en = createClient({ baseUrl: "https://x/api", tenant: "haven", fetch: f, lang: "en" });
    expect(en.openStatus(hours, new Date("2026-05-12T17:00:00Z")).label).toBe(
      "Open now · until 22:00",
    );
    expect(en.openStatus(hours, new Date("2026-05-11T17:00:00Z")).label).toBe("Closed today");
    expect(en.week(hours.venue)).toEqual([
      { days: "Mon", text: "Closed" },
      { days: "Tue–Thu", text: "17:00–22:00" },
      { days: "Fri–Sat", text: "12:00–23:00" },
      { days: "Sun", text: "Closed" },
    ]);
    expect(en.allergenLabel("molluscs")).toBe("Molluscs");
    expect(en.dietLabel("vegan")).toBe("Vegan");
    expect(en.formatDate("2026-11-27")).toMatch(/Friday/);
    const nl = createClient({ baseUrl: "https://x/api", tenant: "haven", fetch: f });
    expect(nl.week(hours.venue)[0]).toEqual({ days: "ma", text: "Gesloten" });
  });
});
