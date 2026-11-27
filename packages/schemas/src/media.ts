import { z } from "zod";

/** Breedtes (px) waarin elke foto wordt opgeslagen. Websites kiezen er een via srcset. */
export const MEDIA_WIDTHS = [400, 800, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** Vercel Functions accepteren max. 4,5 MB per request; de app verkleint foto's vooraf in de browser. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const mediaPatchSchema = z.object({
  alt: z.string().trim().max(200).optional(),
  /** Focuspunt als fractie van de breedte/hoogte (0 = links/boven, 1 = rechts/onder). */
  focusX: z.number().min(0).max(1).optional(),
  focusY: z.number().min(0).max(1).optional(),
});

/** Publieke URL van een foto, relatief aan de API-root. */
export const mediaPath = (id: string, width: MediaWidth) => `/media/${id}/${width}.webp`;
