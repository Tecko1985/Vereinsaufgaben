// Vereinsaufgaben — Aufgaben und Zuständigkeiten der Funktionäre.
//
// Anders als die übrigen Gateway-Apps hält dieser Client KEINEN eigenen
// Datenbestand, den er als Ganzes zurückschreibt. Jede Änderung ist ein eigener
// Worker-Aufruf, der serverseitig geprüft wird; danach wird neu geladen. Das ist
// der Preis dafür, dass Rollenregeln und Vertraulichkeit echte Schranken sind und
// keine Anzeigelogik — und es macht den sonst nötigen Debounce-Save mitsamt
// In-Flight-Guard überflüssig, weil es keinen überlappenden Gesamt-Save gibt.

let currentUser = null;
let ressorts = [];
let aufgaben = [];
let protokoll = [];
let personen = [];          // {username, displayName} — mögliche Empfänger
let alleAnzeigeNamen = {};  // username -> Anzeigename, auch für Ausgeschiedene
let aktuellerTab = "uebersicht";
let offeneDetailId = null;
let ressortBearbeitetId = null;
let gefilterteAufgaben = [];

function canEdit()  { return !!(currentUser && (currentUser.isAdmin || currentUser.canEdit));  }
function canAdmin() { return !!(currentUser && (currentUser.isAdmin || currentUser.canAdmin)); }

// ---------- Helfer ----------

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function nameVon(username) {
  if (!username) return "—";
  return alleAnzeigeNamen[username] || username;
}

function statusInfo(id) {
  return STATUS_WERTE.find((s) => s.id === id) || STATUS_WERTE[0];
}

function prioInfo(id) {
  return PRIORITAETEN.find((p) => p.id === id) || PRIORITAETEN[1];
}

function heuteIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function datumLesbar(iso) {
  if (!iso) return "—";
  const t = String(iso).split("-");
  if (t.length !== 3) return iso;
  return `${t[2]}.${t[1]}.${t[0]}`;
}

function zeitLesbar(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Überfällig ist ein gerechneter Zustand, kein gespeicherter: nur was noch zu tun
// ist, kann überfällig sein. Eine abgelehnte oder zurückgezogene Aufgabe ist es
// nie, auch wenn ihr Datum längst vorbei ist.
function istUeberfaellig(a) {
  if (a.status !== "offen" && a.status !== "gemeldet") return false;
  return !!a.faellig && a.faellig < heuteIso();
}

function istAbgeschlossen(a) {
  return STATUS_ABGESCHLOSSEN.includes(a.status);
}

// Der Worker liefert vertrauliche Aufgaben ohne Text aus; das Kennzeichen dafür
// ist das Feld verdeckt. Der Client zeigt dann den Platzhalter — und muss ihn
// nicht selbst erzeugen, damit gar nicht erst der Eindruck entsteht, hier werde
// etwas nur ausgeblendet.
function titelVon(a) {
  if (a.verdeckt) return "Vertraulicher Vorgang";
  return a.titel || "(ohne Titel)";
}

function sortiereAufgaben(liste) {
  return liste.slice().sort((a, b) => {
    const aAb = istAbgeschlossen(a), bAb = istAbgeschlossen(b);
    if (aAb !== bAb) return aAb ? 1 : -1;             // Offenes zuerst
    if (a.faellig !== b.faellig) return (a.faellig || "9999").localeCompare(b.faellig || "9999");
    return prioInfo(a.prioritaet).rang - prioInfo(b.prioritaet).rang;
  });
}

function setStatusText(text, istFehler) {
  const el = document.getElementById("save-status");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", !!istFehler);
  if (text && !istFehler) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 2500);
}

function zeigeFehler(e) {
  if (e instanceof NotLoggedInError) { zeigeLoginGate(e.message); return; }
  setStatusText(e && e.message ? e.message : "Unbekannter Fehler", true);
  alert(e && e.message ? e.message : "Unbekannter Fehler");
}

function zeigeLoginGate(text) {
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("connect-screen").style.display = "flex";
  if (text) document.getElementById("cloud-error").textContent = text;
}

// ---------- Rechte im Client ----------

// Wer darf dieser Person etwas zuweisen? Spiegelt darfZuweisen() im Worker.
// Der Client entscheidet damit nur, was er anbietet — die Schranke ist der Worker.
function darfZuweisenAn(username) {
  if (canAdmin()) return true;
  if (!currentUser) return false;
  return ressorts.some((r) =>
    (r.verantwortlich === currentUser.username || r.stellvertreter === currentUser.username) &&
    ressortMitglieder(r).includes(username));
}

function darfIrgendwemZuweisen() {
  if (canAdmin()) return true;
  return personen.some((p) => darfZuweisenAn(p.username));
}

// Verantwortlicher und Stellvertreter sind immer auch Mitglieder ihres Ressorts —
// sonst könnte ein Verantwortlicher sich selbst nichts eintragen und stünde in der
// Ressort-Ansicht nicht in der eigenen Mannschaft.
function ressortMitglieder(r) {
  const raus = [];
  [r.verantwortlich, r.stellvertreter].concat(r.mitglieder || []).forEach((u) => {
    if (u && !raus.includes(u)) raus.push(u);
  });
  return raus;
}

function ressortVon(id) {
  return ressorts.find((r) => r.id === id) || null;
}

// ---------- Laden ----------

async function ladeDaten() {
  const body = await ladeAlles();
  ressorts = Array.isArray(body.ressorts) ? body.ressorts : [];
  aufgaben = Array.isArray(body.aufgaben) ? body.aufgaben : [];
  protokoll = Array.isArray(body.protokoll) ? body.protokoll : [];
  alleAnzeigeNamen = (body.namen && typeof body.namen === "object") ? body.namen : {};
  if (body.me) currentUser = Object.assign({}, currentUser, body.me);
}

async function ladePersonen() {
  try {
    const body = await ladeMoeglicheEmpfaenger();
    personen = Array.isArray(body.users) ? body.users : [];
    personen.forEach((p) => { if (!alleAnzeigeNamen[p.username]) alleAnzeigeNamen[p.username] = p.displayName; });
  } catch (e) {
    // Ohne Empfängerliste bleibt die App lesbar — nur Zuweisen geht dann nicht.
    personen = [];
  }
}

// ---------- Rendering: Übersicht ----------

