import { LOCALE_INFO, type LocaleId } from "@mep/schemas";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, useLoad } from "../api";
import { ErrorBox, Sheet, Spinner, useToast } from "../components/ui";
import { useTenant } from "./TenantShell";

interface Field {
  key: string;
  label: string;
  source: string;
  value: string;
  multiline: boolean;
}
interface Entry {
  entity: string;
  entityId: string;
  group: string;
  title: string;
  context?: string;
  fields: Field[];
}
interface Data {
  locale: string;
  locales: string[];
  entries: Entry[];
  total: number;
  missing: number;
}

const OPTIONAL: LocaleId[] = ["en", "de", "fr"];

export function Translations() {
  const { slug, can } = useTenant();
  const toast = useToast();
  const tenantInfo = useLoad(() => api<{ locales: string[] }>(`/public/${slug}/info`), [slug]);
  const [locale, setLocale] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [picking, setPicking] = useState(false);

  const locales = tenantInfo.data?.locales.filter((l) => l !== "nl") ?? [];
  useEffect(() => {
    if (!locale && locales[0]) setLocale(locales[0]);
    if (locale && tenantInfo.data && !locales.includes(locale)) setLocale(locales[0] ?? null);
  }, [locale, locales, tenantInfo.data]);

  const { data, error, loading, reload } = useLoad(
    async () => (locale ? await api<Data>(`/t/${slug}/translations?locale=${locale}`) : null),
    [slug, locale],
  );

  const groups = useMemo(() => {
    const out = new Map<string, Entry[]>();
    for (const e of data?.entries ?? []) {
      if (onlyMissing && e.fields.every((f) => f.value.trim())) continue;
      out.set(e.group, [...(out.get(e.group) ?? []), e]);
    }
    return [...out.entries()];
  }, [data, onlyMissing]);

  async function saveEntry(e: Entry, values: Record<string, string>) {
    try {
      await api(`/t/${slug}/translations`, {
        method: "PUT",
        body: { locale, entity: e.entity, entityId: e.entityId, fields: values },
      });
      toast("Vertaling opgeslagen");
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Opslaan mislukt", true);
    }
  }

  if (tenantInfo.loading) return <Spinner />;
  return (
    <>
      <header className="topbar">
        <Link to={`/t/${slug}/meer`} className="iconbtn" aria-label="Terug">
          ‹
        </Link>
        <h1>Vertalingen</h1>
      </header>
      <main className="content">
        <div className="chips" role="tablist" aria-label="Taal">
          {locales.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              className="chip"
              aria-pressed={locale === l}
              onClick={() => setLocale(l)}
            >
              {LOCALE_INFO[l as LocaleId]?.name ?? l}
            </button>
          ))}
          {can("settings") && (
            <button type="button" className="chip" onClick={() => setPicking(true)}>
              {locales.length === 0 ? "+ Taal toevoegen" : "Talen beheren"}
            </button>
          )}
        </div>

        {locales.length === 0 && (
          <div className="empty">
            <h2>Je site is nog in één taal</h2>
            <p>
              Zet een extra taal aan, bijvoorbeeld Engels voor toeristen. Daarna vul je de
              vertalingen hier in.
            </p>
            {can("settings") ? (
              <button type="button" className="btn primary" onClick={() => setPicking(true)}>
                Taal toevoegen
              </button>
            ) : (
              <p className="s">Vraag de eigenaar om een taal aan te zetten.</p>
            )}
          </div>
        )}

        {locale && loading && <Spinner />}
        {error && <ErrorBox message={error.message} onRetry={reload} />}
        {data && (
          <>
            <section className="card hero" aria-label="Voortgang">
              <div className="t">
                {data.total - data.missing} van {data.total} teksten vertaald
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-valuenow={data.total - data.missing}
                aria-valuemin={0}
                aria-valuemax={data.total}
              >
                <span
                  style={{
                    width: `${data.total ? ((data.total - data.missing) / data.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="hint">
                Wat nog niet vertaald is, toont je site in het Nederlands.
              </span>
            </section>
            <div className="chips" role="group" aria-label="Filter">
              <button
                type="button"
                className="chip"
                aria-pressed={onlyMissing}
                onClick={() => setOnlyMissing(true)}
              >
                Alleen ontbrekend
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={!onlyMissing}
                onClick={() => setOnlyMissing(false)}
              >
                Alles
              </button>
            </div>
            {groups.length === 0 && (
              <div className="empty">
                <h2>Alles vertaald</h2>
                <p>
                  Er ontbreken geen vertalingen in het{" "}
                  {LOCALE_INFO[data.locale as LocaleId]?.name ?? data.locale}.
                </p>
              </div>
            )}
            {groups.map(([group, entries]) => (
              <section key={group} className="stack" aria-label={group}>
                <h2 className="label">{group}</h2>
                {entries.map((e) => (
                  <EntryCard
                    key={`${e.entity}:${e.entityId}:${locale}`}
                    entry={e}
                    onSave={(v) => saveEntry(e, v)}
                  />
                ))}
              </section>
            ))}
          </>
        )}
      </main>
      {picking && tenantInfo.data && (
        <LocalesSheet
          enabled={tenantInfo.data.locales}
          onClose={() => setPicking(false)}
          onDone={() => {
            setPicking(false);
            tenantInfo.reload();
          }}
        />
      )}
      <style>{`.progress{height:8px;border-radius:99px;background:var(--fill2);overflow:hidden}.progress span{display:block;height:100%;background:var(--accent)}.src{background:var(--fill);border-radius:10px;padding:8px 10px;font-size:14px;white-space:pre-wrap}`}</style>
    </>
  );
}

function EntryCard({
  entry,
  onSave,
}: {
  entry: Entry;
  onSave: (values: Record<string, string>) => void;
}) {
  const [vals, setVals] = useState(() =>
    Object.fromEntries(entry.fields.map((f) => [f.key, f.value])),
  );
  const dirty = entry.fields.some((f) => (vals[f.key] ?? "") !== f.value);
  const done = entry.fields.every((f) => f.value.trim());
  return (
    <div className="card">
      <div className="row">
        <div className="grow">
          <div className="t">{entry.title}</div>
          {entry.context && <div className="s">{entry.context}</div>}
        </div>
        <span className={`pill ${done ? "ok" : "warn"}`}>{done ? "Vertaald" : "Ontbreekt"}</span>
      </div>
      {entry.fields.map((f) => {
        const id = `tr-${entry.entity}-${entry.entityId}-${f.key}`;
        return (
          <div className="field" key={f.key}>
            <label className="label" htmlFor={id}>
              {f.label}
            </label>
            <div className="src" aria-label={`Nederlands: ${f.source}`}>
              {f.source}
            </div>
            {f.multiline ? (
              <textarea
                id={id}
                className="input"
                value={vals[f.key] ?? ""}
                maxLength={3000}
                onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
              />
            ) : (
              <input
                id={id}
                className="input"
                value={vals[f.key] ?? ""}
                maxLength={3000}
                onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
              />
            )}
          </div>
        );
      })}
      <button type="button" className="btn primary" disabled={!dirty} onClick={() => onSave(vals)}>
        Opslaan
      </button>
    </div>
  );
}

function LocalesSheet({
  enabled,
  onClose,
  onDone,
}: {
  enabled: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { slug } = useTenant();
  const toast = useToast();
  const [on, setOn] = useState<string[]>(enabled);
  const [busy, setBusy] = useState(false);
  const flip = (l: string) =>
    setOn((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  async function save() {
    setBusy(true);
    try {
      await api(`/t/${slug}/locales`, {
        method: "PUT",
        body: { locales: ["nl", ...on.filter((l) => l !== "nl")] },
      });
      toast("Talen opgeslagen");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Opslaan mislukt", true);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Talen van je site" onClose={onClose}>
      <p className="s">Nederlands staat altijd aan. Kies welke talen erbij komen.</p>
      <div className="chips" role="group" aria-label="Talen">
        <button type="button" className="chip" aria-pressed disabled>
          Nederlands
        </button>
        {OPTIONAL.map((l) => (
          <button
            key={l}
            type="button"
            className="chip"
            aria-pressed={on.includes(l)}
            onClick={() => flip(l)}
          >
            {LOCALE_INFO[l].name}
          </button>
        ))}
      </div>
      <span className="hint">
        Een taal uitzetten verwijdert de vertalingen niet; ze staan klaar als je hem weer aanzet.
      </span>
      <button type="button" className="btn primary block" disabled={busy} onClick={save}>
        Opslaan
      </button>
    </Sheet>
  );
}
