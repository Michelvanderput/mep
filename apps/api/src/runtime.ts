import { createDb } from "@mep/db";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { consoleMailer, resendMailer } from "./mailer";
import { blobStorage, diskStorage } from "./storage";

/** Bouwt de app uit omgevingsvariabelen. Gedeeld door de lokale server en Vercel. */
export function createRuntime(env: NodeJS.ProcessEnv = process.env) {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ontbreekt (zie .env.example)");

  const mailer = env.RESEND_API_KEY
    ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM ?? "Mis en place <no-reply@example.nl>")
    : consoleMailer;

  const storage = env.BLOB_READ_WRITE_TOKEN
    ? blobStorage(env.BLOB_READ_WRITE_TOKEN)
    : diskStorage(env.MEDIA_DIR ?? ".media");

  return createApp({ db: createDb(url), mailer, config: loadConfig(env), storage });
}