function renderUebersicht() {
  const offen = aufgaben.filter((a) => !istAbgeschlossen(a));
  const ueber = aufgaben.filter(istUeberfaellig);
  const erledigt = aufgaben.filter((a) => a.status === "erledigt");
  const abnahme = aufgaben.filter((a) => a.status === "gemeldet");

  document.getElementById("summary-cards").innerHTML = [
    kachel("Offen", offen.length, "#2c6fbb"),
    kachel("Überfällig", ueber.length, ueber.length ? "#c0392b" : "#7f8c8d"),
    kachel("Zur Abnahme", abnahme.length, abnahme.length ? "#d68910" : "#7f8c8d"),
    kachel("Erledigt", erledigt.length, "#1e8449")
  ].join("");

  // Jede Person, die irgendwo als Empfänger auftaucht ODER als möglicher
  // Empfänger bekannt ist. Ausgeschiedene bleiben in der Liste, solange sie noch
  // Aufgaben halten — sonst verschwände deren Historie aus der Übersicht.
  const namen = {};
  personen.forEach((p) => { namen[p.username] = true; });
  aufgaben.forEach((a) => { if (a.empfaenger) namen[a.empfaenger] = true; });

  const zeilen = Object.keys(namen).map((u) => {
    const meine = aufgaben.filter((a) => a.empfaenger === u);
    return {
      username: u,
      offen: meine.filter((a) => !istAbgeschlossen(a)).length,
      ueberfaellig: meine.filter(istUeberfaellig).length,
      erledigt: meine.filter((a) => a.status === "erledigt").length,
      liste: sortiereAufgaben(meine)
    };
  }).filter((z) => z.liste.length > 0 || personen.some((p) => p.username === z.username));

  zeilen.sort((a, b) => (b.ueberfaellig - a.ueberfaellig) || (b.offen - a.offen) || nameVon(a.username).localeCompare(nameVon(b.username)));

  const el = document.getElementById("person-list");
  el.innerHTML = zeilen.map((z) => {
    const ressortNamen = ressorts.filter((r) => ressortMitglieder(r).includes(z.username)).map((r) => r.name);
    return `
      <div class="person-card${z.ueberfaellig ? " hat-ueberfaellig" : ""}" data-person="${escapeHtml(z.username)}">
        <button class="person-head" type="button" data-toggle="${escapeHtml(z.username)}">
          <span class="person-name">
            ${escapeHtml(nameVon(z.username))}
            ${ressortNamen.length ? `<span class="person-ressorts">${escapeHtml(ressortNamen.join(", "))}</span>` : ""}
          </span>
          <span class="person-zahlen">
            <span class="zahl" title="offen">${z.offen}</span>
            <span class="zahl ${z.ueberfaellig ? "warn" : "leer"}" title="überfällig">${z.ueberfaellig}</span>
            <span class="zahl ok" title="erledigt">${z.erledigt}</span>
          </span>
        </button>
        <div class="person-body hidden" id="person-body-${escapeHtml(z.username)}">
          ${z.liste.length ? z.liste.map(aufgabeZeileHtml).join("") : `<p class="muted">Keine Aufgaben.</p>`}
        </div>
      </div>`;
  }).join("");

  document.getElementById("uebersicht-empty").classList.toggle("hidden", zeilen.length > 0);
}

function kachel(titel, wert, farbe) {
  return `<div class="summary-card"><span class="summary-value" style="color:${farbe}">${wert}</span><span class="summary-label">${escapeHtml(titel)}</span></div>`;
}

// ---------- Rendering: Aufgabenzeile ----------

function aufgabeZeileHtml(a) {
  const st = statusInfo(a.status);
  const ueber = istUeberfaellig(a);
  const prio = prioInfo(a.prioritaet);
  const r = a.ressortId ? ressortVon(a.ressortId) : null;
  return `
    <button class="aufgabe-zeile${ueber ? " ueberfaellig" : ""}" type="button" data-aufgabe="${escapeHtml(a.id)}">
      <span class="az-haupt">
        <span class="az-titel">${a.verdeckt ? "🔒 " : ""}${escapeHtml(titelVon(a))}</span>
        <span class="az-meta">
          ${escapeHtml(nameVon(a.empfaenger))}
          ${r ? ` · ${escapeHtml(r.name)}` : ""}
          ${a.von ? ` · von ${escapeHtml(nameVon(a.von))}` : ""}
          ${(a.anhaenge && a.anhaenge.length) ? " · 📎" : ""}
          ${(a.kommentare && a.kommentare.length) ? ` · 💬 ${a.kommentare.length}` : ""}
        </span>
      </span>
      <span class="az-rechts">
        ${a.prioritaet === "hoch" ? `<span class="az-prio" style="color:${prio.farbe}">▲</span>` : ""}
        <span class="az-frist${ueber ? " warn" : ""}">${datumLesbar(a.faellig)}</span>
        <span class="az-status" style="background:${st.farbe}">${escapeHtml(ueber ? "Überfällig" : st.label)}</span>
      </span>
    </button>`;
}

// ---------- Rendering: Meine Aufgaben ----------

function renderMeine() {
  const meine = sortiereAufgaben(aufgaben.filter((a) => a.empfaenger === currentUser.username));
  const vonMir = sortiereAufgaben(aufgaben.filter((a) => a.von === currentUser.username && a.empfaenger !== currentUser.username));

  document.getElementById("meine-liste").innerHTML = meine.map(aufgabeZeileHtml).join("");
  document.getElementById("meine-empty").classList.toggle("hidden", meine.length > 0);
  document.getElementById("vonmir-liste").innerHTML = vonMir.map(aufgabeZeileHtml).join("");
  document.getElementById("vonmir-empty").classList.toggle("hidden", vonMir.length > 0);

  const offeneEigene = meine.filter((a) => !istAbgeschlossen(a)).length;
  const badge = document.getElementById("nav-badge-meine");
  badge.textContent = offeneEigene || "";
  badge.classList.toggle("hidden", offeneEigene === 0);
  badge.classList.toggle("warn", meine.some(istUeberfaellig));
}

// ---------- Rendering: Alle Aufgaben ----------

