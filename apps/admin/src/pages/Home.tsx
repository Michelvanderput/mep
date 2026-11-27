import { Navigate } from "react-router-dom";
import { api, type Me, useLoad } from "../api";
import { ErrorBox, Spinner } from "../components/ui";

/** Stuurt door naar login, de enige zaak van de gebruiker, of de zakenlijst. */
export function Home() {
  const { data, error, loading, reload } = useLoad(() => api<Me>("/me"), []);
  if (loading) return <Spinner />;
  if (error?.status === 401) return <Navigate to="/login" replace />;
  if (error || !data)
    return <ErrorBox message={error?.message ?? "Onbekende fout"} onRetry={reload} />;
  if (!data.user.isSuperadmin && data.tenants.length === 1 && data.tenants[0]) {
    return <Navigate to={`/t/${data.tenants[0].slug}`} replace />;
  }
  return <Navigate to="/zaken" replace />;
}
