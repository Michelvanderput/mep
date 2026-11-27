import type { Role } from "@mep/schemas";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, useLoad } from "../api";
import { ErrorBox, Sheet, Spinner, useToast } from "../components/ui";
import { useTenant } from "./TenantShell";

interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  isYou: boolean;
}

export const ROLE_INFO: Record<Role, { label: string; text: string }> = {
  owner: { label: "Eigenaar", text: "Alles, inclusief het team beheren." },
  manager: { label: "Manager", text: "Alles, behalve het team beheren." },
  kitchen: { label: "Keuken", text: "Kaart, specials en foto's. Ziet geen berichten of tijden." },
  staff: { label: "Medewerker", text: "Inbox, evenementen, pagina's en foto's." },
};
const ROLE_ORDER: Role[] = ["owner", "manager", "kitchen", "staff"];

export function Team() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(
    () => api<{ team: Member[] }>(`/t/${slug}/team`),
    [slug],
  );
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  return (
    <>
      <header className="topbar">
        <Link to={`/t/${slug}/meer`} className="iconbtn" aria-label="Terug">
          ‹
        </Link>
        <h1>Team en rollen</h1>
      </header>
      <main className="content">
        {loading && <Spinner />}
        {error && <ErrorBox message={error.message} onRetry={reload} />}
        {data?.team.map((m) => (
          <button
            key={m.userId}
            type="button"
            className="card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => setEditing(m)}
          >
            <div className="row">
              <div className="grow">
                <div className="t">
                  {m.name ?? m.email}
                  {m.isYou ? " (jij)" : ""}
                </div>
                <div className="s">
                  {m.name ? `${m.email} · ` : ""}
                  {ROLE_INFO[m.role].label}
                </div>
              </div>
              <span aria-hidden>›</span>
            </div>
          </button>
        ))}
        <section className="card" aria-label="Uitleg rollen">
          <div className="label">Wat mag wie?</div>
          {ROLE_ORDER.map((r) => (
            <div key={r} className="s">
              <b>{ROLE_INFO[r].label}:</b> {ROLE_INFO[r].text}
            </div>
          ))}
        </section>
      </main>
      <button
        type="button"
        className="fab"
        aria-label="Teamlid toevoegen"
        onClick={() => setAdding(true)}
      >
        +
      </button>
      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {editing && (
        <EditSheet
          member={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function RoleChips({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="Rol">
        {ROLE_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            className="chip"
            aria-pressed={value === r}
            onClick={() => onChange(r)}
          >
            {ROLE_INFO[r].label}
          </button>
        ))}
      </div>
      <span className="hint">{ROLE_INFO[value].text}</span>
    </div>
  );
}

function AddSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { slug } = useTenant();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/t/${slug}/team`, {
        method: "POST",
        body: { email, name: name || undefined, role },
      });
      toast(`Uitnodiging verstuurd naar ${email}`);
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Uitnodigen mislukt", true);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Teamlid toevoegen" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="tm-n">
            Naam (optioneel)
          </label>
          <input
            id="tm-n"
            className="input"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="tm-e">
            E-mailadres
          </label>
          <input
            id="tm-e"
            className="input"
            type="email"
            inputMode="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="hint">Diegene krijgt een mail met een inloglink.</span>
        </div>
        <RoleChips value={role} onChange={setRole} />
        <button type="submit" className="btn primary block" disabled={busy || !email.trim()}>
          Uitnodigen
        </button>
      </form>
    </Sheet>
  );
}

function EditSheet({
  member,
  onClose,
  onDone,
}: {
  member: Member;
  onClose: () => void;
  onDone: () => void;
}) {
  const { slug } = useTenant();
  const toast = useToast();
  const [role, setRole] = useState<Role>(member.role);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Opslaan mislukt", true);
      setBusy(false);
    }
  }

  return (
    <Sheet title={member.name ?? member.email} onClose={onClose}>
      <RoleChips value={role} onChange={setRole} />
      <button
        type="button"
        className="btn primary block"
        disabled={busy || role === member.role}
        onClick={() =>
          run(
            () => api(`/t/${slug}/team/${member.userId}`, { method: "PATCH", body: { role } }),
            "Rol aangepast",
          )
        }
      >
        Rol opslaan
      </button>
      {confirm ? (
        <div className="card">
          <p className="t">
            {member.isYou
              ? "Jezelf uit het team halen? Je verliest direct toegang."
              : `${member.name ?? member.email} uit het team halen?`}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn danger grow"
              disabled={busy}
              onClick={() =>
                run(
                  () => api(`/t/${slug}/team/${member.userId}`, { method: "DELETE" }),
                  "Teamlid verwijderd",
                )
              }
            >
              Ja, verwijderen
            </button>
            <button type="button" className="btn grow" onClick={() => setConfirm(false)}>
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn danger block" onClick={() => setConfirm(true)}>
          Uit team halen
        </button>
      )}
    </Sheet>
  );
}
