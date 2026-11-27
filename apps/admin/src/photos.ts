import { type MediaWidth, mediaPath } from "@mep/schemas";

export interface Media {
  id: string;
  width: number;
  height: number;
  bytes: number;
  alt: string;
  focusX: number;
  focusY: number;
  createdAt: string;
  usedBy: number;
}

export const photoUrl = (id: string, width: MediaWidth = 400) => `/api${mediaPath(id, width)}`;

const MAX_SIDE = 2000;
const TARGET_BYTES = 3.5 * 1024 * 1024; // server accepteert max. 4 MB (Vercel-limiet)

/**
 * Verkleint een foto in de browser vóór het uploaden: telefoonfoto's zijn vaak 5-10 MB,
 * en de server accepteert er maximaal 4. Houdt de EXIF-rotatie aan.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= TARGET_BYTES) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.75, 0.62]) {
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", quality),
      );
      if (blob && blob.size <= TARGET_BYTES)
        return new File([blob], "foto.jpg", { type: "image/jpeg" });
    }
  } catch {
    // Niet te decoderen in de browser: de server geeft een duidelijke fout.
  }
  return file;
}

export async function uploadPhoto(slug: string, file: File, alt: string): Promise<Media> {
  const small = await shrinkPhoto(file);
  const form = new FormData();
  form.set("file", small);
  form.set("alt", alt);
  const res = await fetch(`/api/t/${slug}/media`, {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      typeof data?.error === "string" ? data.error : "Uploaden mislukt. Probeer het opnieuw.",
    );
  return data.media as Media;
}
