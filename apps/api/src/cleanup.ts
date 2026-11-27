import { type Database, loginTokens, sessions, submissions } from "@mep/db";
import { and, eq, lt } from "drizzle-orm";

const DAY = 86_400_000;

/**
 * Ruimt verlopen gegevens op. Wordt dagelijks aangeroepen via een cron (zie /cron/cleanup).
 * - verlopen of gebruikte inlogtokens en verlopen sessies;
 * - afgehandelde formulierberichten ouder dan de bewaartermijn (AVG: bewaar niet langer dan nodig).
 */
export async function runCleanup(
  db: Database,
  now = new Date(),
  opts: { submissionRetentionDays?: number } = {},
) {
  const retention = opts.submissionRetentionDays ?? 365;
  const tokens = await db
    .delete(loginTokens)
    .where(lt(loginTokens.expiresAt, new Date(now.getTime() - DAY)))
    .returning({ id: loginTokens.id });
  const expiredSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  const oldSubmissions = await db
    .delete(submissions)
    .where(
      and(
        eq(submissions.status, "done"),
        lt(submissions.updatedAt, new Date(now.getTime() - retention * DAY)),
      ),
    )
    .returning({ id: submissions.id });
  return {
    loginTokens: tokens.length,
    sessions: expiredSessions.length,
    submissions: oldSubmissions.length,
  };
}
