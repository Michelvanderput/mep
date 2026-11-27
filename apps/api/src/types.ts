import type { tenants, users } from "@mep/db";
import type { Role } from "@mep/schemas";

export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Env = { Variables: { user: User | null; tenant: Tenant; role: Role } };

export type Area = "today" | "menu" | "hours" | "inbox" | "media";

const ACCESS: Record<Role, Area[]> = {
  owner: ["today", "menu", "hours", "inbox", "media"],
  manager: ["today", "menu", "hours", "inbox", "media"],
  kitchen: ["today", "menu", "media"],
  staff: ["today", "inbox", "media"],
};
export const can = (role: Role, area: Area) => ACCESS[role].includes(area);
