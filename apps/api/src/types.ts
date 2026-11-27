import type { tenants, users } from "@mep/db";
import type { Role } from "@mep/schemas";

export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Env = { Variables: { user: User | null; tenant: Tenant; role: Role } };

export type Area = "today" | "menu" | "hours" | "inbox";

const ACCESS: Record<Role, Area[]> = {
  owner: ["today", "menu", "hours", "inbox"],
  manager: ["today", "menu", "hours", "inbox"],
  kitchen: ["today", "menu"],
  staff: ["today", "inbox"],
};
export const can = (role: Role, area: Area) => ACCESS[role].includes(area);
