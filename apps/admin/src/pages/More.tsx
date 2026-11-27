import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useTenant } from "./TenantShell";

const ROLE_NL = {
  owner: "Eigenaar",
  manager: "Manager",
  kitchen: "Keuken",
  staff: "Medewerker",
} as const;
const SOON = ["Evenementen", "Nieuws en acties", "Team en rollen", "Instellingen"];

export function More() {
  const { slug, name, role, me, can } = useTenant();
  const navigate = useNavigate();
  return (
    <>
      <header className="topbar">
        <h1>Meer</h1>
      </header>
      <main className="content">
        <section className="card">
          <div className="label">Ingelogd als</div>
          <div className="t">{me.user.name ?? me.user.email}</div>
          <div className="s">
            {me.user.email} · {ROLE_NL[role]} bij {name}
          </div>
        </section>
        {can("media") && (
          <Link
            to={`/t/${slug}/fotos`}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="row">
              <div className="grow">
                <div className="t">Foto's</div>
                <div className="s">Je fotobibliotheek, beschrijvingen en uitsnede</div>
              </div>
              <span aria-hidden>›</span>
            </div>
          </Link>
        )}
        {can("pages") && (
          <Link
            to={`/t/${slug}/paginas`}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="row">
              <div className="grow">
                <div className="t">Pagina's en teksten</div>
                <div className="s">Home, over ons, contact en eigen pagina's</div>
              </div>
              <span aria-hidden>›</span>
            </div>
          </Link>
        )}
        <section className="card" aria-label="Binnenkort">
          <div className="label">Binnenkort beschikbaar</div>
          {SOON.map((s) => (
            <div key={s} className="item">
              <span className="grow">{s}</span>
              <span className="pill">Binnenkort</span>
            </div>
          ))}
        </section>
        {(me.user.isSuperadmin || me.tenants.length > 1) && (
          <Link className="btn" to="/zaken">
            Naar andere zaak
          </Link>
        )}
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await api("/auth/logout", { method: "POST", body: {} });
            navigate("/login");
          }}
        >
          Uitloggen
        </button>
      </main>
    </>
  );
}
