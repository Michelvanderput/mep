import { useRef, useState } from "react";
import { api, useLoad } from "../api";
import { ErrorBox, Sheet, Spinner, useToast } from "../components/ui";
import { type Media, photoUrl, uploadPhoto } from "../photos";
import { useTenant } from "./TenantShell";

export function Photos() {
  const { slug } = useTenant();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => api<{ media: Media[] }>(`/t/${slug}/media`),
    [slug],
  );
  const [open, setOpen] = useState<Media | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let failed = 0;
    for (const f of Array.from(files)) {
      try {
        await uploadPhoto(slug, f, "");
      } catch (e) {
        failed++;
        toast(e instanceof Error ? e.message : "Uploaden mislukt", true);
      }
    }
    setBusy(false);
    if (failed < files.length)
      toast(files.length === 1 ? "Foto toegevoegd" : `${files.length - failed} foto's toegevoegd`);
    if (input.current) input.current.value = "";
    reload();
  }

  return (
    <>
      <header className="topbar">
        <h1>Foto's</h1>
      </header>
      <main className="content">
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        {loading && <Spinner />}
        {error && <ErrorBox message={error.message} onRetry={reload} />}
        {data && data.media.length === 0 && (
          <div className="empty">
            <h2>Nog geen foto's</h2>
            <p>
              Voeg foto's toe van je gerechten, zaal en terras. Ze worden automatisch verkleind en
              geschikt gemaakt voor je website.
            </p>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              Eerste foto toevoegen
            </button>
          </div>
        )}
        {data && data.media.length > 0 && (
          <div className="photogrid">
            {data.media.map((m) => (
              <button
                type="button"
                key={m.id}
                className="photo"
                onClick={() => setOpen(m)}
                aria-label={m.alt || "Foto zonder beschrijving"}
              >
                <img
                  src={photoUrl(m.id)}
                  alt=""
                  loading="lazy"
                  style={{ objectPosition: `${m.focusX * 100}% ${m.focusY * 100}%` }}
                />
                {!m.alt && <span className="pill warn">Beschrijving?</span>}
              </button>
            ))}
          </div>
        )}
        {busy && (
          <p className="s" role="status">
            Foto's uploaden…
          </p>
        )}
      </main>
      {data && data.media.length > 0 && (
        <button
          type="button"
          className="fab"
          aria-label="Foto's toevoegen"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          +
        </button>
      )}
      {open && (
        <PhotoSheet
          media={open}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function PhotoSheet({
  media,
  onClose,
  onChanged,
}: {
  media: Media;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { slug } = useTenant();
  const toast = useToast();
  const [alt, setAlt] = useState(media.alt);
  const [focus, setFocus] = useState({ x: media.focusX, y: media.focusY });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  function pick(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setFocus({
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
  }

  async function save() {
    setBusy(true);
    try {
      await api(`/t/${slug}/media/${media.id}`, {
        method: "PATCH",
        body: { alt, focusX: focus.x, focusY: focus.y },
      });
      toast("Foto opgeslagen");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Opslaan mislukt", true);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/t/${slug}/media/${media.id}`, { method: "DELETE" });
      toast("Foto verwijderd");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Verwijderen mislukt", true);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Foto" onClose={onClose}>
      <div className="focus-wrap" onClick={pick} role="presentation">
        <img src={photoUrl(media.id, 800)} alt="" />
        <span
          className="focus-dot"
          style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
        />
      </div>
      <span className="hint">
        Tik op het belangrijkste deel van de foto. Dat blijft zichtbaar als de foto wordt
        bijgesneden.
      </span>
      <div className="field">
        <label className="label" htmlFor="palt">
          Beschrijving
        </label>
        <input
          id="palt"
          className="input"
          value={alt}
          maxLength={200}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Bijvoorbeeld: terras aan het water bij zonsondergang"
        />
      </div>
      <div className="s">
        {media.width} × {media.height} px ·{" "}
        {media.usedBy > 0
          ? `in gebruik bij ${media.usedBy} ${media.usedBy === 1 ? "gerecht" : "gerechten"}`
          : "nergens in gebruik"}
      </div>
      <button type="button" className="btn primary block" disabled={busy} onClick={save}>
        Opslaan
      </button>
      {confirm ? (
        <div className="card">
          <p className="t">
            {media.usedBy > 0
              ? "Deze foto verdwijnt ook bij de gerechten waar hij gebruikt wordt. Verwijderen?"
              : "Foto definitief verwijderen?"}
          </p>
          <div className="row">
            <button type="button" className="btn danger grow" disabled={busy} onClick={remove}>
              Ja, verwijderen
            </button>
            <button type="button" className="btn grow" onClick={() => setConfirm(false)}>
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn danger block" onClick={() => setConfirm(true)}>
          Foto verwijderen
        </button>
      )}
    </Sheet>
  );
}
