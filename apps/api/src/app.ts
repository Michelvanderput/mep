import { zValidator } from "@hono/zod-validator";
import { type Database, memberships, tenants, type users } from "@mep/db";
import { createTenantSchema, requestLoginSchema, verifyLoginSchema } from "@mep/schemas";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { destroySession, findSessionUser, requestLogin, verifyLogin } from "./auth";
import type { Config } from "./config";
import type { Mailer } from "./mailer";
import { createTenantWithOwner, SlugTakenError } from "./tenants";

const SESSION_COOKIE = "mep_session";

type User = typeof users.$inferSelect;
type Env = { Variables: { user: User | null } };

export interface Deps {
  db: Database;
  mailer: Mailer;
  config: Config;
}

export function createApp({ db, mailer, config }: Deps) {
  const app = new Hono<Env>();

  app.use(
    createMiddleware<Env>(async (c, next) => {
      const token = getCookie(c, SESSION_COOKIE);
      c.set("user", token ? await findSessionUser(db, token) : null);
      await next();
    }),
  );

  const requireUser = createMiddleware<Env>(async (c, next) => {
    if (!c.get("user")) return c.json({ error: "Niet ingelogd" }, 401);
    await next();
  });

  const requireSuperadmin = createMiddleware<Env>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Niet ingelogd" }, 401);
    if (!user.isSuperadmin) return c.json({ error: "Geen toegang" }, 403);
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // --- Auth (magic link) ---
  app.post("/auth/request", zValidator("json", requestLoginSchema), async (c) => {
    await requestLogin(db, mailer, config, c.req.valid("json").email);
    // Altijd hetzelfde antwoord, ook als het account niet bestaat.
    return c.json({ ok: true });
  });

  app.post("/auth/verify", zValidator("json", verifyLoginSchema), async (c) => {
    const session = await verifyLogin(db, config, c.req.valid("json").token);
    if (!session) return c.json({ error: "Link ongeldig of verlopen" }, 400);
    setCookie(c, SESSION_COOKIE, session.sessionToken, {
      httpOnly: true,
      sameSite: "Lax",
      secure: config.production,
      path: "/",
      expires: session.expiresAt,
    });
    return c.json({ ok: true });
  });

  app.post("/auth/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await destroySession(db, token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/me", requireUser, async (c) => {
    const user = c.get("user") as User;
    const rows = await db
      .select({
        tenantId: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, user.id));
    return c.json({
      user: { id: user.id, email: user.email, name: user.name, isSuperadmin: user.isSuperadmin },
      tenants: rows,
    });
  });

  // --- Superadmin ---
  app.get("/admin/tenants", requireSuperadmin, async (c) => {
    const rows = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
    return c.json({ tenants: rows });
  });

  app.post(
    "/admin/tenants",
    requireSuperadmin,
    zValidator("json", createTenantSchema),
    async (c) => {
      try {
        const { tenant } = await createTenantWithOwner(
          db,
          mailer,
          config,
          c.req.valid("json"),
          (c.get("user") as User).id,
        );
        return c.json({ tenant }, 201);
      } catch (err) {
        if (err instanceof SlugTakenError) return c.json({ error: err.message }, 409);
        throw err;
      }
    },
  );

  return app;
}
