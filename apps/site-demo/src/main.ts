import {
  contactFields,
  createClient,
  formatPrice,
  type Hours,
  type Menu,
  paragraphs,
} from "@mep/sdk";
import "./style.css";

// Zo gebruikt een klantwebsite MEP: een client per zaak, daarna gewone data.
const MEP = {
  baseUrl: import.meta.env.VITE_MEP_API ?? "http://localhost:8787",
  tenant: import.meta.env.VITE_MEP_TENANT ?? "bistro-de-haven",
};
let mep = createClient({
  baseUrl: import.meta.env.VITE_MEP_API ?? "http://localhost:8787",
  tenant: import.meta.env.VITE_MEP_TENANT ?? "bistro-de-haven",
});

// Koppen en vaste teksten van je eigen site vertaal je zelf; de SDK doet status, dagen, allergenen en datums.
const UI: Record<string, Record<string, string>> = {
  nl: {
    hours: "Openingstijden",
    special: "Vandaag speciaal",
    agenda: "Agenda",
    menu: "Menukaart",
    location: "Adres en route",
    contact: "Contact of groepsaanvraag",
    allergyNote:
      "Heb je een allergie? Vraag het de bediening, ook als er hieronder niets bij staat.",
    name: "Naam",
    email: "E-mail",
    message: "Bericht",
    send: "Verstuur",
    contains: "Bevat",
    soldOut: "Op",
    weekly: "wekelijks",
    tickets: "Tickets",
    thanks: "Bedankt! We nemen snel contact op.",
    access: "Toegankelijkheid",
  },
  en: {
    hours: "Opening hours",
    special: "Today's special",
    agenda: "What's on",
    menu: "Menu",
    location: "Address and directions",
    contact: "Contact or group booking",
    allergyNote: "Do you have an allergy? Please ask our staff, even if nothing is listed below.",
    name: "Name",
    email: "Email",
    message: "Message",
    send: "Send",
    contains: "Contains",
    soldOut: "Sold out",
    weekly: "weekly",
    tickets: "Tickets",
    thanks: "Thank you! We will be in touch soon.",
    access: "Accessibility",
  },
  de: {
    hours: "Öffnungszeiten",
    special: "Heute besonders",
    agenda: "Veranstaltungen",
    menu: "Speisekarte",
    location: "Adresse und Anfahrt",
    contact: "Kontakt oder Gruppenanfrage",
    allergyNote:
      "Haben Sie eine Allergie? Fragen Sie bitte unser Team, auch wenn unten nichts steht.",
    name: "Name",
    email: "E-Mail",
    message: "Nachricht",
    send: "Senden",
    contains: "Enthält",
    soldOut: "Ausverkauft",
    weekly: "wöchentlich",
    tickets: "Tickets",
    thanks: "Danke! Wir melden uns bald.",
    access: "Barrierefreiheit",
  },
  fr: {
    hours: "Horaires",
    special: "Suggestion du jour",
    agenda: "Agenda",
    menu: "Carte",
    location: "Adresse et accès",
    contact: "Contact ou groupe",
    allergyNote: "Une allergie ? Demandez à notre équipe, même si rien n'est indiqué ci-dessous.",
    name: "Nom",
    email: "E-mail",
    message: "Message",
    send: "Envoyer",
    contains: "Contient",
    soldOut: "Épuisé",
    weekly: "chaque semaine",
    tickets: "Billets",
    thanks: "Merci ! Nous vous répondrons bientôt.",
    access: "Accessibilité",
  },
};
let lang = "nl";
const t = (k: string) => UI[lang]?.[k] ?? UI.nl?.[k] ?? k;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function init(langArg?: string) {
  lang = langArg ?? "nl";
  mep = createClient({ ...MEP, lang });
  for (const el of document.querySelectorAll<HTMLElement>("[data-t]"))
    el.textContent = t(el.dataset.t ?? "");
  const [info, hours, menus, announcements, specials, agenda] = await Promise.all([
    mep.info(),
    mep.hours(),
    mep.menus(),
    mep.announcements(),
    mep.specials(),
    mep.events(6),
  ]);
  const langs = $("langs");
  langs.hidden = info.locales.length < 2;
  langs.innerHTML = info.locales
    .map((l) => `<button data-lang="${l}" aria-pressed="${lang === l}">${l.toUpperCase()}</button>`)
    .join("");
  langs.onclick = (e) => {
    const l = (e.target as HTMLElement).dataset.lang;
    if (l) {
      document.documentElement.lang = l;
      void init(l);
    }
  };
  document.title = `${info.name} · ${info.type === "restaurant" ? "Restaurant" : info.type}`;
  $("name").textContent = info.name;

  renderBadge(hours);
  setInterval(() => renderBadge(hours), 30_000); // blijft kloppen op een gecachte pagina

  $("hours-list").innerHTML = mep
    .week(hours.venue)
    .map((r) => `<div><dt>${r.days}</dt><dd>${r.text}</dd></div>`)
    .join("");
  $("exceptions").innerHTML = hours.exceptions
    .slice(0, 3)
    .map(
      (e) =>
        `${e.date.split("-").reverse().join("-")}: ${e.closed ? "gesloten" : e.slots.map((s) => `${s.open}–${s.close}`).join(" en ")}${e.reason ? ` (${esc(e.reason)})` : ""}`,
    )
    .join("<br>");

  renderMenus(menus);

  const [home, about, contactPage] = await Promise.all([
    mep.page("home"),
    mep.page("about"),
    mep.page("contact"),
  ]);
  const heroText = String(home.content.heroText ?? "");
  $("intro").hidden = !heroText;
  $("hero-text").textContent = heroText;
  const story = String(about.content.story ?? "");
  $("about").hidden = !story;
  $("h-about").textContent = String(about.content.heading || about.title);
  $("about-body").innerHTML = paragraphs(story)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
  const c = contactFields(contactPage);
  const hasContact = Object.values(c).some(Boolean);
  $("location").hidden = !hasContact;
  $("location-body").innerHTML = `
    ${c.street ? `<address>${esc(c.street)}<br>${esc(`${c.postalCode} ${c.city}`.trim())}</address>` : ""}
    <p>${c.phone ? `<a href="tel:${c.phone.replace(/\s/g, "")}">${esc(c.phone)}</a>` : ""}${c.phone && c.email ? " · " : ""}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</p>
    ${paragraphs(c.route)
      .map((p) => `<p>${esc(p)}</p>`)
      .join("")}
    ${c.accessibility ? `<p><b>${t("access")}:</b> ${esc(c.accessibility)}</p>` : ""}
    ${c.instagram ? `<p><a href="${esc(c.instagram)}" rel="noopener">Instagram</a></p>` : ""}`;

  $("agenda").hidden = agenda.length === 0;
  $("agenda-list").innerHTML = agenda
    .map((e) => {
      const d = mep.formatDate(e.date);
      return `<li><div class="body"><div class="line"><b>${esc(e.title)}</b>${e.priceCents !== null ? `<span class="price">${formatPrice(e.priceCents)}</span>` : ""}</div>
        <p>${d} · ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}${e.recurring ? ` · ${t("weekly")}` : ""}</p>
        ${e.description ? `<p>${esc(e.description)}</p>` : ""}${e.ticketUrl ? `<p><a href="${esc(e.ticketUrl)}" rel="noopener">${t("tickets")}</a></p>` : ""}</div></li>`;
    })
    .join("");

  const banner = $("banner");
  banner.hidden = announcements.length === 0;
  banner.innerHTML = announcements.map((a) => esc(a.text)).join(" · ");

  $("specials").hidden = specials.length === 0;
  $("specials-list").innerHTML = specials
    .map(
      (x) =>
        `<li><div class="body"><div class="line"><b>${esc(x.name)}</b>${x.priceCents !== null ? `<span class="price">${formatPrice(x.priceCents)}</span>` : ""}</div>${x.description ? `<p>${esc(x.description)}</p>` : ""}</div></li>`,
    )
    .join("");
}

