import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createRuntime } from "./runtime";

// Op Vercel staat de API onder /api (zelfde origin als de beheer-app, dus cookies werken).
const root = new Hono().basePath("/api");

// Een fout bij het opstarten (bv. ontbrekende DATABASE_URL) geven we als leesbare melding terug in
// plaats van de functie te laten crashen met alleen "FUNCTION_INVOCATION_FAILED".
let initError: Error | null = null;
try {
  root.route("/", createRuntime());
} catch (err) {
  initError = err instanceof Error ? err : new Error(String(err));
  console.error("MEP kon niet starten:", initError);
}

// Klassieke Node-handler (req, res): werkt met de Vercel Node-launcher zonder aannames over web-handlers.
export default getRequestListener(async (request) =>
  initError
    ? Response.json(
        { error: "De server is niet goed ingesteld", detail: initError.message },
        { status: 503 },
      )
    : root.fetch(request),
);
