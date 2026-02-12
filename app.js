const STORAGE_KEY = "dispatch_sams_v3_state";
const DOCTORS_KEY = "dispatch_sams_v3_doctors";
const elBossCard = document.getElementById("bossCard");


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
const btnManage = document.getElementById("btnManage");

// Détails
const elDetailsTitle = document.getElementById("detailsTitle");
const elDetailsSub = document.getElementById("detailsSub");
const elDetailsCount = document.getElementById("detailsCount");
const elDetailsList = document.getElementById("detailsList");

// CRUD modal
const dlg = document.getElementById("crud");
const crudList = document.getElementById("crudList");
const fId = document.getElementById("fId");
const fName = document.getElementById("fName");
const fRole = document.getElementById("fRole");
const fPhone = document.getElementById("fPhone");
const fBucket = document.getElementById("fBucket");
const btnNew = document.getElementById("btnNew");
const btnSave = document.getElementById("btnSave");
const btnDelete = document.getElementById("btnDelete");

let selectedZoneId = null;
let selectedDoctorId = null;

init();

async function init(){
  cfg = await fetch("./config.json", {cache:"no-store"}).then(r => r.json());

  // doctors: source = localStorage si présent, sinon config.json
  cfg.doctors = loadDoctors() ?? (cfg.doctors ?? []);
  if(!loadDoctors()) saveDoctors(cfg.doctors);

  elTitle.textContent = cfg.appTitle || "Dispatch SAMS";
  state = loadState() ?? makeInitialState(cfg);

  renderTabs();
  wireGlobalDroppables();
  wireButtons();
}

function makeInitialState(cfg){
  const placements = {};
  for(const d of cfg.doctors){
    // bucket initial depuis config : "hors" ou "reserve"
    const bucket = (d.bucket || d.service || "reserve");
    placements[d.id] = (bucket === "hors") ? "hors" : "reserve";
  }
  return {
    activeSiteId: cfg.sites?.[0]?.id ?? "sud",
    placements // doctorId -> zoneId ("hors","reserve","boss", roomId, interventionId)
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return nu;
    const s = JSON.parse(raw);
    if(!s?.placements) return nu;
    return s;
  }catch{ return nu; }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadDoctors(){
  try{
    const raw = localStorage.getItem(DOCTORS_KEY);
    if(!raw) return null;
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return null;
    return arr;
  }catch{ return null; }
}
function saveDoctors(arr){
  localStorage.setItem(DOCTORS_KEY, JSON.stringify(arr));
}

function wireButtons(){
  btnAllReserve.addEventListener("click", () => {
  for(const d of cfg.doctors){
    const z = state.placements[d.id];

    // On NE touche JAMAIS ceux qui sont hors service (robuste)
    if (isHorsZone(z)) continue;

    // Tous les autres (salle/intervention/boss/réserve/undefined) -> réserve
    state.placements[d.id] = "reserve";
  }
  saveState();
  renderAll();
});


  btnManage.addEventListener("click", () => {
    selectedDoctorId = null;
    renderCrudList();
    clearForm();
    dlg.showModal();
  });

  btnNew.addEventListener("click", (e) => {
    e.preventDefault();
    selectedDoctorId = null;
    clearForm();
    fId.focus();
  });

  btnSave.addEventListener("click", (e) => {
    e.preventDefault();
    const doc = readForm();
    if(!doc) return;

    const idx = cfg.doctors.findIndex(x => x.id === doc.id);
    if(idx >= 0){
      cfg.doctors[idx] = doc;
    }else{
      cfg.doctors.push(doc);
      // placement initial
      state.placements[doc.id] = doc.bucket === "hors" ? "hors" : "reserve";
    }

    // si on a changé le bucket d'un doc existant
    state.placements[doc.id] = doc.bucket === "hors" ? "hors" : (state.placements[doc.id] === "hors" ? "reserve" : state.placements[doc.id] || "reserve");

    saveDoctors(cfg.doctors);
    saveState();
    renderCrudList();
    renderAll();
  });

  btnDelete.addEventListener("click", (e) => {
    e.preventDefault();
    const id = (fId.value || "").trim();
    if(!id) return;

    cfg.doctors = cfg.doctors.filter(d => d.id !== id);
    delete state.placements[id];

    saveDoctors(cfg.doctors);
    saveState();

    selectedDoctorId = null;
    clearForm();
    renderCrudList();
    renderAll();
  });
}

function wireGlobalDroppables(){
  document.querySelectorAll(".droppable").forEach(el => makeDroppable(el, el.dataset.zone));
  makeDroppable(elDetailsList, "__DETAILS_DROP__");
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
  renderDetails();
  renderBoss();
}

function renderRooms(){
  elRoomsGrid.innerHTML = "";

  const site = (cfg.sites || []).find(s => s.id === state.activeSiteId);
  const rooms = site?.rooms || [];

  for(const r of rooms){
    const zoneId = r.id;

    // Wrapper de zone (même classe qu'avant pour garder le style)
    const pill = document.createElement("div");
    pill.className = `roomPill droppable pill-${r.color || "blue"}`;
    pill.dataset.zone = zoneId;

    // Récupère les docs dans cette zone
    const docs = getDoctorsInZone(zoneId);

    // HEADER (titre + compteur)
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const title = document.createElement("div");
    title.textContent = r.label;

    const count = document.createElement("div");
    count.className = "small";
    count.textContent = `${docs.length} médecin${docs.length > 1 ? "s" : ""}`;

    header.appendChild(title);
    header.appendChild(count);

    // BODY (cartes des médecins)
    const body = document.createElement("div");
    body.className = "zoneBody";

    if(docs.length === 0){
      // Optionnel : placeholder léger
      const empty = document.createElement("div");
      empty.className = "small";
      empty.style.opacity = "0.7";
      empty.textContent = "—";
      body.appendChild(empty);
    }else{
      for(const d of docs){
        body.appendChild(makeDoctorCardCompact(d));
      }
    }

    pill.appendChild(header);
    pill.appendChild(body);

    // Drag & Drop
    makeDroppable(pill, zoneId);

    // (Optionnel) clic = sélection (si tu gardes panneau Détails)
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      if(typeof setSelectedZone === "function") setSelectedZone(zoneId);
    });

    elRoomsGrid.appendChild(pill);
  }
}


