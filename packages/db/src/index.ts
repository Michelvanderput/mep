import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

/** Driver-onafhankelijk type: werkt met postgres-js (productie) en PGlite (tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string): Database {
  const client = postgres(url, { max: 10 });
  return drizzlePg(client, { schema });
}
