import { useRef, useState } from "react";
import { api, useLoad } from "../api";
import { type Media, photoUrl, uploadPhoto } from "../photos";
import { Sheet, Spinner, useToast } from "./ui";

/** Foto kiezen uit de bibliotheek of een nieuwe maken/kiezen. Geeft de gekozen foto terug. */
export function PhotoPicker({
  slug,
  suggestedAlt,
  onPick,
  onClose,
}: {
  slug: string;
  suggestedAlt: string;
  onPick: (m: Media) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data, loading } = useLoad(() => api<{ media: Media[] }>(`/t/${slug}/media`), [slug]);
  const [alt, setAlt] = useState(suggestedAlt ? `Bord met ${suggestedAlt.toLowerCase()}` : "");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onPick(await uploadPhoto(slug, file, alt));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Uploaden mislukt", true);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Foto kiezen" onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="alt">
          Beschrijving van de foto
        </label>
        <input
          id="alt"
          className="input"
          value={alt}
          maxLength={200}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Bijvoorbeeld: bord met gerookte paling"
        />
        <span className="hint">Voor slechtzienden en Google. Je kunt dit later aanpassen.</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        className="btn primary block"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Uploaden…" : "Foto maken of kiezen"}
      </button>
      {loading && <Spinner />}
      {data && data.media.length > 0 && (
        <>
          <span className="label">Of kies een bestaande foto</span>
          <div className="photogrid">
            {data.media.map((m) => (
              <button
                type="button"
                key={m.id}
                className="photo"
                onClick={() => onPick(m)}
                aria-label={m.alt || "Foto zonder beschrijving"}
              >
                <img
                  src={photoUrl(m.id)}
                  alt=""
                  loading="lazy"
                  style={{ objectPosition: `${m.focusX * 100}% ${m.focusY * 100}%` }}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