function renderInterventions(){
  elInterventionsRow.innerHTML = "";

  const interventions = cfg.interventions || [];

  for(const it of interventions){
    const zoneId = it.id;

    const pill = document.createElement("div");
    pill.className = "roomPill droppable pill-pink";
    pill.dataset.zone = zoneId;

    const docs = getDoctorsInZone(zoneId);

    // HEADER
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const title = document.createElement("div");
    title.textContent = it.label;

    const count = document.createElement("div");
    count.className = "small";
    count.textContent = `${docs.length} médecin${docs.length > 1 ? "s" : ""}`;

    header.appendChild(title);
    header.appendChild(count);

    // BODY
    const body = document.createElement("div");
    body.className = "zoneBody";

    if(docs.length === 0){
      const empty = document.createElement("div");
      empty.className = "small";
      empty.style.opacity = "0.7";
      empty.textContent = "—";
      body.appendChild(empty);
    }else{
      for(const d of docs){
        body.appendChild(makeDoctorCardCompact(d));
      }
    }

    pill.appendChild(header);
    pill.appendChild(body);

    makeDroppable(pill, zoneId);

    // (Optionnel) clic = sélection (si tu gardes panneau Détails)
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      if(typeof setSelectedZone === "function") setSelectedZone(zoneId);
    });

    elInterventionsRow.appendChild(pill);
  }
}


function renderRightPanels(){
  // Réserve
  elReserveList.innerHTML = "";
  const reserveDocs = cfg.doctors.filter(d => state.placements[d.id] === "reserve");
  elCountReserve.textContent = formatCount(reserveDocs.length, "médecin");

  // clique réserve -> détails
  document.querySelector('[data-zone="reserve"]')?.addEventListener("click", () => {
    selectedZoneId = "reserve";
    renderDetails();
  });

  for(const d of reserveDocs) elReserveList.appendChild(makeDoctorCard(d));

  // Hors service
  elHorsList.innerHTML = "";
  const horsDocs = cfg.doctors.filter(d => state.placements[d.id] === "hors");
  elCountHors.textContent = formatCount(horsDocs.length, "médecin");

  // clique hors -> détails
  document.querySelector('[data-zone="hors"]')?.addEventListener("click", () => {
    selectedZoneId = "hors";
    renderDetails();
  });

  for(const d of horsDocs) elHorsList.appendChild(makeDoctorCard(d));
}

