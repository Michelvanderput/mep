import { ALLERGENS, DIETS, formatPrice, parsePriceToCents } from "@mep/schemas";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, useLoad } from "../api";
import { PhotoPicker } from "../components/PhotoPicker";
import { ErrorBox, Spinner, useToast } from "../components/ui";
import { photoUrl } from "../photos";
import type { MenuItemRow } from "./Menu";
import { useTenant } from "./TenantShell";

interface Loaded {
  item: MenuItemRow & { sectionId: string };
  sections: { id: string; name: string; menuName: string }[];
}

export function ItemEditor() {
  const { id = "" } = useParams();
  const isNew = id === "nieuw";
  const [params] = useSearchParams();
  const { slug } = useTenant();
  const toast = useToast();
  const navigate = useNavigate();
  const back = `/t/${slug}/kaart`;

  const { data, error, loading, reload } = useLoad(async () => {
    if (!isNew) return api<Loaded>(`/t/${slug}/items/${id}`);
    const { menus } = await api<{
      menus: { name: string; sections: { id: string; name: string }[] }[];
    }>(`/t/${slug}/menus`);
    return {
      item: null,
      sections: menus.flatMap((m) =>
        m.sections.map((s) => ({ id: s.id, name: s.name, menuName: m.name })),
      ),
    } as unknown as Loaded;
  }, [slug, id]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [diets, setDiets] = useState<string[]>([]);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!data) return;
    const i = data.item;
    setName(i?.name ?? "");
    setDescription(i?.description ?? "");
    setPrice(i ? (i.priceCents / 100).toFixed(2).replace(".", ",") : "");
    setSectionId(i?.sectionId ?? params.get("sectie") ?? data.sections[0]?.id ?? "");
    setAllergens(i?.allergens ?? []);
    setDiets(i?.diets ?? []);
    setMediaId(i?.mediaId ?? null);
  }, [data, params]);

  if (loading) return <Spinner />;
  if (error || !data)
    return <ErrorBox message={error?.message ?? "Onbekende fout"} onRetry={reload} />;

  const flip = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parsePriceToCents(price);
    if (!name.trim()) return setProblem("Geef het gerecht een naam");
    if (cents === null) return setProblem("Vul een prijs in, bijvoorbeeld 14,50");
    setProblem("");
    setBusy(true);
    try {
      const body = { name, description, priceCents: cents, allergens, diets, sectionId, mediaId };
      if (isNew) await api(`/t/${slug}/sections/${sectionId}/items`, { method: "POST", body });
      else await api(`/t/${slug}/items/${id}`, { method: "PATCH", body });
      toast(isNew ? `${name} is toegevoegd` : "Opgeslagen");
      navigate(back);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Opslaan mislukt");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/t/${slug}/items/${id}`, { method: "DELETE" });
      toast(`${name} is verwijderd`);
      navigate(back);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Verwijderen mislukt", true);
      setBusy(false);
    }
  }

  const priceCents = parsePriceToCents(price);
  return (
    <>
      <header className="topbar">
        <Link to={back} className="iconbtn" aria-label="Terug naar kaart">
          ‹
        </Link>
        <h1>{isNew ? "Nieuw gerecht" : "Gerecht bewerken"}</h1>
      </header>
      <form onSubmit={save} id="item-form">
        <main className="content">
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
          <div className="field">
            <label className="label" htmlFor="name">
              Naam
            </label>
            <input
              id="name"
              className="input"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              autoFocus={isNew}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="desc">
              Omschrijving
            </label>
            <textarea
              id="desc"
              className="input"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bijvoorbeeld: met mierikswortelcrème en rode biet"
            />
          </div>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="field grow">
              <label className="label" htmlFor="price">
                Prijs
              </label>
              <input
                id="price"
                className="input"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="14,50"
              />
              <span className="hint">
                {priceCents !== null ? formatPrice(priceCents) : "Typ 14,50 of 14.50"}
              </span>
            </div>
            <div className="field grow">
              <label className="label" htmlFor="sec">
                Categorie
              </label>
              <select
                id="sec"
                className="input"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                {data.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.menuName} · {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>
              Allergenen
            </legend>
            <div className="chips">
              {ALLERGENS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="chip allergen"
                  aria-pressed={allergens.includes(a.id)}
                  onClick={() => setAllergens(flip(allergens, a.id))}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <span className="hint">
              Vink alles aan wat erin zit. Zit er niets in, laat dan alles leeg: je bevestigt dat
              met Opslaan.
            </span>
          </fieldset>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>
              Dieet
            </legend>
            <div className="chips">
              {DIETS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="chip"
                  aria-pressed={diets.includes(d.id)}
                  onClick={() => setDiets(flip(diets, d.id))}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </fieldset>
          {problem && (
            <div className="err" role="alert">
              {problem}
            </div>
          )}
          {!isNew && (
            <div className="stack" style={{ marginTop: 8 }}>
              {confirmDelete ? (
                <div className="card">
                  <p className="t">{name} definitief verwijderen?</p>
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
                  Gerecht verwijderen
                </button>
              )}
            </div>
          )}
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
          suggestedAlt={name}
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
