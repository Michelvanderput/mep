import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { del, head, list, put } from "@vercel/blob";

/** Bestandsopslag voor media. Productie: Vercel Blob; lokaal: schijf; tests: geheugen. */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  deletePrefix(prefix: string): Promise<void>;
  /** Optioneel: directe CDN-URL van een bestand (dan redirect de API in plaats van te streamen). */
  publicUrl?(key: string): Promise<string | null>;
}

export function memoryStorage(): Storage & { keys(): string[] } {
  const files = new Map<string, { data: Buffer; contentType: string }>();
  return {
    keys: () => [...files.keys()],
    async put(key, data, contentType) {
      files.set(key, { data, contentType });
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async deletePrefix(prefix) {
      for (const k of [...files.keys()]) if (k.startsWith(`${prefix}/`)) files.delete(k);
    },
  };
}

export function diskStorage(root: string): Storage {
  // Voorkom dat een sleutel buiten de root komt (bv. "../").
  const resolve = (key: string) => {
    const full = normalize(join(root, key));
    if (!full.startsWith(normalize(root) + sep)) throw new Error("Ongeldige opslagsleutel");
    return full;
  };
  return {
    async put(key, data) {
      const file = resolve(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async get(key) {
      try {
        return { data: await readFile(resolve(key)), contentType: "image/webp" };
      } catch {
        return null;
      }
    },
    async deletePrefix(prefix) {
      await rm(resolve(prefix), { recursive: true, force: true });
    },
  };
}

/** Vercel Blob (publiek leesbaar, via CDN). Vereist BLOB_READ_WRITE_TOKEN. */
export function blobStorage(token?: string): Storage {
  const publicUrl = async (key: string) => {
    try {
      return (await head(key, { token })).url;
    } catch {
      return null;
    }
  };
  return {
    async put(key, data, contentType) {
      await put(key, data, {
        access: "public",
        contentType,
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 31_536_000,
      });
    },
    async get(key) {
      const url = await publicUrl(key);
      if (!url) return null;
      const res = await fetch(url);
      return res.ok
        ? { data: Buffer.from(await res.arrayBuffer()), contentType: "image/webp" }
        : null;
    },
    async deletePrefix(prefix) {
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: `${prefix}/`, cursor, token });
        if (page.blobs.length > 0)
          await del(
            page.blobs.map((b) => b.url),
            { token },
          );
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
    },
    publicUrl,
  };
}
