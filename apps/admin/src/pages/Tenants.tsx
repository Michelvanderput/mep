import { slugify, TENANT_TYPES } from "@mep/schemas";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, type Me, useLoad } from "../api";
import { ErrorBox, Sheet, Spinner, useToast } from "../components/ui";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
}

const TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  lunchroom: "Lunchroom",
  bar: "Bar",
  beach_club: "Strandpaviljoen",
  hotel: "Hotel",
  other: "Anders",
};

export function Tenants() {
  const navigate = useNavigate();
  const me = useLoad(() => api<Me>("/me"), []);
  const all = useLoad(
    async () =>
      me.data?.user.isSuperadmin
        ? (await api<{ tenants: TenantRow[] }>("/admin/tenants")).tenants
        : [],
    [me.data?.user.isSuperadmin],
  );
  const [creating, setCreating] = useState(false);

  if (me.loading) return <Spinner />;
  if (me.error?.status === 401) return <Navigate to="/login" replace />;
  if (me.error || !me.data)
    return <ErrorBox message={me.error?.message ?? "Onbekende fout"} onRetry={me.reload} />;

  const isSuper = me.data.user.isSuperadmin;
  const rows: { slug: string; name: string; sub: string }[] = isSuper
    ? (all.data ?? []).map((t) => ({
        slug: t.slug,
        name: t.name,
        sub: TYPE_LABELS[t.type] ?? t.type,
      }))
    : me.data.tenants.map((t) => ({ slug: t.slug, name: t.name, sub: "Jouw zaak" }));

  async function logout() {
    await api("/auth/logout", { method: "POST", body: {} });
    navigate("/login");
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>{isSuper ? "Alle zaken" : "Kies een zaak"}</h1>
        <button type="button" className="btn sm ghost" onClick={logout}>
          Uitloggen
        </button>
      </header>
      <main className="content">
        {rows.length === 0 && (
          <div className="empty">
            <h2>Nog geen zaken</h2>
            <p>
              {isSuper ? "Maak de eerste klant aan." : "Je bent nog niet aan een zaak gekoppeld."}
            </p>
          </div>
        )}
        {rows.map((t) => (
          <Link
            key={t.slug}
            to={`/t/${t.slug}`}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="row">
              <div className="grow">
                <div className="t">{t.name}</div>
                <div className="s">
                  {t.sub} · {t.slug}
                </div>
              </div>
              <span aria-hidden>›</span>
            </div>
          </Link>
        ))}
      </main>
      {isSuper && (
        <button
          type="button"
          className="fab"
          aria-label="Nieuwe zaak"
          onClick={() => setCreating(true)}
        >
          +
        </button>
      )}
      {creating && (
        <NewTenant
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            all.reload();
          }}
        />
      )}
    </div>
  );
}

function NewTenant({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState("restaurant");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/admin/tenants", { method: "POST", body: { name, slug, type, ownerEmail } });
      toast(`${name} is aangemaakt, de eigenaar krijgt een mail`);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aanmaken mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Nieuwe zaak" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="tn">
            Naam van de zaak
          </label>
          <input
            id="tn"
            className="input"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="ts">
            Korte naam (voor de URL)
          </label>
          <input
            id="ts"
            className="input"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="tt">
            Soort zaak
          </label>
          <select id="tt" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {TENANT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="to">
            E-mail van de eigenaar
          </label>
          <input
            id="to"
            className="input"
            type="email"
            required
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
          />
          <span className="hint">De eigenaar krijgt direct een inloglink.</span>
        </div>
        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? "Aanmaken…" : "Zaak aanmaken"}
        </button>
      </form>
    </Sheet>
  );
}
