import { type PageField, templateFor } from "@mep/schemas";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, useLoad } from "../api";
import { PhotoPicker } from "../components/PhotoPicker";
import { ErrorBox, Spinner, useToast } from "../components/ui";
import { photoUrl } from "../photos";
import { useTenant } from "./TenantShell";

interface Loaded {
  key: string;
  custom: boolean;
  title: string;
  content: Record<string, string>;
}

const INPUT_MODE: Record<string, "tel" | "email" | "url" | "text"> = {
  phone: "tel",
  email: "email",
  url: "url",
  text: "text",
};

export function PageEditor() {
  const { key = "" } = useParams();
  const { slug } = useTenant();
  const toast = useToast();
  const navigate = useNavigate();
  const back = `/t/${slug}/paginas`;
  const { data, error, loading, reload } = useLoad(
    () => api<Loaded>(`/t/${slug}/pages/${key}`),
    [slug, key],
  );

  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setValues(data.content);
  }, [data]);

  if (loading) return <Spinner />;
  if (error || !data)
    return <ErrorBox message={error?.message ?? "Onbekende fout"} onRetry={reload} />;

  const template = templateFor(data.custom ? "custom" : key);
  const set = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      await api(`/t/${slug}/pages/${key}`, {
        method: "PUT",
        body: { title: data?.custom ? title : undefined, content: values },
      });
      toast("Opgeslagen");
      navigate(back);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Opslaan mislukt");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/t/${slug}/pages/${key}`, { method: "DELETE" });
      toast("Pagina verwijderd");
      navigate(back);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Verwijderen mislukt", true);
      setBusy(false);
    }
  }

  function field(f: PageField) {
    const id = `f-${f.key}`;
    const v = values[f.key] ?? "";
    if (f.type === "photo") {
      return (
        <div className="stack" key={f.key}>
          <span className="label">{f.label}</span>
          <div className={`hero-photo${v ? " has" : ""}`}>
            {v ? (
              <img src={photoUrl(v, 800)} alt="" />
            ) : (
              <button type="button" className="btn" onClick={() => setPicking(f.key)}>
                Foto toevoegen
              </button>
            )}
          </div>
          {v && (
            <div className="row">
              <button type="button" className="btn sm grow" onClick={() => setPicking(f.key)}>
                Foto wijzigen
              </button>
              <button type="button" className="btn sm grow" onClick={() => set(f.key, "")}>
                Foto weghalen
              </button>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="field" key={f.key}>
        <label className="label" htmlFor={id}>
          {f.label}
        </label>
        {f.type === "textarea" ? (
          <textarea
            id={id}
            className="input"
            style={{ minHeight: 140 }}
            maxLength={f.max}
            value={v}
            placeholder={f.placeholder}
            onChange={(e) => set(f.key, e.target.value)}
          />
        ) : (
          <input
            id={id}
            className="input"
            inputMode={INPUT_MODE[f.type]}
            type={f.type === "email" ? "email" : "text"}
            maxLength={f.max}
            value={v}
            placeholder={f.placeholder}
            onChange={(e) => set(f.key, e.target.value)}
          />
        )}
        <span className="hint">
          {f.hint}
          {f.hint && f.type === "textarea" ? " " : ""}
          {f.type === "textarea" && f.max ? `${f.max - v.length} tekens over` : ""}
        </span>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <Link to={back} className="iconbtn" aria-label="Terug naar pagina's">
          ‹
        </Link>
        <h1>{data.title}</h1>
      </header>
      <form onSubmit={save} noValidate>
        <main className="content">
          {data.custom && (
            <div className="field">
              <label className="label" htmlFor="ptitle">
                Titel van de pagina
              </label>
              <input
                id="ptitle"
                className="input"
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}
          {template.fields.map(field)}
          {problem && (
            <div className="err" role="alert">
              {problem}
            </div>
          )}
          {data.custom &&
            (confirmDelete ? (
              <div className="card">
                <p className="t">Deze pagina definitief verwijderen?</p>
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
                Pagina verwijderen
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
          suggestedAlt=""
          onClose={() => setPicking(null)}
          onPick={(m) => {
            set(picking, m.id);
            setPicking(null);
          }}
        />
      )}
    </>
  );
}
