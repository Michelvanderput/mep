import { MEDIA_WIDTHS } from "@mep/schemas";
import sharp from "sharp";

export class InvalidImageError extends Error {}

export interface ProcessedImage {
  width: number;
  height: number;
  variants: { width: number; data: Buffer }[];
}

const MAX_SIDE = 1600;

/**
 * Maakt van een upload een veilige set WebP-varianten: draait volgens EXIF,
 * verwijdert metadata (zoals GPS) en schaalt naar 400/800/1600 px breed.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  try {
    const base = await sharp(input, { limitInputPixels: 80_000_000, failOn: "error" })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    const variants = await Promise.all(
      MEDIA_WIDTHS.map(async (w) => ({
        width: w,
        data: await sharp(base.data)
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer(),
      })),
    );
    return { width: base.info.width, height: base.info.height, variants };
  } catch (err) {
    throw new InvalidImageError(err instanceof Error ? err.message : "Geen geldige afbeelding");
  }
}
