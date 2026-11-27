import { parsePriceToCents } from "@mep/schemas";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, useLoad } from "../api";
import { PhotoPicker } from "../components/PhotoPicker";
import { ErrorBox, Spinner, useToast } from "../components/ui";
import { photoUrl } from "../photos";
import { dateNl, type EventRow } from "./Events";
import { useTenant } from "./TenantShell";

const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

export function EventEditor() {
  const { id = "" } = useParams();
  const isNew = id === "nieuw";
  const { slug } = useTenant();
  const toast = useToast();
  const navigate = useNavigate();
  const back = `/t/${slug}/evenementen`;
  const { data, error, loading, reload } = useLoad(
    async () => (isNew ? null : (await api<{ event: EventRow }>(`/t/${slug}/events/${id}`)).event),
    [slug, id],
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState("20:00");
  const [endTime, setEndTime] = useState("");
  const [repeat, setRepeat] = useState<"none" | "weekly">("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [price, setPrice] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setDescription(data.description);
    setDate(data.date);
    setStartTime(data.startTime);
    setEndTime(data.endTime ?? "");
    setRepeat(data.repeat);
    setRepeatUntil(data.repeatUntil ?? "");
    setPrice(data.priceCents !== null ? (data.priceCents / 100).toFixed(2).replace(".", ",") : "");
    setTicketUrl(data.ticketUrl ?? "");
    setMediaId(data.mediaId);
  }, [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = price.trim() ? parsePriceToCents(price) : null;
    if (price.trim() && cents === null) return setProblem("Vul een prijs in zoals 5,00");
    setProblem("");
    setBusy(true);
    try {
      const body = {
        title,
        description,
        date,
        startTime,
        endTime: endTime || null,
        repeat,
        repeatUntil: repeat === "weekly" && repeatUntil ? repeatUntil : null,
        priceCents: cents,
        ticketUrl: ticketUrl.trim() || null,
        mediaId,
      };
      if (isNew) await api(`/t/${slug}/events`, { method: "POST", body });
      else await api(`/t/${slug}/events/${id}`, { method: "PUT", body });
      toast(isNew ? `${title} staat op je site` : "Opgeslagen");
      navigate(back);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Opslaan mislukt");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/t/${slug}/events/${id}`, { method: "DELETE" });
      toast("Evenement verwijderd");
      navigate(back);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Verwijderen mislukt", true);
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <Link to={back} className="iconbtn" aria-label="Terug naar evenementen">
          ‹
        </Link>
        <h1>{isNew ? "Nieuw evenement" : "Evenement bewerken"}</h1>
      </header>
      <form onSubmit={save} noValidate>
        <main className="content">
          <div className="field">
            <label className="label" htmlFor="et">
              Titel
            </label>
            <input
              id="et"
              className="input"
              autoFocus={isNew}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bijvoorbeeld: Pubquiz"
            />
          </div>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="field grow">
              <label className="label" htmlFor="ed">
                {repeat === "weekly" ? "Eerste datum" : "Datum"}
              </label>
              <input
                id="ed"
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="field grow">
              <label className="label" htmlFor="es">
                Begint om
              </label>
              <input
                id="es"
                className="input"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="field grow">
              <label className="label" htmlFor="ee">
                Eindigt om
              </label>
              <input
                id="ee"
                className="input"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <span className="label">Herhaling</span>
            <div className="chips" role="group" aria-label="Herhaling">
              <button
                type="button"
                className="chip"
                aria-pressed={repeat === "none"}
                onClick={() => setRepeat("none")}
              >
                Eenmalig
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={repeat === "weekly"}
                onClick={() => setRepeat("weekly")}
              >
                Elke {dateNl(date, { weekday: "long" })}
              </button>
            </div>
          </div>
          {repeat === "weekly" && (
            <div className="field">
              <label className="label" htmlFor="eu">
                Herhalen tot (optioneel)
              </label>
              <input
                id="eu"
                className="input"
                type="date"
                min={date}
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
              />
              <span className="hint">
                Leeg laten betekent: blijft doorlopen tot je het evenement verwijdert.
              </span>
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="edesc">
              Omschrijving
            </label>
            <textarea
              id="edesc"
              className="input"
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="field grow">
              <label className="label" htmlFor="ep">
                Prijs (optioneel)
              </label>
              <input
                id="ep"
                className="input"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="5,00"
              />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="etk">
              Ticketlink (optioneel)
            </label>
            <input
              id="etk"
              className="input"
              inputMode="url"
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="stack">
            <span className="label">Foto</span>
            <div className={`hero-photo${mediaId ? " has" : ""}`}>
              {mediaId ? (
                <img src={photoUrl(mediaId, 800)} alt="" />
              ) : (
                <button type="button" className="btn" onClick={() => setPicking(true)}>
                  Foto toevoegen
                </button>
              )}
            </div>
            {mediaId && (
              <div className="row">
                <button type="button" className="btn sm grow" onClick={() => setPicking(true)}>
                  Foto wijzigen
                </button>
                <button type="button" className="btn sm grow" onClick={() => setMediaId(null)}>
                  Foto weghalen
                </button>
              </div>
            )}
          </div>
          {problem && (
            <div className="err" role="alert">
              {problem}
            </div>
          )}
          {!isNew &&
            (confirmDelete ? (
              <div className="card">
                <p className="t">Dit evenement definitief verwijderen?</p>
                <div className="row">
                  <button
                    type="button"
                    className="btn danger grow"
                    disabled={busy}
                    onClick={remove}
                  >
                    Ja, verwijderen
                  </button>
                  <button
                    type="button"
                    className="btn grow"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
                Evenement verwijderen
              </button>
            ))}
        </main>
        <div className="stickybar notab">
          <div>
            <button type="button" className="btn grow" onClick={() => navigate(back)}>
              Annuleren
            </button>
            <button type="submit" className="btn primary grow" disabled={busy}>
              {busy ? "Opslaan…" : "Opslaan"}
            </button>
          </div>
        </div>
      </form>
      {picking && (
        <PhotoPicker
          slug={slug}
          suggestedAlt={title}
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setMediaId(m.id);
            setPicking(false);
          }}
        />
      )}
    </>
  );
}
