import { serve } from "@hono/node-server";
import { createDb } from "@mep/db";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { consoleMailer } from "./mailer";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ontbreekt (zie .env.example)");

const app = createApp({ db: createDb(url), mailer: consoleMailer, config: loadConfig() });
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () =>
  console.log(`MEP API luistert op http://localhost:${port}`),
);
