import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : (data?.error?.issues?.[0]?.message ?? "Er ging iets mis. Probeer het opnieuw.");
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

/** Laadt data en geeft `reload` en `setData` voor optimistische updates. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("Verbinding mislukt", 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
  }, deps);

  return { data, error, loading, reload, setData };
}

export interface Me {
  user: { id: string; email: string; name: string | null; isSuperadmin: boolean };
  tenants: {
    tenantId: string;
    slug: string;
    name: string;
    role: "owner" | "manager" | "kitchen" | "staff";
  }[];
}