function renderAlle() {
  const suche = (document.getElementById("filter-suche").value || "").trim().toLowerCase();
  const person = document.getElementById("filter-person").value;
  const ressortId = document.getElementById("filter-ressort").value;
  const status = document.getElementById("filter-status").value;

  gefilterteAufgaben = sortiereAufgaben(aufgaben.filter((a) => {
    if (person && a.empfaenger !== person) return false;
    if (ressortId && a.ressortId !== ressortId) return false;
    if (status === "offen-alle" && istAbgeschlossen(a)) return false;
    if (status === "ueberfaellig" && !istUeberfaellig(a)) return false;
    if (status && status !== "offen-alle" && status !== "ueberfaellig" && a.status !== status) return false;
    if (suche) {
      const heu = `${a.verdeckt ? "" : (a.titel || "") + " " + (a.beschreibung || "")} ${nameVon(a.empfaenger)}`.toLowerCase();
      if (!heu.includes(suche)) return false;
    }
    return true;
  }));

  document.getElementById("alle-liste").innerHTML = gefilterteAufgaben.map(aufgabeZeileHtml).join("");
  document.getElementById("alle-empty").classList.toggle("hidden", gefilterteAufgaben.length > 0);

  // Ausgeblendetes wird beziffert, nicht stillschweigend weggefiltert.
  const versteckt = aufgaben.length - gefilterteAufgaben.length;
  document.getElementById("filter-count").textContent =
    `${gefilterteAufgaben.length} von ${aufgaben.length}` + (versteckt ? ` · ${versteckt} ausgeblendet` : "");
}

// ---------- Rendering: Ressorts ----------

function renderRessorts() {
  const el = document.getElementById("ressort-list");
  el.innerHTML = ressorts.map((r) => {
    const weitere = (r.mitglieder || []).filter((u) => u !== r.verantwortlich && u !== r.stellvertreter);
    const offeneR = aufgaben.filter((a) => a.ressortId === r.id && !istAbgeschlossen(a)).length;
    return `
      <div class="ressort-card">
        <h3>${escapeHtml(r.name)} ${offeneR ? `<span class="ressort-zahl">${offeneR} offen</span>` : ""}</h3>
        ${r.beschreibung ? `<p class="muted">${escapeHtml(r.beschreibung)}</p>` : ""}
        <dl class="ressort-rollen">
          <dt>Verantwortlich</dt><dd>${escapeHtml(nameVon(r.verantwortlich))}</dd>
          <dt>Stellvertretung</dt><dd>${r.stellvertreter ? escapeHtml(nameVon(r.stellvertreter)) : "—"}</dd>
          <dt>Mitglieder</dt><dd>${weitere.length ? escapeHtml(weitere.map(nameVon).join(", ")) : "—"}</dd>
        </dl>
      </div>`;
  }).join("");
  document.getElementById("ressort-empty").classList.toggle("hidden", ressorts.length > 0);
}

// ---------- Rendering: Verwaltung ----------

function renderVerwaltung() {
  document.getElementById("ressort-admin-list").innerHTML = ressorts.map((r) => `
    <div class="admin-row">
      <span><strong>${escapeHtml(r.name)}</strong> — ${escapeHtml(nameVon(r.verantwortlich))}
        <span class="muted">(${ressortMitglieder(r).length} Beteiligte)</span></span>
      <button class="btn small secondary" data-ressort-edit="${escapeHtml(r.id)}">Bearbeiten</button>
    </div>`).join("") || `<p class="muted">Noch kein Ressort angelegt.</p>`;

  const optionen = personen.map((p) => `<option value="${escapeHtml(p.username)}">${escapeHtml(p.displayName)}</option>`).join("");
  const von = document.getElementById("uebergabe-von");
  const auf = document.getElementById("uebergabe-auf");
  von.innerHTML = `<option value="">— Person wählen —</option>` + optionen;
  auf.innerHTML = `<option value="">— Person wählen —</option>` + optionen;

  const pl = document.getElementById("protokoll-list");
  pl.innerHTML = protokoll.slice().reverse().map((p) => `
    <div class="protokoll-row">
      <span class="pr-zeit">${escapeHtml(zeitLesbar(p.am))}</span>
      <span class="pr-text">${escapeHtml(protokollText(p))}</span>
      <span class="pr-wer">${escapeHtml(nameVon(p.von))}</span>
    </div>`).join("");
  document.getElementById("protokoll-empty").classList.toggle("hidden", protokoll.length > 0);
}

function protokollText(p) {
  if (p.art === "uebergabe") {
    return `Amtsübergabe: ${p.anzahl} offene Aufgabe(n) von ${nameVon(p.vonUser)} auf ${nameVon(p.aufUser)} übertragen`;
  }
  const st = statusInfo(p.status);
  return `Aufgabe gelöscht: „${p.titel}" (Empfänger ${nameVon(p.empfaenger)}, Status ${st.label})`;
}

// ---------- Rendering: Info ----------

