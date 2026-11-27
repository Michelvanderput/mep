import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./index";
import * as schema from "./schema";

/** Verse in-memory Postgres (PGlite) met alle migraties — voor tests. */
export async function createTestDb(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  return db as unknown as Database;
}
