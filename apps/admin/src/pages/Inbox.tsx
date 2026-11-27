import { useEffect, useState } from "react";
import { api, useLoad } from "../api";
import { ErrorBox, Spinner, timeAgo, useToast } from "../components/ui";
import { useTenant } from "./TenantShell";
import { TYPE_NL } from "./Today";

interface Sub {
  id: string;
  type: string;
  status: "new" | "in_progress" | "done";
  name: string;
  email: string;
  phone: string | null;
  message: string;
  data: Record<string, string | number | boolean> | null;
  note: string | null;
  createdAt: string;
}
interface Data {
  submissions: Sub[];
  counts: Record<string, number>;
}

const STATUS: { id: Sub["status"]; label: string }[] = [
  { id: "new", label: "Nieuw" },
  { id: "in_progress", label: "Bezig" },
  { id: "done", label: "Klaar" },
];
const ago = (iso: string) => {
  const t = timeAgo(iso);
  return t === "gisteren" || t === "zojuist" ? t : `${t} geleden`;
};
const FIELD_NL: Record<string, string> = {
  guests: "Aantal personen",
  date: "Datum",
  occasion: "Gelegenheid",
  budget: "Budget",
};

export function Inbox() {
  const { slug, setInboxCount } = useTenant();
  const toast = useToast();
  const [status, setStatus] = useState<Sub["status"]>("new");
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(
    () => api<Data>(`/t/${slug}/submissions?status=${status}`),
    [slug, status],
  );
  const counts = useLoad(
    () => api<Data>(`/t/${slug}/submissions`).then((d) => d.counts),
    [slug, status],
  );

  useEffect(() => {
    if (counts.data) setInboxCount(counts.data.new ?? 0);
  }, [counts.data, setInboxCount]);

  async function patch(id: string, body: { status?: Sub["status"]; note?: string }, msg?: string) {
    try {
      await api(`/t/${slug}/submissions/${id}`, { method: "PATCH", body });
      if (msg) toast(msg);
      await Promise.all([reload(), counts.reload()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Opslaan mislukt", true);
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>Inbox</h1>
      </header>
      <main className="content">
        <div className="chips" role="tablist" aria-label="Status">
          {STATUS.map((s) => (
            <button
              key={s.id}
              role="tab"
              type="button"
              className="chip"
              aria-pressed={status === s.id}
              onClick={() => {
                setStatus(s.id);
                setOpen(null);
              }}
            >
              {s.label}
              {counts.data?.[s.id] ? ` ${counts.data[s.id]}` : ""}
            </button>
          ))}
        </div>
        {loading && <Spinner />}
        {error && <ErrorBox message={error.message} onRetry={reload} />}
        {data && data.submissions.length === 0 && (
          <div className="empty">
            <h2>{status === "new" ? "Alles beantwoord" : "Niets te zien"}</h2>
            <p>{status === "new" ? "Er zijn geen nieuwe berichten." : "Hier staat nog niets."}</p>
          </div>
        )}
        {data?.submissions.map((s) => {
          const expanded = open === s.id;
          return (
            <article key={s.id} className={`card${expanded ? " accent" : ""}`}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : s.id)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span className="row">
                  <span className={`pill ${s.type === "group" ? "warn" : ""}`}>
                    {TYPE_NL[s.type] ?? s.type}
                  </span>
                  <span className="s grow">{ago(s.createdAt)}</span>
                </span>
                <span className="t">
                  {s.name}
                  {s.type === "group" && s.data?.guests ? ` · ${s.data.guests} personen` : ""}
                </span>
                {!expanded && (
                  <span
                    className="s"
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {s.message}
                  </span>
                )}
              </button>
              {expanded && <Detail s={s} onPatch={(b, m) => patch(s.id, b, m)} />}
            </article>
          );
        })}
      </main>
    </>
  );
}

function Detail({
  s,
  onPatch,
}: {
  s: Sub;
  onPatch: (b: { status?: Sub["status"]; note?: string }, msg?: string) => void;
}) {
  const [note, setNote] = useState(s.note ?? "");
  return (
    <div className="stack">
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{s.message}</p>
      {s.data && Object.keys(s.data).length > 0 && (
        <dl
          style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}
        >
          {Object.entries(s.data).map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt className="s">{FIELD_NL[k] ?? k}</dt>
              <dd style={{ margin: 0 }}>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="s">
        {s.email}
        {s.phone ? ` · ${s.phone}` : ""}
      </div>
      <div className="row">
        {s.phone && (
          <a className="btn sm grow" href={`tel:${s.phone.replace(/\s/g, "")}`}>
            Bel
          </a>
        )}
        <a className="btn sm grow" href={`mailto:${s.email}`}>
          Mail
        </a>
      </div>
      <div className="field">
        <label className="label" htmlFor={`note-${s.id}`}>
          Notitie voor jezelf
        </label>
        <textarea
          id={`note-${s.id}`}
          className="input"
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (s.note ?? "") && onPatch({ note }, "Notitie opgeslagen")}
        />
      </div>
      <div className="row">
        {s.status !== "in_progress" && (
          <button
            type="button"
            className="btn grow"
            onClick={() => onPatch({ status: "in_progress", note }, "Gezet op bezig")}
          >
            In behandeling
          </button>
        )}
        {s.status !== "done" && (
          <button
            type="button"
            className="btn primary grow"
            onClick={() => onPatch({ status: "done", note }, "Afgerond")}
          >
            Klaar
          </button>
        )}
        {s.status === "done" && (
          <button
            type="button"
            className="btn grow"
            onClick={() => onPatch({ status: "new" }, "Terug naar nieuw")}
          >
            Terug naar nieuw
          </button>
        )}
      </div>
    </div>
  );
}
