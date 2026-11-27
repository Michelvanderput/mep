import type { Role } from "@mep/schemas";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, type Me, useLoad } from "../api";
import { ErrorBox, icons, Spinner } from "../components/ui";

type Area = "today" | "menu" | "hours" | "inbox" | "media" | "pages" | "events" | "settings";
const ACCESS: Record<Role, Area[]> = {
  owner: ["today", "menu", "hours", "inbox", "media", "pages", "events", "settings"],
  manager: ["today", "menu", "hours", "inbox", "media", "pages", "events"],
  kitchen: ["today", "menu", "media"],
  staff: ["today", "inbox", "media", "pages", "events"],
};

export interface TenantCtx {
  slug: string;
  name: string;
  role: Role;
  me: Me;
  can: (area: Area) => boolean;
  /** Voor de badge op het Inbox-tabblad. */
  setInboxCount: (n: number) => void;
}
const Ctx = createContext<TenantCtx | null>(null);
export function useTenant(): TenantCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTenant buiten TenantShell");
  return v;
}

export function TenantShell() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { data: me, error, loading, reload } = useLoad(() => api<Me>("/me"), []);
  const [inboxCount, setInboxCount] = useState(0);
  const { pathname } = useLocation();

  if (loading) return <Spinner />;
  if (error?.status === 401) return <Navigate to="/login" replace />;
  if (error || !me)
    return <ErrorBox message={error?.message ?? "Onbekende fout"} onRetry={reload} />;

  const membership = me.tenants.find((t) => t.slug === slug);
  const role: Role | undefined = membership?.role ?? (me.user.isSuperadmin ? "owner" : undefined);
  if (!role) return <Navigate to="/zaken" replace />;

  const can = (area: Area) => ACCESS[role].includes(area);
  const name = membership?.name ?? slug;
  const tabs: {
    to: string;
    label: string;
    icon: ReactNode;
    area?: Area;
    end?: boolean;
    count?: number;
  }[] = [
    { to: `/t/${slug}`, label: "Vandaag", icon: icons.today, end: true },
    { to: `/t/${slug}/kaart`, label: "Kaart", icon: icons.menu, area: "menu" },
    { to: `/t/${slug}/tijden`, label: "Tijden", icon: icons.clock, area: "hours" },
    { to: `/t/${slug}/inbox`, label: "Inbox", icon: icons.inbox, area: "inbox", count: inboxCount },
    { to: `/t/${slug}/meer`, label: "Meer", icon: icons.more },
  ];

  return (
    <Ctx.Provider value={{ slug, name, role, me, can, setInboxCount }}>
      <div className="app">
        <Outlet />
      </div>
      {!pathname.includes("/kaart/gerecht/") &&
        !pathname.includes("/paginas/") &&
        !pathname.includes("/evenementen/") && (
          <div className="tabbar">
            <nav aria-label="Hoofdmenu">
              {tabs
                .filter((t) => !t.area || can(t.area))
                .map((t) => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end={t.end}
                    className="tab"
                    onClick={(e) => {
                      if (e.currentTarget.getAttribute("aria-current") === "page") navigate(t.to);
                    }}
                  >
                    {t.icon}
                    {t.label}
                    {t.count ? <span className="count">{t.count}</span> : null}
                  </NavLink>
                ))}
            </nav>
          </div>
        )}
    </Ctx.Provider>
  );
}
