import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, useLoad } from "../api";
import { ErrorBox, Sheet, Spinner, timeAgo, useToast } from "../components/ui";
import { useTenant } from "./TenantShell";

interface Slot {
  open: string;
  close: string;
}
interface Submission {
  id: string;
  type: string;
  name: string;
  message: string;
  createdAt: string;
  data: Record<string, unknown> | null;
}
interface TodayData {
  status: {
    open: boolean;
    label: string;
    todaySlots: Slot[];
    exception: { closed: boolean; reason?: string | null } | null;
  };
  kitchenToday: Slot[];
  inbox: { newCount: number; recent: Submission[] } | null;
  checklist: {
    missingAllergens: number;
    missingAlt: number;
    noHoursYet: boolean;
    upcomingExceptions: number;
  };
}
interface MenusData {
  menus: {
    id: string;
    name: string;
    sections: {
      id: string;
      name: string;
      items: { id: string; name: string; unavailable: boolean }[];
    }[];
  }[];
}

export const TYPE_NL: Record<string, string> = {
  contact: "Contact",
  group: "Groep",
  job: "Sollicitatie",
};

export function Today() {
  const { slug, name, can, setInboxCount } = useTenant();
  const { data, error, loading, reload } = useLoad(
    () => api<TodayData>(`/t/${slug}/today`),
    [slug],
  );
  const [sheet, setSheet] = useState<"override" | "soldout" | null>(null);

  useEffect(() => {
    if (data?.inbox) setInboxCount(data.inbox.newCount);
  }, [data, setInboxCount]);

  return (
    <>
      <header className="topbar">
        <h1>{name}</h1>
      </header>
      <main className="content">
        {loading && <Spinner />}
        {error && <ErrorBox message={error.message} onRetry={reload} />}
        {data && (
          <>
            <section className="card hero" aria-label="Openingsstatus">
              <div className="row">
                <div className="grow">
                  <div className="big">{data.status.label}</div>
                  <div className="s">
                    {data.status.todaySlots.length > 0
                      ? `Vandaag ${data.status.todaySlots.map((s) => `${s.open}–${s.close}`).join(" en ")}`
                      : "Vandaag geen openingstijden"}
                    {data.kitchenToday.length > 0 &&
                      ` · keuken ${data.kitchenToday.map((s) => `${s.open}–${s.close}`).join(" en ")}`}
                  </div>
                  {data.status.exception && (
                    <div className="s" style={{ marginTop: 4 }}>
                      <span className="pill warn">Afwijkend vandaag</span>
                      {data.status.exception.reason ? ` ${data.status.exception.reason}` : ""}
                    </div>
                  )}
                </div>
                <span className={`pill ${data.status.open ? "ok" : ""}`}>
                  {data.status.open ? "Open" : "Dicht"}
                </span>
              </div>
              {can("hours") && (
                <button type="button" className="btn sm" onClick={() => setSheet("override")}>
                  Vandaag afwijkend of dicht
                </button>
              )}
            </section>

            <section aria-label="Snel regelen" className="stack">
              <h2 className="label">Snel regelen</h2>
              <div className="quick">
                {can("menu") && (
                  <button type="button" className="act key" onClick={() => setSheet("soldout")}>
                    <b>Gerecht op</b>
                    <span className="s">Uitverkocht melden</span>
                  </button>
                )}
                <button type="button" className="act" disabled>
                  <b>Dagspecial</b>
                  <span className="s">Binnenkort</span>
                </button>
                <button type="button" className="act" disabled>
                  <b>Melding op site</b>
                  <span className="s">Binnenkort</span>
                </button>
              </div>
            </section>

            {data.inbox && (
              <section className="card" aria-label="Nieuw in je inbox">
                <div className="row">
                  <h2 className="grow t">Nieuw in je inbox</h2>
                  {data.inbox.newCount > 0 && (
                    <span className="pill warn">{data.inbox.newCount}</span>
                  )}
                </div>
                {data.inbox.recent.length === 0 && <p className="s">Geen nieuwe berichten.</p>}
                {data.inbox.recent.map((s) => (
                  <Link
                    key={s.id}
                    to={`/t/${slug}/inbox`}
                    className="item"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div className="grow">
                      <div className="t">
                        {s.name}
                        {s.type === "group" && s.data?.guests
                          ? ` · ${String(s.data.guests)} pers.`
                          : ""}
                      </div>
                      <div
                        className="s"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {TYPE_NL[s.type] ?? s.type} · {s.message}
                      </div>
                    </div>
                    <span className="s">{timeAgo(s.createdAt)}</span>
                  </Link>
                ))}
              </section>
            )}

            {(data.checklist.missingAllergens > 0 ||
              data.checklist.noHoursYet ||
              data.checklist.missingAlt > 0) && (
              <section className="card" aria-label="Nog even afmaken">
                <h2 className="t">Nog even afmaken</h2>
                {data.checklist.noHoursYet && can("hours") && (
                  <Link
                    to={`/t/${slug}/tijden`}
                    className="row"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span className="grow s">Je openingstijden zijn nog niet ingevuld</span>
                    <span aria-hidden>›</span>
                  </Link>
                )}
                {data.checklist.missingAlt > 0 && can("media") && (
                  <Link
                    to={`/t/${slug}/fotos`}
                    className="row"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span className="grow s">
                      {data.checklist.missingAlt}{" "}
                      {data.checklist.missingAlt === 1 ? "foto heeft" : "foto's hebben"} nog geen
                      beschrijving
                    </span>
                    <span aria-hidden>›</span>
                  </Link>
                )}
                {data.checklist.missingAllergens > 0 && can("menu") && (
                  <Link
                    to={`/t/${slug}/kaart`}
                    className="row"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span className="grow s">
                      {data.checklist.missingAllergens}{" "}
                      {data.checklist.missingAllergens === 1 ? "gerecht heeft" : "gerechten hebben"}{" "}
                      nog geen gecontroleerde allergenen
                    </span>
                    <span aria-hidden>›</span>
                  </Link>
                )}
              </section>
            )}
          </>
        )}
      </main>
      {sheet === "override" && data && (
        <OverrideSheet
          hasException={!!data.status.exception}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            reload();
          }}
        />
      )}
      {sheet === "soldout" && (
        <SoldOutSheet
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            reload();
          }}
        />
      )}
      <style>{`.quick{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.act{border:1.5px solid var(--line);background:var(--surface);border-radius:14px;padding:12px 6px;min-height:84px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center;cursor:pointer;font-size:14px}.act.key{border-color:var(--accent);background:var(--ok-bg)}.act[disabled]{opacity:.55;cursor:default}.act .s{font-size:11px}`}</style>
    </>
  );
}

