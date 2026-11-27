import { auditLog, type Database, memberships, tenants, users } from "@mep/db";
import type { CreateTenantInput } from "@mep/schemas";
import { eq } from "drizzle-orm";
import { sendLoginLink } from "./auth";
import type { Config } from "./config";
import type { Mailer } from "./mailer";

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`Slug "${slug}" is al in gebruik`);
  }
}

/** Maakt zaak + eigenaar (indien nodig) + lidmaatschap aan en mailt een welkomstlink. */
export async function createTenantWithOwner(
  db: Database,
  mailer: Mailer,
  config: Config,
  input: CreateTenantInput,
  actorId?: string,
) {
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, input.slug))
    .limit(1);
  if (existing) throw new SlugTakenError(input.slug);

  const { tenant, owner } = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug: input.slug,
        name: input.name,
        type: input.type,
        modules: input.modules,
        locales: input.locales,
      })
      .returning();
    if (!tenant) throw new Error("Tenant aanmaken mislukt");

    let [owner] = await tx.select().from(users).where(eq(users.email, input.ownerEmail)).limit(1);
    if (!owner) {
      [owner] = await tx
        .insert(users)
        .values({ email: input.ownerEmail, name: input.ownerName ?? null })
        .returning();
    }
    if (!owner) throw new Error("Gebruiker aanmaken mislukt");

    await tx.insert(memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
    await tx.insert(auditLog).values({
      tenantId: tenant.id,
      userId: actorId ?? null,
      action: "tenant.create",
      entity: "tenant",
      entityId: tenant.id,
      data: { slug: tenant.slug, ownerEmail: owner.email },
    });
    return { tenant, owner };
  });

  await sendLoginLink(
    db,
    mailer,
    config,
    owner.id,
    owner.email,
    `Welkom bij Mis en place, ${tenant.name}`,
  );
  return { tenant, owner };
}
