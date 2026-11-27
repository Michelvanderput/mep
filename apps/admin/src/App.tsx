import { Navigate, Route, Routes } from "react-router-dom";
import { EventEditor } from "./pages/EventEditor";
import { EventsList } from "./pages/Events";
import { Home } from "./pages/Home";
import { Hours } from "./pages/Hours";
import { Inbox } from "./pages/Inbox";
import { ItemEditor } from "./pages/ItemEditor";
import { Login, Verify } from "./pages/Login";
import { Menu } from "./pages/Menu";
import { More } from "./pages/More";
import { PageEditor } from "./pages/PageEditor";
import { PagesList } from "./pages/Pages";
import { Photos } from "./pages/Photos";
import { Team } from "./pages/Team";
import { TenantShell } from "./pages/TenantShell";
import { Tenants } from "./pages/Tenants";
import { Today } from "./pages/Today";
import { Translations } from "./pages/Translations";

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
        <Route path="fotos" element={<Photos />} />
        <Route path="team" element={<Team />} />
        <Route path="vertalingen" element={<Translations />} />
        <Route path="evenementen" element={<EventsList />} />
        <Route path="evenementen/:id" element={<EventEditor />} />
        <Route path="paginas" element={<PagesList />} />
        <Route path="paginas/:key" element={<PageEditor />} />
        <Route path="meer" element={<More />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
