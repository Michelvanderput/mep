/**
 * Bouwt het hele platform als Vercel "Build Output" (.vercel/output):
 *  - de beheer-app (Vite) als statische bestanden, met SPA-fallback
 *  - de API als één Node-functie op /api (gebundeld met esbuild; sharp als native module meegekopieerd)
 *  - in productie: databasemigraties uitvoeren
 */
import { execSync } from "node:child_process";
import { cp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { build } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, ".vercel/output");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

if (process.env.VERCEL_ENV === "production" && process.env.DATABASE_URL) {
  console.log("→ Databasemigraties");
  run("pnpm db:migrate");
}

console.log("→ Beheer-app bouwen");
run("pnpm --filter @mep/admin build");

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "static"), { recursive: true });
await cp(join(root, "apps/admin/dist"), join(out, "static"), { recursive: true });

console.log("→ API bundelen");
const fn = join(out, "functions/api.func");
await mkdir(fn, { recursive: true });
await build({
  entryPoints: [join(root, "apps/api/src/vercel.ts")],
  outfile: join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["sharp"],
  // Sommige CJS-pakketten verwachten require() in een ESM-bundel.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "warning",
});

// sharp bevat native binaries: kopieer sharp met zijn afhankelijkheden (@img/*) mee.
const req = createRequire(join(root, "apps/api/package.json"));
// sharp exporteert package.json niet: loop vanaf het hoofdbestand omhoog naar de map "sharp".
let sharpDir = dirname(await realpath(req.resolve("sharp")));
while (!sharpDir.endsWith(`${sep}sharp`)) sharpDir = dirname(sharpDir);
const siblings = dirname(sharpDir); // .../node_modules met sharp, @img/*, color, detect-libc, ...
await cp(siblings, join(fn, "node_modules"), { recursive: true, dereference: true });

await writeFile(join(fn, "package.json"), JSON.stringify({ type: "module" }));
await writeFile(
  join(fn, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs22.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
    maxDuration: 30,
  }),
);

await writeFile(
  join(out, "config.json"),
  JSON.stringify({
    version: 3,
    crons: [{ path: "/api/cron/cleanup", schedule: "0 3 * * *" }],
    routes: [
      { src: "/api(?:/.*)?", dest: "/api" },
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/index.html" },
    ],
  }),
);
console.log("✓ .vercel/output klaar");