function renderDetails(){
  // zone par défaut
  if(!selectedZoneId) {
    selectedZoneId = "reserve";
  }

  const zoneName = getZoneLabel(selectedZoneId);
  elDetailsTitle.textContent = zoneName;
  elDetailsSub.textContent = "Médecins dans cette zone (glisser-déposer possible ici)";
  elDetailsList.dataset.zone = selectedZoneId; // drop direct dans la zone sélectionnée

  const docs = getDoctorsInZone(selectedZoneId);
  elDetailsCount.textContent = String(docs.length);
  elDetailsList.innerHTML = "";
  for(const d of docs) elDetailsList.appendChild(makeDoctorCard(d));
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

  // double-clic => réserve (sauf hors service)
  card.addEventListener("dblclick", () => {
    if(!isHorsZone(state.placements[d.id])){
      state.placements[d.id] = "reserve";
      saveState();
      ll();
      setSelectedZone("reserve");
    }
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
  role.className = "badge b-yellow";
  role.textContent = d.role || "—";

  badges.appendChild(role);

  top.appendChild(left);
  top.appendChild(badges);

  card.appendChild(top);
  return card;
}


function makeIcon(txt){
  const el = document.createElement("span");
  el.className = "icon";
  el.textContent = txt;
  return el;
}

function makeDroppable(el, zoneId){
  if(!el) return;

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

    let targetZone = zoneId;

    // si on drop dans la liste Détails, on drop dans la zone sélectionnée
    if(targetZone === "__DETAILS_DROP__"){
      targetZone = selectedZoneId || "reserve";
    }

    // Interdiction optionnelle: un doc "hors" reste hors si tu veux (commente si tu veux autoriser)
    // if (isHorsZone(state.placements[docId]) && !isHorsZone(targetZone)) return;

    state.placements[docId] = targetZone;

    // ✅ Après le drop, on “focus” la zone => tu vois le doc dedans
    setSelectedZone(targetZone);

    saveState();
    ll();
  });
}


function countInZone(zoneId){
  return cfg.doctors.reduce((acc, d) => acc + ((state.placements[d.id] === zoneId) ? 1 : 0), 0);
}

function getDoctorsInZone(zoneId){
  return cfg.doctors.filter(d => state.placements[d.id] === zoneId);
}

function formatCount(n, word){
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

function getZoneLabel(zoneId){
  if(zoneId === "reserve") return "Réserve";
  if(zoneId === "hors") return "Hors service";
  if(zoneId === "boss") return "Responsable du dispatch";

  for(const s of (cfg.sites ?? [])){
    const r = (s.rooms ?? []).find(x => x.id === zoneId);
    if(r) return r.label;
  }
  const it = (cfg.interventions ?? []).find(x => x.id === zoneId);
  if(it) return it.label;

  return zoneId;
}

/* CRUD */
function renderCrudList(){
  crudList.innerHTML = "";
  for(const d of cfg.doctors){
    const item = document.createElement("div");
    item.className = "crudItem" + (d.id === selectedDoctorId ? " active" : "");
    item.innerHTML = `<strong>${escapeHtml(d.name || d.id)}</strong>
      <small>${escapeHtml(d.role || "—")} • ${escapeHtml(d.phone || "—")}</small>`;
    item.addEventListener("click", () => {
      selectedDoctorId = d.id;
      fillForm(d);
      renderCrudList();
    });
    crudList.appendChild(item);
  }
}

function clearForm(){
  fId.value = "";
  fName.value = "";
  fRole.value = "";
  fPhone.value = "";
  fBucket.value = "reserve";
}

function fillForm(d){
  fId.value = d.id || "";
  fName.value = d.name || "";
  fRole.value = d.role || "";
  fPhone.value = d.phone || "";
  // bucket = où il se trouve maintenant (reserve/hors)
  const z = state.placements[d.id];
  fBucket.value = (z === "hors") ? "hors" : "reserve";
}

function readForm(){
  const id = (fId.value || "").trim();
  const name = (fName.value || "").trim();
  if(!id || !name){
    alert("Id et Nom sont obligatoires.");
    return null;
  }
  return {
    id,
    name,
    role: (fRole.value || "").trim(),
    phone: (fPhone.value || "").trim(),
    bucket: fBucket.value // reserve|hors
  };
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function isHorsZone(z){
  // robuste même si l’ancien code a écrit autre chose
  return (z || "").toLowerCase().includes("hors");
}

function setSelectedZone(zoneId){
  selectedZoneId = zoneId;
  renderDetails();
}
function renderBoss(){
  if(!elBossCard) return;
  elBossCard.innerHTML = "";

  const bossDoc = cfg.doctors.find(d => state.placements[d.id] === "boss");
  if(!bossDoc){
    // rien → on laisse juste le hint
    return;
  }
  // petite carte compacte
  elBossCard.appendChild(makeDoctorCard(bossDoc));
}
function makeDoctorCardCompact(d){
  const card = makeDoctorCard(d);
  card.classList.add("compact");
  return card;
}


