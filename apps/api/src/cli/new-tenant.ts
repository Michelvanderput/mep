import { parseArgs } from "node:util";
import { createDb, users } from "@mep/db";
import {
  createTenantSchema,
  emailSchema,
  LOCALES,
  MODULES,
  slugify,
  TENANT_TYPES,
} from "@mep/schemas";
import { loadConfig } from "../config";
import { consoleMailer } from "../mailer";
import { createTenantWithOwner } from "../tenants";

const USAGE = `Gebruik:
  pnpm mep:new-tenant --name "Bistro De Haven" --owner sanne@example.nl [--slug bistro-de-haven]
                      [--type restaurant] [--modules menu,opening_hours,events] [--locales nl,en]
  pnpm mep:new-tenant --superadmin jij@example.nl      (maak/markeer een superadmin)

Types: ${TENANT_TYPES.join(", ")}
Modules: ${MODULES.join(", ")}
Talen: ${LOCALES.join(", ")}`;

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    owner: { type: "string" },
    slug: { type: "string" },
    type: { type: "string" },
    modules: { type: "string" },
    locales: { type: "string" },
    superadmin: { type: "string" },
  },
});

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ontbreekt (zie .env.example)");
const db = createDb(url);

if (values.superadmin) {
  const email = emailSchema.parse(values.superadmin);
  await db
    .insert(users)
    .values({ email, isSuperadmin: true })
    .onConflictDoUpdate({ target: users.email, set: { isSuperadmin: true } });
  console.log(`${email} is superadmin. Log in via de inloglink.`);
  process.exit(0);
}

if (!values.name || !values.owner) {
  console.log(USAGE);
  process.exit(1);
}

const input = createTenantSchema.parse({
  name: values.name,
  slug: values.slug ?? slugify(values.name),
  ownerEmail: values.owner,
  ...(values.type && { type: values.type }),
  ...(values.modules && { modules: values.modules.split(",") }),
  ...(values.locales && { locales: values.locales.split(",") }),
});

const { tenant } = await createTenantWithOwner(db, consoleMailer, loadConfig(), input);
console.log(`Zaak aangemaakt: ${tenant.name} (${tenant.slug}). Welkomstlink staat hierboven.`);
process.exit(0);
