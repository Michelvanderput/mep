import { Hono } from "hono";
import { createRuntime } from "./runtime";

// Op Vercel staat de API onder /api (zelfde origin als de beheer-app, dus cookies werken).
const root = new Hono().basePath("/api");
root.route("/", createRuntime());

export default { fetch: root.fetch };