function renderBadge(hours: Hours) {
  const s = mep.openStatus(hours);
  const el = $("badge");
  el.textContent = s.label;
  el.dataset.open = String(s.open);
}

function renderMenus(menus: Menu[]) {
  const withItems = menus.filter((m) => m.sections.some((s) => s.items.length > 0));
  const tabs = $("menu-tabs");
  const show = (menu: Menu) => {
    for (const b of tabs.children)
      b.setAttribute("aria-selected", String((b as HTMLElement).dataset.id === menu.id));
    $("menu-body").innerHTML = menu.sections
      .filter((s) => s.items.length > 0)
      .map(
        (s) =>
          `<h3>${esc(s.name)}</h3><ul class="items">${s.items
            .map(
              (i) => `<li class="${i.available ? "" : "gone"}">
              ${i.photo ? `<img src="${mep.photoUrl(i.photo.id, 400)}" srcset="${mep.photoSrcSet(i.photo.id)}" sizes="96px" width="96" height="96" alt="" loading="lazy">` : ""}
              <div class="body"><div class="line"><b>${esc(i.name)}</b><span class="price">${formatPrice(i.priceCents)}</span></div>
                ${i.description ? `<p>${esc(i.description)}</p>` : ""}
                <p class="tags">${i.diets.map((d) => `<span>${mep.dietLabel(d)}</span>`).join("")}${
                  i.allergens && i.allergens.length
                    ? `<span class="al">${t("contains")}: ${i.allergens.map(mep.allergenLabel).join(", ")}</span>`
                    : ""
                }${i.available ? "" : `<span class="al">${t("soldOut")}</span>`}</p></div></li>`,
            )
            .join("")}</ul>`,
      )
      .join("");
  };
  tabs.innerHTML = withItems
    .map((m) => `<button role="tab" data-id="${m.id}">${esc(m.name)}</button>`)
    .join("");
  tabs.onclick = (e) => {
    const id = (e.target as HTMLElement).dataset.id;
    const m = withItems.find((x) => x.id === id);
    if (m) show(m);
  };
  if (withItems[0]) show(withItems[0]);
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  const status = $("form-status");
  status.textContent = "Versturen…";
  try {
    await mep.submit(
      {
        name: String(f.get("name")),
        email: String(f.get("email")),
        message: String(f.get("message")),
      },
      { website: String(f.get("website") ?? "") },
    );
    status.textContent = t("thanks");
    (e.target as HTMLFormElement).reset();
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : "Versturen mislukt";
  }
});

init().catch(() => {
  $("name").textContent = "Even geduld";
  $("menu-body").textContent = "De gegevens konden niet worden geladen.";
});