function renderInfo() {
  document.getElementById("meta-view").innerHTML = `
    <div class="form-field"><label>Aufgaben insgesamt</label><span>${aufgaben.length}</span></div>
    <div class="form-field"><label>Davon offen</label><span>${aufgaben.filter((a) => !istAbgeschlossen(a)).length}</span></div>
    <div class="form-field"><label>Ressorts</label><span>${ressorts.length}</span></div>`;
  document.getElementById("info-user").textContent = currentUser
    ? `Angemeldet als ${nameVon(currentUser.username)} — ${canAdmin() ? "Administrieren" : canEdit() ? "Bearbeiten" : "Sehen"}.`
    : "";

  document.getElementById("changelog-list").innerHTML = APP_CHANGELOG.map((v) => `
    <div class="changelog-version">
      <h3>Version ${escapeHtml(v.version)}</h3>
      ${v.groups.map((g) => `
        <h4>${escapeHtml(g.title)}</h4>
        <ul>${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`).join("")}
    </div>`).join("");
}

// ---------- Alles neu zeichnen ----------

function renderAll() {
  renderUebersicht();
  renderMeine();
  fuelleFilterDropdowns();
  renderAlle();
  renderRessorts();
  if (canAdmin()) renderVerwaltung();
  renderInfo();
  applyRechteSichtbarkeit();
}

function fuelleFilterDropdowns() {
  const fp = document.getElementById("filter-person");
  const fr = document.getElementById("filter-ressort");
  const altP = fp.value, altR = fr.value;
  const namen = {};
  personen.forEach((p) => { namen[p.username] = p.displayName; });
  aufgaben.forEach((a) => { if (a.empfaenger && !namen[a.empfaenger]) namen[a.empfaenger] = nameVon(a.empfaenger); });
  fp.innerHTML = `<option value="">Alle Personen</option>` +
    Object.keys(namen).sort((a, b) => namen[a].localeCompare(namen[b]))
      .map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(namen[u])}</option>`).join("");
  fr.innerHTML = `<option value="">Alle Ressorts</option>` +
    ressorts.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("");
  fp.value = altP; fr.value = altR;
}

// Sehen ist wirklich read-only: Bedienelemente verschwinden, nicht nur ihre Wirkung.
function applyRechteSichtbarkeit() {
  document.querySelectorAll(".editor-only").forEach((el) => el.classList.toggle("hidden", !canEdit()));
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !canAdmin()));
  document.getElementById("export-gesperrt").classList.toggle("hidden", canEdit());
  // Zuweisen hängt nicht am Bearbeiten-Recht allein, sondern an einer Ressort-Rolle.
  const btn = document.getElementById("btn-zuweisen-oeffnen");
  if (btn && !btn.classList.contains("hidden")) btn.classList.toggle("hidden", !darfIrgendwemZuweisen());
}

// ---------- Tabs ----------

function switchTab(tab) {
  aktuellerTab = tab;
  document.querySelectorAll("nav button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
}

// ---------- Detailansicht ----------

function oeffneDetail(id) {
  const a = aufgaben.find((x) => x.id === id);
  if (!a) return;
  offeneDetailId = id;

  const st = statusInfo(a.status);
  const r = a.ressortId ? ressortVon(a.ressortId) : null;
  const binEmpfaenger = a.empfaenger === currentUser.username;
  const binZuweiser = a.von === currentUser.username;
  const darfAendern = (binZuweiser || canAdmin()) && !istAbgeschlossen(a);

  document.getElementById("detail-titel").innerHTML =
    `${a.verdeckt ? "🔒 " : ""}${escapeHtml(titelVon(a))} <span class="az-status" style="background:${st.farbe}">${escapeHtml(st.label)}</span>`;

  const body = document.getElementById("detail-body");
  body.innerHTML = `
    <div class="detail-kopf">
      <div><label>Empfänger</label><span>${escapeHtml(nameVon(a.empfaenger))}</span></div>
      <div><label>Zugewiesen von</label><span>${escapeHtml(nameVon(a.von))}</span></div>
      <div><label>Ressort</label><span>${r ? escapeHtml(r.name) : "—"}</span></div>
      <div><label>Frist</label><span class="${istUeberfaellig(a) ? "warn" : ""}">${datumLesbar(a.faellig)}${istUeberfaellig(a) ? " (überfällig)" : ""}</span></div>
      <div><label>Priorität</label><span>${escapeHtml(prioInfo(a.prioritaet).label)}</span></div>
      <div><label>Erstellt</label><span>${escapeHtml(zeitLesbar(a.erstelltAm))}</span></div>
      ${a.abnahme ? `<div><label>Abnahme</label><span>erforderlich</span></div>` : ""}
      ${a.vertraulich ? `<div><label>Sichtbarkeit</label><span>vertraulich</span></div>` : ""}
    </div>

    ${a.verdeckt ? `<p class="muted hinweis">Dieser Vorgang ist vertraulich. Beschreibung, Rückfragen und Anhänge sind nur für die Beteiligten sichtbar.</p>` : `

      ${darfAendern ? `
        <div class="detail-block">
          <h4>Auftrag</h4>
          <div class="form-grid">
            <div class="form-field wide"><label>Titel</label><input type="text" id="dt-titel" maxlength="200" value="${escapeHtml(a.titel || "")}" /></div>
            <div class="form-field"><label>Frist</label><input type="date" id="dt-faellig" value="${escapeHtml(a.faellig || "")}" /></div>
            <div class="form-field"><label>Priorität</label><select id="dt-prioritaet">${PRIORITAETEN.map((p) => `<option value="${p.id}"${p.id === a.prioritaet ? " selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}</select></div>
            <div class="form-field wide"><label>Beschreibung</label><textarea id="dt-beschreibung" rows="4" maxlength="4000">${escapeHtml(a.beschreibung || "")}</textarea></div>
          </div>
          <button class="btn small" id="dt-speichern">Änderung speichern</button>
          <p class="muted" style="margin-top:6px;">Jede Änderung wird unten im Verlauf mit altem und neuem Wert festgehalten.</p>
        </div>
      ` : `
        <div class="detail-block">
          <h4>Auftrag</h4>
          <p class="detail-text">${a.beschreibung ? escapeHtml(a.beschreibung).replace(/\n/g, "<br>") : "<span class=\"muted\">Keine Beschreibung hinterlegt.</span>"}</p>
        </div>
      `}

      ${a.ablehnGrund ? `<div class="detail-block"><h4>Ablehnung</h4><p class="detail-text">${escapeHtml(a.ablehnGrund)}</p></div>` : ""}
      ${a.rueckgabeGrund ? `<div class="detail-block"><h4>Zurückgegeben</h4><p class="detail-text">${escapeHtml(a.rueckgabeGrund)}</p></div>` : ""}
      ${a.zurueckgezogenGrund ? `<div class="detail-block"><h4>Zurückgezogen</h4><p class="detail-text">${escapeHtml(a.zurueckgezogenGrund)}</p></div>` : ""}

      <div class="detail-block">
        <h4>Anhänge</h4>
        <div class="anhang-liste" id="dt-anhaenge">
          ${(a.anhaenge || []).length ? (a.anhaenge || []).map((f) => `
            <div class="anhang-row">
              <button class="anhang-name" type="button" data-anhang="${escapeHtml(f.fileId)}">📎 ${escapeHtml(f.name)}</button>
              <span class="muted">${escapeHtml(f.art === "nachweis" ? "Nachweis" : "zum Auftrag")} · ${escapeHtml(nameVon(f.von))}</span>
              ${(f.von === currentUser.username || canAdmin()) ? `<button class="btn tiny danger" data-anhang-del="${escapeHtml(f.fileId)}">Entfernen</button>` : ""}
            </div>`).join("") : `<p class="muted">Keine Anhänge.</p>`}
        </div>
        ${(binEmpfaenger || binZuweiser || canAdmin()) && canEdit() ? `
          <div class="anhang-upload">
            <input type="file" id="dt-datei" />
            <button class="btn small secondary" id="dt-datei-hoch">Anhang hochladen</button>
            <span class="muted">${binEmpfaenger && !binZuweiser ? "wird als Nachweis abgelegt" : "wird dem Auftrag beigelegt"} · höchstens ${MAX_ANHANG_MB} MB</span>
          </div>` : ""}
      </div>

      <div class="detail-block">
        <h4>Rückfragen</h4>
        <div class="kommentar-liste">
          ${(a.kommentare || []).length ? (a.kommentare || []).map((k) => `
            <div class="kommentar">
              <span class="k-kopf">${escapeHtml(nameVon(k.von))} · ${escapeHtml(zeitLesbar(k.am))}</span>
              <span class="k-text">${escapeHtml(k.text)}</span>
            </div>`).join("") : `<p class="muted">Noch keine Rückfrage.</p>`}
        </div>
        ${canEdit() ? `
          <div class="kommentar-neu">
            <textarea id="dt-kommentar" rows="2" maxlength="1000" placeholder="Rückfrage oder Zwischenstand…"></textarea>
            <button class="btn small secondary" id="dt-kommentar-senden">Senden</button>
          </div>` : ""}
      </div>

      <div class="detail-block">
        <h4>Verlauf</h4>
        <div class="verlauf-liste">
          ${(a.verlauf || []).length ? (a.verlauf || []).slice().reverse().map((v) => `
            <div class="verlauf-row">
              <span class="v-zeit">${escapeHtml(zeitLesbar(v.am))}</span>
              <span class="v-text">${escapeHtml(verlaufText(v))}</span>
              <span class="v-wer">${escapeHtml(nameVon(v.von))}</span>
            </div>`).join("") : `<p class="muted">Keine Änderung seit dem Anlegen.</p>`}
        </div>
      </div>
    `}`;

  renderDetailAktionen(a, binEmpfaenger, binZuweiser);
  document.getElementById("detail-modal").classList.remove("hidden");
}

function verlaufText(v) {
  const felder = { titel: "Titel", beschreibung: "Beschreibung", faellig: "Frist", prioritaet: "Priorität" };
  if (v.was === "status") return `Status: ${statusInfo(v.alt).label} → ${statusInfo(v.neu).label}`;
  if (v.was === "empfaenger") return `Empfänger: ${nameVon(v.alt)} → ${nameVon(v.neu)}`;
  const name = felder[v.was] || v.was;
  if (v.was === "faellig") return `${name}: ${datumLesbar(v.alt)} → ${datumLesbar(v.neu)}`;
  if (v.was === "beschreibung") return `${name} geändert`;
  return `${name}: „${v.alt || "—"}" → „${v.neu || "—"}"`;
}

function renderDetailAktionen(a, binEmpfaenger, binZuweiser) {
  const box = document.getElementById("detail-aktionen");
  const knoepfe = [];

  if (canEdit() && binEmpfaenger && a.status === "offen") {
    knoepfe.push(a.abnahme
      ? `<button class="btn success" data-akt="gemeldet">Erledigt melden</button>`
      : `<button class="btn success" data-akt="erledigt">Erledigt</button>`);
    knoepfe.push(`<button class="btn secondary" data-akt="abgelehnt">Ablehnen…</button>`);
  }
  // Abnehmen und Zurückgeben nur für den, der die Aufgabe gestellt hat.
  // Administrieren zählt hier bewusst NICHT mit — sonst nähme ein Empfänger mit
  // Admin-Recht seine eigene Meldung ab und die Abnahme wäre wirkungslos. Der
  // Worker prüft dasselbe; die Zeile darunter (Zurückziehen) bleibt unberührt.
  if (canEdit() && binZuweiser && a.status === "gemeldet") {
    knoepfe.push(`<button class="btn success" data-akt="abgenommen">Abnehmen</button>`);
    knoepfe.push(`<button class="btn secondary" data-akt="zurueckgegeben">Zurückgeben…</button>`);
  }
  if (canEdit() && (binZuweiser || canAdmin()) && (a.status === "offen" || a.status === "gemeldet")) {
    knoepfe.push(`<button class="btn secondary" data-akt="zurueckziehen">Zurückziehen…</button>`);
  }

  box.innerHTML = knoepfe.join("") || `<span class="muted">Für dich gibt es an diesem Vorgang nichts zu tun.</span>`;

  // Löschen ist erlaubt, hinterlässt aber einen Protokolleintrag — das ist der
  // Grund, warum es hier stehen darf, ohne den Nachweischarakter aufzugeben.
  const del = document.getElementById("detail-loeschen");
  const darfLoeschen = canEdit() && (a.von === currentUser.username || canAdmin());
  del.classList.toggle("hidden", !darfLoeschen);
}

function schliesseDetail() {
  document.getElementById("detail-modal").classList.add("hidden");
  offeneDetailId = null;
}

// ---------- Aktionen an einer Aufgabe ----------

async function fuehreAktionAus(aktion) {
  const a = aufgaben.find((x) => x.id === offeneDetailId);
  if (!a) return;
  try {
    if (aktion === "abgelehnt" || aktion === "zurueckgegeben") {
      const grund = prompt(aktion === "abgelehnt"
        ? "Warum lehnst du diese Aufgabe ab? Die Begründung sieht der Zuweiser."
        : "Warum gibst du die Aufgabe zurück? Sie wird dann wieder offen.");
      if (grund === null) return;
      if (!grund.trim()) { alert("Ohne Begründung geht das nicht."); return; }
      await setzeStatus(a.id, aktion, grund.trim());
    } else if (aktion === "zurueckziehen") {
      const grund = prompt("Warum ziehst du die Aufgabe zurück? (freiwillig)") || "";
      await zieheAufgabeZurueck(a.id, grund.trim());
    } else {
      await setzeStatus(a.id, aktion, "");
    }
    setStatusText("Gespeichert");
    await ladeDaten();
    renderAll();
    oeffneDetail(a.id);
  } catch (e) { zeigeFehler(e); }
}

async function speichereDetailAenderung() {
  const a = aufgaben.find((x) => x.id === offeneDetailId);
  if (!a) return;
  const felder = {
    titel: document.getElementById("dt-titel").value.trim(),
    beschreibung: document.getElementById("dt-beschreibung").value.trim(),
    faellig: document.getElementById("dt-faellig").value,
    prioritaet: document.getElementById("dt-prioritaet").value
  };
  if (!felder.titel) { alert("Ein Titel muss stehen bleiben."); return; }
  if (!felder.faellig) { alert("Eine Frist muss stehen bleiben."); return; }
  try {
    await aendereAufgabe(a.id, felder);
    setStatusText("Gespeichert");
    await ladeDaten();
    renderAll();
    oeffneDetail(a.id);
  } catch (e) { zeigeFehler(e); }
}

async function sendeKommentar() {
  const feld = document.getElementById("dt-kommentar");
  const text = (feld.value || "").trim();
  if (!text) return;
  try {
    await schreibeKommentar(offeneDetailId, text);
    feld.value = "";
    await ladeDaten();
    renderAll();
    oeffneDetail(offeneDetailId);
  } catch (e) { zeigeFehler(e); }
}

async function loescheAktuelleAufgabe() {
  const a = aufgaben.find((x) => x.id === offeneDetailId);
  if (!a) return;
  if (!confirm(`„${titelVon(a)}" wirklich löschen?\n\nDie Aufgabe verschwindet aus den Listen. Im Protokoll der Verwaltung bleibt festgehalten, dass du sie gelöscht hast.`)) return;
  try {
    await loescheAufgabe(a.id);
    schliesseDetail();
    setStatusText("Gelöscht");
    await ladeDaten();
    renderAll();
  } catch (e) { zeigeFehler(e); }
}

// ---------- Anhänge ----------

async function ladeDateiHoch() {
  const input = document.getElementById("dt-datei");
  const datei = input.files && input.files[0];
  if (!datei) { alert("Bitte zuerst eine Datei auswählen."); return; }
  if (datei.size > MAX_ANHANG_MB * 1024 * 1024) {
    alert(`Die Datei ist größer als ${MAX_ANHANG_MB} MB.`);
    return;
  }
  const a = aufgaben.find((x) => x.id === offeneDetailId);
  const art = (a && a.empfaenger === currentUser.username && a.von !== currentUser.username) ? "nachweis" : "auftrag";
  try {
    setStatusText("Lade hoch…");
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error("Datei konnte nicht gelesen werden"));
      fr.readAsDataURL(datei);
    });
    await ladeAnhangHoch(offeneDetailId, datei.name, art, dataUrl);
    input.value = "";
    setStatusText("Hochgeladen");
    await ladeDaten();
    renderAll();
    oeffneDetail(offeneDetailId);
  } catch (e) { zeigeFehler(e); }
}

