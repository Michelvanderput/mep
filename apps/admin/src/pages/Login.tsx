import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/request", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versturen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <div className="brand">Mis en place</div>
      {sent ? (
        <div className="stack" role="status">
          <h1 className="big">Check je mail</h1>
          <p className="muted">
            Als {email} bij ons bekend is, hebben we een inloglink gestuurd. De link is 15 minuten
            geldig en werkt één keer.
          </p>
          <button type="button" className="btn" onClick={() => setSent(false)}>
            Ander e-mailadres
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <h1 className="big">Inloggen</h1>
          <p className="muted">
            Vul je e-mailadres in. Je krijgt een link waarmee je direct inlogt, een wachtwoord is
            niet nodig.
          </p>
          <div className="field">
            <label className="label" htmlFor="email">
              E-mailadres
            </label>
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@restaurant.nl"
            />
          </div>
          {error && (
            <div className="err" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? "Versturen…" : "Stuur inloglink"}
          </button>
        </form>
      )}
    </main>
  );
}

export function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode: token mag maar één keer ingewisseld worden
    started.current = true;
    const token = params.get("token") ?? "";
    api("/auth/verify", { method: "POST", body: { token } })
      .then(() => navigate("/", { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : "Inloggen mislukt"));
  }, [params, navigate]);

  return (
    <main className="center">
      <div className="brand">Mis en place</div>
      {error ? (
        <div className="stack" role="alert">
          <h1 className="big">Deze link werkt niet meer</h1>
          <p className="muted">{error}. Vraag een nieuwe link aan.</p>
          <button type="button" className="btn primary" onClick={() => navigate("/login")}>
            Nieuwe link aanvragen
          </button>
        </div>
      ) : (
        <p className="muted" role="status">
          Je wordt ingelogd…
        </p>
      )}
    </main>
  );
}