function OverrideSheet({
  hasException,
  onClose,
  onDone,
}: {
  hasException: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { slug } = useTenant();
  const toast = useToast();
  const [mode, setMode] = useState<"closed" | "hours">("closed");
  const [open, setOpen] = useState("17:00");
  const [close, setClose] = useState("21:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(body: unknown, msg: string) {
    setBusy(true);
    try {
      await api(`/t/${slug}/today/override`, { method: "POST", body });
      toast(msg);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Opslaan mislukt", true);
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "closed") return send({ mode, reason }, "Vandaag staat op gesloten");
    if (close <= open) return toast("Sluiten moet na openen liggen", true);
    return send({ mode, slots: [{ open, close }], reason }, "Vandaag aangepast");
  }

  return (
    <Sheet title="Vandaag afwijkend" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="chips" role="group" aria-label="Wat wil je doen">
          <button
            type="button"
            className="chip"
            aria-pressed={mode === "closed"}
            onClick={() => setMode("closed")}
          >
            Hele dag dicht
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={mode === "hours"}
            onClick={() => setMode("hours")}
          >
            Andere tijden
          </button>
        </div>
        {mode === "hours" && (
          <div className="timerow">
            <input
              aria-label="Open vanaf"
              className="input"
              type="time"
              value={open}
              onChange={(e) => setOpen(e.target.value)}
            />{" "}
            tot{" "}
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
          <label className="label" htmlFor="why">
            Reden (optioneel)
          </label>
          <input
            id="why"
            className="input"
            value={reason}
            maxLength={120}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Bijvoorbeeld: besloten feest"
          />
        </div>
        <button type="submit" className="btn primary block" disabled={busy}>
          Opslaan
        </button>
        {hasException && (
          <button
            type="button"
            className="btn block"
            disabled={busy}
            onClick={() => send({ mode: "reset" }, "Terug naar het weekschema")}
          >
            Terug naar weekschema
          </button>
        )}
      </form>
    </Sheet>
  );
}

function SoldOutSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { slug } = useTenant();
  const toast = useToast();
  const { data, error, loading } = useLoad(() => api<MenusData>(`/t/${slug}/menus`), [slug]);
  const [q, setQ] = useState("");
  const items = (data?.menus ?? [])
    .flatMap((m) =>
      m.sections.flatMap((s) => s.items.map((i) => ({ ...i, where: `${m.name} · ${s.name}` }))),
    )
    .filter((i) => !i.unavailable && i.name.toLowerCase().includes(q.toLowerCase()));

  async function markSoldOut(id: string, itemName: string) {
    const tomorrow = new Date(Date.now() + 86_400_000);
    const until = tomorrow.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    try {
      await api(`/t/${slug}/items/${id}/soldout`, {
        method: "POST",
        body: { soldOut: true, until },
      });
      toast(`${itemName} is op tot morgen`);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Opslaan mislukt", true);
    }
  }

  return (
    <Sheet title="Welk gerecht is op?" onClose={onClose}>
      <input
        className="input"
        type="search"
        placeholder="Zoek een gerecht…"
        aria-label="Zoek een gerecht"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {loading && <Spinner />}
      {error && <div className="err">{error.message}</div>}
      <div>
        {items.map((i) => (
          <div className="item" key={i.id}>
            <div className="grow">
              <div className="t">{i.name}</div>
              <div className="s">{i.where}</div>
            </div>
            <button type="button" className="btn sm" onClick={() => markSoldOut(i.id, i.name)}>
              Op tot morgen
            </button>
          </div>
        ))}
        {data && items.length === 0 && <p className="s">Geen gerechten gevonden.</p>}
      </div>
    </Sheet>
  );
}
