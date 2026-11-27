import {
  computeOpenStatus,
  type HoursException,
  type Slot,
  upcomingHolidays,
  type WeekSchedule,
} from "@mep/schemas";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { api, useLoad } from "../api";
import { ErrorBox, Sheet, Spinner, Switch, useToast } from "../components/ui";
import { useTenant } from "./TenantShell";

interface HoursData {
  timezone: string;
  venue: WeekSchedule;
  kitchen: WeekSchedule;
  exceptions: HoursException[];
}
const DAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const DAYS_LONG = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const DEFAULT_SLOT: Slot = { open: "17:00", close: "22:00" };

const dateNl = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export function Hours() {
  const { slug } = useTenant();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => api<HoursData>(`/t/${slug}/hours`),
    [slug],
  );
  const [kind, setKind] = useState<"venue" | "kitchen">("venue");
  const [draft, setDraft] = useState<Record<"venue" | "kitchen", WeekSchedule> | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<null | { date?: string; reason?: string }>(null);

  useEffect(() => {
    if (data) setDraft({ venue: data.venue, kitchen: data.kitchen });
  }, [data]);

  const schedule = draft?.[kind];
  const dirty = useMemo(
    () => !!data && !!draft && JSON.stringify(draft[kind]) !== JSON.stringify(data[kind]),
    [data, draft, kind],
  );

  const preview = useMemo(
    () =>
      data && draft
        ? computeOpenStatus({
            schedule: draft.venue,
            exceptions: data.exceptions,
            now: new Date(),
            timeZone: data.timezone,
          })
        : null,
    [data, draft],
  );

  if (loading)
    return (
      <>
        <header className="topbar">
          <h1>Openingstijden</h1>
        </header>
        <Spinner />
      </>
    );
  if (error || !data || !draft || !schedule)
    return (
      <>
        <header className="topbar">
          <h1>Openingstijden</h1>
        </header>
        <ErrorBox message={error?.message ?? "Onbekende fout"} onRetry={reload} />
      </>
    );

  const setDay = (i: number, slots: Slot[]) =>
    setDraft({ ...draft, [kind]: schedule.map((d, idx) => (idx === i ? slots : d)) });
  const setSlot = (i: number, s: number, patch: Partial<Slot>) =>
    setDay(
      i,
      (schedule[i] ?? []).map((x, idx) => (idx === s ? { ...x, ...patch } : x)),
    );

  const invalid = schedule.findIndex(
    (d) =>
      d.some((s) => s.close <= s.open || !s.open || !s.close) ||
      d.some((s, i) => i > 0 && s.open < (d[i - 1] as Slot).close),
  );

  async function save() {
    if (invalid >= 0) return toast(`Controleer de tijden van ${DAYS_LONG[invalid]}`, true);
    setSaving(true);
    try {
      await api(`/t/${slug}/hours/${kind}`, { method: "PUT", body: { schedule } });
      toast(kind === "venue" ? "Openingstijden opgeslagen" : "Keukentijden opgeslagen");
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Opslaan mislukt", true);
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: data.timezone });
  const upcoming = data.exceptions.filter((e) => e.date >= today);
  const suggestions = upcomingHolidays(today, 8)
    .filter((h) => !data.exceptions.some((e) => e.date === h.date))
    .slice(0, 5);

  return (
    <>
      <header className="topbar">
        <h1>Openingstijden</h1>
      </header>
      <main className="content">
        {preview && (
          <section className="card hero" aria-label="Zo ziet de site het nu">
            <div className="t">Zo ziet de site het nu</div>
            <div className="s">{preview.label}</div>
          </section>
        )}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="label">Weekschema</h2>
          <div className="chips" role="group" aria-label="Soort tijden">
            <button
              type="button"
              className="chip"
              aria-pressed={kind === "venue"}
              onClick={() => setKind("venue")}
            >
              Zaal
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={kind === "kitchen"}
              onClick={() => setKind("kitchen")}
            >
              Keuken
            </button>
          </div>
        </div>
        <section className="card" aria-label="Weekschema">
          {schedule.map((slots, i) => (
            <div className="day" key={DAYS[i]}>
              <span className="name">{DAYS[i]}</span>
              <Switch
                checked={slots.length > 0}
                label={`${DAYS_LONG[i]} open`}
                onChange={(v) => setDay(i, v ? [DEFAULT_SLOT] : [])}
              />
              <div className="grow stack" style={{ gap: 8 }}>
                {slots.length === 0 && (
                  <span className="s" style={{ paddingTop: 6 }}>
                    Gesloten
                  </span>
                )}
                {slots.map((s, si) => (
                  <div className="timerow" key={`${DAYS[i]}-${s.open}-${s.close}-${si}`}>
                    <input
                      aria-label={`${DAYS_LONG[i]} open`}
                      className="input"
                      type="time"
                      value={s.open}
                      onChange={(e) => setSlot(i, si, { open: e.target.value })}
                    />
                    –
                    <input
                      aria-label={`${DAYS_LONG[i]} dicht`}
                      className="input"
                      type="time"
                      value={s.close}
                      onChange={(e) => setSlot(i, si, { close: e.target.value })}
                    />
                    {slots.length > 1 && (
                      <button
                        type="button"
                        className="iconbtn"
                        aria-label="Tijdvak verwijderen"
                        onClick={() =>
                          setDay(
                            i,
                            slots.filter((_, x) => x !== si),
                          )
                        }
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {slots.length > 0 && slots.length < 3 && (
                  <button
                    type="button"
                    className="btn sm ghost"
                    style={{ alignSelf: "flex-start", paddingLeft: 0 }}
                    onClick={() =>
                      setDay(i, [
                        ...slots,
                        { open: slots.at(-1)?.close ?? "17:00", close: "23:00" },
                      ])
                    }
                  >
                    + Tweede tijdvak
                  </button>
                )}
              </div>
            </div>
          ))}
          {invalid >= 0 && (
            <div className="err" role="alert">
              Controleer {DAYS_LONG[invalid]}: sluiten moet na openen liggen en tijdvakken mogen
              niet overlappen.
            </div>
          )}
        </section>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="label">Uitzonderingen</h2>
          <button type="button" className="btn sm" onClick={() => setAdding({})}>
            + Toevoegen
          </button>
        </div>
        <p className="hint" style={{ marginTop: -6 }}>
          Uitzonderingen gaan voor het weekschema en gelden voor de zaal.
        </p>
        {upcoming.length === 0 && <p className="s">Geen uitzonderingen gepland.</p>}
        {upcoming.length > 0 && (
          <section className="card" aria-label="Geplande uitzonderingen">
            {upcoming.map((e) => (
              <div className="item" key={e.date}>
                <div className="grow">
                  <div className="t">{dateNl(e.date)}</div>
                  <div className="s">
                    {e.closed
                      ? "Gesloten"
                      : e.slots.map((s) => `${s.open}–${s.close}`).join(" en ")}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  aria-label={`Uitzondering ${dateNl(e.date)} verwijderen`}
                  onClick={async () => {
                    await api(`/t/${slug}/hours/exceptions/${e.date}`, { method: "DELETE" });
                    toast("Uitzondering verwijderd");
                    reload();
                  }}
                >
                  Verwijder
                </button>
              </div>
            ))}
          </section>
        )}
        {suggestions.length > 0 && (
          <div className="stack">
            <span className="label">Komende feestdagen</span>
            <div className="chips">
              {suggestions.map((h) => (
                <button
                  type="button"
                  key={h.date}
                  className="chip"
                  onClick={() => setAdding({ date: h.date, reason: h.name })}
                >
                  {h.name} · {h.date.slice(8)}-{h.date.slice(5, 7)}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
      {dirty && (
        <div className="stickybar">
          <div>
            <button
              type="button"
              className="btn grow"
              onClick={() => setDraft({ ...draft, [kind]: data[kind] })}
            >
              Terugzetten
            </button>
            <button type="button" className="btn primary grow" disabled={saving} onClick={save}>
              {saving ? "Opslaan…" : "Opslaan"}
            </button>
          </div>
        </div>
      )}
      {adding && (
        <ExceptionSheet
          initial={adding}
          today={today}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function ExceptionSheet({
  initial,
  today,
  onClose,
  onSaved,
}: {
  initial: { date?: string; reason?: string };
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { slug } = useTenant();
  const toast = useToast();
  const [date, setDate] = useState(initial.date ?? today);
  const [closed, setClosed] = useState(true);
  const [open, setOpen] = useState("17:00");
  const [close, setClose] = useState("21:00");
  const [reason, setReason] = useState(initial.reason ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!closed && close <= open) return toast("Sluiten moet na openen liggen", true);
    setBusy(true);
    try {
      await api(`/t/${slug}/hours/exceptions/day`, {
        method: "PUT",
        body: { date, closed, slots: closed ? [] : [{ open, close }], reason: reason || undefined },
      });
      toast("Uitzondering opgeslagen");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Opslaan mislukt", true);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Uitzondering toevoegen" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="exd">
            Datum
          </label>
          <input
            id="exd"
            className="input"
            type="date"
            min={today}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="chips" role="group" aria-label="Open of dicht">
          <button
            type="button"
            className="chip"
            aria-pressed={closed}
            onClick={() => setClosed(true)}
          >
            Gesloten
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={!closed}
            onClick={() => setClosed(false)}
          >
            Andere tijden
          </button>
        </div>
        {!closed && (
          <div className="timerow">
            <input
              aria-label="Open vanaf"
              className="input"
              type="time"
              value={open}
              onChange={(e) => setOpen(e.target.value)}
            />
            –
            <input
              aria-label="Dicht om"
              className="input"
              type="time"
              value={close}
              onChange={(e) => setClose(e.target.value)}
            />
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="exr">
            Reden (optioneel)
          </label>
          <input
            id="exr"
            className="input"
            maxLength={120}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Bijvoorbeeld: Eerste kerstdag"
          />
        </div>
        <button type="submit" className="btn primary block" disabled={busy}>
          Opslaan
        </button>
      </form>
    </Sheet>
  );
}
