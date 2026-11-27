import { DIETS, formatPrice } from "@mep/schemas";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, useLoad } from "../api";
import { ErrorBox, Sheet, Spinner, Switch, useToast } from "../components/ui";
import { useTenant } from "./TenantShell";

export interface MenuItemRow {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  allergens: string[];
  allergensChecked: boolean;
  diets: string[];
  unavailable: boolean;
  soldOut: boolean;
  soldOutUntil: string | null;
}
interface Section {
  id: string;
  name: string;
  items: MenuItemRow[];
}
interface MenuData {
  menus: { id: string; name: string; sections: Section[] }[];
}

const dietLabel = (id: string) => DIETS.find((d) => d.id === id)?.label ?? id;
const tomorrow = () =>
  new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

export function Menu() {
  const { slug } = useTenant();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api<MenuData>(`/t/${slug}/menus`), [slug]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sorting, setSorting] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<
    | null
    | { kind: "menu" }
    | { kind: "section" }
    | { kind: "soldout"; item: MenuItemRow }
    | { kind: "rename"; section: Section }
  >(null);

  if (loading)
    return (
      <>
        <header className="topbar">
          <h1>Kaart</h1>
        </header>
        <Spinner />
      </>
    );
  if (error || !data)
    return (
      <>
        <header className="topbar">
          <h1>Kaart</h1>
        </header>
        <ErrorBox message={error?.message ?? "Onbekende fout"} onRetry={reload} />
      </>
    );

  const menu = data.menus.find((m) => m.id === activeId) ?? data.menus[0];

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast(ok);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Opslaan mislukt", true);
    }
  }

  const toggle = (item: MenuItemRow, available: boolean) =>
    available
      ? run(
          () =>
            api(`/t/${slug}/items/${item.id}/soldout`, {
              method: "POST",
              body: { soldOut: false },
            }),
          `${item.name} is weer beschikbaar`,
        )
      : setSheet({ kind: "soldout", item });

  const move = (section: Section, index: number, dir: -1 | 1) => {
    const ids = section.items.map((i) => i.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    run(() => api(`/t/${slug}/sections/${section.id}/order`, { method: "PUT", body: { ids } }));
  };

  async function newItem() {
    const section = menu?.sections[0];
    if (!section) return setSheet({ kind: "section" });
    navigate(`/t/${slug}/kaart/gerecht/nieuw?sectie=${section.id}`);
  }

  const needle = q.trim().toLowerCase();

  return (
    <>
      <header className="topbar">
        <h1>Kaart</h1>
        {menu && menu.sections.length > 0 && (
          <button
            type="button"
            className="btn sm"
            aria-pressed={sorting}
            onClick={() => setSorting(!sorting)}
          >
            {sorting ? "Klaar" : "Sorteren"}
          </button>
        )}
      </header>
      <main className="content">
        {data.menus.length === 0 ? (
          <div className="empty">
            <h2>Nog geen kaart</h2>
            <p>Begin met een kaart, bijvoorbeeld Diner of Lunch.</p>
            <button
              type="button"
              className="btn primary"
              onClick={() => setSheet({ kind: "menu" })}
            >
              Eerste kaart maken
            </button>
          </div>
        ) : (
          <>
            <div className="chips scroll" role="tablist" aria-label="Kaarten">
              {data.menus.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  className="chip"
                  aria-pressed={m.id === menu?.id}
                  onClick={() => setActiveId(m.id)}
                >
                  {m.name}
                </button>
              ))}
              <button type="button" className="chip" onClick={() => setSheet({ kind: "menu" })}>
                + Kaart
              </button>
            </div>
            <input
              className="input"
              type="search"
              placeholder="Zoek een gerecht…"
              aria-label="Zoek een gerecht"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {menu && menu.sections.length === 0 && (
              <div className="empty">
                <h2>Nog geen categorieën</h2>
                <p>Deel {menu.name} in, bijvoorbeeld Voorgerechten en Hoofdgerechten.</p>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setSheet({ kind: "section" })}
                >
                  Categorie toevoegen
                </button>
              </div>
            )}
            {menu?.sections.map((section) => {
              const items = needle
                ? section.items.filter((i) => i.name.toLowerCase().includes(needle))
                : section.items;
              if (needle && items.length === 0) return null;
              const open = needle ? true : !collapsed[section.id];
              return (
                <section key={section.id} className="card" aria-label={section.name}>
                  <div className="row">
                    <button
                      type="button"
                      className="row grow"
                      style={{
                        background: "none",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      aria-expanded={open}
                      onClick={() => setCollapsed({ ...collapsed, [section.id]: open })}
                    >
                      <h2 className="t grow" style={{ fontSize: "1rem" }}>
                        {section.name} <span className="s">· {section.items.length}</span>
                      </h2>
                      <span aria-hidden>{open ? "⌃" : "⌄"}</span>
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`${section.name} hernoemen`}
                      onClick={() => setSheet({ kind: "rename", section })}
                    >
                      ✎
                    </button>
                  </div>
                  {open && (
                    <div>
                      {items.length === 0 && (
                        <p className="s">Nog geen gerechten in deze categorie.</p>
                      )}
                      {items.map((item, idx) => (
                        <div key={item.id} className={`item${item.unavailable ? " off" : ""}`}>
                          {sorting && (
                            <div className="stack" style={{ gap: 2 }}>
                              <button
                                type="button"
                                className="iconbtn"
                                style={{ minHeight: 30 }}
                                aria-label={`${item.name} omhoog`}
                                disabled={idx === 0}
                                onClick={() => move(section, idx, -1)}
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                className="iconbtn"
                                style={{ minHeight: 30 }}
                                aria-label={`${item.name} omlaag`}
                                disabled={idx === items.length - 1}
                                onClick={() => move(section, idx, 1)}
                              >
                                ▼
                              </button>
                            </div>
                          )}
                          <Link className="main" to={`/t/${slug}/kaart/gerecht/${item.id}`}>
                            <div className="t">{item.name}</div>
                            <div className="s">
                              {formatPrice(item.priceCents)}
                              {item.diets.map((d) => (
                                <span key={d} className="pill" style={{ marginLeft: 6 }}>
                                  {dietLabel(d)}
                                </span>
                              ))}
                              {!item.allergensChecked && (
                                <span className="pill warn" style={{ marginLeft: 6 }}>
                                  Allergenen?
                                </span>
                              )}
                              {item.unavailable && (
                                <span className="pill warn" style={{ marginLeft: 6 }}>
                                  {item.soldOutUntil
                                    ? `Op tot ${item.soldOutUntil.slice(8)}-${item.soldOutUntil.slice(5, 7)}`
                                    : "Op"}
                                </span>
                              )}
                            </div>
                          </Link>
                          {!sorting && (
                            <Switch
                              checked={!item.unavailable}
                              onChange={(v) => toggle(item, v)}
                              label={`${item.name} beschikbaar`}
                            />
                          )}
                        </div>
                      ))}
                      {!sorting && (
                        <Link
                          className="btn sm ghost"
                          to={`/t/${slug}/kaart/gerecht/nieuw?sectie=${section.id}`}
                        >
                          + Gerecht in {section.name}
                        </Link>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
            {menu && menu.sections.length > 0 && (
              <button type="button" className="btn" onClick={() => setSheet({ kind: "section" })}>
                + Categorie
              </button>
            )}
          </>
        )}
      </main>
      {menu && menu.sections.length > 0 && (
        <button type="button" className="fab" aria-label="Gerecht toevoegen" onClick={newItem}>
          +
        </button>
      )}

      {sheet?.kind === "menu" && (
        <NameSheet
          title="Nieuwe kaart"
          label="Naam van de kaart"
          placeholder="Bijvoorbeeld Lunch"
          onClose={() => setSheet(null)}
          onSave={(name) =>
            run(async () => {
              const r = await api<{ menu: { id: string } }>(`/t/${slug}/menus`, {
                method: "POST",
                body: { name },
              });
              setActiveId(r.menu.id);
              setSheet(null);
            })
          }
        />
      )}
      {sheet?.kind === "section" && menu && (
        <NameSheet
          title="Nieuwe categorie"
          label="Naam van de categorie"
          placeholder="Bijvoorbeeld Voorgerechten"
          onClose={() => setSheet(null)}
          onSave={(name) =>
            run(async () => {
              await api(`/t/${slug}/menus/${menu.id}/sections`, { method: "POST", body: { name } });
              setSheet(null);
            })
          }
        />
      )}
      {sheet?.kind === "rename" && (
        <NameSheet
          title="Categorie hernoemen"
          label="Naam"
          initial={sheet.section.name}
          onClose={() => setSheet(null)}
          onSave={(name) =>
            run(async () => {
              await api(`/t/${slug}/sections/${(sheet as { section: Section }).section.id}`, {
                method: "PATCH",
                body: { name },
              });
              setSheet(null);
            })
          }
        />
      )}
      {sheet?.kind === "soldout" && (
        <SoldOutSheet
          item={sheet.item}
          onClose={() => setSheet(null)}
          onSave={(until) =>
            run(async () => {
              await api(`/t/${slug}/items/${(sheet as { item: MenuItemRow }).item.id}/soldout`, {
                method: "POST",
                body: { soldOut: true, until },
              });
              setSheet(null);
            }, `${sheet.item.name} staat op uitverkocht`)
          }
        />
      )}
    </>
  );
}

function NameSheet({
  title,
  label,
  placeholder,
  initial = "",
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  placeholder?: string;
  initial?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSave(name.trim());
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="nm">
            {label}
          </label>
          <input
            id="nm"
            className="input"
            autoFocus
            value={name}
            maxLength={80}
            placeholder={placeholder}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="submit" className="btn primary block" disabled={!name.trim()}>
          Opslaan
        </button>
      </form>
    </Sheet>
  );
}

function SoldOutSheet({
  item,
  onSave,
  onClose,
}: {
  item: MenuItemRow;
  onSave: (until: string | null) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState(tomorrow());
  const [pick, setPick] = useState(false);
  return (
    <Sheet title={`${item.name} is op`} onClose={onClose}>
      <p className="s">Tot wanneer is het gerecht niet beschikbaar?</p>
      <button type="button" className="btn primary block" onClick={() => onSave(tomorrow())}>
        Alleen vandaag, morgen weer
      </button>
      <button type="button" className="btn block" onClick={() => onSave(null)}>
        Tot ik hem zelf terugzet
      </button>
      {pick ? (
        <div className="row">
          <input
            className="input"
            type="date"
            aria-label="Weer beschikbaar vanaf"
            min={tomorrow()}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button type="button" className="btn" onClick={() => onSave(custom)}>
            Kies
          </button>
        </div>
      ) : (
        <button type="button" className="btn ghost block" onClick={() => setPick(true)}>
          Kies een datum
        </button>
      )}
    </Sheet>
  );
}
