const STORAGE_KEY = "dispatch_sams_like_ui_v1";

let cfg = null;
let state = null;

const elTitle = document.getElementById("appTitle");
const elTabs = document.getElementById("tabs");
const elRoomsGrid = document.getElementById("roomsGrid");
const elInterventionsRow = document.getElementById("interventionsRow");

const elReserveList = document.getElementById("reserveList");
const elHorsList = document.getElementById("horsList");
const elCountReserve = document.getElementById("countReserve");
const elCountHors = document.getElementById("countHors");

const btnAllReserve = document.getElementById("btnAllReserve");

init();

async function init(){
  cfg = await fetch("./config.json", {cache:"no-store"}).then(r => r.json());
  elTitle.textContent = cfg.appTitle || "Dispatch";

  state = loadState() ?? makeInitialState(cfg);

  renderTabs();
  renderAll();

  // droppables (boss / reserve)
  document.querySelectorAll(".droppable").forEach(el => makeDroppable(el, el.dataset.zone));

  btnAllReserve.addEventListener("click", () => {
    // renvoyer tout le monde en réserve (sauf hors-service: on les met aussi en réserve mais en gardant le flag service)
    for (const id of Object.keys(state.placements)) state.placements[id] = "reserve";
    saveState();
    renderAll();
  });
}

