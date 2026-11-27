export interface Config {
  adminUrl: string;
  production: boolean;
  loginTokenTtlMs: number;
  sessionTtlMs: number;
  /** Geheim voor de dagelijkse opruim-cron; zonder dit is /cron/cleanup uitgeschakeld. */
  cronSecret?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    adminUrl: (env.ADMIN_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    production: env.NODE_ENV === "production",
    loginTokenTtlMs: 15 * 60 * 1000,
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    cronSecret: env.CRON_SECRET,
  };
}
