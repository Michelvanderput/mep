import { formatPrice } from "@mep/schemas";
import { Link } from "react-router-dom";
import { api, useLoad } from "../api";
import { ErrorBox, Spinner } from "../components/ui";
import { photoUrl } from "../photos";
import { useTenant } from "./TenantShell";

export interface EventRow {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string | null;
  repeat: "none" | "weekly";
  repeatUntil: string | null;
  priceCents: number | null;
  ticketUrl: string | null;
  mediaId: string | null;
  nextDate: string | null;
  past: boolean;
}

export const dateNl = (
  iso: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("nl-NL", { ...opts, timeZone: "UTC" });

export function EventsList() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(
    () => api<{ events: EventRow[] }>(`/t/${slug}/events`),
    [slug],
  );
  const upcoming = data?.events.filter((e) => !e.past) ?? [];
  const past = data?.events.filter((e) => e.past) ?? [];

  const row = (e: EventRow) => (
    <Link
      key={e.id}
      to={`/t/${slug}/evenementen/${e.id}`}
      className="card"
      style={{ textDecoration: "none", color: "inherit", opacity: e.past ? 0.65 : 1 }}
    >
      <div className="row">
        {e.mediaId ? (
          <img className="thumb" src={photoUrl(e.mediaId)} alt="" loading="lazy" />
        ) : (
          <span className="thumb empty" aria-hidden>
            foto
          </span>
        )}
        <div className="grow">
          <div className="t">{e.title}</div>
          <div className="s">
            {e.repeat === "weekly" ? `Elke ${dateNl(e.date, { weekday: "long" })}` : dateNl(e.date)}{" "}
            · {e.startTime}
            {e.endTime ? `–${e.endTime}` : ""}
            {e.priceCents !== null ? ` · ${formatPrice(e.priceCents)}` : ""}
          </div>
          {!e.past && e.repeat === "weekly" && e.nextDate && (
            <div className="s">
              Eerstvolgende: {dateNl(e.nextDate)}
              {e.repeatUntil ? ` · t/m ${dateNl(e.repeatUntil)}` : ""}
            </div>
          )}
        </div>
        {e.past ? (
          <span className="pill">Afgelopen</span>
        ) : (
          e.repeat === "weekly" && <span className="pill ok">Wekelijks</span>
        )}
      </div>
    </Link>
  );

  return (
    <>
      <header className="topbar">
        <Link to={`/t/${slug}/meer`} className="iconbtn" aria-label="Terug">
          ‹
        </Link>
        <h1>Evenementen</h1>
      </header>
      <main className="content">
        {loading && <Spinner />}
        {error && <ErrorBox message={error.message} onRetry={reload} />}
        {data && data.events.length === 0 && (
          <div className="empty">
            <h2>Nog geen evenementen</h2>
            <p>
              Plaats je eerste pubquiz, live muziek of proeverij. Terugkerende avonden voer je één
              keer in.
            </p>
            <Link className="btn primary" to={`/t/${slug}/evenementen/nieuw`}>
              Evenement toevoegen
            </Link>
          </div>
        )}
        {upcoming.map(row)}
        {past.length > 0 && (
          <>
            <h2 className="label" style={{ marginTop: 8 }}>
              Afgelopen
            </h2>
            {past.map(row)}
          </>
        )}
      </main>
      {data && data.events.length > 0 && (
        <Link to={`/t/${slug}/evenementen/nieuw`} className="fab" aria-label="Evenement toevoegen">
          +
        </Link>
      )}
    </>
  );
}
