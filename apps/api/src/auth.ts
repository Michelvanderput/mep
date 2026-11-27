import { createHash, randomBytes } from "node:crypto";
import { type Database, loginTokens, sessions, users } from "@mep/db";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { Config } from "./config";
import type { Mailer } from "./mailer";

export const MAX_ACTIVE_LOGIN_TOKENS = 5;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Maakt een inloglink aan en mailt die. Geeft altijd geen informatie terug over
 * het bestaan van het account (voorkomt e-mail-enumeratie).
 */
export async function requestLogin(db: Database, mailer: Mailer, config: Config, email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return;

  const [{ active } = { active: 0 }] = await db
    .select({ active: count() })
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.userId, user.id),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date()),
      ),
    );
  if (active >= MAX_ACTIVE_LOGIN_TOKENS) return;

  await sendLoginLink(db, mailer, config, user.id, user.email, "Je inloglink voor Mis en place");
}

export async function sendLoginLink(
  db: Database,
  mailer: Mailer,
  config: Config,
  userId: string,
  email: string,
  subject: string,
) {
  const token = newToken();
  await db.insert(loginTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + config.loginTokenTtlMs),
  });
  const minutes = Math.round(config.loginTokenTtlMs / 60000);
  await mailer.send({
    to: email,
    subject,
    text: `Klik om in te loggen:\n${config.adminUrl}/login/verify?token=${token}\n\nDeze link is ${minutes} minuten geldig en werkt één keer.`,
  });
}

/** Wisselt een inlogtoken in voor een sessie. Geeft null bij ongeldig/verlopen/gebruikt. */
export async function verifyLogin(db: Database, config: Config, token: string) {
  const [used] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(loginTokens.tokenHash, hashToken(token)),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: loginTokens.userId });
  if (!used) return null;

  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlMs);
  await db.insert(sessions).values({ id: hashToken(sessionToken), userId: used.userId, expiresAt });
  return { sessionToken, expiresAt, userId: used.userId };
}

export async function findSessionUser(db: Database, sessionToken: string) {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(sessionToken)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function destroySession(db: Database, sessionToken: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(sessionToken)));
}
