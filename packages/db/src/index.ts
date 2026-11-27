import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

/** Driver-onafhankelijk type: werkt met postgres-js (productie) en PGlite (tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string): Database {
  // Op Vercel (serverless): 1 verbinding per instantie en geen prepared statements,
  // zodat een gepoolde verbinding (Neon/pgbouncer) werkt.
  const serverless = !!process.env.VERCEL;
  const client = postgres(
    url,
    serverless ? { max: 1, prepare: false, idle_timeout: 20 } : { max: 10 },
  );
  return drizzlePg(client, { schema });
}
