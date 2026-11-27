import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, useLoad } from "../api";
import { ErrorBox, Sheet, Spinner, useToast } from "../components/ui";
import { useTenant } from "./TenantShell";

interface PageRow {
  key: string;
  title: string;
  description: string;
  custom: boolean;
  filled: boolean;
}

export function PagesList() {
  const { slug } = useTenant();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => api<{ pages: PageRow[] }>(`/t/${slug}/pages`),
    [slug],
  );
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { key } = await api<{ key: string }>(`/t/${slug}/pages`, {
        method: "POST",
        body: { title },
      });
      navigate(`/t/${slug}/paginas/${key}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Aanmaken mislukt", true);
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <Link to={`/t/${slug}/meer`} className="iconbtn" aria-label="Terug">
          ‹
        </Link>
        <h1>Pagina's en teksten</h1>
      </header>
      <main className="content">
        {loading && <Spinner />}
        {error && <ErrorBox message={error.message} onRetry={reload} />}
        {data?.pages.map((p) => (
          <Link
            key={p.key}
            to={`/t/${slug}/paginas/${p.key}`}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="row">
              <div className="grow">
                <div className="t">{p.title}</div>
                <div className="s">{p.description || "Eigen pagina"}</div>
              </div>
              <span className={`pill ${p.filled ? "ok" : "warn"}`}>
                {p.filled ? "Ingevuld" : "Nog leeg"}
              </span>
              <span aria-hidden>›</span>
            </div>
          </Link>
        ))}
        {data && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Eigen pagina
          </button>
        )}
      </main>
      {adding && (
        <Sheet title="Nieuwe pagina" onClose={() => setAdding(false)}>
          <form className="stack" onSubmit={create}>
            <div className="field">
              <label className="label" htmlFor="pt">
                Titel
              </label>
              <input
                id="pt"
                className="input"
                autoFocus
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Bijvoorbeeld: Zaalverhuur"
              />
            </div>
            <button
              type="submit"
              className="btn primary block"
              disabled={busy || title.trim().length < 2}
            >
              Aanmaken
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}