function makeInitialState(cfg){
  const placements = {};
  // par défaut : tout le monde en "hors" (liste) si service=hors, sinon "reserve"
  for(const d of cfg.doctors){
    placements[d.id] = d.service === "hors" ? "hors" : "reserve";
  }
  return {
    activeSiteId: cfg.sites?.[0]?.id ?? "sud",
    placements,        // doctorId -> zoneId ("hors","reserve","boss", roomId, interventionId)
    service: Object.fromEntries(cfg.doctors.map(d => [d.id, d.service || "en"])) // en|hors
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const s = JSON.parse(raw);
    if(!s?.placements || !s?.service) return null;
    return s;
  }catch{ return null; }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderTabs(){
  elTabs.innerHTML = "";
  for(const site of cfg.sites){
    const b = document.createElement("button");
    b.className = "tab" + (site.id === state.activeSiteId ? " active" : "");
    b.textContent = site.name;
    b.addEventListener("click", () => {
      state.activeSiteId = site.id;
      saveState();
      renderAll();
      renderTabs();
    });
    elTabs.appendChild(b);
  }
}

function renderAll(){
  renderRooms();
  renderInterventions();
  renderRightPanels();
}

function renderRooms(){
  elRoomsGrid.innerHTML = "";

  const site = cfg.sites.find(s => s.id === state.activeSiteId);
  const rooms = site?.rooms ?? [];

  for(const r of rooms){
    const pill = document.createElement("div");
    pill.className = `roomPill droppable pill-${r.color || "blue"}`;
    pill.dataset.zone = r.id;

    const left = document.createElement("div");
    left.textContent = r.label;

    const right = document.createElement("div");
    right.className = "small";
    right.textContent = `${countInZone(r.id)} médecin`;

    pill.appendChild(left);
    pill.appendChild(right);

    makeDroppable(pill, r.id);
    elRoomsGrid.appendChild(pill);
  }
}

function renderInterventions(){
  elInterventionsRow.innerHTML = "";

  for(const it of cfg.interventions){
    const pill = document.createElement("div");
    pill.className = `roomPill droppable pill-pink`;
    pill.dataset.zone = it.id;

    const left = document.createElement("div");
    left.textContent = it.label;

    const right = document.createElement("div");
    right.className = "small";
    right.textContent = `${countInZone(it.id)} médecin`;

    pill.appendChild(left);
    pill.appendChild(right);

    makeDroppable(pill, it.id);
    elInterventionsRow.appendChild(pill);
  }
}

function renderRightPanels(){
  // Réserve: on affiche les cartes si elles sont placées en réserve
  elReserveList.innerHTML = "";
  const reserveDocs = cfg.doctors.filter(d => state.placements[d.id] === "reserve");
  elCountReserve.textContent = formatCount(reserveDocs.length, "médecin");

  for(const d of reserveDocs){
    elReserveList.appendChild(makeDoctorCard(d));
  }

  // Hors-service: cartes scroll
  elHorsList.innerHTML = "";
  const horsDocs = cfg.doctors.filter(d => state.placements[d.id] === "hors");
  elCountHors.textContent = formatCount(horsDocs.length, "médecin");

  for(const d of horsDocs){
    elHorsList.appendChild(makeDoctorCard(d));
  }
}

function makeDoctorCard(d){
  const card = document.createElement("div");
  card.className = "docCard";
  card.draggable = true;
  card.dataset.doc = d.id;

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", d.id);
    e.dataTransfer.effectAllowed = "move";
  });

  // double-clic => réserve
  card.addEventListener("dblclick", () => {
    state.placements[d.id] = "reserve";
    saveState();
    renderAll();
    // on re-render les compteurs à gauche
    renderRooms();
    renderInterventions();
  });

  const top = document.createElement("div");
  top.className = "docTop";

  const left = document.createElement("div");
  const name = document.createElement("div");
  name.className = "docName";
  name.textContent = d.name;

  const phone = document.createElement("div");
  phone.className = "docLine";
  phone.innerHTML = `📞 <span>${d.phone || "—"}</span>`;

  left.appendChild(name);
  left.appendChild(phone);

  const badges = document.createElement("div");
  badges.className = "badges";

  const role = document.createElement("div");
  role.className = "badge " + roleBadgeClass(d.role);
  role.textContent = d.role || "—";

  const serviceBadge = document.createElement("div");
  const isEn = (state.service[d.id] ?? "en") === "en";
  serviceBadge.className = "badge " + (isEn ? "b-green" : "b-pink");
  serviceBadge.textContent = isEn ? "En service" : "Hors-service";

  badges.appendChild(role);
  badges.appendChild(serviceBadge);

  top.appendChild(left);
  top.appendChild(badges);

  const actions = document.createElement("div");
  actions.className = "docActions";

  const icons = document.createElement("div");
  icons.className = "iconRow";
  icons.appendChild(makeIcon("🩺"));
  icons.appendChild(makeIcon("🩻"));
  icons.appendChild(makeIcon("🧾"));

  const toggle = document.createElement("button");
  toggle.className = "toggle " + (isEn ? "en" : "hors");
  toggle.textContent = isEn ? "En service" : "Hors-service";
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const nowEn = (state.service[d.id] ?? "en") !== "en";
    state.service[d.id] = nowEn ? "en" : "hors";
    saveState();
    renderAll();
  });

  actions.appendChild(icons);
  actions.appendChild(toggle);

  card.appendChild(top);
  card.appendChild(actions);

  return card;
}

function makeIcon(txt){
  const el = document.createElement("span");
  el.className = "icon";
  el.textContent = txt;
  return el;
}

function roleBadgeClass(role){
  const r = (role || "").toLowerCase();
  if(r.includes("direct")) return "b-red";
  if(r.includes("chef")) return "b-yellow";
  if(r.includes("adj")) return "b-pink";
  return "b-yellow";
}

function makeDroppable(el, zoneId){
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("dragOver");
    e.dataTransfer.dropEffect = "move";
  });
  el.addEventListener("dragleave", () => el.classList.remove("dragOver"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("dragOver");
    const docId = e.dataTransfer.getData("text/plain");
    if(!docId) return;

    state.placements[docId] = zoneId;
    saveState();

    // maj UI
    renderAll();
    renderRooms();
    renderInterventions();
  });
}

function countInZone(zoneId){
  return cfg.doctors.reduce((acc, d) => acc + ((state.placements[d.id] === zoneId) ? 1 : 0), 0);
}

function formatCount(n, word){
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}
