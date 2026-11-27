import { serve } from "@hono/node-server";
import { createRuntime } from "./runtime";

const app = createRuntime();
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () =>
  console.log(`MEP API luistert op http://localhost:${port}`),
);
