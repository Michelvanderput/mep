import { Navigate, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Hours } from "./pages/Hours";
import { Inbox } from "./pages/Inbox";
import { ItemEditor } from "./pages/ItemEditor";
import { Login, Verify } from "./pages/Login";
import { Menu } from "./pages/Menu";
import { More } from "./pages/More";
import { TenantShell } from "./pages/TenantShell";
import { Tenants } from "./pages/Tenants";
import { Today } from "./pages/Today";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/login/verify" element={<Verify />} />
      <Route path="/" element={<Home />} />
      <Route path="/zaken" element={<Tenants />} />
      <Route path="/t/:slug" element={<TenantShell />}>
        <Route index element={<Today />} />
        <Route path="kaart" element={<Menu />} />
        <Route path="kaart/gerecht/:id" element={<ItemEditor />} />
        <Route path="tijden" element={<Hours />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="meer" element={<More />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