async function oeffneAnhang(fileId) {
  try {
    const a = aufgaben.find((x) => x.id === offeneDetailId);
    const meta = a && (a.anhaenge || []).find((f) => f.fileId === fileId);
    setStatusText("Lade Anhang…");
    const blob = await holeAnhang(offeneDetailId, fileId);
    // Safari blockt window.open nach einem await lautlos — deshalb ein
    // synthetischer Klick auf einen Download-Link statt eines späten open().
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (meta && meta.name) || "anhang";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatusText("");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { zeigeFehler(e); }
}

async function entferneAnhang(fileId) {
  if (!confirm("Diesen Anhang entfernen?")) return;
  try {
    await loescheAnhang(offeneDetailId, fileId);
    await ladeDaten();
    renderAll();
    oeffneDetail(offeneDetailId);
  } catch (e) { zeigeFehler(e); }
}

// ---------- Zuweisen ----------

function oeffneZuweisen() {
  const form = document.getElementById("zuweisen-form");
  form.reset();
  document.getElementById("zw-prioritaet").innerHTML =
    PRIORITAETEN.map((p) => `<option value="${p.id}"${p.id === "normal" ? " selected" : ""}>${escapeHtml(p.label)}</option>`).join("");

  const erlaubte = personen.filter((p) => darfZuweisenAn(p.username));
  document.getElementById("zw-personen").innerHTML = erlaubte.length
    ? erlaubte.map((p) => `<label><input type="checkbox" value="${escapeHtml(p.username)}" /> ${escapeHtml(p.displayName)}</label>`).join("")
    : `<p class="muted">Du kannst niemandem eine Aufgabe zuweisen. Dafür musst du ein Ressort verantworten oder vertreten.</p>`;

  const meineRessorts = ressorts.filter((r) => canAdmin() || r.verantwortlich === currentUser.username || r.stellvertreter === currentUser.username);
  document.getElementById("zw-ressort").innerHTML = meineRessorts.length
    ? meineRessorts.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("")
    : `<option value="">— kein Ressort verfügbar —</option>`;

  aktualisiereZuweisenModus();
  document.getElementById("zuweisen-modal").classList.remove("hidden");
}

function aktualisiereZuweisenModus() {
  const modus = document.querySelector("input[name='zw-modus']:checked").value;
  document.getElementById("zw-personen-feld").classList.toggle("hidden", modus !== "person");
  document.getElementById("zw-ressort-feld").classList.toggle("hidden", modus === "person");
  const r = ressortVon(document.getElementById("zw-ressort").value);
  const hinweis = document.getElementById("zw-ressort-hinweis");
  if (!r) { hinweis.textContent = ""; return; }
  hinweis.textContent = modus === "ressort"
    ? `Die Aufgabe geht an ${nameVon(r.verantwortlich)} als Verantwortlichen. Die übrigen ${Math.max(0, ressortMitglieder(r).length - 1)} Beteiligten sehen sie mit.`
    : `Es entsteht je Mitglied eine eigene Aufgabe — ${ressortMitglieder(r).length} insgesamt. Jeder hakt selbst ab.`;
}

async function speichereZuweisung() {
  const modus = document.querySelector("input[name='zw-modus']:checked").value;
  const titel = document.getElementById("zw-titel").value.trim();
  const faellig = document.getElementById("zw-faellig").value;
  if (!titel) { alert("Bitte einen Titel angeben."); return; }
  if (!faellig) { alert("Bitte eine Frist angeben — ohne Frist ist es kein Auftrag."); return; }

  const daten = {
    modus, titel, faellig,
    beschreibung: document.getElementById("zw-beschreibung").value.trim(),
    prioritaet: document.getElementById("zw-prioritaet").value,
    abnahme: document.getElementById("zw-abnahme").checked,
    vertraulich: document.getElementById("zw-vertraulich").checked
  };

  if (modus === "person") {
    daten.empfaenger = Array.from(document.querySelectorAll("#zw-personen input:checked")).map((c) => c.value);
    if (!daten.empfaenger.length) { alert("Bitte mindestens eine Person auswählen."); return; }
  } else {
    daten.ressortId = document.getElementById("zw-ressort").value;
    if (!daten.ressortId) { alert("Bitte ein Ressort auswählen."); return; }
  }

  try {
    const body = await legeAufgabeAn(daten);
    document.getElementById("zuweisen-modal").classList.add("hidden");
    meldeVersand(body);
    await ladeDaten();
    renderAll();
  } catch (e) { zeigeFehler(e); }
}

// Seit 2026-07-29 verschickt der Server beim Anlegen eine E-Mail an die Empfänger.
// Wer KEINE bekommen hat, ist dabei die wichtigere Hälfte der Nachricht: ohne diese
// Meldung verlässt sich der Zuweiser auf eine Zustellung, die nie stattgefunden hat.
// Deshalb steht der Normalfall im flüchtigen Statustext, jede Lücke dagegen in einem
// Hinweis, den man wegklicken muss.
function meldeVersand(body) {
  const angelegt = (body && body.angelegt) || 1;
  // Antwortet noch der alte Worker (Pages ist vor dem Worker-Deploy draußen),
  // fehlen die Versandfelder komplett. Dann darf hier NICHTS über E-Mails stehen —
  // aus fehlenden Feldern "0 benachrichtigt" zu rechnen würde einen Fehlschlag
  // melden, den es nicht gab.
  if (!body || typeof body.benachrichtigt !== "number") {
    setStatusText(`${angelegt} ${angelegt === 1 ? "Aufgabe" : "Aufgaben"} zugewiesen`);
    return;
  }
  const benachrichtigt = body.benachrichtigt;
  const ohne = body.ohneAdresse || [];
  const mailAus = !!body.mailAus;
  const kopf = `${angelegt} ${angelegt === 1 ? "Aufgabe" : "Aufgaben"} zugewiesen`;
  const fehlgeschlagen = mailAus ? 0 : Math.max(0, angelegt - benachrichtigt - ohne.length);

  const hinweise = [];
  if (mailAus) {
    hinweise.push("Es wurde keine E-Mail verschickt — der Mailversand ist gerade nicht verfügbar. Die Aufgabe steht trotzdem in der Liste.");
  }
  if (ohne.length) {
    hinweise.push(`Keine E-Mail bekommen: ${ohne.join(", ")}.\nIn den Trainerdaten ist dazu keine E-Mail-Adresse hinterlegt.`);
  }
  if (fehlgeschlagen) {
    hinweise.push(`Bei ${fehlgeschlagen} ${fehlgeschlagen === 1 ? "Empfänger" : "Empfängern"} ist der Mailversand fehlgeschlagen.`);
  }

  if (!hinweise.length) {
    setStatusText(benachrichtigt ? `${kopf} · ${benachrichtigt} per E-Mail benachrichtigt` : kopf);
    return;
  }
  setStatusText(kopf);
  alert(`${kopf}.\n\n${hinweise.join("\n\n")}`);
}

// ---------- Ressort-Verwaltung ----------

function oeffneRessortModal(id) {
  ressortBearbeitetId = id || null;
  const r = id ? ressortVon(id) : null;
  document.getElementById("ressort-modal-titel").textContent = r ? "Ressort bearbeiten" : "Neues Ressort";
  document.getElementById("rf-name").value = r ? r.name : "";
  document.getElementById("rf-beschreibung").value = r ? (r.beschreibung || "") : "";

  const opts = (leerLabel) => `<option value="">${leerLabel}</option>` +
    personen.map((p) => `<option value="${escapeHtml(p.username)}">${escapeHtml(p.displayName)}</option>`).join("");
  const ver = document.getElementById("rf-verantwortlich");
  const stv = document.getElementById("rf-stellvertreter");
  ver.innerHTML = opts("— bitte wählen —");
  stv.innerHTML = opts("— keine —");
  ver.value = r ? (r.verantwortlich || "") : "";
  stv.value = r ? (r.stellvertreter || "") : "";

  const mitglieder = r ? (r.mitglieder || []) : [];
  document.getElementById("rf-mitglieder").innerHTML = personen.map((p) =>
    `<label><input type="checkbox" value="${escapeHtml(p.username)}"${mitglieder.includes(p.username) ? " checked" : ""} /> ${escapeHtml(p.displayName)}</label>`).join("");

  document.getElementById("rf-loeschen").classList.toggle("hidden", !r);
  document.getElementById("ressort-modal").classList.remove("hidden");
}

async function speichereRessortForm() {
  const ressort = {
    id: ressortBearbeitetId || "",
    name: document.getElementById("rf-name").value.trim(),
    beschreibung: document.getElementById("rf-beschreibung").value.trim(),
    verantwortlich: document.getElementById("rf-verantwortlich").value,
    stellvertreter: document.getElementById("rf-stellvertreter").value,
    mitglieder: Array.from(document.querySelectorAll("#rf-mitglieder input:checked")).map((c) => c.value)
  };
  if (!ressort.name) { alert("Bitte einen Namen angeben."); return; }
  if (!ressort.verantwortlich) { alert("Ein Ressort braucht genau einen Verantwortlichen."); return; }
  try {
    await speichereRessort(ressort);
    document.getElementById("ressort-modal").classList.add("hidden");
    setStatusText("Gespeichert");
    await ladeDaten();
    renderAll();
  } catch (e) { zeigeFehler(e); }
}

async function loescheRessortForm() {
  if (!ressortBearbeitetId) return;
  const offeneR = aufgaben.filter((a) => a.ressortId === ressortBearbeitetId && !istAbgeschlossen(a)).length;
  if (!confirm(`Ressort wirklich löschen?${offeneR ? `\n\nEs hängen noch ${offeneR} offene Aufgaben daran. Die bleiben bestehen und verlieren nur ihre Ressort-Zuordnung.` : ""}`)) return;
  try {
    await loescheRessort(ressortBearbeitetId);
    document.getElementById("ressort-modal").classList.add("hidden");
    setStatusText("Gelöscht");
    await ladeDaten();
    renderAll();
  } catch (e) { zeigeFehler(e); }
}

async function starteUebergabe() {
  const von = document.getElementById("uebergabe-von").value;
  const auf = document.getElementById("uebergabe-auf").value;
  if (!von || !auf) { alert("Bitte beide Personen auswählen."); return; }
  if (von === auf) { alert("Das ist dieselbe Person."); return; }
  const anzahl = aufgaben.filter((a) => a.empfaenger === von && !istAbgeschlossen(a)).length;
  if (!anzahl) { alert(`${nameVon(von)} hat gerade keine offene Aufgabe.`); return; }
  if (!confirm(`${anzahl} offene Aufgabe(n) von ${nameVon(von)} auf ${nameVon(auf)} übertragen?\n\nErledigtes bleibt bei ${nameVon(von)} stehen.`)) return;
  try {
    await uebergebeAufgaben(von, auf);
    setStatusText("Übertragen");
    await ladeDaten();
    renderAll();
  } catch (e) { zeigeFehler(e); }
}

// ---------- Export ----------

function exportCsv() {
  const kopf = ["Titel", "Empfänger", "Ressort", "Zugewiesen von", "Frist", "Priorität", "Status", "Überfällig", "Erstellt", "Erledigt am"];
  const zeilen = gefilterteAufgaben.map((a) => {
    const r = a.ressortId ? ressortVon(a.ressortId) : null;
    return [
      titelVon(a), nameVon(a.empfaenger), r ? r.name : "", nameVon(a.von),
      datumLesbar(a.faellig), prioInfo(a.prioritaet).label, statusInfo(a.status).label,
      istUeberfaellig(a) ? "ja" : "nein", zeitLesbar(a.erstelltAm), zeitLesbar(a.erledigtAm)
    ];
  });
  const csv = [kopf].concat(zeilen)
    .map((z) => z.map((f) => `"${String(f == null ? "" : f).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  // BOM, sonst zerlegt Excel die Umlaute.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vereinsaufgaben-${heuteIso()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function druckeListe() {
  const rows = gefilterteAufgaben.map((a) => {
    const r = a.ressortId ? ressortVon(a.ressortId) : null;
    const st = istUeberfaellig(a) ? "Überfällig" : statusInfo(a.status).label;
    return `<tr>
      <td>${escapeHtml(datumLesbar(a.faellig))}</td>
      <td>${escapeHtml(titelVon(a))}</td>
      <td>${escapeHtml(nameVon(a.empfaenger))}</td>
      <td>${escapeHtml(r ? r.name : "")}</td>
      <td>${escapeHtml(st)}</td>
    </tr>`;
  }).join("");
  document.getElementById("print-content").innerHTML = `
    <h1>Vereinsaufgaben</h1>
    <p>Stand ${escapeHtml(datumLesbar(heuteIso()))} · ${gefilterteAufgaben.length} Vorgänge</p>
    <table class="print-table">
      <thead><tr><th>Frist</th><th>Aufgabe</th><th>Empfänger</th><th>Ressort</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.body.classList.add("printing-report");
  window.print();
  setTimeout(() => document.body.classList.remove("printing-report"), 500);
}

// ---------- Ereignisse ----------

function setupListeners() {
  document.querySelectorAll("nav button[data-tab]").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });

  document.getElementById("btn-zuweisen-oeffnen").addEventListener("click", oeffneZuweisen);
  document.getElementById("zuweisen-close").addEventListener("click", () => document.getElementById("zuweisen-modal").classList.add("hidden"));
  document.getElementById("zw-abbrechen").addEventListener("click", (e) => { e.preventDefault(); document.getElementById("zuweisen-modal").classList.add("hidden"); });
  document.getElementById("zw-speichern").addEventListener("click", (e) => { e.preventDefault(); speichereZuweisung(); });
  document.querySelectorAll("input[name='zw-modus']").forEach((r) => r.addEventListener("change", aktualisiereZuweisenModus));
  document.getElementById("zw-ressort").addEventListener("change", aktualisiereZuweisenModus);

  document.getElementById("detail-close").addEventListener("click", schliesseDetail);
  document.getElementById("detail-schliessen").addEventListener("click", schliesseDetail);
  document.getElementById("detail-loeschen").addEventListener("click", loescheAktuelleAufgabe);
  document.getElementById("detail-aktionen").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-akt]");
    if (btn) fuehreAktionAus(btn.dataset.akt);
  });
  document.getElementById("detail-body").addEventListener("click", (e) => {
    if (e.target.closest("#dt-speichern")) { speichereDetailAenderung(); return; }
    if (e.target.closest("#dt-kommentar-senden")) { sendeKommentar(); return; }
    if (e.target.closest("#dt-datei-hoch")) { ladeDateiHoch(); return; }
    const anh = e.target.closest("[data-anhang]");
    if (anh) { oeffneAnhang(anh.dataset.anhang); return; }
    const del = e.target.closest("[data-anhang-del]");
    if (del) { entferneAnhang(del.dataset.anhangDel); return; }
  });

  // Aufgabenzeilen und Personen-Aufklappen laufen über Delegation am Main —
  // die Listen werden bei jedem Laden neu gezeichnet, einzeln gebundene Handler
  // wären nach dem ersten Neuzeichnen tot.
  document.querySelector("main").addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const body = document.getElementById("person-body-" + toggle.dataset.toggle);
      if (body) body.classList.toggle("hidden");
      return;
    }
    const zeile = e.target.closest("[data-aufgabe]");
    if (zeile) { oeffneDetail(zeile.dataset.aufgabe); return; }
    const red = e.target.closest("[data-ressort-edit]");
    if (red) { oeffneRessortModal(red.dataset.ressortEdit); return; }
  });

  ["filter-suche", "filter-person", "filter-ressort", "filter-status"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAlle);
    document.getElementById(id).addEventListener("change", renderAlle);
  });

  document.getElementById("btn-export-csv").addEventListener("click", exportCsv);
  document.getElementById("btn-export-druck").addEventListener("click", druckeListe);

  document.getElementById("btn-ressort-neu").addEventListener("click", () => oeffneRessortModal(null));
  document.getElementById("ressort-close").addEventListener("click", () => document.getElementById("ressort-modal").classList.add("hidden"));
  document.getElementById("rf-abbrechen").addEventListener("click", (e) => { e.preventDefault(); document.getElementById("ressort-modal").classList.add("hidden"); });
  document.getElementById("rf-speichern").addEventListener("click", (e) => { e.preventDefault(); speichereRessortForm(); });
  document.getElementById("rf-loeschen").addEventListener("click", (e) => { e.preventDefault(); loescheRessortForm(); });
  document.getElementById("btn-uebergabe").addEventListener("click", starteUebergabe);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["ressort-modal", "zuweisen-modal", "detail-modal"].some((id) => {
      const el = document.getElementById(id);
      if (!el.classList.contains("hidden")) { el.classList.add("hidden"); if (id === "detail-modal") offeneDetailId = null; return true; }
      return false;
    });
  });
}

// ---------- Start ----------

async function init() {
  document.getElementById("version-badge-2").textContent = "v" + APP_VERSION;

  try {
    currentUser = await fetchMe();
  } catch (e) {
    zeigeLoginGate(e instanceof NotLoggedInError ? "" : (e.message || ""));
    return;
  }

  document.getElementById("connect-screen").style.display = "none";
  document.getElementById("app-shell").style.display = "";
  document.getElementById("header-user").textContent = nameVon(currentUser.username);

  setupListeners();

  try {
    await ladePersonen();
    await ladeDaten();
  } catch (e) {
    zeigeFehler(e);
    return;
  }

  renderAll();
  // Wer verwaltet, will zuerst sehen, wer was liegen hat; alle anderen ihre
  // eigene Liste. Erst nach dem Laden gesetzt, damit kein leerer Tab aufblitzt.
  switchTab(canAdmin() ? "uebersicht" : "meine");
}

document.addEventListener("DOMContentLoaded", init);
